"""ゴング（試合開始の合図）で境界を微調整する（純ロジック・外部依存ゼロ）。

**なぜ必要か**
スコアボードは、ゴングと同時に出るとは限りません。数秒早く出ることも遅く出ることもある。
一方ゴングは、試合開始そのものです。だから**スコアボードで大まかに決めて、
音で数秒だけ寄せる**と、開始が実際の試合開始に近づきます。

**なぜ主判定にしないか**
ゴングだけを頼りにすると、歓声・入場曲・マイクのハウリングを拾って壊れます。
「スコアボードで決めた位置の前後数秒」という狭い窓の中でだけ探せば、
その危険はほぼ消えます。**探す範囲を絞ることが、この処理の肝です。**

**外したら動かさない**
窓の中に明確な立ち上がりが無ければ、元の位置のままにします。
自信のないときに動かさないのは、動かして外すより安全です。
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class OnsetParams:
    search_sec: float = 6.0
    """検出位置の前後、何秒まで探すか。広げるほど別の音を拾う危険が増える。"""

    compare_sec: float = 2.0
    """立ち上がりの大きさを測るのに使う、前後それぞれの長さ。"""

    min_jump: float = 1.0
    """これ未満の立ち上がりなら「見つからなかった」とみなして動かさない。

    単位は、その窓の中での偏差値。1.0 は「ばらつき1つぶん跳ねた」という意味。
    """


def find_onset(
    values: list[float],
    params: OnsetParams,
    *,
    step_sec: float,
) -> float | None:
    """立ち上がりが一番はっきりしている位置（先頭からの秒数）を返す。

    見つからなければ None。`values` は窓のぶんだけ切り出した音量の並び。
    """
    if step_sec <= 0:
        raise ValueError("step_sec は正の数にしてください")
    span = max(1, int(round(params.compare_sec / step_sec)))
    if len(values) < span * 2 + 1:
        return None

    # 窓の中で正規化する。会場の音量そのものではなく「跳ね方」だけを見たいため。
    count = len(values)
    mean = sum(values) / count
    variance = sum((v - mean) ** 2 for v in values) / count
    if variance <= 1e-12:
        return None
    deviation = variance**0.5
    normalized = [(v - mean) / deviation for v in values]

    best_position = None
    best_jump = 0.0
    for position in range(span, count - span):
        before = sum(normalized[position - span : position]) / span
        after = sum(normalized[position : position + span]) / span
        jump = after - before
        if jump > best_jump:
            best_jump, best_position = jump, position

    if best_position is None or best_jump < params.min_jump:
        return None
    return best_position * step_sec


def refine_start(
    current_start_sec: float,
    values: list[float],
    params: OnsetParams,
    *,
    step_sec: float,
    window_start_sec: float,
) -> tuple[float, float | None]:
    """開始位置を寄せた結果と、動かした秒数を返す。

    動かさなかった場合は `(元の位置, None)`。
    """
    found = find_onset(values, params, step_sec=step_sec)
    if found is None:
        return current_start_sec, None

    moved_to = window_start_sec + found
    shift = moved_to - current_start_sec
    if abs(shift) > params.search_sec:
        # 窓の端に張り付いた＝窓の外にもっと大きい音がある可能性。動かさない。
        return current_start_sec, None
    return moved_to, shift
