"""写真 → 墨絵/白黒マンガ風の人物レイヤー（透過PNG）。
使い方: python3 ink.py 入力写真 出力PNG [--bg green|white] [--crop x0,y0,x1,y1] [--scale 倍率]
- --bg white : 白い壁の前で撮った写真用（明るい背景を紙として抜く）
- --bg green : 緑の壁・マット前の写真用（緑を抜く）
出力はアルファ付きPNG。黒=墨、透明=紙。"""
import sys, argparse
import numpy as np, cv2

ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("dst")
ap.add_argument("--bg", default="white", choices=["white", "green"])
ap.add_argument("--crop", default="")
ap.add_argument("--scale", type=float, default=2.0)
ap.add_argument("--dark", type=float, default=0.30)   # これより暗い所は墨ベタ
ap.add_argument("--mid", type=float, default=0.58)    # これより暗い所は網点（スクリーントーン）
ap.add_argument("--dot", type=int, default=9)         # 網点の間隔(px)
ap.add_argument("--erase", default="")                # ロゴ消し: "x0,y0,x1,y1;x0,y0,x1,y1"（元写真の座標）
a = ap.parse_args()

img = cv2.imread(a.src)
if a.erase:
    em = np.zeros(img.shape[:2], np.uint8)
    for r in a.erase.split(";"):
        ex0, ey0, ex1, ey1 = map(int, r.split(","))
        em[ey0:ey1, ex0:ex1] = 255
    img = cv2.inpaint(img, em, 7, cv2.INPAINT_TELEA)
if a.crop:
    x0, y0, x1, y1 = map(int, a.crop.split(","))
    img = img[y0:y1, x0:x1]
if a.scale != 1:
    img = cv2.resize(img, None, fx=a.scale, fy=a.scale, interpolation=cv2.INTER_LANCZOS4)
H, W = img.shape[:2]
rng = np.random.default_rng(7)

# ---- 1. 人物マスク ----
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
if a.bg == "green":
    bgmask = cv2.inRange(hsv, (32, 95, 105), (86, 255, 255))
else:
    bgmask = cv2.inRange(hsv, (0, 0, 175), (180, 45, 255))
fg = cv2.bitwise_not(bgmask)
k = max(3, int(min(H, W) * 0.006)) | 1
fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((k, k), np.uint8))
fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((k * 3, k * 3), np.uint8))
n, lab, stats, _ = cv2.connectedComponentsWithStats(fg, 8)
keep = np.zeros_like(fg)
big = max(stats[1:, cv2.CC_STAT_AREA]) if n > 1 else 0
for i in range(1, n):
    if stats[i, cv2.CC_STAT_AREA] >= big * 0.04:
        keep[lab == i] = 255
# 穴を埋める（白いTシャツなどが抜けないように）
cnts, _ = cv2.findContours(keep, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
mask = np.zeros_like(keep); cv2.drawContours(mask, cnts, -1, 255, -1)
mask = cv2.GaussianBlur(mask, (0, 0), k * 0.5); mask = (mask > 127).astype(np.uint8) * 255

# ---- 2. 明暗を整える ----
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
gray = cv2.bilateralFilter(gray, 9, 60, 9)
gray = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8)).apply(gray)
g = gray.astype(np.float32) / 255.0

# ---- 3. 線（XDoG：筆っぽい輪郭線）----
def xdog(g, sigma=1.4, kk=1.6, tau=0.985, eps=0.0, phi=18.0):
    g1 = cv2.GaussianBlur(g, (0, 0), sigma); g2 = cv2.GaussianBlur(g, (0, 0), sigma * kk)
    d = g1 - tau * g2
    out = np.where(d >= eps, 1.0, 1.0 + np.tanh(phi * (d - eps)))
    return np.clip(out, 0, 1)
s = a.scale
lines = np.minimum(xdog(g, 1.3 * s, tau=0.985, phi=22), xdog(g, 2.6 * s, tau=0.98, phi=14))

# ---- 4. 2〜3段階の影：墨ベタ + 網点 ----
solid = (g < a.dark).astype(np.float32)
solid = cv2.GaussianBlur(solid, (0, 0), 1.2 * s)
solid = (solid > 0.5).astype(np.float32)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
p = a.dot * s / 2.0
ang = np.deg2rad(45)
u = (xx * np.cos(ang) + yy * np.sin(ang)) / p; v = (-xx * np.sin(ang) + yy * np.cos(ang)) / p
cell = np.sqrt((u - np.round(u)) ** 2 + (v - np.round(v)) ** 2)      # 0..0.707
midv = np.clip((a.mid - cv2.GaussianBlur(g, (0, 0), 2 * s)) / (a.mid - a.dark), 0, 1)  # 暗いほど点が大きい
dots = (cell < (0.18 + 0.34 * midv)).astype(np.float32) * (midv > 0.02)

ink = np.maximum(solid, np.maximum(1.0 - lines, dots))

# ---- 5. 太い外輪郭（マンガの主線）----
edge = cv2.morphologyEx(mask, cv2.MORPH_GRADIENT, np.ones((int(5 * s) | 1, int(5 * s) | 1), np.uint8))
ink = np.maximum(ink, edge.astype(np.float32) / 255.0)
ink *= (cv2.dilate(mask, np.ones((int(3 * s) | 1,) * 2, np.uint8)) > 0)

# ---- 6. 墨のにじみ・かすれ ----
noise = cv2.GaussianBlur(rng.random((H, W)).astype(np.float32), (0, 0), 1.2 * s)
noise = (noise - noise.min()) / (noise.max() - noise.min())
soft = cv2.GaussianBlur(ink, (0, 0), 0.8 * s)
ink = np.clip((soft - (0.36 + 0.22 * (noise - 0.5))) * 9.0, 0, 1)

# 人物の内側は紙の色で塗る（後ろの円相が体を透けて見えないように）。その上に墨。
body = cv2.GaussianBlur((mask > 0).astype(np.float32), (0, 0), 0.8 * s)
paper = np.array([0xE4, 0xEC, 0xF1], np.float32)      # BGR of #F1ECE4
inkc = np.array([0x14, 0x14, 0x14], np.float32)
rgba = np.zeros((H, W, 4), np.uint8)
rgba[..., 0:3] = (paper[None, None, :] * (1 - ink[..., None]) + inkc[None, None, :] * ink[..., None]).astype(np.uint8)
rgba[..., 3] = (np.maximum(ink, body) * 255).astype(np.uint8)
ys, xs = np.where(rgba[..., 3] > 8)
pad = int(20 * s)
y0, y1 = max(0, ys.min() - pad), min(H, ys.max() + pad); x0, x1 = max(0, xs.min() - pad), min(W, xs.max() + pad)
cv2.imwrite(a.dst, rgba[y0:y1, x0:x1])
print("saved", a.dst, rgba[y0:y1, x0:x1].shape)
