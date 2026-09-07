"""書き出したMP4が壊れていないかを機械的に確かめる。

目視チェック（音ズレ・映像の破損・再エンコードの有無）を、
毎回同じ基準で数値にするためのモジュール。
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path

from ..shellcmd import require_tool, run


@dataclass
class OutputCheck:
    name: str
    exists: bool = False
    video_codec: str = ""
    audio_codec: str = ""
    duration_sec: float = 0.0
    expected_sec: float = 0.0
    av_offset_sec: float = 0.0
    decode_errors: int = 0

    @property
    def duration_error_sec(self) -> float:
        return self.duration_sec - self.expected_sec

    def problems(self, *, source_video_codec: str, tolerance_sec: float = 1.5) -> list[str]:
        issues: list[str] = []
        if not self.exists:
            return ["ファイルがない"]
        if source_video_codec and self.video_codec != source_video_codec:
            issues.append(f"映像コーデックが変わっている（{source_video_codec}→{self.video_codec}）＝再エンコードされた")
        if abs(self.duration_error_sec) > tolerance_sec:
            issues.append(f"尺が {self.duration_error_sec:+.1f}秒ずれている")
        if abs(self.av_offset_sec) > 0.2:
            issues.append(f"音ズレ {self.av_offset_sec:+.2f}秒")
        if self.decode_errors:
            issues.append(f"デコードエラー {self.decode_errors}件")
        return issues


def _probe_streams(path: Path) -> dict:
    out = run(
        [
            require_tool("ffprobe"), "-v", "error",
            "-show_entries", "stream=codec_type,codec_name,start_time",
            "-show_entries", "format=duration",
            "-of", "json",
            str(path),
        ],
        quiet=True,
    )
    return json.loads(out or "{}")


def count_decode_errors(path: Path) -> int:
    """全編デコードして、ffmpeg が出したエラー行数を数える。"""
    result = subprocess.run(
        [require_tool("ffmpeg"), "-v", "error", "-nostdin", "-i", str(path), "-f", "null", "-"],
        capture_output=True,
        text=True,
    )
    stderr = (result.stderr or "").strip()
    return len([line for line in stderr.splitlines() if line.strip()])


def inspect(path: Path, expected_sec: float, *, deep: bool = True) -> OutputCheck:
    check = OutputCheck(name=path.name, expected_sec=round(expected_sec, 3))
    if not path.exists():
        return check
    check.exists = True

    data = _probe_streams(path)
    video_start = audio_start = None
    for stream in data.get("streams", []):
        if stream.get("codec_type") == "video" and not check.video_codec:
            check.video_codec = stream.get("codec_name", "")
            video_start = float(stream.get("start_time") or 0.0)
        elif stream.get("codec_type") == "audio" and not check.audio_codec:
            check.audio_codec = stream.get("codec_name", "")
            audio_start = float(stream.get("start_time") or 0.0)

    check.duration_sec = round(float(data.get("format", {}).get("duration") or 0.0), 3)
    if video_start is not None and audio_start is not None:
        check.av_offset_sec = round(audio_start - video_start, 3)
    if deep:
        check.decode_errors = count_decode_errors(path)
    return check
