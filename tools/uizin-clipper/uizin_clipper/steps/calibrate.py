"""初回だけ必要な位置合わせ（キャリブレーション）。

システムは「スコアボードがどこに、どんな見た目で出るか」を知らない。
そこを人間が1回だけ教える。所要10分。以降はテロップのデザインが変わるまで不要。
"""

from __future__ import annotations

from pathlib import Path

from ..shellcmd import run
from ..timecode import format_timecode
from .score import crop_filter


FONT_CANDIDATES = (
    "/System/Library/Fonts/Supplemental/Arial.ttf",       # macOS
    "/System/Library/Fonts/Helvetica.ttc",                # macOS（古い版）
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",    # Linux
    "/usr/share/fonts/TTF/DejaVuSans.ttf",
)


def find_font() -> str | None:
    """目盛りの数字に使えるフォントを1つ探す。無ければ None。"""
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return path
    return None


def grid_filter(step: int = 100, major: int = 500, width: int = 1920, height: int = 1080) -> str:
    """座標の目盛りを描く ffmpeg フィルタを組み立てる（純ロジック）。

    ★なぜ要るか
      ROI の座標は、縮小された画面写真から目分量で当てると外します。
      実際に外しました（第13回大会で一致度 0.20〜0.63、26試合中5試合しか出ず）。
      **画像そのものに目盛りを焼き込めば、読み取るだけで済みます。**

    細い線が `step` ごと、太い線が `major` ごと。数字は `major` ごとに入れます。
    """
    if step <= 0 or major <= 0:
        raise ValueError("目盛りの間隔は正の数にしてください")

    parts = [
        f"drawgrid=width={step}:height={step}:thickness=1:color=red@0.35",
        f"drawgrid=width={major}:height={major}:thickness=2:color=yellow@0.85",
    ]

    font = find_font()
    if font:
        for x in range(major, width, major):
            parts.append(
                f"drawtext=fontfile={font}:text='x={x}':fontcolor=yellow:fontsize=28:"
                f"box=1:boxcolor=black@0.7:boxborderw=4:x={x + 6}:y=8"
            )
        for y in range(major, height, major):
            parts.append(
                f"drawtext=fontfile={font}:text='y={y}':fontcolor=yellow:fontsize=28:"
                f"box=1:boxcolor=black@0.7:boxborderw=4:x=8:y={y + 6}"
            )
    return ",".join(parts)


def extract_full_frame(video: Path, at_sec: float, output: Path, *, grid: bool = False) -> Path:
    """指定時刻の1枚をそのまま書き出す（ROIの座標を目で決めるため）。

    `grid=True` で座標の目盛りを焼き込む。★目分量で当てるより確実です。
    """
    output.parent.mkdir(parents=True, exist_ok=True)
    argv = [
        "ffmpeg", "-v", "error", "-nostdin", "-y",
        "-ss", f"{at_sec:.3f}",
        "-i", str(video),
        "-frames:v", "1",
    ]
    if grid:
        argv += ["-vf", grid_filter()]
    argv.append(str(output))
    run(argv, quiet=True)
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
