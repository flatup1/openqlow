"""JMJ やさしい格闘技教材アニメ — 共通の部品

Blender 5.x の Python で、マネキン・舞台・光・文字・動きをすべて作る。
外部のモデルや素材は使わない。レッスンごとのファイル（jmj_lessonNN.py）から読み込んで使う。
"""
import math
import os
import sys

import bpy  # bpy を先に読み込む（bmesh は bpy の後でないと見つからない）
import bmesh
from mathutils import Matrix, Vector

FPS = 30
VIEW = "Standard"   # 色の見え方。赤がくすまない Standard を使う
SPOT_WATTS = 900    # スポットライトの強さ
ACCENT = (0.80, 0.03, 0.03)  # 差し色（仮: 赤）。JMJ のブランドカラーが決まったら差し替える
JP_FONTS = [
    "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc",  # macOS
    "/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf",
    "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf",
]

# ---------------------------------------------------------------- 骨格（立ち姿勢・左側。右は Y を反転）
# 前 = +X、左 = +Y、上 = +Z。単位はメートル。
J = {
    "hips": (0, 0, 0.95), "spine": (0, 0, 1.05), "chest": (0, 0, 1.25),
    "neck": (0, 0, 1.48), "head": (0, 0, 1.56), "head_top": (0, 0, 1.78),
    "shoulder": (0, 0.20, 1.42), "elbow": (-0.02, 0.215, 1.14),
    "wrist": (0.02, 0.225, 0.88), "hand_tip": (0.035, 0.228, 0.78),
    "hip": (0, 0.095, 0.93), "knee": (0.025, 0.10, 0.51),
    "ankle": (0, 0.10, 0.08), "toe": (0.17, 0.10, 0.03),
}
SIDES = (("L", 1), ("R", -1))


def side(p, s):
    return Vector((p[0], p[1] * s, p[2]))


def rot(axis, deg):
    return Matrix.Rotation(math.radians(deg), 3, axis)


# ---------------------------------------------------------------- シーンの入れ物
def get_collection(name):
    col = bpy.data.collections.get(name)
    if col:
        for ob in list(col.objects):
            bpy.data.objects.remove(ob, do_unlink=True)
    else:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col


def new_mat(name, color, rough=0.5):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if not m.node_tree:
        m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    m.diffuse_color = (*color, 1)
    return m


# ---------------------------------------------------------------- 骨組み（アーマチュア）
def pole_angle(base, ik, pole_loc):
    """IK のひじ・ひざが、置いた目印（ポール）の方を向くための角度。"""
    def signed(u, v, n):
        a = u.angle(v)
        return -a if u.cross(v).angle(n) < 1 else a
    pole_normal = (ik.tail - base.head).cross(pole_loc - base.head)
    proj = pole_normal.cross(base.tail - base.head)
    return signed(base.x_axis, proj, base.tail - base.head)


def build_rig(col, name="JMJ_Rig"):
    arm = bpy.data.armatures.new(name)
    rig = bpy.data.objects.new(name, arm)
    col.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.edit_bones

    def bone(n, head, tail, parent=None, connect=False):
        b = eb.new(n)
        b.head, b.tail = Vector(head), Vector(tail)
        if parent:
            b.parent = eb[parent]
            b.use_connect = connect
        return b

    bone("root", (0, 0, 0), (0.3, 0, 0))
    bone("hips", J["hips"], J["spine"], "root")
    bone("spine", J["spine"], J["chest"], "hips", True)
    bone("chest", J["chest"], J["neck"], "spine", True)
    bone("neck", J["neck"], J["head"], "chest", True)
    bone("head", J["head"], J["head_top"], "neck", True)
    angles = {}
    for sn, s in SIDES:
        P = {k: side(v, s) for k, v in J.items()}
        bone(f"upper_arm.{sn}", P["shoulder"], P["elbow"], "chest")
        bone(f"forearm.{sn}", P["elbow"], P["wrist"], f"upper_arm.{sn}", True)
        bone(f"hand.{sn}", P["wrist"], P["hand_tip"], f"forearm.{sn}", True)
        bone(f"thigh.{sn}", P["hip"], P["knee"], "hips")
        bone(f"shin.{sn}", P["knee"], P["ankle"], f"thigh.{sn}", True)
        foot = bone(f"foot.{sn}", P["ankle"], P["toe"], f"shin.{sn}", True)
        # 動かすための目印（コントロール）
        bone(f"ik_hand.{sn}", P["wrist"], P["wrist"] + Vector((0, 0, -0.1)), "root")
        ikf = bone(f"ik_foot.{sn}", P["ankle"], P["toe"], "root")
        ikf.roll = foot.roll
        pe = bone(f"pole_elbow.{sn}", P["elbow"] + Vector((-0.4, 0, 0)),
                  P["elbow"] + Vector((-0.4, 0, 0.1)), "root")
        pk = bone(f"pole_knee.{sn}", P["knee"] + Vector((0.5, 0, 0)),
                  P["knee"] + Vector((0.5, 0, 0.1)), "root")
        angles[f"forearm.{sn}"] = pole_angle(eb[f"upper_arm.{sn}"], eb[f"forearm.{sn}"], pe.head)
        angles[f"shin.{sn}"] = pole_angle(eb[f"thigh.{sn}"], eb[f"shin.{sn}"], pk.head)
    bpy.ops.object.mode_set(mode="POSE")

    for sn, _ in SIDES:
        for lower, target, pole in ((f"forearm.{sn}", f"ik_hand.{sn}", f"pole_elbow.{sn}"),
                                    (f"shin.{sn}", f"ik_foot.{sn}", f"pole_knee.{sn}")):
            c = rig.pose.bones[lower].constraints.new("IK")
            c.target, c.subtarget = rig, target
            c.pole_target, c.pole_subtarget = rig, pole
            c.pole_angle = angles[lower]
            c.chain_count = 2
        c = rig.pose.bones[f"foot.{sn}"].constraints.new("COPY_ROTATION")
        c.target, c.subtarget = rig, f"ik_foot.{sn}"
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


# ---------------------------------------------------------------- 体（やわらかい丸みのマネキン）
class BodyBuilder:
    def __init__(self, groups):
        self.bm = bmesh.new()
        self.dl = self.bm.verts.layers.deform.verify()
        self.groups = {n: i for i, n in enumerate(groups)}

    def _finish(self, verts, matrix, group, mat):
        bmesh.ops.transform(self.bm, matrix=matrix, verts=verts)
        gi = self.groups[group]
        for v in verts:
            v[self.dl][gi] = 1.0
            for f in v.link_faces:
                f.material_index = mat
                f.smooth = True

    def ball(self, center, radii, group, mat, along=None):
        r = self.bm and bmesh.ops.create_uvsphere(self.bm, u_segments=40, v_segments=20, radius=1.0)
        radii = (radii,) * 3 if isinstance(radii, (int, float)) else radii
        m = Matrix.Translation(Vector(center))
        if along is not None:
            m = m @ Vector(along).to_track_quat("Z", "Y").to_matrix().to_4x4()
        self._finish(r["verts"], m @ Matrix.Diagonal((*radii, 1)), group, mat)

    def limb(self, a, b, r1, r2, group, mat):
        a, b = Vector(a), Vector(b)
        d = b - a
        r = bmesh.ops.create_cone(self.bm, cap_ends=False, segments=40,
                                  radius1=r1, radius2=r2, depth=d.length)
        m = Matrix.Translation((a + b) / 2) @ d.to_track_quat("Z", "Y").to_matrix().to_4x4()
        self._finish(r["verts"], m, group, mat)


BODY, SHORTS, GLOVE, CUFF = 0, 1, 2, 3


def build_body(col, rig, name="JMJ_Mannequin"):
    groups = [b.name for b in rig.data.bones]
    bb = BodyBuilder(groups)
    # 胴体
    bb.ball((0, 0, 0.965), (0.108, 0.158, 0.115), "hips", SHORTS)
    bb.ball((0, 0, 1.14), (0.098, 0.140, 0.135), "spine", BODY)
    bb.ball((0, 0, 1.33), (0.118, 0.180, 0.170), "chest", BODY)
    bb.limb((0, 0, 1.44), (0, 0, 1.60), 0.052, 0.048, "neck", BODY)
    bb.ball((0.01, 0, 1.672), (0.098, 0.088, 0.118), "head", BODY)
    for sn, s in SIDES:
        P = {k: side(v, s) for k, v in J.items()}
        # 腕
        bb.ball(P["shoulder"], 0.064, "chest", BODY)
        bb.limb(P["shoulder"], P["elbow"], 0.054, 0.044, f"upper_arm.{sn}", BODY)
        bb.ball(P["elbow"], 0.046, f"forearm.{sn}", BODY)
        bb.limb(P["elbow"], P["wrist"], 0.044, 0.036, f"forearm.{sn}", BODY)
        hand_dir = (P["hand_tip"] - P["wrist"]).normalized()
        bb.limb(P["wrist"] - hand_dir * 0.035, P["wrist"] + hand_dir * 0.02, 0.043, 0.046,
                f"hand.{sn}", CUFF)
        bb.ball(P["wrist"] + hand_dir * 0.075, (0.060, 0.064, 0.080), f"hand.{sn}", GLOVE,
                along=hand_dir)
        # 脚
        bb.ball(P["hip"], 0.082, f"thigh.{sn}", SHORTS)
        bb.limb(P["hip"], P["knee"], 0.078, 0.056, f"thigh.{sn}", BODY)
        bb.limb(P["hip"], P["hip"].lerp(P["knee"], 0.42), 0.088, 0.080, f"thigh.{sn}", SHORTS)
        bb.ball(P["knee"], 0.058, f"shin.{sn}", BODY)
        bb.limb(P["knee"], P["ankle"], 0.056, 0.040, f"shin.{sn}", BODY)
        bb.ball(P["ankle"], 0.043, f"shin.{sn}", BODY)
        bb.ball(side((0.075, 0.10, 0.042), s), (0.125, 0.050, 0.042), f"foot.{sn}", BODY)

    mesh = bpy.data.meshes.new(name)
    ob = bpy.data.objects.new(name, mesh)
    col.objects.link(ob)
    for g in groups:
        ob.vertex_groups.new(name=g)
    bb.bm.to_mesh(mesh)
    bb.bm.free()
    mesh.materials.append(new_mat("JMJ_Body", (0.45, 0.45, 0.46), 0.55))
    mesh.materials.append(new_mat("JMJ_Shorts", (0.025, 0.025, 0.028), 0.7))
    mesh.materials.append(new_mat("JMJ_Accent", ACCENT, 0.4))
    mesh.materials.append(new_mat("JMJ_Cuff", (0.03, 0.03, 0.03), 0.6))
    ob.parent = rig
    ob.modifiers.new("Armature", "ARMATURE").object = rig
    return ob


# ---------------------------------------------------------------- 舞台・光・カメラ
def build_stage(col):
    sc = bpy.context.scene
    mesh = bpy.data.meshes.new("JMJ_Floor")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=30)
    bm.to_mesh(mesh)
    bm.free()
    floor = bpy.data.objects.new("JMJ_Floor", mesh)
    mat = new_mat("JMJ_Mat", (0.035, 0.035, 0.038), 0.9)
    mat.node_tree.nodes["Principled BSDF"].inputs["Specular IOR Level"].default_value = 0.05
    mesh.materials.append(mat)  # つや消しの床。遠くは黒い背景にとけこむ
    col.objects.link(floor)

    world = bpy.data.worlds.get("JMJ_World") or bpy.data.worlds.new("JMJ_World")
    if not world.node_tree:
        world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.022, 0.022, 0.026, 1)  # かげを少しだけ明るくする弱い光
    bg.inputs["Strength"].default_value = 1.0
    sc.world = world
    world.cycles_visibility.camera = False  # 背景そのものは真っ黒にする

    # 主役の光は1つだけ（上からのスポットライト）
    light = bpy.data.lights.new("JMJ_Spot", "SPOT")
    light.energy = SPOT_WATTS
    light.spot_size = math.radians(58)
    light.spot_blend = 0.75
    light.shadow_soft_size = 0.35
    spot = bpy.data.objects.new("JMJ_Spot", light)
    col.objects.link(spot)
    spot.location = (0.9, -1.3, 4.3)
    aim(spot, (0.25, 0.0, 0.9))

    cam_data = bpy.data.cameras.new("JMJ_Camera")
    cam_data.lens = 50
    cam = bpy.data.objects.new("JMJ_Camera", cam_data)
    col.objects.link(cam)
    cam.location = (0.32, -4.3, 1.12)
    aim(cam, (0.32, 0.0, 1.0))
    sc.camera = cam
    return cam


def aim(ob, target):
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def add_text(col, body, loc, size, color=(0.9, 0.9, 0.9), name="JMJ_Text", cam=None):
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = body
    cu.size = size
    cu.align_x = "LEFT"
    for path in JP_FONTS:
        if os.path.exists(path):
            cu.font = bpy.data.fonts.load(path, check_existing=True)
            break
    ob = bpy.data.objects.new(name, cu)
    col.objects.link(ob)
    ob.location = loc
    if cam:
        ob.rotation_euler = cam.rotation_euler
    ob.visible_shadow = ob.visible_diffuse = ob.visible_glossy = False
    m = bpy.data.materials.new(name + "_Mat")
    if not m.node_tree:
        m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*color, 1)
    em.inputs["Strength"].default_value = 1.0
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(em.outputs[0], out.inputs[0])
    cu.materials.append(m)
    return ob


def show_between(ob, start, end):
    """テキストを start〜end フレームの間だけ表示する。"""
    for f, hide in ((start - 1, True), (start, False), (end, False), (end + 1, True)):
        ob.hide_render = ob.hide_viewport = hide
        ob.keyframe_insert("hide_render", frame=f)
        ob.keyframe_insert("hide_viewport", frame=f)


# ---------------------------------------------------------------- ポーズ
_last_quat = {}


def _key_rot(pb, basis, frame):
    q = basis.to_quaternion()
    prev = _last_quat.get(pb.name)
    if prev is not None and prev.dot(q) < 0:
        q.negate()
    _last_quat[pb.name] = q.copy()
    pb.rotation_quaternion = q
    pb.keyframe_insert("rotation_quaternion", frame=frame)


def apply_pose(rig, pose, frame):
    """pose の数値（世界座標）を骨に入れて、frame にキーを打つ。"""
    pbs = rig.pose.bones
    rest = {b.name: b.matrix_local.to_3x3() for b in rig.data.bones}
    head = {b.name: b.head_local.copy() for b in rig.data.bones}

    # 胴体: 腰 → 背中 → 胸 → 首 → 頭 の順に、ひねり(yaw)と前かがみ(lean)を積む
    d_parent = Matrix.Identity(3)
    for name in ("hips", "spine", "chest", "neck", "head"):
        p = pose[name]
        d = d_parent @ rot("Z", p.get("yaw", 0)) @ rot("Y", p.get("lean", 0)) @ rot("X", p.get("tilt", 0))
        b = rest[name]
        _key_rot(pbs[name], b.inverted() @ d_parent.inverted() @ d @ b, frame)
        if name == "hips":
            pbs[name].location = b.inverted() @ Vector(p.get("move", (0, 0, 0)))
            pbs[name].keyframe_insert("location", frame=frame)
        d_parent = d

    for sn, s in SIDES:
        def place(bone_name, world_pos):
            pb = pbs[bone_name]
            pb.location = rest[bone_name].inverted() @ (Vector(world_pos) - head[bone_name])
            pb.keyframe_insert("location", frame=frame)

        place(f"ik_hand.{sn}", pose[f"hand_{sn}"])
        place(f"pole_elbow.{sn}", pose[f"elbow_{sn}"])
        place(f"pole_knee.{sn}", pose[f"knee_{sn}"])
        f = pose[f"foot_{sn}"]
        place(f"ik_foot.{sn}", f["pos"])
        b = rest[f"ik_foot.{sn}"]
        d = rot("Z", f.get("yaw", 0)) @ rot("Y", f.get("heel", 0))
        _key_rot(pbs[f"ik_foot.{sn}"], b.inverted() @ d @ b, frame)


def merged(base, **changes):
    out = {k: (dict(v) if isinstance(v, dict) else v) for k, v in base.items()}
    for k, v in changes.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k].update(v)
        else:
            out[k] = v
    return out


# ---------------------------------------------------------------- ポーズ集（どのレッスンからも使う）
# 手足の位置は世界座標（メートル）。yaw = ひねり、lean = 前かがみ、heel = かかとを上げる角度。
# 構え（オーソドックス: 左足が前）
STANCE = {
    "hips": {"move": (0.0, -0.01, -0.10), "yaw": -35, "lean": 3},
    "spine": {"yaw": -5, "lean": 3},
    "chest": {"yaw": -8, "lean": 4},
    "neck": {"yaw": 18, "lean": 0},
    "head": {"yaw": 25, "lean": 6},
    "hand_L": (0.44, 0.09, 1.37), "elbow_L": (0.25, 0.32, 0.55),
    "hand_R": (0.21, -0.08, 1.37), "elbow_R": (-0.05, -0.45, 0.55),
    "foot_L": {"pos": (0.20, 0.13, 0.08), "yaw": -15},
    "foot_R": {"pos": (-0.24, -0.14, 0.13), "yaw": -45, "heel": 18},
    "knee_L": (1.2, -0.15, 0.5), "knee_R": (0.5, -0.9, 0.45),
}
# 構えの「軽いはずみ」
BOUNCE = merged(STANCE, hips={"move": (0.0, -0.01, -0.115)})
# ジャブ（左手をまっすぐ前へ。右手はあごの横に残す）
JAB = merged(
    STANCE,
    hips={"move": (0.05, -0.01, -0.105), "yaw": -42, "lean": 4},
    spine={"yaw": -6}, chest={"yaw": -12},
    neck={"yaw": 22}, head={"yaw": 33},
    hand_L=(0.80, 0.02, 1.38), elbow_L=(0.5, 0.22, 0.4),
    hand_R=(0.24, -0.06, 1.37),
)
# ストレート（右手をまっすぐ前へ。腰と肩を回し、後ろ足のかかとを上げる。左手はあごの横に戻す）
CROSS = merged(
    STANCE,
    hips={"move": (0.09, 0.0, -0.11), "yaw": -6, "lean": 5},
    spine={"yaw": 8}, chest={"yaw": 14},
    neck={"yaw": -6}, head={"yaw": -8},
    hand_R=(0.72, -0.04, 1.37), elbow_R=(0.45, -0.30, 0.4),
    hand_L=(0.30, 0.10, 1.37), elbow_L=(0.20, 0.40, 0.55),
    foot_R={"pos": (-0.22, -0.13, 0.168), "yaw": -12, "heel": 34},
    knee_R=(1.0, -0.35, 0.35),
)


# ---------------------------------------------------------------- 組み立て
def animate(rig, timeline):
    """timeline = [(フレーム, ポーズ), ...]。30fps。"""
    _last_quat.clear()
    for frame, pose in timeline:
        apply_pose(rig, pose, frame)


def build(lesson, with_text=True):
    """lesson の内容でシーンを組み立てる。

    lesson = {
        "collection": コレクション名, "number": レッスン番号, "title": 技の名前,
        "timeline": [(フレーム, ポーズ), ...], "end": 最後のフレーム,
        "labels": [(文字, 出すフレーム, 消すフレーム), ...],   # 速さの表示など
    }
    """
    sc = bpy.context.scene
    col = get_collection(lesson["collection"])
    rig = build_rig(col)
    build_body(col, rig)
    cam = build_stage(col)
    animate(rig, lesson["timeline"])
    if with_text:
        # 文字はカメラの 3m 手前の面に置く。u, v は画面の中心を 0、端を ±1 とした位置。
        m3 = cam.rotation_euler.to_matrix()
        right, up, fwd = m3 @ Vector((1, 0, 0)), m3 @ Vector((0, 1, 0)), m3 @ Vector((0, 0, -1))
        dist = 3.0
        half_h = dist * 18.0 / cam.data.lens
        half_w = half_h * 1080 / 1920

        def at(u, v):
            return cam.location + fwd * dist + right * (u * half_w) + up * (v * half_h)

        white = (0.92, 0.92, 0.92)
        add_text(col, f"LESSON {lesson['number']}", at(-0.86, 0.80), 0.075, ACCENT, "JMJ_T_Lesson", cam)
        add_text(col, lesson["title"], at(-0.86, 0.63), 0.16, white, "JMJ_T_Title", cam)
        for i, (text, start, end) in enumerate(lesson.get("labels", [])):
            label = add_text(col, text, at(-0.86, 0.50), 0.075, white, f"JMJ_T_Label{i}", cam)
            show_between(label, start, end)
    sc.frame_start, sc.frame_end = 1, lesson["end"]
    sc.render.fps = FPS
    sc.render.resolution_x, sc.render.resolution_y = 1080, 1920  # 縦長
    return rig, cam


def setup_render(scale=50, samples=48):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_percentage = scale
    sc.render.image_settings.file_format = "PNG"
    sc.render.film_transparent = False
    sc.view_settings.view_transform = VIEW


def main(lesson):
    """コマンドラインから使うときの入口。

    --still 画像 [--frame N]   1コマだけ書き出す
    --anim フォルダ             全コマを連番画像で書き出す
    --scale 50|100  --samples N  --no-text  --save ファイル.blend
    """
    argv = sys.argv[1:]

    def opt(name, default):
        return int(argv[argv.index(name) + 1]) if name in argv else default

    if bpy.app.background:
        bpy.ops.wm.read_factory_settings(use_empty=True)
    build(lesson, with_text="--no-text" not in argv)
    sc = bpy.context.scene
    if "--still" in argv:
        setup_render(scale=opt("--scale", 50), samples=opt("--samples", 48))
        sc.frame_set(opt("--frame", 1))
        sc.render.filepath = argv[argv.index("--still") + 1]
        bpy.ops.render.render(write_still=True)
    elif "--anim" in argv:
        setup_render(scale=opt("--scale", 50), samples=opt("--samples", 32))
        sc.render.filepath = argv[argv.index("--anim") + 1].rstrip("/") + "/f_"
        bpy.ops.render.render(animation=True)
    if "--save" in argv:
        bpy.ops.wm.save_as_mainfile(filepath=argv[argv.index("--save") + 1])
