"""運動量を一定間隔で測る（打撃の交換・もつれ・カメラの寄り）。

隣り合うフレームの差の平均を取るだけです。物体検出も姿勢推定も使いません。

**なぜこれで足りるか**
選手が激しく動けば画面は大きく変わります。動きが止まれば変わりません。
「誰が何をしたか」は要らず、「激しいかどうか」だけが要るので、
差分の平均で十分です。

**なぜ主軸にしないか**
カメラを切り替えただけでも差分は跳ねます。単独で信用すると
カット割りの多い場面ばかり選んでしまうので、音量より軽く扱います。
"""

from __future__ import annotations

import subprocess
from pathlib import Path

from ..shellcmd import require_tool

FRAME_WIDTH = 96
FRAME_HEIGHT = 54
"""比較用の縮小サイズ。小さいほど速く、圧縮ノイズにも強い。
16:9 を保っているので、縦横比の違う映像でも歪んだまま一貫して比較できる。"""

SAMPLE_FPS = 4.0
"""1秒に4枚。打撃の交換を捉えるにはこれで足りる（1枚では速い動きを見落とす）。"""


def _numpy():
    try:
        import numpy  # noqa: PLC0415
    except ImportError as exc:  # pragma: no cover - 環境依存
        raise RuntimeError(
            "numpy が必要です。`pip install -r requirements.txt` を実行してください。"
        ) from exc
    return numpy


def measure(
    video: Path,
    *,
    start_sec: float,
    duration_sec: float,
    step_sec: float = 1.0,
    sample_fps: float = SAMPLE_FPS,
) -> list[float]:
    """`step_sec` ごとの運動量（0.0〜1.0付近）を返す。"""
    if duration_sec <= 0:
        raise ValueError("duration_sec は正の数にしてください")
    if step_sec <= 0:
        raise ValueError("step_sec は正の数にしてください")
    if sample_fps <= 0:
        raise ValueError("sample_fps は正の数にしてください")

    ffmpeg = require_tool("ffmpeg")
    numpy = _numpy()

    frame_bytes = FRAME_WIDTH * FRAME_HEIGHT
    argv = [
        ffmpeg, "-v", "error", "-nostdin",
        "-ss", f"{max(0.0, start_sec):.3f}",
        "-t", f"{duration_sec:.3f}",
        "-i", str(video),
        "-an", "-sn", "-dn",
        "-vf", f"fps={sample_fps},scale={FRAME_WIDTH}:{FRAME_HEIGHT},format=gray",
        "-f", "rawvideo", "-pix_fmt", "gray", "-",
    ]
    process = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert process.stdout is not None

    per_step = max(1, int(round(sample_fps * step_sec)))
    differences: list[float] = []
    previous = None
    try:
        while True:
            chunk = process.stdout.read(frame_bytes)
            if not chunk or len(chunk) < frame_bytes:
                break
            frame = numpy.frombuffer(chunk, dtype=numpy.uint8).astype(numpy.float32)
            if previous is not None:
                differences.append(float(numpy.abs(frame - previous).mean()) / 255.0)
            previous = frame
    finally:
        process.stdout.close()
        process.wait()

    if not differences:
        return []

    values: list[float] = []
    for position in range(0, len(differences), per_step):
        window = differences[position : position + per_step]
        if window:
            values.append(sum(window) / len(window))
    return values
