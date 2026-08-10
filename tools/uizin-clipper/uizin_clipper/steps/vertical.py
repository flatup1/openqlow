"""横型の動画を 9:16（縦型）にする。

**既定では使いません。** 縦型は再エンコードが必要で、そのぶん画質が落ちるからです。
横型の出力は最初から最後まで無劣化で通っているので、そこに劣化する工程を混ぜません。

必要になったときだけ、書き出し済みのMP4に対して後から掛けます。
（元動画からやり直さないので、劣化は1回だけで済みます。）

**埋め方は2つ**
- `blur` … 同じ映像を拡大してぼかし、上下の余白に敷く。画面が埋まって見栄えがよい。
- `black` … 上下を黒帯にする。処理が軽く、元の絵に何も足さない。
"""

from __future__ import annotations

import subprocess
from pathlib import Path

from ..shellcmd import require_tool

TARGET_WIDTH = 1080
TARGET_HEIGHT = 1920

FILLS = ("blur", "black")


def build_filter(
    *,
    target_width: int = TARGET_WIDTH,
    target_height: int = TARGET_HEIGHT,
    fill: str = "blur",
    blur_strength: int = 20,
) -> str:
    """9:16 に収めるための -vf 文字列を組み立てる（純ロジックなのでテスト可能）。

    元映像は**切り取らず**、横幅いっぱいに収めて上下に余白を作る。
    試合は横に動くので、左右を切ると選手が画面から消える。
    """
    if target_width <= 0 or target_height <= 0:
        raise ValueError("出力サイズは正の数にしてください")
    if fill not in FILLS:
        raise ValueError(f"fill は {' / '.join(FILLS)} のどれかにしてください: {fill!r}")

    fit = (
        f"scale={target_width}:{target_height}:force_original_aspect_ratio=decrease"
    )
    if fill == "black":
        return (
            f"{fit},"
            f"pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2:color=black,"
            f"setsar=1"
        )

    # ぼかし背景: 同じ映像を画面いっぱいに広げてぼかし、その上に元映像を重ねる
    return (
        f"split=2[bg][fg];"
        f"[bg]scale={target_width}:{target_height}:force_original_aspect_ratio=increase,"
        f"crop={target_width}:{target_height},boxblur={blur_strength}:1[bgblur];"
        f"[fg]{fit}[fgfit];"
        f"[bgblur][fgfit]overlay=(W-w)/2:(H-h)/2,setsar=1"
    )


def convert(
    source: Path,
    output: Path,
    *,
    fill: str = "blur",
    target_width: int = TARGET_WIDTH,
    target_height: int = TARGET_HEIGHT,
    crf: int = 20,
    preset: str = "medium",
    overwrite: bool = False,
) -> Path:
    """1本の動画を 9:16 に変換する。**再エンコードするので画質は落ちる。**"""
    require_tool("ffmpeg")
    if output.exists() and not overwrite:
        raise FileExistsError(f"既にあります: {output}（--overwrite で上書き）")
    output.parent.mkdir(parents=True, exist_ok=True)

    graph = build_filter(
        target_width=target_width, target_height=target_height, fill=fill
    )
    # split を使う blur 版は filter_complex、単純な black 版は vf で足りる
    filter_option = ["-filter_complex", graph] if fill == "blur" else ["-vf", graph]

    argv = [
        "ffmpeg", "-v", "error", "-nostdin", "-y" if overwrite else "-n",
        "-i", str(source),
        *filter_option,
        "-c:v", "libx264", "-preset", preset, "-crf", str(crf),
        "-pix_fmt", "yuv420p",
        "-c:a", "copy",
        str(output),
    ]
    result = subprocess.run(argv, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(
            f"9:16 変換に失敗しました: {source.name}\n{result.stderr.strip()[:500]}"
        )
    return output
