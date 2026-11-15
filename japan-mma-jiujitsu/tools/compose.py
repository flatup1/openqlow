"""見本の合成: 和紙 + 薄墨の「柔」 + 朱の円相 + 墨絵風の人物 → ヒーロー画像。
使い方: python3 compose.py 人物PNG 円相PNG 柔フォントTTF 出力PNG [W H]"""
import sys, numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter
fig_p, enso_p, font_p, dst = sys.argv[1:5]
W, H = (int(sys.argv[5]), int(sys.argv[6])) if len(sys.argv) > 6 else (2560, 1440)
rng = np.random.default_rng(11)
PAPER = np.array([0xED, 0xE9, 0xE0], np.float32); INK = (0x14, 0x14, 0x14)
# washi: soft mottling + fine fibres
mott = cv2.GaussianBlur(rng.standard_normal((H, W)).astype(np.float32), (0, 0), 90); mott /= np.abs(mott).max()
grain = rng.standard_normal((H, W)).astype(np.float32)
fib = np.zeros((H, W), np.float32)
for _ in range(1400):
    x, y = rng.integers(0, W), rng.integers(0, H); L = rng.integers(18, 70); ang = rng.uniform(0, np.pi)
    cv2.line(fib, (int(x), int(y)), (int(x + L * np.cos(ang)), int(y + L * np.sin(ang))), float(rng.uniform(.3, 1)), 1, cv2.LINE_AA)
fib = cv2.GaussianBlur(fib, (0, 0), 0.7)
base = PAPER[None, None, :] * (1 + 0.012 * mott[..., None] + 0.008 * grain[..., None]) + 5.0 * fib[..., None]
img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).convert("RGBA")
portrait = H > W
# figure + enso placement: landscape → right 55%; portrait → top 60%
if portrait: cx, cy, D = W * 0.50, H * 0.31, W * 1.02
else:        cx, cy, D = W * 0.685, H * 0.50, H * 0.98
# 柔 in pale ink
ks = int(D * 0.92); f = ImageFont.truetype(font_p, ks)
k = Image.new("L", (W, H), 0); d = ImageDraw.Draw(k)
bb = d.textbbox((0, 0), "柔", font=f); d.text((cx - (bb[0] + bb[2]) / 2 + D * 0.04, cy - (bb[1] + bb[3]) / 2), "柔", font=f, fill=255)
k = k.filter(ImageFilter.GaussianBlur(1.2))
kl = Image.new("RGBA", (W, H), INK + (0,)); kl.putalpha(k.point(lambda v: int(v * 0.12))); img.alpha_composite(kl)
# enso
e = Image.open(enso_p).convert("RGBA").resize((int(D), int(D)), Image.LANCZOS)
img.alpha_composite(e, (int(cx - D / 2), int(cy - D / 2)))
# ground wash under the figure
fig = Image.open(fig_p).convert("RGBA")
fh = int(D * 0.80); fw = int(fig.width * fh / fig.height); fig = fig.resize((fw, fh), Image.LANCZOS)
fx, fy = int(cx - fw / 2 + D * 0.02), int(cy - fh / 2 + D * 0.03)
g = np.zeros((H, W), np.float32)
cv2.ellipse(g, (int(fx + fw * 0.5), int(fy + fh * 0.985)), (int(fw * 0.62), int(fh * 0.035)), 0, 0, 360, 1.0, -1, cv2.LINE_AA)
g = cv2.GaussianBlur(g, (0, 0), D * 0.012) * (0.75 + 0.25 * cv2.GaussianBlur(rng.random((H, W)).astype(np.float32), (0, 0), 6))
gl = Image.new("RGBA", (W, H), INK + (0,)); gl.putalpha(Image.fromarray((np.clip(g, 0, 1) * 120).astype(np.uint8))); img.alpha_composite(gl)
img.alpha_composite(fig, (fx, fy))
# gentle vignette
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32); v = ((xx / W - .5) ** 2 + (yy / H - .5) ** 2) ** .5
a = np.asarray(img.convert("RGB")).astype(np.float32) * (1 - 0.10 * np.clip((v - .45) / .3, 0, 1))[..., None]
Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(dst)
print("saved", dst, (W, H))
