"""枠の中身を「文字」でターミナルに出す。

★なぜ必要か
　枠(ROI)の位置が合っているかは、切り出した画像を見れば一目で分かる。
　ところが画像は、環境によっては受け渡しが面倒で、確認が止まってしまう。
　実際にそれで詰まった（原寸PNGが数MBあり、貼るのが負担だった）。

　**文字なら、ターミナルからそのままコピーできる。**
　精度は落ちるが「ROUNDの文字が入っているか / タイマーを含んでいないか」の
　判断には十分で、確認が止まらないことのほうがはるかに価値が高い。
"""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Sequence

import numpy as np

from .shellcmd import run
from .steps.score import crop_filter

# 暗い→明るい。黒地に白文字のテロップを想定しているので、
# 文字の部分が濃い記号になって浮かび上がる。
RAMP = " .:-=+*#%@"


def cell_rows(roi: Sequence[int], cols: int) -> int:
    """指定した文字数の横幅に対して、縦を何行にするか。

    ★文字は横より縦に長い（およそ1:2）。縦横比をそのまま行数にすると
    　縦に間延びして、形が判断できなくなる。だから半分にする。
    """
    _, _, width, height = (int(v) for v in roi)
    if width <= 0 or height <= 0:
        raise ValueError(f"ROIの幅・高さは正の数にしてください: {roi}")
    if cols <= 0:
        raise ValueError("横の文字数は1以上にしてください")
    return max(2, round(cols * height / width / 2))


def to_ascii(gray: np.ndarray, ramp: str = RAMP) -> list[str]:
    """0-255 の濃淡を文字の行に変える（純ロジック・テスト対象）。"""
    if gray.ndim != 2:
        raise ValueError("2次元の濃淡データを渡してください")
    if len(ramp) < 2:
        raise ValueError("濃淡の記号は2文字以上必要です")
    # ★その画像の中での相対値にする。絶対値だと、明るい場面では全部濃く、
    #   暗い場面では全部薄くなり、形が見えない。
    low = int(gray.min())
    high = int(gray.max())
    span = high - low
    if span == 0:
        return [ramp[0] * gray.shape[1] for _ in range(gray.shape[0])]
    scaled = (gray.astype(np.float64) - low) / span * (len(ramp) - 1)
    index = np.rint(scaled).astype(int)
    return ["".join(ramp[i] for i in row) for row in index]


def grab_gray(video: Path, at_sec: float, roi: Sequence[int], cols: int, rows: int) -> np.ndarray:
    """動画の1コマから枠内を切り出し、指定サイズの濃淡データにする。"""
    with tempfile.TemporaryDirectory() as tmp:
        raw = Path(tmp) / "roi.gray"
        run(
            [
                "ffmpeg", "-v", "error", "-nostdin", "-y",
                "-ss", f"{float(at_sec):.3f}",
                "-i", str(video),
                "-frames:v", "1",
                "-vf", f"{crop_filter(roi)},scale={cols}:{rows},format=gray",
                "-f", "rawvideo", "-pix_fmt", "gray",
                str(raw),
            ],
            quiet=True,
        )
        data = np.frombuffer(raw.read_bytes(), dtype=np.uint8)
    if data.size != cols * rows:
        raise RuntimeError(
            f"取り出せた画素数が合いません（{data.size} != {cols * rows}）。"
            "時刻が動画の長さを超えていないか確認してください。"
        )
    return data.reshape(rows, cols)


def render(video: Path, at_sec: float, roi: Sequence[int], cols: int = 72) -> list[str]:
    """枠の中身を文字の行にして返す。"""
    rows = cell_rows(roi, cols)
    return to_ascii(grab_gray(video, at_sec, roi, cols, rows))


def frame_lines(lines: Sequence[str], roi: Sequence[int]) -> list[str]:
    """座標が読めるように枠線を付ける。貼り付けたときに何を見ているか分かる。"""
    x, y, width, height = (int(v) for v in roi)
    body = [f"|{line}|" for line in lines]
    edge = "+" + "-" * (len(lines[0]) if lines else 0) + "+"
    return [
        f"ROI x={x} y={y} 幅={width} 高={height}  （右下 x={x + width} y={y + height}）",
        edge,
        *body,
        edge,
    ]
