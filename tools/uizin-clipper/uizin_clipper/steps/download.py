"""YouTube から大会動画を取得する（yt-dlp）。

- 再エンコードしない（画質劣化なし）
- すでに落としてあれば何もしない（4時間動画を二度落とさない）
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from ..shellcmd import run

# yt-dlp の -f 指定: 横動画のmp4を優先し、無ければ最良のものにフォールバック
FORMAT_SELECTOR = "bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b[ext=mp4]/b"

_ID_PATTERNS = (
    re.compile(r"youtube\.com/live/([A-Za-z0-9_-]{6,})"),
    re.compile(r"youtu\.be/([A-Za-z0-9_-]{6,})"),
    re.compile(r"[?&]v=([A-Za-z0-9_-]{6,})"),
    re.compile(r"youtube\.com/embed/([A-Za-z0-9_-]{6,})"),
)


def extract_video_id(url: str) -> str:
    """URL から動画IDを取り出す。作業フォルダ名に使う。"""
    for pattern in _ID_PATTERNS:
        matched = pattern.search(url)
        if matched:
            return matched.group(1)
    # URLでない（ローカルファイル等）場合はファイル名から作る
    stem = Path(url).stem
    safe = re.sub(r"[^A-Za-z0-9_-]", "_", stem)
    if not safe:
        safe = "video"
    if safe != stem:
        # 日本語名などは置換で潰れて衝突しうるので、短いハッシュを付けて区別する
        digest = hashlib.sha1(stem.encode("utf-8")).hexdigest()[:6]
        return f"{safe}_{digest}"
    return safe


def download(url: str, work_dir: Path, *, force: bool = False) -> Path:
    """work_dir/source.mp4 を用意して返す。"""
    work_dir.mkdir(parents=True, exist_ok=True)
    target = work_dir / "source.mp4"

    if target.exists() and not force:
        print(f"[download] 既にあるので取得を省略: {target}")
        return target

    run(
        [
            "yt-dlp",
            "-f", FORMAT_SELECTOR,
            "--merge-output-format", "mp4",
            "--write-info-json",
            "--no-playlist",
            "--retries", "10",
            "--fragment-retries", "10",
            "-o", str(work_dir / "source.%(ext)s"),
            url,
        ],
        capture=False,
    )

    if not target.exists():
        # コンテナが mp4 にならなかった場合の救済
        candidates = sorted(work_dir.glob("source.*"))
        media = [p for p in candidates if p.suffix not in (".json", ".tmp")]
        if not media:
            raise FileNotFoundError(f"ダウンロード結果が見つかりません: {work_dir}")
        return media[0]
    return target


def read_info(work_dir: Path) -> dict:
    """yt-dlp が書いた info.json からタイトル等を読む。無ければ空。"""
    for path in sorted(work_dir.glob("*.info.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        return {
            "title": data.get("title"),
            "upload_date": data.get("upload_date"),
            "webpage_url": data.get("webpage_url"),
        }
    return {}
