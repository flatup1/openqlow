"""出力ファイル名・フォルダ名の生成。外部依存なし。

方針:
- 選手名が両方そろっているときだけ `01_赤選手vs青選手.mp4`
- 片方でも欠けたら `01.mp4`（中途半端な名前を残さない）
- macOS / Windows / Linux のどれでも壊れない文字だけにする
"""

from __future__ import annotations

import re
import unicodedata

# Windows で使えない文字 + パス区切り + 制御文字
_FORBIDDEN = re.compile(r'[\\/:*?"<>|\x00-\x1f\x7f]')
_WHITESPACE = re.compile(r"\s+")

# Windows の予約デバイス名
_RESERVED = {
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}

MAX_NAME_BYTES = 150
"""1要素あたりの上限バイト数（多くのファイルシステムは255バイト）。"""


def sanitize_component(value: str, *, fallback: str = "untitled") -> str:
    """ファイル名の1要素として安全な文字列にする。"""
    text = unicodedata.normalize("NFC", str(value))
    text = _FORBIDDEN.sub("", text)
    text = _WHITESPACE.sub(" ", text).strip()
    text = text.strip(". ")  # 末尾のドット・空白は Windows で消える

    if not text:
        return fallback
    if text.upper() in _RESERVED:
        text = f"_{text}"

    # バイト長で切り詰める（日本語で名前が長い場合の保険）
    encoded = text.encode("utf-8")
    if len(encoded) > MAX_NAME_BYTES:
        text = encoded[:MAX_NAME_BYTES].decode("utf-8", errors="ignore").strip()
        text = text.strip(". ") or fallback
    return text


def build_event_dirname(event: str) -> str:
    """`第13回大会` のような出力フォルダ名を作る。"""
    return sanitize_component(event, fallback="大会")


def build_clip_filename(
    index: int,
    red: str | None = None,
    blue: str | None = None,
    *,
    ext: str = "mp4",
    versus: str = "vs",
) -> str:
    """`01_赤選手vs青選手.mp4` もしくは `01.mp4` を返す。"""
    if index < 1:
        raise ValueError("index は1以上にしてください")

    number = f"{index:02d}"
    red_name = sanitize_component(red, fallback="") if red else ""
    blue_name = sanitize_component(blue, fallback="") if blue else ""

    suffix = ext.lstrip(".")
    if red_name and blue_name:
        stem = sanitize_component(f"{number}_{red_name}{versus}{blue_name}")
    else:
        stem = number
    return f"{stem}.{suffix}"


def stale_names(existing: list[str], produced: set[str]) -> list[str]:
    """出力フォルダに残っている「今回作らなかったファイル」を返す。

    ★選手名を入れて書き出し直すと、`01.mp4` と `01_赤選手vs青選手.mp4` が
      両方フォルダに残る。12試合なのに24本並ぶことになり、
      **間違ったほうを投稿する事故につながる。**
      消すかどうかは人間が決めるので、ここでは「これは古い」と教えるだけ。
    """
    return sorted(name for name in existing if name not in produced)


def ensure_unique(name: str, taken: set[str]) -> str:
    """同名が既にあるときだけ `_2` `_3` を足す。呼び出し側で taken を更新すること。"""
    if name not in taken:
        return name
    stem, dot, ext = name.rpartition(".")
    if not dot:  # 拡張子なし
        stem, ext = name, ""
    counter = 2
    while True:
        candidate = f"{stem}_{counter}.{ext}" if ext else f"{stem}_{counter}"
        if candidate not in taken:
            return candidate
        counter += 1
