"""写真1枚をまるごと墨絵風（白黒）にする。人物の切り抜きはしない。集合写真・背景つきの写真用。
使い方: python3 inkframe.py 入力 出力JPG [--crop x0,y0,x1,y1] [--width 1200] [--fade-top 0.3]
- 黒い所は墨ベタ、中くらいの所は薄墨のにじみ、明るい所は和紙の色になる
- --fade-top: 上の方を霧のように薄くする（背景のポスターなどを目立たなくする）"""
import argparse, numpy as np, cv2
ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("dst")
ap.add_argument("--crop", default="")
ap.add_argument("--width", type=int, default=1200)
ap.add_argument("--dark", type=float, default=0.24)
ap.add_argument("--mid", type=float, default=0.56)
ap.add_argument("--fade-top", type=float, default=0.0)
ap.add_argument("--abstract", action="store_true")   # 細部をまとめて絵っぽくする（顔が小さい写真では使わない）
ap.add_argument("--calm-top", type=float, default=0.0)   # 上の方の細かい模様（ポスターなど）をぼかして、線を出さない（高さに対する割合）
a = ap.parse_args()
img = cv2.imread(a.src)
if a.crop:
    x0, y0, x1, y1 = map(int, a.crop.split(",")); img = img[y0:y1, x0:x1]
if a.abstract: img = cv2.pyrMeanShiftFiltering(img, 9, 28)
s = 2.0
img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_LANCZOS4)
H, W = img.shape[:2]; rng = np.random.default_rng(5)
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
gray = cv2.bilateralFilter(gray, 7, 40, 7)
blur = cv2.GaussianBlur(gray, (0, 0), 1.6 * s); gray = cv2.addWeighted(gray, 1.7, blur, -0.7, 0)   # 小さい元写真でも輪郭がぼけないように
gray = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(6, 6)).apply(gray)
g = gray.astype(np.float32) / 255.0
if a.calm_top > 0:
    ch = int(H * a.calm_top); wv = np.zeros(H, np.float32); wv[:ch] = np.linspace(1, 0, ch) ** 1.4
    g = g * (1 - wv[:, None]) + cv2.GaussianBlur(g, (0, 0), 7 * s) * wv[:, None]
def xdog(g, sigma, kk=1.6, tau=0.985, phi=18.0):
    d = cv2.GaussianBlur(g, (0, 0), sigma) - tau * cv2.GaussianBlur(g, (0, 0), sigma * kk)
    return np.clip(np.where(d >= 0, 1.0, 1.0 + np.tanh(phi * d)), 0, 1)
lines = np.minimum(xdog(g, 0.9 * s, tau=0.982, phi=30), xdog(g, 2.0 * s, tau=0.976, phi=16))
gb = cv2.GaussianBlur(g, (0, 0), 0.8 * s)
def sm(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)
solid = sm(a.dark + 0.04, a.dark - 0.04, gb)                       # 墨ベタ
wash = np.clip((a.mid - gb) / (a.mid - a.dark), 0, 1) ** 1.25 * 0.62   # 薄墨〜中墨（なめらか）
tone = np.maximum(solid, wash)
# にじみ: 薄墨の部分に和紙の繊維のムラを入れる
gran = cv2.GaussianBlur(rng.standard_normal((H, W)).astype(np.float32), (0, 0), 1.6 * s)
gran = gran / np.abs(gran).max()
tone = np.clip(tone * (1 + 0.22 * gran * (tone < 0.9)), 0, 1)
tone = cv2.GaussianBlur(tone, (0, 0), 0.5 * s)
ink = np.maximum(tone, (1.0 - lines) * 0.95)
# 筆のかすれ
noise = cv2.GaussianBlur(rng.random((H, W)).astype(np.float32), (0, 0), 1.0 * s); noise = (noise - noise.min()) / (noise.max() - noise.min())
ink = np.where(ink > 0.75, np.clip(ink - 0.18 * (noise > 0.78), 0, 1), ink)
if a.fade_top > 0:
    fh = int(H * a.fade_top); ramp = np.ones(H, np.float32); ramp[:fh] = np.linspace(0.08, 1, fh) ** 1.6
    streak = cv2.GaussianBlur(rng.random((1, W)).astype(np.float32), (0, 0), 10 * s); streak = (streak - streak.min()) / (streak.max() - streak.min())
    fade = np.clip(ramp[:, None] * (0.8 + 0.5 * streak), 0, 1); fade[fh:] = 1
    ink *= fade
# 和紙
mott = cv2.GaussianBlur(rng.standard_normal((H, W)).astype(np.float32), (0, 0), 60); mott /= np.abs(mott).max()
fib = np.zeros((H, W), np.float32)
for _ in range(int(H * W / 2200)):
    x, y = rng.integers(0, W), rng.integers(0, H); L = rng.integers(10, 40); an = rng.uniform(0, np.pi)
    cv2.line(fib, (int(x), int(y)), (int(x + L * np.cos(an)), int(y + L * np.sin(an))), float(rng.uniform(.3, 1)), 1, cv2.LINE_AA)
paper = np.array([0xE0, 0xE9, 0xED], np.float32)[None, None, :] * (1 + 0.014 * mott[..., None]) + 4.0 * cv2.GaussianBlur(fib, (0, 0), 0.6)[..., None]
inkc = np.array([0x14, 0x14, 0x14], np.float32)
out = paper * (1 - ink[..., None]) + inkc * ink[..., None]
out = np.clip(out, 0, 255).astype(np.uint8)
w = min(a.width, W); out = cv2.resize(out, (w, int(H * w / W)), interpolation=cv2.INTER_AREA)
cv2.imwrite(a.dst, out, [cv2.IMWRITE_JPEG_QUALITY, 84, cv2.IMWRITE_JPEG_PROGRESSIVE, 1])
print("saved", a.dst, out.shape[1], "x", out.shape[0])
