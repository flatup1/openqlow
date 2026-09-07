"""1試合の中から「見どころ」候補を選ぶ（純ロジック・外部依存ゼロ）。

**考え方**

見どころに共通するのは「静かだったものが急に動く」ことです。
だから絶対値ではなく、**その試合の中での相対的な急上昇**だけを見ます。
会場の広さ・マイクの位置・カメラの寄りが大会ごとに違っても、
試合の中で正規化すれば同じ基準が使えます。

使う信号は2つだけ。どちらも ffmpeg で取れます。

1. **音量**（歓声・実況・打撃音）… ダウンやKOの直後に必ず跳ねる。主軸。
2. **運動量**（隣り合うフレームの差）… 歓声が薄い好局面を拾う。従軸。

さらに「試合の終わり際」に軽い加点をします。決着はほぼ必ずそこにあるからです。

**AI を使わない理由**
「ダウンを検出する」には学習が要りますが、ダウンが起きたときに
音量と運動量が同時に跳ねるのは物理的にほぼ確実です。
安いほうの信号で同じ場所に着地できるなら、そちらを使います。

**完全自動にしない理由**
上位N本を `highlights.json` に出して、人間が見て選びます。
`segments.json` と同じで、機械が9割、人間が1割です。
"""

from __future__ import annotations

from dataclasses import dataclass, field

MIN_CLIP_SEC = 15.0
MAX_CLIP_SEC = 60.0


@dataclass
class HighlightParams:
    """見どころ抽出の調整値。すべて秒とスコアの単位。"""

    top_n: int = 3
    """1試合から取り出す本数。"""

    min_clip_sec: float = MIN_CLIP_SEC
    max_clip_sec: float = MAX_CLIP_SEC

    lead_in_sec: float = 7.0
    """盛り上がりの「手前」を何秒入れるか。

    ★歓声は出来事の**あと**に来る。ピークだけを切ると、
      肝心の打撃が画面に映らないクリップになる。
    """

    tail_sec: float = 5.0
    """盛り上がりの「あと」を何秒残すか（倒れた相手・レフェリーの反応）。"""

    min_gap_sec: float = 20.0
    """候補どうしを最低これだけ離す。同じ場面を2本作らないため。"""

    loudness_weight: float = 1.0
    motion_weight: float = 0.6
    """運動量を音量より軽くする。カメラの切り替えでも運動量は跳ねるため、
    単独では信用しない。"""

    ending_bonus: float = 0.5
    """試合の終わり際への加点の大きさ。"""

    ending_span_sec: float = 90.0
    """終わりから何秒ぶんを「終わり際」とみなすか。"""

    smooth_sec: float = 3.0
    """スコアをならす窓幅。1秒だけの物音で選ばれるのを防ぐ。"""

    min_score: float = 0.5
    """このスコアに届かない場面は、本数が埋まらなくても候補にしない。

    ★スコアはその試合の中での偏差値なので、0 が「その試合の平均」。
      0.5 は「平均より半歩だけ上」。ここを外すと、盛り上がりのない
      平坦な場所を本数合わせで拾ってしまう（実際にテストで出た）。
      淡々とした試合では候補が top_n より少なくなるが、
      **無い物を出すより少なく出すほうが正しい。**
    """

    def validate(self) -> None:
        if self.top_n < 1:
            raise ValueError("top_n は1以上にしてください")
        if not 0 < self.min_clip_sec <= self.max_clip_sec:
            raise ValueError("min_clip_sec と max_clip_sec の関係が不正です")
        if self.lead_in_sec < 0 or self.tail_sec < 0:
            raise ValueError("のりしろは0以上にしてください")


@dataclass
class Highlight:
    """見どころ候補1本。時刻は「試合の頭からの秒数」ではなく元動画の絶対秒。"""

    index: int
    start_sec: float
    end_sec: float
    peak_sec: float
    score: float
    reason: str
    flags: list[str] = field(default_factory=list)

    @property
    def duration_sec(self) -> float:
        return self.end_sec - self.start_sec


def zscore(values: list[float]) -> list[float]:
    """平均0・ばらつき1にそろえる。会場やマイクの違いを吸収する。"""
    if not values:
        return []
    count = len(values)
    mean = sum(values) / count
    variance = sum((v - mean) ** 2 for v in values) / count
    if variance <= 1e-12:
        return [0.0] * count
    deviation = variance**0.5
    return [(v - mean) / deviation for v in values]


def moving_average(values: list[float], window: int) -> list[float]:
    """単純移動平均。窓は奇数に丸めて中央ぞろえにする。"""
    if window <= 1 or not values:
        return list(values)
    half = window // 2
    smoothed: list[float] = []
    for position in range(len(values)):
        low = max(0, position - half)
        high = min(len(values), position + half + 1)
        window_values = values[low:high]
        smoothed.append(sum(window_values) / len(window_values))
    return smoothed


def combine_scores(
    loudness: list[float],
    motion: list[float],
    params: HighlightParams,
    *,
    step_sec: float,
) -> list[float]:
    """音量と運動量を1本のスコアにまとめる。

    長さが違う場合は短いほうに合わせる（測り方の都合で1つずれることがある）。
    """
    if step_sec <= 0:
        raise ValueError("step_sec は正の数にしてください")

    count = min(len(loudness), len(motion)) if motion else len(loudness)
    if count == 0:
        return []

    loud = zscore(list(loudness[:count]))
    move = zscore(list(motion[:count])) if motion else [0.0] * count

    scores = [
        params.loudness_weight * loud[i] + params.motion_weight * move[i]
        for i in range(count)
    ]

    # 試合の終わり際に、終端へ近づくほど大きくなる加点を足す
    if params.ending_bonus > 0 and params.ending_span_sec > 0:
        span_steps = max(1, int(round(params.ending_span_sec / step_sec)))
        for offset in range(min(span_steps, count)):
            position = count - 1 - offset
            nearness = 1.0 - (offset / span_steps)
            scores[position] += params.ending_bonus * nearness

    window = max(1, int(round(params.smooth_sec / step_sec)))
    return moving_average(scores, window)


def _describe(
    peak_sec: float,
    duration_sec: float,
    match_duration_sec: float,
    params: HighlightParams,
) -> str:
    """なぜ選ばれたかを日本語で1行にする（人間が選ぶときの手がかり）。"""
    remaining = match_duration_sec - peak_sec
    if remaining <= params.ending_span_sec:
        return "試合の終わり際の盛り上がり（決着の可能性が高い）"
    return "音量と動きが急に上がった場面"


def pick_highlights(
    scores: list[float],
    params: HighlightParams,
    *,
    step_sec: float,
    offset_sec: float = 0.0,
    match_duration_sec: float | None = None,
) -> list[Highlight]:
    """スコアの山を高いほうから取り、重ならないように候補を切り出す。

    `offset_sec` は試合の開始絶対秒。返す時刻は元動画の絶対秒になる。
    """
    params.validate()
    if step_sec <= 0:
        raise ValueError("step_sec は正の数にしてください")
    if not scores:
        return []

    total_sec = len(scores) * step_sec
    duration = match_duration_sec if match_duration_sec is not None else total_sec

    order = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
    chosen: list[Highlight] = []
    taken: list[tuple[float, float]] = []

    for position in order:
        if len(chosen) >= params.top_n:
            break
        if scores[position] < params.min_score:
            break  # 以降はもっと低い。本数合わせで平坦な場所を拾わない
        peak = position * step_sec

        start = peak - params.lead_in_sec
        end = peak + params.tail_sec
        if end - start < params.min_clip_sec:
            # 足りないぶんは前後に均等に伸ばす（出来事の手前を優先）
            shortage = params.min_clip_sec - (end - start)
            start -= shortage * 0.6
            end += shortage * 0.4
        if end - start > params.max_clip_sec:
            end = start + params.max_clip_sec

        start = max(0.0, start)
        end = min(duration, end)
        if end - start < params.min_clip_sec:
            # 試合の端に寄りすぎて尺が取れない場合は反対側へ伸ばす
            if end >= duration:
                start = max(0.0, duration - params.min_clip_sec)
            else:
                end = min(duration, start + params.min_clip_sec)
        if end - start < params.min_clip_sec:
            continue  # 試合そのものが短くて15秒取れない

        if any(start < kept_end + params.min_gap_sec and kept_start - params.min_gap_sec < end
               for kept_start, kept_end in taken):
            continue

        taken.append((start, end))
        chosen.append(
            Highlight(
                index=0,
                start_sec=round(offset_sec + start, 3),
                end_sec=round(offset_sec + end, 3),
                peak_sec=round(offset_sec + peak, 3),
                score=round(scores[position], 4),
                reason=_describe(peak, end - start, duration, params),
            )
        )

    chosen.sort(key=lambda h: h.start_sec)
    for number, highlight in enumerate(chosen, start=1):
        highlight.index = number
    return chosen
