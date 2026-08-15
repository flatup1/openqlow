"""segments.json（中間成果物）の読み書き。外部依存なし。

このファイルが本システムの心臓部。
検出結果をいったん人間が読める形にして、**人間の修正を絶対に失わない**ようにする。

- `"locked": true`  … 人間が確定させた区間。再検出しても書き換えない。
- `"skip": true`    … 書き出さない区間（誤検出・エキシビションなど）。
- 手入力した `red` / `blue` / `title` は、再検出後も同じ区間に引き継ぐ。
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from .timecode import format_timecode

MANIFEST_VERSION = 1

# 人間が編集する欄。再検出時に引き継ぐ対象。
HUMAN_FIELDS = ("red", "blue", "result", "title", "note", "skip")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def segment_to_dict(segment: Any) -> dict:
    """steps.segment.Segment を JSON 用の dict にする。"""
    return {
        "index": segment.index,
        "start": format_timecode(segment.start_sec),
        "end": format_timecode(segment.end_sec),
        "start_sec": round(segment.start_sec, 3),
        "end_sec": round(segment.end_sec, 3),
        "duration_sec": round(segment.duration_sec, 3),
        "core_start_sec": round(segment.core_start_sec, 3),
        "core_end_sec": round(segment.core_end_sec, 3),
        "confidence": segment.confidence,
        "flags": list(segment.flags),
        "red": None,
        "blue": None,
        "result": None,
        "title": None,
        "note": None,
        "skip": False,
        "locked": False,
    }


def build_manifest(
    *,
    source: dict,
    profile: dict,
    segments: Iterable[dict],
) -> dict:
    ordered = renumber(list(segments))
    return {
        "version": MANIFEST_VERSION,
        "generated_at": _now_iso(),
        "source": source,
        "profile": profile,
        "segments": ordered,
    }


def load_manifest(path: str | Path) -> dict:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    version = data.get("version")
    if version != MANIFEST_VERSION:
        raise ValueError(
            f"manifest のバージョンが違います (期待={MANIFEST_VERSION}, 実際={version!r})"
        )
    if not isinstance(data.get("segments"), list):
        raise ValueError("manifest に segments 配列がありません")
    for segment in data["segments"]:
        normalize_segment(segment)
    return data


def save_manifest(path: str | Path, manifest: dict) -> Path:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    # 書き込み中の中断で壊さないよう、一時ファイル経由で置き換える
    temp = target.with_suffix(target.suffix + ".tmp")
    temp.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    temp.replace(target)
    return target


def overlap_ratio(a: dict, b: dict) -> float:
    """b から見て a とどれだけ重なっているか（0.0〜1.0）。"""
    start = max(float(a["start_sec"]), float(b["start_sec"]))
    end = min(float(a["end_sec"]), float(b["end_sec"]))
    overlap = max(0.0, end - start)
    span = float(b["end_sec"]) - float(b["start_sec"])
    if span <= 0:
        return 0.0
    return overlap / span


def normalize_segment(segment: dict) -> dict:
    """start_sec / end_sec を正として、表示用の派生値を作り直す。

    人間が segments.json の秒数を直したあと、尺やタイムコード表示が
    古いままにならないようにする。
    """
    start = float(segment["start_sec"])
    end = float(segment["end_sec"])
    segment["start_sec"] = round(start, 3)
    segment["end_sec"] = round(end, 3)
    segment["duration_sec"] = round(max(0.0, end - start), 3)
    segment["start"] = format_timecode(start)
    segment["end"] = format_timecode(end)
    return segment


def resolve_overlaps(segments: list[dict], *, duration_sec: float | None = None) -> list[str]:
    """隣同士が重なっていたら中間点で分け、動画の外へはみ出していたら戻す。

    直した内容の説明を返す（何も直さなければ空）。

    ★`detect` は のりしろ が重なったときに中間点で分けています。しかし `refine` は
      そのあとに境界を動かすので、**そこで重なりが復活します**。実測で確認:

        1本目の終了 300秒 → 304秒（ゴングへ +4.0秒 寄せた）
        2本目の開始 303秒 のまま  → 1秒ぶん、同じ映像が2本に入る

      同じ理由で、動画の尺を超える位置へ動くこともあります（尺500秒に対して502秒）。
      **境界を動かす処理のあとには、必ずここを通すこと。**
    """
    notes: list[str] = []
    ordered = sorted(segments, key=lambda s: float(s["start_sec"]))

    for segment in ordered:
        if float(segment["start_sec"]) < 0.0:
            notes.append(f"{segment['index']:02d} 開始が0秒より前だったので戻しました")
            segment["start_sec"] = 0.0
            normalize_segment(segment)
        if duration_sec is not None and float(segment["end_sec"]) > duration_sec:
            notes.append(f"{segment['index']:02d} 終了が動画の尺を超えていたので戻しました")
            segment["end_sec"] = duration_sec
            normalize_segment(segment)

    for previous, current in zip(ordered, ordered[1:]):
        if float(current["start_sec"]) >= float(previous["end_sec"]):
            continue
        # 中間点は「試合そのもの」の境目で取る。のりしろ同士の重なりなので、
        # 中身のある部分（core）を基準にしたほうが、どちらの試合も欠けない。
        previous_core = float(previous.get("core_end_sec", previous["end_sec"]))
        current_core = float(current.get("core_start_sec", current["start_sec"]))
        midpoint = (previous_core + current_core) / 2.0
        midpoint = max(previous_core, min(current_core, midpoint))
        notes.append(
            f"{previous['index']:02d} と {current['index']:02d} が重なっていたので"
            f" {format_timecode(midpoint, with_millis=False)} で分けました"
        )
        previous["end_sec"] = midpoint
        current["start_sec"] = midpoint
        normalize_segment(previous)
        normalize_segment(current)

    return notes


def renumber(segments: list[dict]) -> list[dict]:
    """開始時刻順に並べ替えて 1 から採番し直し、派生値も更新する。"""
    ordered = sorted(segments, key=lambda s: float(s["start_sec"]))
    for number, segment in enumerate(ordered, start=1):
        segment["index"] = number
        normalize_segment(segment)
    return ordered


def merge_segments(
    existing: list[dict],
    detected: list[dict],
    *,
    locked_overlap: float = 0.5,
    carry_overlap: float = 0.6,
) -> list[dict]:
    """既存 manifest の人間の編集を守りながら、新しい検出結果を取り込む。

    - locked な区間はそのまま残す
    - locked と `locked_overlap` 以上重なる検出結果は捨てる（二重取り防止）
    - locked でない既存区間と `carry_overlap` 以上重なる検出結果には、
      手入力欄（選手名など）を引き継ぐ
    """
    locked = [dict(s) for s in existing if s.get("locked")]
    unlocked = [s for s in existing if not s.get("locked")]

    survivors: list[dict] = []
    for candidate in detected:
        fresh = dict(candidate)
        if any(overlap_ratio(kept, fresh) >= locked_overlap for kept in locked):
            continue

        best: dict | None = None
        best_score = 0.0
        for previous in unlocked:
            score = overlap_ratio(previous, fresh)
            if score >= carry_overlap and score > best_score:
                best, best_score = previous, score
        if best is not None:
            for field in HUMAN_FIELDS:
                value = best.get(field)
                if value not in (None, "", False):
                    fresh[field] = value
        survivors.append(fresh)

    return renumber(locked + survivors)


def renderable_segments(manifest: dict) -> list[dict]:
    """書き出し対象（skip でないもの）だけを返す。"""
    return [s for s in manifest["segments"] if not s.get("skip")]
