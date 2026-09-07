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

from .stats import MIN_DEVIATION, normalize


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

    min_deviation: float = MIN_DEVIATION
    """窓の中の音量のばらつきがこれ未満なら、最初から探さない。

    ★偏差値は「ばらつきで割る」ので、**ばらつきがほぼゼロだと計算上の微小な揺れが
      巨大な跳ねに化ける**。4時間素材で実際に起きた:
        ばらつき 0.000001 の平坦な音に対して、2件の開始位置が誤って動いた。
      ゼロ割り防止（1e-12）だけでは足りず、**音量の実寸での下限**が要る。

      音量は 0.0〜1.0。本物のゴングなら 0.02 → 0.3 のように跳ねるので、
      その窓のばらつきは 0.05 以上になる。0.005 はその10分の1で、十分に安全側。
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
    normalized = normalize(values, min_deviation=params.min_deviation)
    if normalized is None:
        # 平坦な音。ここで割ると微小な揺れが巨大な跳ねに化けるので、探さない。
        return None

    count = len(values)
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


def refine_end(
    current_end_sec: float,
    values: list[float],
    params: OnsetParams,
    *,
    step_sec: float,
    window_start_sec: float,
) -> tuple[float, float | None]:
    """終了位置を、終了のゴングに寄せた結果と、動かした秒数を返す。

    **開始と同じ理屈です。** スコアボードが消えるのはゴングと同時とは限りません。
    ゴングは試合終了そのものなので、そこに寄せると終わりが実際の終了に近づきます。

    ★★**終了はゴングより前に動かしません。**
      前に動かすと、決着の瞬間そのものが切り抜きから落ちます。
      切り抜きは「決まった瞬間」が命なので、迷ったら後ろに残すのが正しい。
      ゴングが検出位置より前に見つかった場合は、動かさずそのままにします。

    動かさなかった場合は `(元の位置, None)`。
    """
    found = find_onset(values, params, step_sec=step_sec)
    if found is None:
        return current_end_sec, None

    moved_to = window_start_sec + found
    shift = moved_to - current_end_sec
    if abs(shift) > params.search_sec:
        # 窓の端に張り付いた＝窓の外にもっと大きい音がある可能性。動かさない。
        return current_end_sec, None
    if shift < 0:
        # ゴングが検出位置より前。切り詰める方向には動かさない。
        return current_end_sec, None
    return moved_to, shift
