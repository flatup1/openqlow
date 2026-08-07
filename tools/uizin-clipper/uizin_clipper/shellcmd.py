"""外部コマンド（yt-dlp / ffmpeg / ffprobe）呼び出しの共通処理。

外部ツール依存は必ずこの層を通す。ここだけ見れば「何を実行しているか」が分かる。
"""

from __future__ import annotations

import shutil
import subprocess
from typing import Sequence

INSTALL_HINT = {
    "ffmpeg": "brew install ffmpeg  (macOS) / sudo apt install ffmpeg (Linux)",
    "ffprobe": "brew install ffmpeg  (macOS) / sudo apt install ffmpeg (Linux)",
    "yt-dlp": "pip install -U yt-dlp",
}


class ToolMissingError(RuntimeError):
    pass


class CommandFailedError(RuntimeError):
    pass


def require_tool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        hint = INSTALL_HINT.get(name, "")
        raise ToolMissingError(
            f"{name} が見つかりません。インストールしてください。{(' 例: ' + hint) if hint else ''}"
        )
    return path


def run(argv: Sequence[str], *, capture: bool = True, quiet: bool = False) -> str:
    """コマンドを実行する。失敗したら stderr を添えて例外にする。"""
    require_tool(argv[0])
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
