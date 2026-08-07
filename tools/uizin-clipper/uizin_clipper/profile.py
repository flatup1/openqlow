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


def scale_roi(
    roi: tuple[int, int, int, int],
    source_size: tuple[int, int],
    target_size: tuple[int, int],
) -> tuple[int, int, int, int]:
    """ROI を別の解像度に換算し、フレームからはみ出さないよう収める。

    1080p で位置合わせしたプロファイルを 720p の動画にそのまま使えるようにする。
    """
    base_w, base_h = source_size
    if base_w <= 0 or base_h <= 0:
        raise ValueError("source_size が不正です")
    width, height = target_size

    x, y, w, h = roi
    if (width, height) != (base_w, base_h):
        ratio_x = width / base_w
        ratio_y = height / base_h
        x = int(round(x * ratio_x))
        y = int(round(y * ratio_y))
        w = int(round(w * ratio_x))
        h = int(round(h * ratio_y))

    x = max(0, min(int(x), max(0, width - 1)))
    y = max(0, min(int(y), max(0, height - 1)))
    w = max(1, min(int(w), width - x))
    h = max(1, min(int(h), height - y))
    return (x, y, w, h)


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

    same_match_roi: tuple[int, int, int, int] | None = None
    """選手名テロップの位置。ラウンド間で割れた区間を繋ぐかの判定に使う。

    未設定なら従来どおり `max_gap_sec` だけで判断する（動作は変わらない）。
    """

    same_match_threshold: float = 0.85
    """この一致度以上なら「同じ試合のラウンド間」とみなす。"""

    @property
    def same_match_size(self) -> tuple[int, int]:
        from .steps.calibrate import suggest_template_size  # noqa: PLC0415

        if not self.same_match_roi:
            raise ValueError("same_match_roi が未設定です")
        return suggest_template_size(self.same_match_roi, DEFAULT_TEMPLATE_WIDTH)

    def scaled_same_match_roi(self, width: int, height: int) -> tuple[int, int, int, int] | None:
        if not self.same_match_roi:
            return None
        return scale_roi(self.same_match_roi, self.source_size, (width, height))

    @property
    def template_paths(self) -> list[Path]:
        base = self.path.parent
        return [(base / t) if not Path(t).is_absolute() else Path(t) for t in self.templates]

    def scaled_roi(self, width: int, height: int) -> tuple[int, int, int, int]:
        """実際の動画解像度に合わせて ROI を換算する。"""
        return scale_roi(self.roi, self.source_size, (width, height))

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
            "same_match_roi": list(self.same_match_roi) if self.same_match_roi else None,
            "same_match_threshold": self.same_match_threshold,
            "segment": {
                "enter_threshold": self.segment.enter_threshold,
                "exit_threshold": self.segment.exit_threshold,
                "min_duration_sec": self.segment.min_duration_sec,
                "max_gap_sec": self.segment.max_gap_sec,
                "pre_roll_sec": self.segment.pre_roll_sec,
                "post_roll_sec": self.segment.post_roll_sec,
                "long_segment_sec": self.segment.long_segment_sec,
                "round_gap_sec": self.segment.round_gap_sec,
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

    same_match = data.get("same_match_roi")
    if same_match:
        same_match = tuple(int(v) for v in same_match)
        if len(same_match) != 4:
            raise ValueError("same_match_roi は [x, y, width, height] の4要素にしてください")
    else:
        same_match = None

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
        same_match_roi=same_match,  # type: ignore[arg-type]
        same_match_threshold=float(data.get("same_match_threshold", 0.85)),
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
