"""外部コマンド（yt-dlp / ffmpeg / ffprobe）呼び出しの共通処理。

外部ツール依存は必ずこの層を通す。ここだけ見れば「何を実行しているか」が分かる。
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path
from typing import Sequence

INSTALL_HINT = {
    "ffmpeg": "brew install ffmpeg  (macOS) / sudo apt install ffmpeg (Linux)",
    "ffprobe": "brew install ffmpeg  (macOS) / sudo apt install ffmpeg (Linux)",
    "yt-dlp": "pip install -U yt-dlp",
}

# ★入っているのに PATH に無いだけ、という状態が実機で何度も起きた。
#   `.zprofile` への登録は**新しく開いたターミナルにしか効かない**ので、
#   「セットアップ直後の同じターミナル」では見つからない。
#   その状態で yt-dlp を呼ぶと、映像と音声の合体だけが黙って抜ける。
#   置き場所は決まっているので、ここで探しにいけば、この手の事故は起きない。
EXTRA_DIRS = (
    "/opt/homebrew/bin",              # Apple シリコンの Mac
    "/usr/local/bin",                 # Intel の Mac
    "/home/linuxbrew/.linuxbrew/bin",  # Linux の Homebrew
    "/usr/bin",
    "/snap/bin",
)


class ToolMissingError(RuntimeError):
    pass


class CommandFailedError(RuntimeError):
    pass


def find_tool(name: str, *, extra_dirs: Sequence[str] = EXTRA_DIRS) -> str | None:
    """道具の場所を返す。PATH に無ければ、よくある置き場所も探す。"""
    found = shutil.which(name)
    if found:
        return found
    for directory in extra_dirs:
        candidate = Path(directory) / name
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
    return None


def require_tool(name: str) -> str:
    path = find_tool(name)
    if not path:
        hint = INSTALL_HINT.get(name, "")
        raise ToolMissingError(
            f"{name} が見つかりません。インストールしてください。"
            f"{(' 例: ' + hint) if hint else ''}\n"
            "すでに入れてあるのにこう出る場合は、置き場所が知られていないだけです。\n"
            "  eval \"$(/opt/homebrew/bin/brew shellenv)\"\n"
            "を実行してから、もう一度お試しください。"
        )
    return path


def run(argv: Sequence[str], *, capture: bool = True, quiet: bool = False) -> str:
    """コマンドを実行する。失敗したら stderr を添えて例外にする。"""
    argv = [require_tool(argv[0]), *argv[1:]]
    if not quiet:
        print(f"$ {' '.join(argv)}")
    result = subprocess.run(
        list(argv),
        capture_output=capture,
        text=True,
    )
    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        tail = "\n".join(stderr.splitlines()[-15:])
        raise CommandFailedError(
            f"コマンドが失敗しました (exit={result.returncode}): {' '.join(argv)}\n{tail}"
        )
    return result.stdout or ""
