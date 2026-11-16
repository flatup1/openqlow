"""シェア用の画像（OGP・1200×630）: 和紙 + 朱の円相 + 「柔」 + サイト名。人物は入れない。
使い方: python3 og.py 円相PNG 筆文字TTF AntonTTF Barlow700TTF 出力JPG"""
import sys, numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter
enso_p, kanji_p, anton_p, barlow_p, dst = sys.argv[1:6]
K = 2; W, H = 1200 * K, 630 * K
rng = np.random.default_rng(11)
PAPER = np.array([0xED, 0xE9, 0xE0], np.float32); INK = (0x14, 0x14, 0x14); SHU = (0xB5, 0x12, 0x1B)
mott = cv2.GaussianBlur(rng.standard_normal((H, W)).astype(np.float32), (0, 0), 90); mott /= np.abs(mott).max()
grain = rng.standard_normal((H, W)).astype(np.float32)
fib = np.zeros((H, W), np.float32)
for _ in range(900):
    x, y = rng.integers(0, W), rng.integers(0, H); L = rng.integers(18, 70); ang = rng.uniform(0, np.pi)
    cv2.line(fib, (int(x), int(y)), (int(x + L * np.cos(ang)), int(y + L * np.sin(ang))), float(rng.uniform(.3, 1)), 1, cv2.LINE_AA)
fib = cv2.GaussianBlur(fib, (0, 0), 0.7)
base = PAPER[None, None, :] * (1 + 0.012 * mott[..., None] + 0.008 * grain[..., None]) + 5.0 * fib[..., None]
img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).convert("RGBA")
# right: enso with the kanji inside
D = int(H * 0.86); cx, cy = int(W * 0.765), int(H * 0.5)
f = ImageFont.truetype(kanji_p, int(D * 0.56)); k = Image.new("L", (W, H), 0); d = ImageDraw.Draw(k)
bb = d.textbbox((0, 0), "柔", font=f); d.text((cx - (bb[0] + bb[2]) / 2, cy - (bb[1] + bb[3]) / 2), "柔", font=f, fill=255)
kl = Image.new("RGBA", (W, H), INK + (0,)); kl.putalpha(k.point(lambda v: int(v * 0.94))); img.alpha_composite(kl)
e = Image.open(enso_p).convert("RGBA").resize((D, D), Image.LANCZOS); img.alpha_composite(e, (cx - D // 2, cy - D // 2))
# left: type
d = ImageDraw.Draw(img); x0 = int(W * 0.06)
def spaced(xy, text, font, fill, track):
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=font, fill=fill); x += d.textlength(ch, font=font) + track
eb = ImageFont.truetype(barlow_p, 15 * K); spaced((x0, int(H * 0.215)), "MMA JIU-JITSU EXPERIENCE · NARITA, JAPAN", eb, SHU + (255,), 3.0 * K)
t = ImageFont.truetype(anton_p, 104 * K)
d.text((x0, int(H * 0.27)), "JAPAN MMA", font=t, fill=INK + (255,)); d.text((x0, int(H * 0.27) + 106 * K), "JIU-JITSU", font=t, fill=INK + (255,))
sb = ImageFont.truetype(barlow_p, 25 * K)
d.text((x0, int(H * 0.70)), "Leg locks · Triangle · Armbar", font=sb, fill=INK + (255,))
d.text((x0, int(H * 0.70) + 34 * K), "No-gi · No sparring · Near Narita Airport", font=sb, fill=(0x4E, 0x4A, 0x44, 255))
out = img.convert("RGB").resize((1200, 630), Image.LANCZOS); out.save(dst, quality=86, optimize=True, progressive=True)
print("saved", dst, out.size)
