"""秒数と HH:MM:SS.mmm 形式の相互変換。外部依存なし。"""

from __future__ import annotations

import re

_TIMECODE_RE = re.compile(
    r"^(?:(?P<h>\d+):)?(?P<m>\d{1,2}):(?P<s>\d{1,2})(?:\.(?P<frac>\d{1,6}))?$"
)


def parse_timecode(value: str | int | float) -> float:
    """"00:12:34.5" / "12:34" / 754.5 を秒(float)にする。"""
    if isinstance(value, (int, float)):
        seconds = float(value)
        if seconds < 0:
            raise ValueError(f"負の時刻は指定できません: {value}")
        return seconds

    text = str(value).strip()
    if not text:
        raise ValueError("時刻が空です")

    # 純粋な秒指定（"754" / "754.5"）も受け付ける
    if re.fullmatch(r"\d+(?:\.\d+)?", text):
        return float(text)

    matched = _TIMECODE_RE.match(text)
    if not matched:
        raise ValueError(f"時刻の形式が不正です: {value!r} (例: 00:12:34 / 12:34 / 754.5)")

    hours = int(matched.group("h") or 0)
    minutes = int(matched.group("m"))
    seconds = int(matched.group("s"))
    if minutes > 59 or seconds > 59:
        raise ValueError(f"分・秒は59以下にしてください: {value!r}")

    frac = matched.group("frac")
    fraction = float(f"0.{frac}") if frac else 0.0
    return hours * 3600 + minutes * 60 + seconds + fraction


def format_timecode(seconds: float, *, with_millis: bool = True) -> str:
    """秒を HH:MM:SS.mmm にする。負の値は 0 に丸める。"""
    total = max(0.0, float(seconds))
    hours = int(total // 3600)
    minutes = int((total % 3600) // 60)
    secs = total % 60
    if with_millis:
        return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"
    return f"{hours:02d}:{minutes:02d}:{int(secs):02d}"


def format_duration(seconds: float) -> str:
    """尺の表示用。1試合は分:秒で読めれば十分。"""
    total = max(0.0, float(seconds))
    minutes = int(total // 60)
    secs = int(round(total % 60))
    if secs == 60:  # 四捨五入の繰り上がり
        minutes += 1
        secs = 0
    return f"{minutes}:{secs:02d}"
