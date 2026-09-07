"""検出結果を正解と突き合わせて数値で出す。外部依存なし。

「だいたい動いた」ではなく、
正解 / 見逃し / 誤検出 / 分割 / 結合 を件数で出すためのモジュール。

判定規則はひとつだけ:
  正解区間と検出区間が `min_overlap` 以上重なっていれば「対応している」とみなす。
  重なりは短いほうを基準にするので、長さが違っても素直に対応が取れる。
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Interval:
    start_sec: float
    end_sec: float
    label: str = ""

    @property
    def duration_sec(self) -> float:
        return max(0.0, self.end_sec - self.start_sec)


def overlap_sec(a: Interval, b: Interval) -> float:
    return max(0.0, min(a.end_sec, b.end_sec) - max(a.start_sec, b.start_sec))


def overlap_fraction(a: Interval, b: Interval) -> float:
    """短いほうに対する重なりの割合（0.0〜1.0）。"""
    shorter = min(a.duration_sec, b.duration_sec)
    if shorter <= 0:
        return 0.0
    return overlap_sec(a, b) / shorter


@dataclass
class Evaluation:
    matched: list[tuple[int, int]] = field(default_factory=list)
    """(正解の番号, 検出の番号) の対応。いずれも1始まり。"""

    missed: list[int] = field(default_factory=list)
    """見逃し（正解にあるが検出が1つも対応しない）。"""

    spurious: list[int] = field(default_factory=list)
    """誤検出（検出したが正解が1つも対応しない）。"""

    split: list[tuple[int, list[int]]] = field(default_factory=list)
    """1試合が複数に分割された（正解1つに検出が2つ以上）。"""

    fused: list[tuple[int, list[int]]] = field(default_factory=list)
    """複数試合が1本に結合された（検出1つに正解が2つ以上）。"""

    start_errors_sec: list[float] = field(default_factory=list)
    """開始のずれ（検出 − 正解）。負なら早めに始まっている＝前のりしろ。"""

    end_errors_sec: list[float] = field(default_factory=list)
    """終了のずれ（検出 − 正解）。正なら余分に後ろが入っている。"""

    @property
    def correct(self) -> int:
        """1対1で正しく取れた試合数。"""
        split_truths = {t for t, _ in self.split}
        fused_truths = {t for pair in self.fused for t in pair[1]}
        return sum(
            1
            for truth, _ in self.matched
            if truth not in split_truths and truth not in fused_truths
        )

    def summary(self, truth_count: int, detected_count: int) -> dict:
        return {
            "正解の試合数": truth_count,
            "検出した試合数": detected_count,
            "正しく検出": self.correct,
            "見逃し": len(self.missed),
            "余計な検出": len(self.spurious),
            "1試合が複数に分割": len(self.split),
            "複数試合が1本に結合": len(self.fused),
        }


def evaluate(
    truth: list[Interval],
    detected: list[Interval],
    *,
    min_overlap: float = 0.3,
) -> Evaluation:
    """正解と検出を突き合わせる。どちらも開始時刻順である必要はない。"""
    truth = sorted(truth, key=lambda i: i.start_sec)
    detected = sorted(detected, key=lambda i: i.start_sec)

    links: list[tuple[int, int]] = []
    for ti, t in enumerate(truth, start=1):
        for di, d in enumerate(detected, start=1):
            if overlap_fraction(t, d) >= min_overlap:
                links.append((ti, di))

    result = Evaluation(matched=links)

    by_truth: dict[int, list[int]] = {}
    by_detected: dict[int, list[int]] = {}
    for ti, di in links:
        by_truth.setdefault(ti, []).append(di)
        by_detected.setdefault(di, []).append(ti)

    result.missed = [i for i in range(1, len(truth) + 1) if i not in by_truth]
    result.spurious = [i for i in range(1, len(detected) + 1) if i not in by_detected]
    result.split = [(ti, dis) for ti, dis in sorted(by_truth.items()) if len(dis) > 1]
    result.fused = [(di, tis) for di, tis in sorted(by_detected.items()) if len(tis) > 1]

    # 境界のずれは、1対1で対応した組だけを見る（分割・結合は意味がないので除く）
    for ti, dis in sorted(by_truth.items()):
        if len(dis) != 1:
            continue
        di = dis[0]
        if len(by_detected.get(di, [])) != 1:
            continue
        result.start_errors_sec.append(detected[di - 1].start_sec - truth[ti - 1].start_sec)
        result.end_errors_sec.append(detected[di - 1].end_sec - truth[ti - 1].end_sec)

    return result


def load_truth(path) -> list[Interval]:
    """正解ファイル（YAML）を読む。

    ```yaml
    matches:
      - {start: "00:12:04", end: "00:18:33", label: "山田 vs 佐藤"}
    ```
    """
    from pathlib import Path  # noqa: PLC0415

    from .timecode import parse_timecode  # noqa: PLC0415

    target = Path(path)
    text = target.read_text(encoding="utf-8")
    if target.suffix.lower() == ".json":
        import json  # noqa: PLC0415

        data = json.loads(text)
    else:
        try:
            import yaml  # noqa: PLC0415
        except ImportError as exc:  # pragma: no cover - 環境依存
            raise RuntimeError("PyYAML が必要です") from exc
        data = yaml.safe_load(text) or {}

    rows = data.get("matches")
    if not isinstance(rows, list) or not rows:
        raise ValueError(f"正解ファイルに matches がありません: {target}")

    out: list[Interval] = []
    for row in rows:
        out.append(
            Interval(
                start_sec=parse_timecode(row["start"]),
                end_sec=parse_timecode(row["end"]),
                label=str(row.get("label") or ""),
            )
        )
    return out
