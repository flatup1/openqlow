"""UIZIN 大会動画 自動切り抜き CLI。

コマンド:
  download       大会動画を取得する
  contact-sheet  下見用に一定間隔の静止画を出す（ROI決めに使う）
  calibrate      スコアボードの位置と基準画像を登録する（初回だけ）
  detect         試合区間を検出して segments.json を作る
  list           segments.json を人が読める形で表示する
  render         segments.json どおりに無劣化MP4を書き出す
  run            download → detect → render を一気に実行する
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import manifest as mf
from .naming import build_clip_filename, build_event_dirname, ensure_unique
from .profile import Profile, load_profile, save_profile
from .shellcmd import CommandFailedError, ToolMissingError
from .steps import calibrate as calib
from .steps import download as dl
from .steps import probe as probe_step
from .steps import render as render_step
from .steps import score as score_step
from .steps.segment import detect_segments
from .timecode import format_duration, format_timecode, parse_timecode

PACKAGE_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_WORK_ROOT = PACKAGE_ROOT / "work"
DEFAULT_OUT_ROOT = PACKAGE_ROOT / "out"
DEFAULT_PROFILE = PACKAGE_ROOT / "profiles" / "uizin.yml"


# ---------------------------------------------------------------- 共通ヘルパ


def parse_roi(value: str) -> tuple[int, int, int, int]:
    parts = [p.strip() for p in value.replace(" ", "").split(",")]
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("ROI は x,y,幅,高さ の4つで指定してください（例 1180,55,620,130）")
    try:
        numbers = tuple(int(p) for p in parts)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"ROI は整数で指定してください: {value!r}") from exc
    if numbers[2] <= 0 or numbers[3] <= 0:
        raise argparse.ArgumentTypeError("ROI の幅・高さは1以上にしてください")
    return numbers  # type: ignore[return-value]


def resolve_source(args, work_root: Path) -> tuple[Path, Path, str]:
    """--url / --video のどちらでも (動画パス, 作業フォルダ, 動画ID) を返す。"""
    if getattr(args, "url", None):
        video_id = dl.extract_video_id(args.url)
        work_dir = work_root / video_id
        video = dl.download(args.url, work_dir, force=getattr(args, "force_download", False))
        return video, work_dir, video_id

    video = Path(args.video).expanduser().resolve()
    if not video.exists():
        raise FileNotFoundError(f"動画がありません: {video}")
    if video.parent.parent == work_root.resolve():
        work_dir = video.parent
        video_id = work_dir.name
    else:
        video_id = dl.extract_video_id(str(video))
        work_dir = work_root / video_id
    work_dir.mkdir(parents=True, exist_ok=True)
    return video, work_dir, video_id


def scores_meta(profile: Profile, roi, video: Path) -> dict:
    templates = []
    for path in profile.template_paths:
        stat = path.stat() if path.exists() else None
        templates.append(
            {
                "path": path.name,
                "mtime": int(stat.st_mtime) if stat else 0,
                "bytes": stat.st_size if stat else 0,
            }
        )
    return {
        "video": video.name,
        "roi": list(roi),
        "template_size": list(profile.template_size),
        "fps": profile.fps,
        "templates": templates,
    }


def print_segments(manifest: dict) -> None:
    segments = manifest["segments"]
    if not segments:
        print("試合が1件も検出されませんでした。しきい値かROIを見直してください。")
        return
    print(f"検出 {len(segments)} 試合  (source: {manifest['source'].get('title') or manifest['source'].get('video_id')})")
    for segment in segments:
        marks = []
        if segment.get("locked"):
            marks.append("locked")
        if segment.get("skip"):
            marks.append("SKIP")
        marks.extend(segment.get("flags") or [])
        names = ""
        if segment.get("red") and segment.get("blue"):
            names = f"  {segment['red']} vs {segment['blue']}"
        print(
            f"  {segment['index']:02d}  "
            f"{format_timecode(segment['start_sec'], with_millis=False)} → "
            f"{format_timecode(segment['end_sec'], with_millis=False)}  "
            f"({format_duration(segment['duration_sec'])})  "
            f"conf {segment['confidence']:.2f}"
            f"{'  [' + ' '.join(marks) + ']' if marks else ''}{names}"
        )
    low = [s for s in segments if "low_confidence" in (s.get("flags") or [])]
    if low:
        numbers = ", ".join("{:02d}".format(s["index"]) for s in low)
        print(f"\n※ 確認推奨: {numbers} （一致度が低い区間）")


# ---------------------------------------------------------------- コマンド


def cmd_download(args) -> int:
    work_root = Path(args.work_dir)
    video_id = dl.extract_video_id(args.url)
    video = dl.download(args.url, work_root / video_id, force=args.force)
    print(f"[download] 完了: {video}")
    return 0


def cmd_contact_sheet(args) -> int:
    work_root = Path(args.work_dir)
    video, work_dir, _ = resolve_source(args, work_root)
    info = probe_step.load_or_probe(video, work_dir)
    out_dir = work_dir / "contact"
    frames = calib.contact_sheet(
        video, out_dir, info["duration_sec"], interval_sec=args.interval
    )
    print(f"[contact-sheet] {len(frames)} 枚を書き出しました: {out_dir}")
    print("試合中の1枚を選び、スコアボードを囲む座標 (x,y,幅,高さ) を控えてください。")
    print(f"※ 座標は元動画の解像度 {info['width']}x{info['height']} 基準で指定します。")
    return 0


def cmd_calibrate(args) -> int:
    work_root = Path(args.work_dir)
    video, work_dir, _ = resolve_source(args, work_root)
    info = probe_step.load_or_probe(video, work_dir)
    at_sec = parse_timecode(args.at)

    if args.roi is None:
        preview = work_dir / f"frame_{format_timecode(at_sec, with_millis=False).replace(':', '')}.png"
        calib.extract_full_frame(video, at_sec, preview)
        print(f"[calibrate] 1枚だけ書き出しました: {preview}")
        print("この画像でスコアボードを囲む座標を測り、--roi x,y,幅,高さ を付けて再実行してください。")
        return 0

    profile_path = Path(args.profile)
    if profile_path.exists():
        profile = load_profile(profile_path)
    else:
        profile = Profile(path=profile_path, name=profile_path.stem)

    profile.roi = args.roi
    profile.source_size = (info["width"], info["height"])
    profile.template_size = calib.suggest_template_size(args.roi, args.template_width)

    template_name = f"{profile.name}.template{len(profile.templates) + 1 if args.append else 1:02d}.png"
    template_path = profile_path.parent / template_name
    calib.extract_template(video, at_sec, args.roi, profile.template_size, template_path)

    if args.append and template_name not in profile.templates:
        profile.templates.append(template_name)
    elif not args.append:
        profile.templates = [template_name]

    save_profile(profile)
    print(f"[calibrate] 基準画像: {template_path}")
    print(f"[calibrate] プロファイル更新: {profile_path}")
    print("次は `detect` を実行してください。")
    return 0


def cmd_detect(args) -> int:
    work_root = Path(args.work_dir)
    profile = load_profile(args.profile)
    profile.validate()

    video, work_dir, video_id = resolve_source(args, work_root)
    info = probe_step.load_or_probe(video, work_dir)
    roi = profile.scaled_roi(info["width"], info["height"])

    scores_path = work_dir / "scores.json"
    meta = scores_meta(profile, roi, video)
    scores: list[float] | None = None
    if scores_path.exists() and not args.force:
        cached, cached_meta = score_step.load_scores(scores_path)
        if cached_meta == meta:
            print(f"[score] キャッシュを使用: {scores_path}")
            scores = cached
        else:
            print("[score] 設定が変わっているので解析し直します")
    if scores is None:
        scores = score_step.score_video(
            video, profile.template_paths, roi, profile.template_size, profile.fps
        )
        score_step.save_scores(scores_path, scores, meta)

    segments = detect_segments(
        scores, profile.segment, duration_sec=info["duration_sec"]
    )
    detected = [mf.segment_to_dict(s) for s in segments]

    manifest_path = work_dir / "segments.json"
    source_meta = {
        "video_id": video_id,
        "path": str(video),
        "duration_sec": round(info["duration_sec"], 3),
        **dl.read_info(work_dir),
    }
    if manifest_path.exists():
        existing = mf.load_manifest(manifest_path)
        merged = mf.merge_segments(existing["segments"], detected)
        kept = sum(1 for s in existing["segments"] if s.get("locked"))
        if kept:
            print(f"[merge] 人間が確定済みの {kept} 件はそのまま残しました")
    else:
        merged = detected

    manifest = mf.build_manifest(
        source=source_meta,
        profile={"name": profile.name, "path": str(Path(args.profile))},
        segments=merged,
    )
    mf.save_manifest(manifest_path, manifest)
    print_segments(manifest)
    print(f"\n[detect] 中間ファイル: {manifest_path}")
    print("内容を確認し、直した区間には \"locked\": true を付けてください。")
    return 0


def cmd_list(args) -> int:
    print_segments(mf.load_manifest(args.manifest))
    return 0


def cmd_render(args) -> int:
    manifest = mf.load_manifest(args.manifest)
    source = Path(manifest["source"]["path"])
    if args.video:
        source = Path(args.video)
    if not source.exists():
        raise FileNotFoundError(f"元動画がありません: {source}（--video で指定できます）")

    work_dir = Path(args.manifest).resolve().parent
    info = probe_step.load_or_probe(source, work_dir)

    event = args.event or manifest["source"].get("title") or manifest["source"]["video_id"]
    out_dir = Path(args.out_dir) / build_event_dirname(event)
    out_dir.mkdir(parents=True, exist_ok=True)

    targets = mf.renderable_segments(manifest)
    if not targets:
        print("書き出す区間がありません。")
        return 1

    taken: set[str] = set()
    for segment in targets:
        filename = ensure_unique(
            build_clip_filename(segment["index"], segment.get("red"), segment.get("blue")),
            taken,
        )
        taken.add(filename)
        plan = render_step.plan_cut(
            segment["start_sec"], segment["end_sec"], info["keyframes"]
        )
        render_step.cut(source, out_dir / filename, plan, overwrite=args.overwrite)
        print(
            f"[render] {filename}  "
            f"{format_timecode(plan.seek_sec, with_millis=False)} + {format_duration(plan.duration_sec)}"
            f"  (前のりしろ {plan.lead_in_sec:.1f}s)"
        )

    print(f"\n[render] 完了: {out_dir}  ({len(targets)} 本)")
    return 0


def cmd_run(args) -> int:
    work_root = Path(args.work_dir)
    video_id = dl.extract_video_id(args.url)

    print("=== 1/3 ダウンロード ===")
    dl.download(args.url, work_root / video_id, force=args.force_download)

    print("\n=== 2/3 試合検出 ===")
    args.video = None
    rc = cmd_detect(args)
    if rc:
        return rc

    if args.stop_after == "detect":
        print("\n--stop-after detect のためここで終了します。")
        return 0

    print("\n=== 3/3 書き出し ===")
    args.manifest = str(work_root / video_id / "segments.json")
    return cmd_render(args)


# ---------------------------------------------------------------- パーサ


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="uizin-clip",
        description="UIZIN 大会動画から試合だけを無劣化で切り出す",
    )
    parser.add_argument("--work-dir", default=str(DEFAULT_WORK_ROOT), help="作業フォルダ（既定 tools/uizin-clipper/work）")
    sub = parser.add_subparsers(dest="command", required=True)

    def add_source(sp, *, allow_url: bool = True):
        group = sp.add_mutually_exclusive_group(required=True)
        if allow_url:
            group.add_argument("--url", help="YouTube URL")
        group.add_argument("--video", help="ローカル動画ファイル")

    p_dl = sub.add_parser("download", help="大会動画を取得する")
    p_dl.add_argument("url")
    p_dl.add_argument("--force", action="store_true", help="既にあっても取り直す")
    p_dl.set_defaults(func=cmd_download)

    p_cs = sub.add_parser("contact-sheet", help="下見用の静止画を出す")
    add_source(p_cs)
    p_cs.add_argument("--interval", type=float, default=300.0, help="何秒おきに出すか（既定300秒）")
    p_cs.set_defaults(func=cmd_contact_sheet)

    p_cal = sub.add_parser("calibrate", help="スコアボードの位置と基準画像を登録する")
    add_source(p_cal)
    p_cal.add_argument("--at", required=True, help="試合中の時刻（例 00:23:10）")
    p_cal.add_argument("--roi", type=parse_roi, help="x,y,幅,高さ（省略すると静止画だけ出す）")
    p_cal.add_argument("--profile", default=str(DEFAULT_PROFILE))
    p_cal.add_argument("--append", action="store_true", help="基準画像を追加する（複数デザイン対応）")
    p_cal.add_argument("--template-width", type=int, default=160, help="照合用に縮小する幅")
    p_cal.set_defaults(func=cmd_calibrate)

    p_det = sub.add_parser("detect", help="試合区間を検出して segments.json を作る")
    add_source(p_det)
    p_det.add_argument("--profile", default=str(DEFAULT_PROFILE))
    p_det.add_argument("--force", action="store_true", help="スコアのキャッシュを使わず解析し直す")
    p_det.set_defaults(func=cmd_detect)

    p_list = sub.add_parser("list", help="segments.json を表示する")
    p_list.add_argument("--manifest", required=True)
    p_list.set_defaults(func=cmd_list)

    p_ren = sub.add_parser("render", help="segments.json どおりにMP4を書き出す")
    p_ren.add_argument("--manifest", required=True)
    p_ren.add_argument("--video", help="元動画（既定は manifest に記録されたパス）")
    p_ren.add_argument("--event", help="出力フォルダ名（例 第13回大会）")
    p_ren.add_argument("--out-dir", default=str(DEFAULT_OUT_ROOT))
    p_ren.add_argument("--overwrite", action="store_true")
    p_ren.set_defaults(func=cmd_render)

    p_run = sub.add_parser("run", help="取得→検出→書き出しを一気に実行する")
    p_run.add_argument("url")
    p_run.add_argument("--profile", default=str(DEFAULT_PROFILE))
    p_run.add_argument("--event", help="出力フォルダ名（例 第14回大会）")
    p_run.add_argument("--out-dir", default=str(DEFAULT_OUT_ROOT))
    p_run.add_argument("--force", action="store_true", help="解析キャッシュを使わず検出し直す")
    p_run.add_argument("--force-download", action="store_true", help="動画を取り直す")
    p_run.add_argument("--overwrite", action="store_true", help="既にあるMP4も書き直す")
    p_run.add_argument(
        "--stop-after",
        choices=["detect", "render"],
        default="render",
        help="detect を指定すると書き出し前に止まる（確認してから render）",
    )
    p_run.set_defaults(func=cmd_run)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except (ToolMissingError, CommandFailedError, FileNotFoundError, ValueError) as exc:
        print(f"エラー: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:  # pragma: no cover
        print("\n中断しました。途中経過は work/ に残っているので、同じコマンドで再開できます。")
        return 130
