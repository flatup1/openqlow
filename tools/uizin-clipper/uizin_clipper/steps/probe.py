"""動画の尺とキーフレーム位置を調べる（ffprobe）。

キーフレーム一覧は無劣化カットに必須。4時間動画で数十秒かかるので必ずキャッシュする。
"""

from __future__ import annotations

import json
from pathlib import Path

from ..shellcmd import run


def probe_duration(video: Path) -> float:
    out = run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(video),
        ],
        quiet=True,
    ).strip()
    try:
        return float(out)
    except ValueError as exc:
        raise RuntimeError(f"尺を取得できません: {video} ({out!r})") from exc


def probe_video_size(video: Path) -> tuple[int, int]:
    out = run(
        [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "csv=p=0",
            str(video),
        ],
        quiet=True,
    ).strip().splitlines()[0]
    width, height = (int(x) for x in out.split(",")[:2])
    return width, height


def probe_keyframes(video: Path) -> list[float]:
    """キーフレームの時刻(秒)を昇順で返す。

    デコードせずパケットのフラグだけ見るので、`-skip_frame nokey` より速い。
    """
    out = run(
        [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "packet=pts_time,flags",
            "-of", "csv=print_section=0",
            str(video),
        ],
        quiet=True,
    )
    keyframes: list[float] = []
    for line in out.splitlines():
        parts = line.strip().split(",")
        if len(parts) < 2:
            continue
        pts_time, flags = parts[0], parts[1]
        if "K" not in flags:
            continue
        try:
            keyframes.append(float(pts_time))
        except ValueError:
            continue
    keyframes.sort()
    return keyframes


def load_or_probe(video: Path, work_dir: Path, *, force: bool = False) -> dict:
    """尺・解像度・キーフレームをまとめて取得し、work_dir にキャッシュする。"""
    cache = work_dir / "probe.json"
    if cache.exists() and not force:
        try:
            data = json.loads(cache.read_text(encoding="utf-8"))
            if data.get("keyframes"):
                print(f"[probe] キャッシュを使用: {cache}")
                return data
        except (OSError, json.JSONDecodeError):
            pass

    print("[probe] 尺とキーフレームを解析中（4時間動画で数十秒かかります）")
    width, height = probe_video_size(video)
    data = {
        "duration_sec": probe_duration(video),
        "width": width,
        "height": height,
        "keyframes": probe_keyframes(video),
    }
    work_dir.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data
