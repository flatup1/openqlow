"""一致度スコアの列から「試合区間」を作る状態機械。

このモジュールは **外部依存ゼロの純ロジック** にしてある。
ffmpeg も numpy も使わないので、どの環境でも一瞬でテストできる。
検出精度の議論は、ここのパラメータだけを見れば足りる。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Sequence


@dataclass(frozen=True)
class SegmentParams:
    """区間化のパラメータ。プロファイル(YAML)から差し替える前提の暫定既定値。"""

    fps: float = 1.0
    """スコアのサンプリング周波数（1.0 = 1秒に1点）。"""

    enter_threshold: float = 0.62
    """この値以上で「試合中」に入る。"""

    exit_threshold: float = 0.45
    """この値未満で「試合外」に戻る。入口より低くする（ヒステリシス）。"""

    min_duration_sec: float = 45.0
    """これより短い区間は捨てる。リプレイやテロップの一瞬の再表示を除去する。"""

    max_gap_sec: float = 20.0
    """この秒数以下の途切れは同じ試合として繋ぐ（引きの画・観客カットなど）。"""

    pre_roll_sec: float = 6.0
    """検出した開始より前に足す秒数（入場の余韻）。"""

    post_roll_sec: float = 8.0
    """検出した終了より後ろに足す秒数（勝ち名乗り）。"""

    long_segment_sec: float = 1200.0
    """これを超える区間は flags に too_long を立てて人間に見てもらう。"""

    def validate(self) -> None:
        if self.fps <= 0:
            raise ValueError("fps は正の数にしてください")
        if not (0.0 <= self.exit_threshold <= self.enter_threshold <= 1.0):
            raise ValueError(
                "しきい値は 0 <= exit_threshold <= enter_threshold <= 1 にしてください"
            )
        for name in ("min_duration_sec", "max_gap_sec", "pre_roll_sec", "post_roll_sec"):
            if getattr(self, name) < 0:
                raise ValueError(f"{name} は0以上にしてください")


@dataclass
class Segment:
    """1試合ぶんの区間。"""

    index: int
    start_sec: float
    end_sec: float
    core_start_sec: float
    core_end_sec: float
    confidence: float
    flags: list[str] = field(default_factory=list)

    @property
    def duration_sec(self) -> float:
        return max(0.0, self.end_sec - self.start_sec)


def _interval_state(scores: Sequence[float], params: SegmentParams) -> list[bool]:
    """ヒステリシス付きで各サンプルの ON/OFF を決める。"""
    states: list[bool] = []
    active = False
    for score in scores:
        if active:
            if score < params.exit_threshold:
                active = False
        else:
            if score >= params.enter_threshold:
                active = True
        states.append(active)
    return states


def _runs(states: Sequence[bool]) -> list[tuple[int, int]]:
    """連続する True の [開始index, 終了index]（終了は含む）を返す。"""
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for i, is_on in enumerate(states):
        if is_on and start is None:
            start = i
        elif not is_on and start is not None:
            runs.append((start, i - 1))
            start = None
    if start is not None:
        runs.append((start, len(states) - 1))
    return runs


def detect_segments(
    scores: Sequence[float],
    params: SegmentParams | None = None,
    *,
    duration_sec: float | None = None,
    start_offset_sec: float = 0.0,
) -> list[Segment]:
    """スコア列から試合区間を作る。

    scores[i] は「start_offset_sec + i / fps 秒時点」の一致度(0.0〜1.0)。
    """
    params = params or SegmentParams()
    params.validate()
    if not scores:
        return []

    step = 1.0 / params.fps
    states = _interval_state(scores, params)
    runs = _runs(states)
    if not runs:
        return []

    # 1) 近すぎる区間を繋ぐ（試合中の一時的なテロップ消失を吸収）
    merged: list[tuple[int, int]] = [runs[0]]
    for start_idx, end_idx in runs[1:]:
        prev_start, prev_end = merged[-1]
        gap_sec = (start_idx - prev_end - 1) * step
        if gap_sec <= params.max_gap_sec:
            merged[-1] = (prev_start, end_idx)
        else:
            merged.append((start_idx, end_idx))

    # 2) 短すぎる区間を捨てる
    kept = [
        (s, e)
        for s, e in merged
        if (e - s + 1) * step >= params.min_duration_sec
    ]
    if not kept:
        return []

    upper_bound = duration_sec if duration_sec is not None else (
        start_offset_sec + len(scores) * step
    )

    segments: list[Segment] = []
    for start_idx, end_idx in kept:
        core_start = start_offset_sec + start_idx * step
        core_end = start_offset_sec + (end_idx + 1) * step
        window = scores[start_idx : end_idx + 1]
        confidence = sum(window) / len(window)
        segments.append(
            Segment(
                index=0,  # 後で採番する
                start_sec=max(0.0, core_start - params.pre_roll_sec),
                end_sec=min(upper_bound, core_end + params.post_roll_sec),
                core_start_sec=core_start,
                core_end_sec=core_end,
                confidence=round(min(1.0, max(0.0, confidence)), 4),
            )
        )

    # 3) のりしろで重なったら中間点で分ける（同じ映像を2本に入れない）
    for prev, current in zip(segments, segments[1:]):
        if current.start_sec < prev.end_sec:
            midpoint = (prev.core_end_sec + current.core_start_sec) / 2.0
            prev.end_sec = midpoint
            current.start_sec = midpoint

    # 4) 採番とフラグ付け
    for number, segment in enumerate(segments, start=1):
        segment.index = number
        if segment.duration_sec >= params.long_segment_sec:
            segment.flags.append("too_long")
        if segment.confidence < params.enter_threshold:
            segment.flags.append("low_confidence")

    return segments
