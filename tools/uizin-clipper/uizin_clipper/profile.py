"""大会シリーズごとの設定（プロファイル）。

**テロップのデザインが変わっても、直すのはこのYAML1枚だけ。コードは触らない。**
これが数年運用するための一番の仕掛け。
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from .steps.segment import SegmentParams

DEFAULT_TEMPLATE_WIDTH = 160
"""比較用に縮小するときの幅。小さいほど速く、ノイズに強い。"""


@dataclass
class Profile:
    path: Path
    name: str = "uizin"
    roi: tuple[int, int, int, int] = (0, 0, 0, 0)
    source_size: tuple[int, int] = (1920, 1080)
    template_size: tuple[int, int] = (DEFAULT_TEMPLATE_WIDTH, 40)
    templates: list[str] = field(default_factory=list)
    fps: float = 1.0
    segment: SegmentParams = field(default_factory=SegmentParams)
    event_name_format: str = "第{n}回大会"

    @property
    def template_paths(self) -> list[Path]:
        base = self.path.parent
        return [(base / t) if not Path(t).is_absolute() else Path(t) for t in self.templates]

    def scaled_roi(self, width: int, height: int) -> tuple[int, int, int, int]:
        """実際の動画解像度に合わせて ROI を換算する。

        1080p で位置合わせしたプロファイルを 720p の動画にそのまま使えるようにする。
        """
        base_w, base_h = self.source_size
        if base_w <= 0 or base_h <= 0:
            raise ValueError("source_size が不正です")

        x, y, w, h = self.roi
        if (width, height) != (base_w, base_h):
            ratio_x = width / base_w
            ratio_y = height / base_h
            x = int(round(x * ratio_x))
            y = int(round(y * ratio_y))
            w = int(round(w * ratio_x))
            h = int(round(h * ratio_y))

        # フレームからはみ出さないように必ず収める
        x = max(0, min(int(x), max(0, width - 1)))
        y = max(0, min(int(y), max(0, height - 1)))
        w = max(1, min(int(w), width - x))
        h = max(1, min(int(h), height - y))
        return (x, y, w, h)

    def validate(self) -> None:
        x, y, w, h = self.roi
        if w <= 0 or h <= 0:
            raise ValueError(
                "ROI が未設定です。先に `calibrate` でスコアボードの位置を登録してください。"
            )
        if not self.templates:
            raise ValueError(
                "基準画像が未設定です。先に `calibrate` を実行してください。"
            )
        self.segment.validate()

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "roi": list(self.roi),
            "source_size": list(self.source_size),
            "template_size": list(self.template_size),
            "templates": list(self.templates),
            "fps": self.fps,
            "event_name_format": self.event_name_format,
            "segment": {
                "enter_threshold": self.segment.enter_threshold,
                "exit_threshold": self.segment.exit_threshold,
                "min_duration_sec": self.segment.min_duration_sec,
                "max_gap_sec": self.segment.max_gap_sec,
                "pre_roll_sec": self.segment.pre_roll_sec,
                "post_roll_sec": self.segment.post_roll_sec,
                "long_segment_sec": self.segment.long_segment_sec,
            },
        }


def _read_structured(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".json":
        return json.loads(text)
    try:
        import yaml  # noqa: PLC0415
    except ImportError as exc:  # pragma: no cover - 環境依存
        raise RuntimeError(
            "PyYAML が必要です。`pip install -r requirements.txt` を実行してください。"
        ) from exc
    return yaml.safe_load(text) or {}


def profile_from_dict(data: dict, path: Path) -> Profile:
    segment_data = dict(data.get("segment") or {})
    fps = float(data.get("fps", 1.0))
    known = {f: segment_data[f] for f in SegmentParams.__dataclass_fields__ if f in segment_data}
    known["fps"] = fps

    roi = tuple(int(v) for v in (data.get("roi") or (0, 0, 0, 0)))
    if len(roi) != 4:
        raise ValueError("roi は [x, y, width, height] の4要素にしてください")

    source_size = tuple(int(v) for v in (data.get("source_size") or (1920, 1080)))
    template_size = tuple(int(v) for v in (data.get("template_size") or (DEFAULT_TEMPLATE_WIDTH, 40)))

    templates = data.get("templates") or []
    if isinstance(templates, str):
        templates = [templates]

    return Profile(
        path=path,
        name=str(data.get("name") or path.stem),
        roi=roi,  # type: ignore[arg-type]
        source_size=source_size,  # type: ignore[arg-type]
        template_size=template_size,  # type: ignore[arg-type]
        templates=[str(t) for t in templates],
        fps=fps,
        segment=SegmentParams(**known),
        event_name_format=str(data.get("event_name_format") or "第{n}回大会"),
    )


def load_profile(path: str | Path) -> Profile:
    target = Path(path)
    if not target.exists():
        raise FileNotFoundError(
            f"プロファイルがありません: {target}\n"
            "profiles/uizin.example.yml をコピーして `calibrate` を実行してください。"
        )
    return profile_from_dict(_read_structured(target), target)


def save_profile(profile: Profile) -> Path:
    target = profile.path
    target.parent.mkdir(parents=True, exist_ok=True)
    data = profile.to_dict()
    if target.suffix.lower() == ".json":
        target.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        return target
    import yaml  # noqa: PLC0415

    target.write_text(
        yaml.safe_dump(data, allow_unicode=True, sort_keys=False), encoding="utf-8"
    )
    return target
