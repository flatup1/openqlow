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


def build_command(
    url: str,
    work_dir: Path,
    *,
    cookies_from_browser: str | None = None,
    extra_args: list[str] | None = None,
) -> list[str]:
    """yt-dlp に渡すコマンドを組み立てる（純関数・テストできる形）。

    ★追加の指定を通せるようにしてあるのは、**YouTube 側の締め付けが変わるから**です。
      ここを固定してしまうと、YouTube が対策を変えるたびにコード修正が要ります。
      渡し口を用意しておけば、その場で回避できます。
    """
    command = [
        "yt-dlp",
        "-f", FORMAT_SELECTOR,
        "--merge-output-format", "mp4",
        "--write-info-json",
        "--no-playlist",
        "--retries", "10",
        "--fragment-retries", "10",
    ]
    if cookies_from_browser:
        command += ["--cookies-from-browser", cookies_from_browser]
    command += list(extra_args or [])
    command += ["-o", str(work_dir / "source.%(ext)s"), url]
    return command


BLOCKED_HINT = """
YouTube に取得を断られました。動画が消えたわけではありません。
YouTube は自動取得を止めるしくみを頻繁に変えるので、次の順に試してください。

  1) yt-dlp を最新にする（これで直ることが多い）
       python -m pip install -U --pre "yt-dlp[default]"

  2) ブラウザのログイン情報を使う（YouTube で普通に見られているなら効く）
       python -m uizin_clipper download "URL" --cookies-from-browser chrome
     （safari / firefox / edge / brave も指定できます。そのブラウザで
       YouTube にログインしておいてください）

  3) 取りに行き方を変える
       python -m uizin_clipper download "URL" \\
           --yt-dlp-arg --extractor-args --yt-dlp-arg "youtube:player_client=web_safari,ios"

どれでも駄目な場合は、ブラウザで手元に落とした mp4 を
  --video そのファイル
で直接渡せます。以降の処理は同じように動きます。
""".strip()


def download(
    url: str,
    work_dir: Path,
    *,
    force: bool = False,
    cookies_from_browser: str | None = None,
    extra_args: list[str] | None = None,
) -> Path:
    """work_dir/source.mp4 を用意して返す。"""
    work_dir.mkdir(parents=True, exist_ok=True)
    target = work_dir / "source.mp4"

    if target.exists() and not force:
        print(f"[download] 既にあるので取得を省略: {target}")
        return target

    command = build_command(
        url,
        work_dir,
        cookies_from_browser=cookies_from_browser,
        extra_args=extra_args,
    )
    try:
        run(command, capture=False)
    except Exception:
        # ★失敗の理由をここで説明する。エラー文だけでは次に何をすべきか分からない。
        print(f"\n{BLOCKED_HINT}\n")
        raise

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
