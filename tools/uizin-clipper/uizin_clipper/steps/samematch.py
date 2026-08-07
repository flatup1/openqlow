"""途切れの前後が「同じ試合か」を判定する。

ラウンド間でスコアボードが消えると、1試合が2本に割れる。
かといって `max_gap_sec` を大きくすると、今度は隣の試合と繋がってしまう。
実測でも 20秒→分割、90秒→結合 となり、秒数だけでは必ずどちらかに倒れる。

そこで秒数に頼らず、**途切れの前後で選手名テロップが同じかどうか**を見る。

- 同じ → ラウンド間なので繋ぐ
- 違う → 次の試合が始まったので繋がない

比較は主判定と同じ ZNCC。AIも学習も不要で、なぜそう判定したかを数値で説明できる。
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Sequence

from ..shellcmd import require_tool
from .score import build_filter, zncc


def sample_roi(video: Path, at_sec: float, roi: Sequence[int], size: Sequence[int]):
    """指定時刻の ROI を1枚だけ切り出してグレースケール配列で返す。"""
    from .score import _numpy  # noqa: PLC0415

    np = _numpy()
    require_tool("ffmpeg")
    width, height = (int(v) for v in size)
    argv = [
        "ffmpeg", "-v", "error", "-nostdin",
        "-ss", f"{max(0.0, at_sec):.3f}",
        "-i", str(video),
        "-frames:v", "1",
        "-vf", build_filter(roi, size, None),
        "-f", "rawvideo", "-pix_fmt", "gray", "-",
    ]
    result = subprocess.run(argv, capture_output=True)
    if result.returncode != 0 or len(result.stdout) < width * height:
        raise RuntimeError(
            f"{at_sec:.1f}秒 のフレームを取得できません:\n"
            f"{result.stderr.decode('utf-8', 'ignore')[-300:]}"
        )
    return np.frombuffer(result.stdout[: width * height], dtype=np.uint8).astype(np.float32)


def same_content(
    video: Path,
    roi: Sequence[int],
    size: Sequence[int],
    at_a: float,
    at_b: float,
) -> float:
    """2つの時刻の ROI がどれだけ似ているかを返す（0.0〜1.0）。"""
    a = sample_roi(video, at_a, roi, size)
    b = sample_roi(video, at_b, roi, size)
    return max(0.0, zncc(a, b))


def make_round_decider(
    video: Path,
    roi: Sequence[int],
    size: Sequence[int],
    threshold: float,
    *,
    inset_sec: float = 2.0,
    verbose: bool = True,
):
    """`segment.merge_rounds` に渡す判定関数を作る。

    途切れの「直前」と「直後」を少し内側に入った位置で見る（境界のちらつきを避ける）。
    """
    def decide(prev, current) -> bool:
        before = max(0.0, prev.core_end_sec - inset_sec)
        after = current.core_start_sec + inset_sec
        score = same_content(video, roi, size, before, after)
        merged = score >= threshold
        if verbose:
            gap = current.core_start_sec - prev.core_end_sec
            verdict = "同じ試合（繋ぐ）" if merged else "別の試合（繋がない）"
            print(
                f"[round] 途切れ {gap:.0f}秒: テロップ一致度 {score:.3f} → {verdict}"
            )
        return merged

    return decide
