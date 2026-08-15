"""主判定：スコアボード（試合中テロップ）の一致度を1秒ごとに測る。

やっていることは「画面の決まった場所を切り出して、基準画像とどれだけ似ているか」だけ。
似ている = 試合中。似ていない = MC・休憩・表彰。

- ffmpeg で ROI を切り出し、グレースケール生データとして受け取る
  （ffmpeg 側で crop + scale するので、Python 側は極小の配列しか扱わない = 速い）
- 比較は ZNCC（正規化相互相関）。明るさやコントラストが変わっても形が合えば当たる。
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Iterator, Sequence

from ..shellcmd import require_tool

EPSILON = 1e-8


def _numpy():
    try:
        import numpy  # noqa: PLC0415
    except ImportError as exc:  # pragma: no cover - 環境依存
        raise RuntimeError(
            "numpy が必要です。`pip install -r requirements.txt` を実行してください。"
        ) from exc
    return numpy


def crop_filter(roi: Sequence[int]) -> str:
    x, y, width, height = (int(v) for v in roi)
    if width <= 0 or height <= 0:
        raise ValueError(f"ROIの幅・高さは正の数にしてください: {roi}")
    if x < 0 or y < 0:
        raise ValueError(f"ROIの座標は0以上にしてください: {roi}")
    return f"crop={width}:{height}:{x}:{y}"


def build_filter(roi: Sequence[int], size: Sequence[int], fps: float | None) -> str:
    """ffmpeg の -vf 文字列を組み立てる（純ロジックなのでテスト可能）。"""
    width, height = (int(v) for v in size)
    parts = []
    if fps:
        parts.append(f"fps={fps}")
    parts.append(crop_filter(roi))
    parts.append(f"scale={width}:{height}")
    parts.append("format=gray")
    return ",".join(parts)


def iter_roi_frames(
    video: Path,
    roi: Sequence[int],
    size: Sequence[int],
    fps: float,
    *,
    from_sec: float = 0.0,
    until_sec: float | None = None,
) -> Iterator[bytes]:
    """ROI を fps 間隔で切り出し、1フレームぶんの生バイト列を順に返す。

    `from_sec` / `until_sec` で解析する範囲を絞れる。

    ★大会配信の**最後にハイライト映像が入る**ことがある（第13回大会で実際にあった）。
      そこには過去の試合のテロップが再び映るので、範囲を絞らないと
      **同じ試合を2回検出**してしまう。試合が終わる時刻で切るのが確実。
    """
    ffmpeg = require_tool("ffmpeg")
    width, height = (int(v) for v in size)
    frame_bytes = width * height

    argv = [ffmpeg, "-v", "error", "-nostdin"]
    if from_sec > 0:
        # -i より前に置くと速い（そこまで読み飛ばす）
        argv += ["-ss", f"{from_sec:.3f}"]
    argv += ["-i", str(video)]
    if until_sec is not None:
        argv += ["-t", f"{max(0.0, until_sec - from_sec):.3f}"]
    argv += [
        "-an", "-sn", "-dn",
        "-vf", build_filter(roi, size, fps),
        "-f", "rawvideo", "-pix_fmt", "gray", "-",
    ]
    process = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert process.stdout is not None
    try:
        while True:
            chunk = process.stdout.read(frame_bytes)
            if not chunk or len(chunk) < frame_bytes:
                break
            yield chunk
    finally:
        process.stdout.close()
        stderr = process.stderr.read().decode("utf-8", "ignore") if process.stderr else ""
        process.wait()
        if process.returncode not in (0, None) and process.returncode != 0:
            raise RuntimeError(f"ffmpeg のフレーム抽出に失敗しました:\n{stderr[-800:]}")


def load_template(path: Path, size: Sequence[int]):
    """基準画像(PNG)を指定サイズのグレースケール配列として読む。"""
    np = _numpy()
    ffmpeg = require_tool("ffmpeg")
    width, height = (int(v) for v in size)
    argv = [
        ffmpeg, "-v", "error", "-nostdin",
        "-i", str(path),
        "-vf", f"scale={width}:{height},format=gray",
        "-frames:v", "1",
        "-f", "rawvideo", "-pix_fmt", "gray", "-",
    ]
    result = subprocess.run(argv, capture_output=True)
    if result.returncode != 0 or len(result.stdout) < width * height:
        raise RuntimeError(
            f"基準画像を読み込めません: {path}\n{result.stderr.decode('utf-8', 'ignore')[-400:]}"
        )
    return np.frombuffer(result.stdout[: width * height], dtype=np.uint8).astype(np.float32)


MIN_TEMPLATE_STD = 6.0
"""基準画像に必要な最低限の「模様の濃さ」。これ未満は無地とみなす。"""


def template_std(template) -> float:
    """基準画像のばらつき。無地（真っ白な帯など）だと 0 に近づく。"""
    np = _numpy()
    return float(np.std(template))


def zncc(sample, template) -> float:
    """正規化相互相関。-1.0〜1.0 を返す。"""
    np = _numpy()
    a = sample - sample.mean()
    b = template - template.mean()
    denom = float(np.sqrt((a * a).sum()) * np.sqrt((b * b).sum()))
    if denom < EPSILON:
        return 0.0
    return float((a * b).sum() / denom)


def score_video(
    video: Path,
    templates: Sequence[Path],
    roi: Sequence[int],
    size: Sequence[int],
    fps: float,
    *,
    progress_every: int = 600,
    from_sec: float = 0.0,
    until_sec: float | None = None,
) -> list[float]:
    """1サンプルごとの一致度(0.0〜1.0)を返す。複数テンプレートは最大値を採用。"""
    np = _numpy()
    if not templates:
        raise ValueError("基準画像が1枚もありません。先に calibrate を実行してください。")

    loaded = [load_template(Path(t), size) for t in templates]

    # 無地のROIを選ぶと ZNCC は常に 0 になり、「1件も検出されない」だけで
    # 理由が分からなくなる。黙って失敗させず、ここで止めて原因を伝える。
    for path, template in zip(templates, loaded):
        deviation = template_std(template)
        if deviation < MIN_TEMPLATE_STD:
            raise ValueError(
                f"基準画像に模様がありません（ばらつき {deviation:.1f} < {MIN_TEMPLATE_STD}）: {path}\n"
                "無地の帯や単色部分をROIに選ぶと判定できません。\n"
                "枠線・ロゴ・区切り線など、形のある部分を含めて calibrate し直してください。"
            )

    scores: list[float] = []
    for i, raw in enumerate(
        iter_roi_frames(video, roi, size, fps, from_sec=from_sec, until_sec=until_sec)
    ):
        sample = np.frombuffer(raw, dtype=np.uint8).astype(np.float32)
        best = max(zncc(sample, template) for template in loaded)
        scores.append(round(max(0.0, best), 4))
        if progress_every and i and i % progress_every == 0:
            print(f"[score] {(from_sec + i / fps) / 60:.0f} 分まで解析済み")
    return scores


def save_scores(path: Path, scores: Sequence[float], meta: dict) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"meta": meta, "scores": list(scores)}
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return path


def load_scores(path: Path) -> tuple[list[float], dict]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return list(data["scores"]), dict(data.get("meta", {}))
