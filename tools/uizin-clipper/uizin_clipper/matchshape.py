"""大会の「試合の形」から、おかしな検出に気づく（純ロジック・外部依存ゼロ）。

**なぜこれが効くか**

UIZIN大会の進行は決まっています（オーナーによる実際の進行）。

    入場曲 → 青コーナー紹介 → 赤コーナー紹介 → 試合 → 終了のゴング

    1ラウンド 1分30秒 × 2ラウンド、インターバル 1分。KOならもっと短い。

つまり **1試合は最長でも 1:30 + 1:00 + 1:30 = 4分00秒**。ここから外れた区間は、
中身を見なくても「あやしい」と分かります。

- 長すぎる → 2試合が繋がった、または休憩を巻き込んだ
- 短すぎる → リプレイやテロップの一瞬の再表示を拾った

★これは**捨てる基準ではなく、気づく基準**です。勝手に消すと、本当に特殊な試合
（延長・トラブルによる中断）が黙って消えます。人間に見せて判断してもらいます。
"""

from __future__ import annotations

from dataclasses import dataclass

from .stats import MIN_DEVIATION, mean_and_deviation


@dataclass(frozen=True)
class MatchShape:
    """大会の進行から決まる、1試合の長さの目安。"""

    round_sec: float = 90.0
    """1ラウンドの長さ（1分30秒）。"""

    rounds: int = 2
    """ラウンド数。"""

    interval_sec: float = 60.0
    """ラウンド間のインターバル（1分）。"""

    tolerance_sec: float = 90.0
    """目安からこれだけはみ出しても、まだ警告しない余裕。

    前後の余白（pre_roll / post_roll）、勝ち名乗り、レフェリーの説明などが入るため。
    ★狭くしすぎると毎回警告が出て、誰も読まなくなる。警告は少ないから効きます。
    """

    def core_sec(self) -> float:
        """試合そのものの長さ（余白を含まない最長）。"""
        return self.round_sec * self.rounds + self.interval_sec * max(0, self.rounds - 1)

    def max_expected_sec(self) -> float:
        """ここを超えたら「長すぎる」と知らせる。"""
        return self.core_sec() + self.tolerance_sec


def duration_flags(duration_sec: float, shape: MatchShape, *, min_duration_sec: float) -> list[str]:
    """長さから見た気づきを返す。問題が無ければ空。"""
    flags: list[str] = []
    if duration_sec > shape.max_expected_sec():
        flags.append("too_long")
    if duration_sec < min_duration_sec:
        flags.append("too_short")
    return flags


def looks_like_two_matches(duration_sec: float, shape: MatchShape) -> bool:
    """2試合ぶんの長さに近いか（結合を疑う材料）。"""
    return duration_sec >= shape.core_sec() * 2


@dataclass(frozen=True)
class KoHintParams:
    """KOらしさを見積もるための値。"""

    before_finish_sec: float = 2.0
    """決着の何秒前から見るか。"""

    after_finish_sec: float = 8.0
    """決着の何秒後まで見るか。

    ★★**ここが要点です。歓声は決着の「あと」に来ます。**
      最初は「終了より前の10秒」を見ていましたが、実際に動かすとKOの試合で
      1件も反応しませんでした（偏差 +0.4 / +0.6。しきい値 1.2 に届かない）。

      スコアボードは決着とほぼ同時に消えるので、**歓声の大半は終了より後ろ**にあります。
      前だけ見ていては、一番大きい音を丸ごと窓の外に置いていたことになります。

    ★長くしすぎると薄まる点は変わりません。歓声が10秒でも20秒で平均すると
      半分に薄まって「跳ねていない」と判定します（実測で 2.0 → 0.75 に落ちた）。
    """

    min_spike: float = 1.2
    """この偏差値以上跳ねていれば「大きな歓声があった」とみなす。"""

    min_deviation: float = MIN_DEVIATION
    """音量のばらつきがこれ未満なら判定しない。

    ★偏差値は「ばらつきで割る」ので、平坦だと微小な揺れが巨大な跳ねに化ける。
      ゴング検出で実際に起きた誤作動と同じ原因なので、同じ下限を使う。
    """

    short_ratio: float = 0.75
    """試合そのものの長さに対してこの割合より短ければ「早く決着した」とみなす。"""


def ending_spike(
    values: list[float],
    params: KoHintParams,
    *,
    step_sec: float,
    finish_at_sec: float | None = None,
) -> float | None:
    """決着まわりの音量の跳ね（偏差値）を返す。測れなければ None。

    `finish_at_sec` は `values` の先頭から数えた決着の位置。
    省略すると末尾を決着とみなします。

    ★`values` は **決着の少しあとまで**渡すこと。歓声は決着のあとに来ます。
      ただし勝ち名乗りのアナウンス（数十秒）まで入れると薄まるので、
      `after_finish_sec` ぶんだけで十分です。
    """
    if step_sec <= 0:
        raise ValueError("step_sec は正の数にしてください")
    if len(values) < 4:
        return None

    mean, deviation = mean_and_deviation(values)
    if deviation < params.min_deviation:
        # 平坦な音。ここで割ると微小な揺れが巨大な跳ねに化ける。
        return None

    count = len(values)
    finish = count if finish_at_sec is None else int(round(finish_at_sec / step_sec))
    first = max(0, finish - max(1, int(round(params.before_finish_sec / step_sec))))
    last = min(count, finish + max(1, int(round(params.after_finish_sec / step_sec))))
    if last <= first:
        return None

    window = values[first:last]
    return (sum(window) / len(window) - mean) / deviation


def ko_hint(
    duration_sec: float,
    values: list[float],
    shape: MatchShape,
    params: KoHintParams,
    *,
    step_sec: float,
    finish_at_sec: float | None = None,
) -> tuple[bool, str]:
    """(KOらしいか, 理由) を返す。

    ★これは**下書き**です。`result` を自動で確定はしません。
      KOと判定を取り違えた切り抜きを公開する事故は、手入力3秒で防げます。
      機械が「らしい」と言い、人間が決める。この順番は変えません。
    """
    spike = ending_spike(values, params, step_sec=step_sec, finish_at_sec=finish_at_sec)
    if spike is None:
        return False, "音が平坦で判断できません"

    short = duration_sec < shape.core_sec() * params.short_ratio
    loud = spike >= params.min_spike

    if short and loud:
        return True, f"早い決着（{duration_sec:.0f}秒）で終わり際に大きな歓声（偏差 {spike:+.1f}）"
    if loud:
        return False, f"終わり際に歓声はあるが、長さは規定どおり（偏差 {spike:+.1f}）"
    if short:
        return False, f"早く終わったが、歓声の盛り上がりは小さい（偏差 {spike:+.1f}）"
    return False, f"規定どおりの決着（偏差 {spike:+.1f}）"
