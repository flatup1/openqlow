"""筆で描いたような朱の円相（透過PNG）を作る。
使い方: python3 enso.py 出力PNG [--size 1600] [--start -48] [--sweep 332] [--seed 3]
start: 書き始めの角度（0=真上、時計回りに増える）。-48 は左上。 sweep: 何度ぶん回すか。"""
import sys, argparse, math
import numpy as np, cv2
ap = argparse.ArgumentParser()
ap.add_argument("dst"); ap.add_argument("--size", type=int, default=1600)
ap.add_argument("--start", type=float, default=-48); ap.add_argument("--sweep", type=float, default=332)
ap.add_argument("--seed", type=int, default=3)
a = ap.parse_args()
rng = np.random.default_rng(a.seed)
N = a.size; SS = 2; M = N * SS                   # supersample
cx = cy = M / 2; R = M * 0.355; WMAX = M * 0.105

def smooth_noise(n, scale, rng):
    x = rng.standard_normal(n + 2 * scale)
    k = np.hanning(scale * 2 + 1); k /= k.sum()
    y = np.convolve(x, k, mode="same")[scale:-scale]
    return (y - y.mean()) / (y.std() + 1e-6)

T = 3200
t = np.linspace(0, 1, T)
theta = np.deg2rad(a.start + a.sweep * t)        # 0 = up, clockwise
# pressure profile: touch down, press, long pull, lift
w = np.interp(t, [0, .015, .06, .35, .7, .9, 1], [.55, .92, 1.0, .86, .6, .34, .05])
w *= 1 + 0.05 * smooth_noise(T, 260, rng)
rad = R * (1 + 0.010 * smooth_noise(T, 700, rng)) * (1 + 0.018 * np.cos(theta * 2 + 0.6))
# the stroke drifts slightly inward as the hand lifts
rad -= WMAX * 0.10 * t ** 2

canvas = np.zeros((M, M), np.float32)
NB = 340
offs = np.sort(rng.uniform(-0.5, 0.5, NB))
# hairs dry out in clumps: a 2-D field (across the brush x along the stroke) decides where ink still reaches paper
field = cv2.GaussianBlur(rng.standard_normal((NB, T)).astype(np.float32), (0, 0), sigmaX=38, sigmaY=2.6)
field = (field - field.mean()) / field.std()
fine = cv2.GaussianBlur(rng.standard_normal((NB, T)).astype(np.float32), (0, 0), sigmaX=9, sigmaY=0.8)
fine = (fine - fine.mean()) / fine.std()
for i, o in enumerate(offs):
    edge = abs(o) * 2                              # 0 centre .. 1 edge
    ink = rng.uniform(0.8, 1.0)
    dry_at = np.clip(rng.normal(0.40 - 0.22 * edge, 0.07), 0.08, 1.0)   # edges dry first
    dryness = np.clip((t - dry_at) / 0.42, 0, 1)
    on = (0.75 * field[i] + 0.45 * fine[i]) > (-3.0 + 3.9 * dryness ** 0.8)
    wob = 1 + 0.035 * smooth_noise(T, 90, rng)
    r = rad + o * WMAX * w * wob
    x = cx + r * np.sin(theta); y = cy - r * np.cos(theta)
    pts = np.stack([x, y], 1)
    th = max(1, int(round(SS * rng.uniform(1.2, 2.6))))
    idx = np.where(on)[0]
    if len(idx) == 0: continue
    runs = np.split(idx, np.where(np.diff(idx) > 1)[0] + 1)
    layer = np.zeros_like(canvas)
    for run in runs:
        if len(run) < 2: continue
        cv2.polylines(layer, [np.round(pts[run] * 16).astype(np.int32)], False, float(ink), th, cv2.LINE_AA, 4)
    canvas = np.maximum(canvas, layer)

# ink pool where the brush first touches + a few flecks thrown off the stroke
x0 = cx + rad[40] * np.sin(theta[40]); y0 = cy - rad[40] * np.cos(theta[40])
cv2.ellipse(canvas, (int(x0), int(y0)), (int(WMAX * .50), int(WMAX * .40)), float(np.rad2deg(theta[40])), 0, 360, 1.0, -1, cv2.LINE_AA)
for _ in range(15):
    tt = rng.uniform(0.02, 0.55); j = int(tt * (T - 1))
    rr = rad[j] + rng.choice([-1, 1]) * WMAX * rng.uniform(0.62, 1.5)
    px = cx + rr * np.sin(theta[j]); py = cy - rr * np.cos(theta[j])
    s = M * rng.choice([0.0016, 0.0024, 0.004, 0.0062], p=[.4, .3, .2, .1])
    cv2.ellipse(canvas, (int(px), int(py)), (int(s * rng.uniform(1, 1.9)) + 1, int(s) + 1), float(rng.uniform(0, 180)), 0, 360, float(rng.uniform(.7, 1)), -1, cv2.LINE_AA)

# wet bristles merge, dry ones stay streaky; paper tooth eats the edges
soft = cv2.GaussianBlur(canvas, (0, 0), SS * 1.0)
tooth = cv2.GaussianBlur(rng.random((M, M)).astype(np.float32), (0, 0), SS * 1.1)
tooth = (tooth - tooth.mean()) / tooth.std()
alpha = np.clip((soft - (0.34 + 0.07 * tooth)) * 6.0, 0, 1)
# uneven ink load → slightly darker pools
load = cv2.GaussianBlur(alpha, (0, 0), SS * 9)
alpha = cv2.resize(alpha, (N, N), interpolation=cv2.INTER_AREA); load = cv2.resize(load, (N, N), interpolation=cv2.INTER_AREA)
c_hi = np.array([0x1B, 0x12, 0xB5], np.float32)   # BGR of #B5121B
c_lo = np.array([0x17, 0x0C, 0x8C], np.float32)   # pooled, darker vermilion
mix = np.clip((load - 0.55) / 0.45, 0, 1)[..., None]
rgb = c_hi * (1 - mix * 0.55) + c_lo * (mix * 0.55)
out = np.dstack([rgb, alpha[..., None] * 255 * 0.96]).astype(np.uint8)
cv2.imwrite(a.dst, out)
print("saved", a.dst, out.shape)
