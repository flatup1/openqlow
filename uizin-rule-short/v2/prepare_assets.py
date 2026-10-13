"""UIZIN ルールポスター（原本PNG）から、動画v2で使うイラストを切り出す。

使い方: python3 prepare_assets.py <ポスターPNGのパス>
- 原本は読み取るだけで変更しない。出力は ./assets/*.jpg
- ポスターの文字（旧ルールの文言・番号）は使わず、イラスト部分だけを切り出す
- 元が約330px幅と小さいので、2倍に拡大して軽くシャープをかける
"""
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageFilter

# (左, 上, 右, 下) = ポスター 1024x1536 上の座標
CROPS = {
    "r2_headgear": (12, 434, 343, 668),   # 01 ヘッドギアの2人（右上の時計アイコンは消す）
    "r4_down": (700, 436, 1012, 668),     # 03 レフェリーとダウンした子
    "r5_draw": (12, 878, 331, 1086),      # 04 グータッチ
    "r6_stop": (349, 878, 682, 1086),     # 05 レフェリーのストップ
    "r7_voice": (699, 879, 1014, 1086),   # 06 ヘッドギアの子
    "hook_hero": (514, 0, 812, 362),      # 表紙の男の子（右側の英字コピーは入れない）
}
# 時計アイコンの位置（ポスター座標）
CLOCK = (238, 372, 336, 478)


def remove_clock(img: Image.Image, box) -> Image.Image:
    """時計アイコン（明るい線）だけを周りの空の色で埋める。"""
    arr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    x0, y0, x1, y1 = box
    region = arr[y0:y1, x0:x1]
    gray = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)
    mask_r = (gray > 110).astype(np.uint8) * 255
    mask_r = cv2.dilate(mask_r, np.ones((5, 5), np.uint8), iterations=1)
    mask = np.zeros(arr.shape[:2], np.uint8)
    mask[y0:y1, x0:x1] = mask_r
    out = cv2.inpaint(arr, mask, 6, cv2.INPAINT_TELEA)
    return Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGR2RGB))


def main() -> None:
    src_path = Path(sys.argv[1])
    out_dir = Path(__file__).parent / "assets"
    out_dir.mkdir(exist_ok=True)
    poster = Image.open(src_path).convert("RGB")
    assert poster.size == (1024, 1536), f"想定外のサイズ: {poster.size}"
    cleaned = remove_clock(poster, CLOCK)
    for name, box in CROPS.items():
        base = cleaned if name == "r2_headgear" else poster
        im = base.crop(box)
        im = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
        im = im.filter(ImageFilter.UnsharpMask(radius=1.6, percent=70, threshold=2))
        im.save(out_dir / f"{name}.jpg", quality=93)
        print(name, im.size)


if __name__ == "__main__":
    main()
