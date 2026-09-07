"""対戦表（card.yml）から選手名を入れる。外部依存なし（読み込みは呼び出し側）。

**OCRを主にしない理由**は設計書のとおり。装飾テロップの日本語OCRは誤読するが、
対戦表の手入力は3分で100%正確。だからここは「素直に読んで入れるだけ」に徹する。

安全策:
- 対戦表の件数と検出の件数が合わないときは、**勝手に詰めずに止める**。
  ずれたまま入れると、全部の名前が1つずつずれた動画が出来上がる。
- 既に入っている名前は上書きしない（人間が直したものを消さない）。
"""

from __future__ import annotations

from typing import Any

CARD_FIELDS = ("red", "blue", "result", "note")
"""対戦表から取り込む欄。`title` は選手名から自動で作るのでここには入れない。"""


class CardMismatch(ValueError):
    """対戦表の件数と検出結果の件数が合わない。"""


def parse_card(data: Any) -> list[dict]:
    """card.yml を読んだ結果を、正規化した対戦リストにする。

    受け付ける形:
        matches:
          - red: 赤選手
            blue: 青選手
            result: KO
          - [赤選手, 青選手]          # 短く書きたいとき
    """
    if isinstance(data, dict):
        rows = data.get("matches")
        if rows is None:
            raise ValueError("card.yml に matches がありません")
    else:
        rows = data
    if not isinstance(rows, list):
        raise ValueError("matches は配列にしてください")

    parsed: list[dict] = []
    for position, row in enumerate(rows, start=1):
        if isinstance(row, (list, tuple)):
            if len(row) < 2:
                raise ValueError(f"{position}件目: [赤, 青] の2つを書いてください")
            entry = {"red": row[0], "blue": row[1]}
        elif isinstance(row, dict):
            entry = dict(row)
        else:
            raise ValueError(f"{position}件目の書き方が分かりません: {row!r}")

        red = str(entry.get("red") or "").strip()
        blue = str(entry.get("blue") or "").strip()
        if not red or not blue:
            raise ValueError(f"{position}件目: red と blue の両方を書いてください")

        cleaned = {"red": red, "blue": blue}
        for field in ("result", "note"):
            value = entry.get(field)
            if value not in (None, ""):
                cleaned[field] = str(value).strip()
        parsed.append(cleaned)
    return parsed


def apply_card(
    segments: list[dict],
    card: list[dict],
    *,
    overwrite: bool = False,
) -> int:
    """検出結果に選手名を入れる。書き込んだ件数を返す。

    `skip: true` の区間は対戦表の対象外として飛ばす（誤検出を数に入れない）。
    件数が合わなければ何も書かずに例外にする。
    """
    targets = [s for s in segments if not s.get("skip")]
    if len(targets) != len(card):
        raise CardMismatch(
            f"対戦表 {len(card)} 件に対して、書き出す区間が {len(targets)} 件あります。\n"
            "先に segments.json を直してください（余計な区間には \"skip\": true を付ける）。\n"
            "順番がそのまま対応するので、件数が合わないまま入れると全部ずれます。"
        )

    written = 0
    for segment, row in zip(targets, card):
        changed = False
        for field in CARD_FIELDS:
            value = row.get(field)
            if value in (None, ""):
                continue
            if not overwrite and segment.get(field) not in (None, ""):
                continue
            segment[field] = value
            changed = True
        if changed:
            written += 1
    return written
