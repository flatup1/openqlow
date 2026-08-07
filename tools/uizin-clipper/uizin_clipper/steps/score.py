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
) -> Iterator[bytes]:
    """ROI を fps 間隔で切り出し、1フレームぶんの生バイト列を順に返す。"""
    require_tool("ffmpeg")
    width, height = (int(v) for v in size)
    frame_bytes = width * height

    argv = [
        "ffmpeg", "-v", "error", "-nostdin",
        "-i", str(video),
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
    require_tool("ffmpeg")
    width, height = (int(v) for v in size)
    argv = [
        "ffmpeg", "-v", "error", "-nostdin",
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
) -> list[float]:
    """1サンプルごとの一致度(0.0〜1.0)を返す。複数テンプレートは最大値を採用。"""
    np = _numpy()
    if not templates:
        raise ValueError("基準画像が1枚もありません。先に calibrate を実行してください。")

    loaded = [load_template(Path(t), size) for t in templates]
    scores: list[float] = []
    for i, raw in enumerate(iter_roi_frames(video, roi, size, fps)):
        sample = np.frombuffer(raw, dtype=np.uint8).astype(np.float32)
        best = max(zncc(sample, template) for template in loaded)
        scores.append(round(max(0.0, best), 4))
        if progress_every and i and i % progress_every == 0:
            print(f"[score] {i / fps / 60:.0f} 分ぶん解析済み")
    return scores


def save_scores(path: Path, scores: Sequence[float], meta: dict) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"meta": meta, "scores": list(scores)}
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return path


def load_scores(path: Path) -> tuple[list[float], dict]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return list(data["scores"]), dict(data.get("meta", {}))
