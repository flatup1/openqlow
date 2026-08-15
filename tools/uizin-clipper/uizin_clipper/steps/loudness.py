"""音量を一定間隔で測る（歓声・実況・打撃音）。

ffmpeg で「モノラル・低いサンプリングレートの生の波形」をもらい、
一定サンプルごとの RMS（実効値）を出すだけです。
音声解析ライブラリも学習済みモデルも使いません。

8kHz に落としているのは、**大きさが分かればよく、何を言っているかは要らない**からです。
4時間ぶんでも 8000 サンプル/秒 × 2バイト ≒ 230MB を流すだけで済みます。
"""

from __future__ import annotations

import subprocess
from pathlib import Path

from ..shellcmd import require_tool

SAMPLE_RATE = 8000
"""音量を測るためだけのレート。声の内容は使わないのでこれで足りる。"""

_CHUNK_FRAMES = 1 << 16


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
) -> list[float]:
    """`start_sec` から `duration_sec` ぶんの音量を `step_sec` ごとに返す。

    返す値は RMS（0.0〜1.0 付近）。無音なら 0.0。
    音声トラックが無い動画では空リストを返す（呼び出し側で運動量だけに切り替える）。
    """
    if duration_sec <= 0:
        raise ValueError("duration_sec は正の数にしてください")
    if step_sec <= 0:
        raise ValueError("step_sec は正の数にしてください")

    ffmpeg = require_tool("ffmpeg")
    numpy = _numpy()

    argv = [
        ffmpeg, "-v", "error", "-nostdin",
        "-ss", f"{max(0.0, start_sec):.3f}",
        "-t", f"{duration_sec:.3f}",
        "-i", str(video),
        "-vn", "-sn", "-dn",
        "-ac", "1", "-ar", str(SAMPLE_RATE),
        "-f", "s16le", "-",
    ]
    process = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert process.stdout is not None

    per_step = int(round(SAMPLE_RATE * step_sec))
    values: list[float] = []
    pending = numpy.empty(0, dtype=numpy.int16)
    try:
        while True:
            raw = process.stdout.read(_CHUNK_FRAMES * 2)
            if not raw:
                break
            block = numpy.frombuffer(raw, dtype=numpy.int16)
            pending = numpy.concatenate((pending, block)) if pending.size else block
            usable = (pending.size // per_step) * per_step
            if usable:
                shaped = pending[:usable].astype(numpy.float32) / 32768.0
                shaped = shaped.reshape(-1, per_step)
                values.extend(numpy.sqrt((shaped**2).mean(axis=1)).tolist())
                pending = pending[usable:]
    finally:
        process.stdout.close()
        process.wait()

    if process.returncode not in (0, None) and not values:
        # 音声トラックが無い場合もここに来る。呼び出し側で判断できるよう空を返す。
        return []
    return values
