"""試合区間をMP4として書き出す。

`-c copy`（ストリームコピー）なので **再エンコードなし＝画質劣化ゼロ・高速**。
ただしストリームコピーはキーフレームでしか切れないため、
開始位置は「直前のキーフレーム」に吸着させる。
その差分（lead_in）は前のりしろとして自然に使えるので、実用上は有利。
"""

from __future__ import annotations

import bisect
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from ..shellcmd import run


@dataclass(frozen=True)
class CutPlan:
    seek_sec: float
    """実際に ffmpeg へ渡す開始位置（キーフレーム）。"""

    duration_sec: float
    """seek_sec からの長さ。"""

    lead_in_sec: float
    """要求した開始位置より何秒前から始まるか。"""

    @property
    def end_sec(self) -> float:
        return self.seek_sec + self.duration_sec


def plan_cut(
    start_sec: float,
    end_sec: float,
    keyframes: Sequence[float],
    *,
    max_lead_in_sec: float = 12.0,
) -> CutPlan:
    """無劣化カットの実際の切り出し範囲を決める（純ロジック）。"""
    if end_sec <= start_sec:
        raise ValueError(f"終了は開始より後にしてください: {start_sec} -> {end_sec}")

    start = max(0.0, float(start_sec))
    seek = start
    if keyframes:
        position = bisect.bisect_right(list(keyframes), start)
        if position > 0:
            candidate = float(keyframes[position - 1])
            # 極端に手前のキーフレームまで戻ると別の場面が混ざるので上限をかける
            if start - candidate <= max_lead_in_sec:
                seek = candidate

    return CutPlan(
        seek_sec=round(seek, 3),
        duration_sec=round(float(end_sec) - seek, 3),
        lead_in_sec=round(start - seek, 3),
    )


def cut(
    source: Path,
    output: Path,
    plan: CutPlan,
    *,
    overwrite: bool = False,
) -> Path:
    """1本ぶんを書き出す。既にあればスキップ（何度実行しても安全）。"""
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists() and not overwrite:
        print(f"[render] 既にあるので省略: {output.name}")
        return output

    run(
        [
            "ffmpeg", "-v", "error", "-nostdin", "-y",
            "-ss", f"{plan.seek_sec:.3f}",
            "-i", str(source),
            "-t", f"{plan.duration_sec:.3f}",
            "-map", "0:v:0", "-map", "0:a:0?",
            "-c", "copy",
            "-avoid_negative_ts", "make_zero",
            "-movflags", "+faststart",
            str(output),
        ],
        capture=True,
        quiet=True,
    )
    return output
