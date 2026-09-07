"""初回だけ必要な位置合わせ（キャリブレーション）。

システムは「スコアボードがどこに、どんな見た目で出るか」を知らない。
そこを人間が1回だけ教える。所要10分。以降はテロップのデザインが変わるまで不要。
"""

from __future__ import annotations

from pathlib import Path

from ..shellcmd import run
from ..timecode import format_timecode
from .score import crop_filter


def extract_full_frame(video: Path, at_sec: float, output: Path) -> Path:
    """指定時刻の1枚をそのまま書き出す（ROIの座標を目で決めるため）。"""
    output.parent.mkdir(parents=True, exist_ok=True)
    run(
        [
            "ffmpeg", "-v", "error", "-nostdin", "-y",
            "-ss", f"{at_sec:.3f}",
            "-i", str(video),
            "-frames:v", "1",
            str(output),
        ],
        quiet=True,
    )
    return output


def contact_sheet(
    video: Path,
    out_dir: Path,
    duration_sec: float,
    *,
    interval_sec: float = 300.0,
    scale_width: int = 960,
) -> list[Path]:
    """一定間隔の静止画を書き出す。試合中の1枚を探すための下見用。"""
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    position = 0.0
    while position < duration_sec:
        label = format_timecode(position, with_millis=False).replace(":", "")
        target = out_dir / f"t{label}.jpg"
        if not target.exists():
            run(
                [
                    "ffmpeg", "-v", "error", "-nostdin", "-y",
                    "-ss", f"{position:.3f}",
                    "-i", str(video),
                    "-frames:v", "1",
                    "-vf", f"scale={scale_width}:-2",
                    "-q:v", "4",
                    str(target),
                ],
                quiet=True,
            )
        written.append(target)
        position += interval_sec
    return written


def extract_template(
    video: Path,
    at_sec: float,
    roi: tuple[int, int, int, int],
    size: tuple[int, int],
    output: Path,
) -> Path:
    """ROI を切り出して基準画像(PNG)として保存する。

    グレースケール・縮小済みで保存するので、そのまま照合に使えて中身も目で確認できる。
    """
    output.parent.mkdir(parents=True, exist_ok=True)
    width, height = size
    run(
        [
            "ffmpeg", "-v", "error", "-nostdin", "-y",
            "-ss", f"{at_sec:.3f}",
            "-i", str(video),
            "-frames:v", "1",
            "-vf", f"{crop_filter(roi)},scale={width}:{height},format=gray",
            str(output),
        ],
        quiet=True,
    )
    return output


def suggest_template_size(roi: tuple[int, int, int, int], target_width: int = 160) -> tuple[int, int]:
    """ROI の縦横比を保ったまま、照合用の小さいサイズを決める（偶数に丸める）。"""
    _, _, width, height = roi
    if width <= 0 or height <= 0:
        raise ValueError("ROI の幅・高さが不正です")
    scaled_width = min(target_width, width)
    scaled_height = max(2, int(round(height * scaled_width / width)))
    if scaled_height % 2:
        scaled_height += 1
    if scaled_width % 2:
        scaled_width += 1
    return (scaled_width, scaled_height)
