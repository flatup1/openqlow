"""音量・動きの「跳ね方」を測る共通計算（純ロジック・外部依存ゼロ）。

★同じ計算が3か所（`highlight` / `onset` / `matchshape`）に散らばっていました。
  偏差値は「ばらつきで割る」ので、**ばらつきがほぼゼロだと微小な揺れが巨大な跳ねに化ける**
  という同じ罠を、3か所それぞれで踏まないよう見張る必要がありました。
  実際に `onset` で踏み、あとから `matchshape` にも同じ下限を手で書き足しています。
  1か所にまとめれば、直す場所も1か所で済みます。
"""

from __future__ import annotations

MIN_DEVIATION = 0.005
"""ばらつきの下限（音量は 0.0〜1.0）。

本物のゴングなら 0.02 → 0.3 のように跳ねるので、その窓のばらつきは 0.05 以上になる。
0.005 はその10分の1で、十分に安全側。4時間素材では 0.000000 のばらつきに対して
開始位置が誤って動いた実績があり、ゼロ割り防止（1e-12）では桁が小さすぎて効かなかった。
"""


def mean_and_deviation(values: list[float]) -> tuple[float, float]:
    """平均とばらつき（標準偏差）を返す。空なら (0.0, 0.0)。"""
    count = len(values)
    if count == 0:
        return 0.0, 0.0
    mean = sum(values) / count
    variance = sum((v - mean) ** 2 for v in values) / count
    return mean, variance**0.5


def normalize(values: list[float], *, min_deviation: float = MIN_DEVIATION) -> list[float] | None:
    """その並びの中での偏差値に直す。平坦すぎて測れないときは None。

    ★None を返すのが肝です。「0で埋めて続ける」と、平坦な音でも何かを検出したことになり、
      根拠の無い判断が下流へ流れます。**測れないときは測れないと言う。**
    """
    mean, deviation = mean_and_deviation(values)
    if deviation < min_deviation:
        return None
    return [(v - mean) / deviation for v in values]
