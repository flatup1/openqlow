"""UIZIN 大会動画 自動切り抜き CLI。

コマンド:
  download       大会動画を取得する
  contact-sheet  下見用に一定間隔の静止画を出す（ROI決めに使う）
  calibrate      スコアボードの位置と基準画像を登録する（初回だけ）
  detect         試合区間を検出して segments.json を作る
  list           segments.json を人が読める形で表示する
  card           対戦表（card.yml）から選手名を入れる
  refine         ゴングで開始・終了を数秒だけ寄せる
  render         segments.json どおりに無劣化MP4を書き出す
  vertical       書き出したMP4を9:16にする（再エンコード・任意）
  highlights     1試合の中からSNS向けの見どころ候補を選ぶ
  captions       投稿文の下書きを作る（送信はしない）
  run            download → detect → render を一気に実行する
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import captions as caption_step
from . import manifest as mf
from .card import apply_card, parse_card
from .evaluate import Interval, evaluate, load_truth
from .highlight import HighlightParams, combine_scores, pick_highlights
from .matchshape import (
    KoHintParams,
    MatchShape,
    duration_flags,
    ko_hint,
    looks_like_two_matches,
)
from .naming import build_clip_filename, build_event_dirname, ensure_unique, stale_names
from .onset import OnsetParams, refine_end, refine_start
from .profile import Profile, load_profile, save_profile
from .shellcmd import CommandFailedError, ToolMissingError
from .steps import calibrate as calib
from .steps import download as dl
from .steps import inspect_output
from .steps import loudness as loudness_step
from .steps import motion as motion_step
from .steps import probe as probe_step
from .steps import render as render_step
from .steps import samematch
from .steps import score as score_step
from .steps import vertical as vertical_step
from .steps.segment import SegmentParams, detect_segments, merge_rounds
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
        video = dl.download(
            args.url,
            work_dir,
            force=getattr(args, "force_download", False),
            cookies_from_browser=getattr(args, "cookies_from_browser", None),
            extra_args=getattr(args, "yt_dlp_arg", None),
        )
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

    # 検出時に使った基準を manifest から読む。無ければ既定値。
    recorded = (manifest.get("profile") or {}).get("params") or {}
    print_shape_warnings(segments, recorded.get("min_duration_sec"))


def print_shape_warnings(segments: list[dict], min_duration_sec: float | None = None) -> None:
    """大会の進行から見ておかしい長さの区間を知らせる。

    UIZIN大会は 1ラウンド1分30秒×2、インターバル1分。試合そのものは最長4分。
    ★消さずに知らせるだけ。延長や中断など、本当に特殊な試合を黙って消さないため。

    `min_duration_sec` は検出に使った値を渡す。★渡さずに既定値を使うと、
    プロファイルで基準を変えている場合に **検出と表示で言うことが食い違う**。
    """
    shape = MatchShape()
    if min_duration_sec is None:
        min_duration_sec = SegmentParams().min_duration_sec
    suspicious = []
    for segment in segments:
        flags = duration_flags(
            float(segment["duration_sec"]), shape, min_duration_sec=min_duration_sec
        )
        if flags:
            suspicious.append((segment, flags))

    if not suspicious:
        return

    print(f"\n※ 長さが目安から外れています（1試合の目安は最長 {format_duration(shape.core_sec())}）")
    for segment, flags in suspicious:
        reason = "長すぎます" if "too_long" in flags else "短すぎます"
        if "too_long" in flags and looks_like_two_matches(float(segment["duration_sec"]), shape):
            reason = "長すぎます（2試合が繋がった疑い）"
        print(
            f"  {segment['index']:02d}  {format_duration(segment['duration_sec'])}  → {reason}"
        )
    print("  中身を確認してください。自動では消しません。")


# ---------------------------------------------------------------- コマンド


def cmd_download(args) -> int:
    work_root = Path(args.work_dir)
    video_id = dl.extract_video_id(args.url)
    video = dl.download(
        args.url,
        work_root / video_id,
        force=args.force,
        cookies_from_browser=args.cookies_from_browser,
        extra_args=args.yt_dlp_arg,
    )
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

    if args.same_match_roi:
        profile.same_match_roi = args.same_match_roi

    save_profile(profile)

    # 無地のROIを選ぶと検出が常にゼロになるので、ここで気づけるようにする
    deviation = score_step.template_std(
        score_step.load_template(template_path, profile.template_size)
    )
    if deviation < score_step.MIN_TEMPLATE_STD:
        print(
            f"[警告] 基準画像に模様がありません（ばらつき {deviation:.1f}）。\n"
            "        無地の部分を選ぶと1件も検出できません。"
            "枠線・ロゴ・区切り線を含む位置にしてください。"
        )
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

    # ラウンド間で割れた区間を、テロップが同じかどうかで繋ぎ直す。
    # same_match_roi が未設定なら従来どおり max_gap_sec だけで判断する。
    same_roi = profile.scaled_same_match_roi(info["width"], info["height"])
    if same_roi and len(segments) > 1:
        print("[round] ラウンド間の途切れを確認します（テロップが同じなら繋ぎます）")
        segments = merge_rounds(
            segments,
            profile.segment,
            samematch.make_round_decider(
                video, same_roi, profile.same_match_size, profile.same_match_threshold
            ),
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
        profile={
            "name": profile.name,
            "path": str(Path(args.profile)),
            # ★検出に使った基準を残す。あとから list や report が同じ基準で
            #   話せるようにするため。残さないと、表示だけ既定値で判断してしまう。
            "params": {
                "min_duration_sec": profile.segment.min_duration_sec,
                "post_roll_sec": profile.segment.post_roll_sec,
                "round_gap_sec": profile.segment.round_gap_sec,
                "long_segment_sec": profile.segment.long_segment_sec,
            },
        },
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
    warn_about_stale(out_dir, taken, prune=getattr(args, "prune", False))
    return 0


def cmd_card(args) -> int:
    """対戦表から選手名を入れる。ファイル名が `01_赤選手vs青選手.mp4` になる。"""
    from .profile import _read_structured  # noqa: PLC0415

    manifest = mf.load_manifest(args.manifest)
    card = parse_card(_read_structured(Path(args.card)))

    written = apply_card(manifest["segments"], card, overwrite=args.overwrite)
    mf.save_manifest(args.manifest, manifest)

    print(f"[card] {written} 件に選手名を入れました。")
    for segment in mf.renderable_segments(manifest):
        filename = build_clip_filename(
            segment["index"], segment.get("red"), segment.get("blue")
        )
        print(f"  {segment['index']:02d}  {filename}")
    print("\n名前が違っていたら segments.json を直して \"locked\": true を付けてください。")
    return 0


def cmd_refine(args) -> int:
    """ゴング（試合開始の合図）で開始位置を数秒だけ寄せる。

    スコアボードで決めた位置の**前後数秒だけ**を探す。範囲を絞ることが安全装置。
    立ち上がりが見つからなければ動かさない。`locked` の区間は触らない。
    """
    manifest = mf.load_manifest(args.manifest)
    source = Path(args.video) if args.video else Path(manifest["source"]["path"])
    if not source.exists():
        raise FileNotFoundError(f"元動画がありません: {source}（--video で指定できます）")

    params = OnsetParams(search_sec=args.window)
    step = 0.25  # ゴングは一瞬なので、見どころ抽出より細かく測る
    moved_count = 0

    for segment in manifest["segments"]:
        if segment.get("locked"):
            print(f"  {segment['index']:02d}  locked のため触りません")
            continue

        core_start = float(segment.get("core_start_sec", segment["start_sec"]))
        window_start = max(0.0, core_start - params.search_sec)
        window_length = params.search_sec * 2

        values = loudness_step.measure(
            source, start_sec=window_start, duration_sec=window_length, step_sec=step
        )
        if not values:
            print(f"  {segment['index']:02d}  音が読めませんでした")
            continue

        moved, shift = refine_start(
            core_start, values, params, step_sec=step, window_start_sec=window_start
        )
        if shift is None:
            print(f"  {segment['index']:02d}  開始: はっきりした合図なし → 動かしません")
        else:
            # 前のりしろを保ったまま、全体を同じだけずらす
            segment["core_start_sec"] = round(moved, 3)
            segment["start_sec"] = round(float(segment["start_sec"]) + shift, 3)
            mf.normalize_segment(segment)
            moved_count += 1
            print(
                f"  {segment['index']:02d}  開始: {shift:+.2f}秒 寄せました → "
                f"{format_timecode(segment['start_sec'], with_millis=False)}"
            )

        if args.start_only:
            continue

        # ---- 終了のゴング。開始と同じ理屈だが、前へは絶対に動かさない ----
        core_end = float(segment.get("core_end_sec", segment["end_sec"]))
        end_window_start = max(0.0, core_end - params.search_sec)

        end_values = loudness_step.measure(
            source, start_sec=end_window_start, duration_sec=window_length, step_sec=step
        )
        if not end_values:
            print(f"  {segment['index']:02d}  終了: 音が読めませんでした")
            continue

        moved_end, end_shift = refine_end(
            core_end, end_values, params, step_sec=step, window_start_sec=end_window_start
        )
        if end_shift is None:
            print(f"  {segment['index']:02d}  終了: 動かしません")
            continue

        segment["core_end_sec"] = round(moved_end, 3)
        segment["end_sec"] = round(float(segment["end_sec"]) + end_shift, 3)
        mf.normalize_segment(segment)
        moved_count += 1
        print(
            f"  {segment['index']:02d}  終了: {end_shift:+.2f}秒 後ろへ寄せました → "
            f"{format_timecode(segment['end_sec'], with_millis=False)}"
        )

    # ★境界を動かしたあとは必ず整える。動かした結果、隣と重なったり
    #   動画の外へはみ出したりする（実測で確認済み）。
    duration_sec = None
    try:
        duration_sec = probe_step.load_or_probe(source, Path(args.manifest).resolve().parent)[
            "duration_sec"
        ]
    except (CommandFailedError, ToolMissingError, KeyError, OSError):
        print("  ※ 動画の尺が読めないので、尺のはみ出しは確認できませんでした")

    for note in mf.resolve_overlaps(manifest["segments"], duration_sec=duration_sec):
        print(f"  整えました: {note}")

    mf.save_manifest(args.manifest, manifest)
    print(f"\n[refine] {moved_count} 件の境界を調整しました。")
    print("納得できない区間は segments.json を直して \"locked\": true を付けてください。")
    return 0


def cmd_vertical(args) -> int:
    """書き出し済みのMP4を 9:16 に変換する。**再エンコードするので画質は落ちる。**"""
    source_dir = Path(args.in_dir)
    if not source_dir.is_dir():
        raise FileNotFoundError(f"フォルダがありません: {source_dir}")

    files = sorted(p for p in source_dir.glob("*.mp4") if p.is_file())
    if not files:
        print(f"MP4がありません: {source_dir}")
        return 1

    out_dir = Path(args.out_dir) if args.out_dir else source_dir / "vertical"
    print(f"■ 9:16 変換  {len(files)} 本  埋め方={args.fill}")
    print("※ 再エンコードします。元の横型（無劣化）はそのまま残ります。")

    for path in files:
        target = out_dir / path.name
        vertical_step.convert(
            path,
            target,
            fill=args.fill,
            target_width=args.width,
            target_height=args.height,
            crf=args.crf,
            overwrite=args.overwrite,
        )
        print(f"[vertical] {target.name}")

    print(f"\n[vertical] 完了: {out_dir}")
    return 0


def cmd_highlights(args) -> int:
    """1試合の中から、SNS向けの短い見どころ候補を選ぶ。

    音量と運動量を測るだけで、AIも学習も外部APIも使わない。
    結果は highlights.json に書き、**人間が見て選ぶ**。
    """
    manifest = mf.load_manifest(args.manifest)
    source = Path(args.video) if args.video else Path(manifest["source"]["path"])
    if not source.exists():
        raise FileNotFoundError(f"元動画がありません: {source}（--video で指定できます）")

    params = HighlightParams(
        top_n=args.top,
        min_clip_sec=args.min_sec,
        max_clip_sec=args.max_sec,
    )
    params.validate()

    targets = mf.renderable_segments(manifest)
    if args.match:
        targets = [s for s in targets if s["index"] == args.match]
        if not targets:
            raise ValueError(f"{args.match} 番の試合がありません")

    step = args.step
    results: list[dict] = []
    for segment in targets:
        start = float(segment["start_sec"])
        duration = float(segment["duration_sec"])
        label = build_clip_filename(segment["index"], segment.get("red"), segment.get("blue"))
        print(f"[highlights] {label} を解析中…（{format_duration(duration)}）")

        loud = loudness_step.measure(
            source, start_sec=start, duration_sec=duration, step_sec=step
        )
        move = motion_step.measure(
            source, start_sec=start, duration_sec=duration, step_sec=step
        )
        if not loud and not move:
            print("  → 音声も映像も読めませんでした。飛ばします。")
            continue
        if not loud:
            print("  → 音声トラックがないので、動きだけで判断します。")

        # ★KOらしさの「下書き」。ここで音量を測っているので、ついでに見積もる。
        #   result は自動で確定しない。KOと判定を取り違えた切り抜きを公開する事故は、
        #   手入力3秒で防げる。機械が「らしい」と言い、人間が決める。
        if loud:
            core_end = float(segment.get("core_end_sec", segment["end_sec"]))
            core_len = max(0.0, core_end - start)
            core_loud = loud[: max(1, int(round(core_len / step)))]
            looks_ko, reason = ko_hint(
                core_len, core_loud, MatchShape(), KoHintParams(), step_sec=step
            )
            segment["result_hint"] = "KO?" if looks_ko else ""
            segment["result_hint_reason"] = reason
            print(f"  勝敗の下書き: {'KOらしい' if looks_ko else '判断しない'} — {reason}")

        scores = combine_scores(loud or [0.0] * len(move), move, params, step_sec=step)
        picked = pick_highlights(
            scores,
            params,
            step_sec=step,
            offset_sec=start,
            match_duration_sec=duration,
        )
        if not picked:
            print("  → 目立つ盛り上がりがありませんでした（無理に作りません）。")

        for highlight in picked:
            print(
                f"  {highlight.index}: "
                f"{format_timecode(highlight.start_sec, with_millis=False)} → "
                f"{format_timecode(highlight.end_sec, with_millis=False)} "
                f"({format_duration(highlight.duration_sec)})  "
                f"スコア {highlight.score:.2f}  {highlight.reason}"
            )
            results.append(
                {
                    "match_index": segment["index"],
                    "index": highlight.index,
                    "start": format_timecode(highlight.start_sec),
                    "end": format_timecode(highlight.end_sec),
                    "start_sec": highlight.start_sec,
                    "end_sec": highlight.end_sec,
                    "peak_sec": highlight.peak_sec,
                    "duration_sec": round(highlight.duration_sec, 3),
                    "score": highlight.score,
                    "reason": highlight.reason,
                    "skip": False,
                }
            )

    out_path = Path(args.out or (Path(args.manifest).resolve().parent / "highlights.json"))
    out_path.write_text(
        json.dumps(
            {"source": manifest["source"], "highlights": results},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    # 勝敗の下書き（result_hint）を書き戻す。result そのものには触らない。
    mf.save_manifest(args.manifest, manifest)

    print(f"\n[highlights] {len(results)} 本の候補: {out_path}")
    print("中身を見て、要らない候補には \"skip\": true を付けてください。")
    print("勝敗の下書きは segments.json の result_hint に入れました（確定は人間が）。")
    print(f"書き出しは: render-highlights --highlights {out_path}")
    return 0


def cmd_render_highlights(args) -> int:
    """highlights.json どおりに、短い動画を無劣化で書き出す。"""
    data = json.loads(Path(args.highlights).read_text(encoding="utf-8"))
    entries = [h for h in data.get("highlights", []) if not h.get("skip")]
    if not entries:
        print("書き出す候補がありません。")
        return 1

    source = Path(args.video) if args.video else Path(data["source"]["path"])
    if not source.exists():
        raise FileNotFoundError(f"元動画がありません: {source}（--video で指定できます）")

    work_dir = Path(args.highlights).resolve().parent
    info = probe_step.load_or_probe(source, work_dir)

    event = args.event or data["source"].get("title") or data["source"]["video_id"]
    out_dir = Path(args.out_dir) / build_event_dirname(event) / "shorts"
    out_dir.mkdir(parents=True, exist_ok=True)

    taken: set[str] = set()
    for entry in entries:
        name = f"{int(entry['match_index']):02d}_short{int(entry['index'])}.mp4"
        filename = ensure_unique(name, taken)
        taken.add(filename)
        plan = render_step.plan_cut(
            entry["start_sec"], entry["end_sec"], info["keyframes"]
        )
        render_step.cut(source, out_dir / filename, plan, overwrite=args.overwrite)
        print(
            f"[shorts] {filename}  "
            f"{format_timecode(plan.seek_sec, with_millis=False)} + "
            f"{format_duration(plan.duration_sec)}"
        )

    print(f"\n[shorts] 完了: {out_dir}  ({len(entries)} 本)")
    warn_about_stale(out_dir, taken, prune=getattr(args, "prune", False))
    print(
        "※ 無劣化カットなのでキーフレームまで手前に戻ります。"
        "秒単位でぴったり切りたい場合だけ、再エンコードが必要です。"
    )
    return 0


def cmd_captions(args) -> int:
    """投稿文の下書きを作る。**送信はしない。**"""
    manifest = mf.load_manifest(args.manifest)
    event = args.event or manifest["source"].get("title") or manifest["source"]["video_id"]
    hashtags = [t for t in (args.hashtags or "").split(",") if t.strip()]

    out_dir = Path(args.out_dir) / build_event_dirname(event) / "captions"
    out_dir.mkdir(parents=True, exist_ok=True)

    for segment in mf.renderable_segments(manifest):
        context = caption_step.CaptionContext(
            event=event,
            index=segment["index"],
            red=segment.get("red"),
            blue=segment.get("blue"),
            result=segment.get("result"),
            note=segment.get("note"),
            **({"hashtags": hashtags} if hashtags else {}),
        )
        target = out_dir / f"{segment['index']:02d}.txt"
        target.write_text(caption_step.render_text(context), encoding="utf-8")
        print(f"[captions] {target.name}  {caption_step.youtube_title(context)}")

    print(f"\n[captions] 下書き: {out_dir}")
    print("★ これは下書きです。投稿・公開はオーナー承認後に人間が行ってください。")
    return 0


def warn_about_stale(out_dir: Path, produced: set[str], *, prune: bool) -> None:
    """今回作らなかったMP4が残っていたら知らせる（既定では消さない）。

    ★選手名を入れて書き出し直すと `01.mp4` と `01_赤選手vs青選手.mp4` が両方残り、
      12試合なのに24本並ぶ。**間違ったほうを投稿する事故**につながるので必ず知らせる。
    """
    leftovers = stale_names([p.name for p in out_dir.glob("*.mp4")], produced)
    if not leftovers:
        return

    print(f"\n⚠ 今回作らなかったMP4が {len(leftovers)} 本残っています（古い書き出し）:")
    for name in leftovers:
        print(f"    {name}")

    if not prune:
        print("  中身を確かめて、要らなければ削除してください（--prune で自動削除）。")
        return

    for name in leftovers:
        (out_dir / name).unlink()
    print(f"  --prune 指定のため削除しました（{len(leftovers)} 本）。")


def cmd_report(args) -> int:
    """検出結果を正解と突き合わせ、書き出したMP4も点検して数値で出す。"""
    manifest = mf.load_manifest(args.manifest)
    detected = [
        Interval(s["start_sec"], s["end_sec"], f"{s['index']:02d}")
        for s in mf.renderable_segments(manifest)
    ]

    print(f"■ 検出結果  {len(detected)} 本")
    for segment in mf.renderable_segments(manifest):
        marks = " ".join(segment.get("flags") or [])
        print(
            f"  {segment['index']:02d}  "
            f"{format_timecode(segment['start_sec'], with_millis=False)} → "
            f"{format_timecode(segment['end_sec'], with_millis=False)}  "
            f"({format_duration(segment['duration_sec'])})  conf {segment['confidence']:.2f}"
            f"{'  [' + marks + ']' if marks else ''}"
        )

    if args.truth:
        truth = load_truth(args.truth)
        result = evaluate(truth, detected, min_overlap=args.min_overlap)
        print(f"\n■ 正解との突き合わせ（正解 {len(truth)} 試合）")
        for key, value in result.summary(len(truth), len(detected)).items():
            print(f"  {key}: {value}")
        if result.missed:
            print(f"  見逃した正解番号: {result.missed}")
        if result.spurious:
            print(f"  余計に検出した番号: {result.spurious}")
        for ti, dis in result.split:
            print(f"  分割: 正解{ti} → 検出{dis}")
        for di, tis in result.fused:
            print(f"  結合: 検出{di} → 正解{tis}")
        if result.start_errors_sec:
            starts = sorted(result.start_errors_sec)
            ends = sorted(result.end_errors_sec)
            middle = len(starts) // 2
            print(
                f"  開始のずれ  中央 {starts[middle]:+.1f}秒  "
                f"最小 {starts[0]:+.1f}秒  最大 {starts[-1]:+.1f}秒"
            )
            print(
                f"  終了のずれ  中央 {ends[middle]:+.1f}秒  "
                f"最小 {ends[0]:+.1f}秒  最大 {ends[-1]:+.1f}秒"
            )

    if args.out_dir:
        source = Path(manifest["source"]["path"])
        source_codec = ""
        keyframes: list[float] = []
        if source.exists():
            source_codec = inspect_output.inspect(source, 0.0, deep=False).video_codec
            work_dir = Path(args.manifest).resolve().parent
            keyframes = probe_step.load_or_probe(source, work_dir)["keyframes"]
        event = args.event or manifest["source"].get("title") or manifest["source"]["video_id"]
        directory = Path(args.out_dir) / build_event_dirname(event)
        print(f"\n■ 書き出したMP4の点検  {directory}")
        taken: set[str] = set()
        problem_count = 0
        for segment in mf.renderable_segments(manifest):
            filename = ensure_unique(
                build_clip_filename(segment["index"], segment.get("red"), segment.get("blue")),
                taken,
            )
            taken.add(filename)
            plan = render_step.plan_cut(
                segment["start_sec"], segment["end_sec"], keyframes
            )
            check = inspect_output.inspect(
                directory / filename, plan.duration_sec, deep=not args.quick
            )
            issues = check.problems(source_video_codec=source_codec)
            problem_count += bool(issues)
            status = "NG: " + " / ".join(issues) if issues else "OK"
            print(
                f"  {check.name}  {check.video_codec or '-'}/{check.audio_codec or '-'}  "
                f"尺 {check.duration_sec:.1f}s（想定 {check.expected_sec:.1f}s, "
                f"差 {check.duration_error_sec:+.1f}s）  音ズレ {check.av_offset_sec:+.2f}s  "
                f"エラー {check.decode_errors}  → {status}"
            )
        print(f"  問題のあったファイル: {problem_count} / {len(taken)}")
    return 0


def cmd_run(args) -> int:
    work_root = Path(args.work_dir)
    video_id = dl.extract_video_id(args.url)

    print("=== 1/3 ダウンロード ===")
    dl.download(
        args.url,
        work_root / video_id,
        force=args.force_download,
        cookies_from_browser=args.cookies_from_browser,
        extra_args=args.yt_dlp_arg,
    )

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

    def add_download_options(sp):
        """★YouTube に断られたときの逃げ道。

        YouTube は自動取得を止めるしくみを頻繁に変えます。回避方法を
        コードに埋め込むと、変わるたびに修正が必要になるので、渡し口だけ用意します。
        """
        sp.add_argument(
            "--cookies-from-browser",
            help="ブラウザのログイン情報を使う（chrome / safari / firefox / edge / brave）",
        )
        sp.add_argument(
            "--yt-dlp-arg",
            action="append",
            metavar="ARG",
            help="yt-dlp にそのまま渡す引数（何回でも指定できる）",
        )

    def add_source(sp, *, allow_url: bool = True):
        group = sp.add_mutually_exclusive_group(required=True)
        if allow_url:
            group.add_argument("--url", help="YouTube URL")
            add_download_options(sp)
        group.add_argument("--video", help="ローカル動画ファイル")

    p_dl = sub.add_parser("download", help="大会動画を取得する")
    p_dl.add_argument("url")
    p_dl.add_argument("--force", action="store_true", help="既にあっても取り直す")
    add_download_options(p_dl)
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
    p_cal.add_argument(
        "--same-match-roi",
        type=parse_roi,
        help="選手名テロップの位置。指定するとラウンド間の途切れを繋げるようになる",
    )
    p_cal.set_defaults(func=cmd_calibrate)

    p_det = sub.add_parser("detect", help="試合区間を検出して segments.json を作る")
    add_source(p_det)
    p_det.add_argument("--profile", default=str(DEFAULT_PROFILE))
    p_det.add_argument("--force", action="store_true", help="スコアのキャッシュを使わず解析し直す")
    p_det.set_defaults(func=cmd_detect)

    p_list = sub.add_parser("list", help="segments.json を表示する")
    p_list.add_argument("--manifest", required=True)
    p_list.set_defaults(func=cmd_list)

    p_rep = sub.add_parser("report", help="検出結果と出力MP4を数値で点検する")
    p_rep.add_argument("--manifest", required=True)
    p_rep.add_argument("--truth", help="正解ファイル（YAML）。指定すると精度を数値化する")
    p_rep.add_argument("--out-dir", help="指定すると書き出したMP4も点検する")
    p_rep.add_argument("--event", help="出力フォルダ名（render と同じもの）")
    p_rep.add_argument("--min-overlap", type=float, default=0.3, help="対応とみなす重なりの割合")
    p_rep.add_argument("--quick", action="store_true", help="全編デコード検査を省く")
    p_rep.set_defaults(func=cmd_report)

    p_card = sub.add_parser("card", help="対戦表から選手名を入れる")
    p_card.add_argument("--manifest", required=True)
    p_card.add_argument("--card", required=True, help="対戦表 YAML（matches: に上から順に書く）")
    p_card.add_argument("--overwrite", action="store_true", help="既に入っている名前も上書きする")
    p_card.set_defaults(func=cmd_card)

    p_ref = sub.add_parser("refine", help="ゴングで開始・終了を数秒だけ寄せる")
    p_ref.add_argument("--manifest", required=True)
    p_ref.add_argument("--video", help="元動画（既定は manifest に記録されたパス）")
    p_ref.add_argument("--window", type=float, default=6.0, help="前後何秒まで探すか（既定6秒）")
    p_ref.add_argument(
        "--start-only",
        action="store_true",
        help="開始だけ調整する（終了のゴングは見ない）",
    )
    p_ref.set_defaults(func=cmd_refine)

    p_vert = sub.add_parser("vertical", help="書き出したMP4を9:16にする（再エンコード）")
    p_vert.add_argument("--in-dir", required=True, help="横型MP4の入っているフォルダ")
    p_vert.add_argument("--out-dir", help="出力先（既定 <in-dir>/vertical）")
    p_vert.add_argument("--fill", choices=list(vertical_step.FILLS), default="blur")
    p_vert.add_argument("--width", type=int, default=vertical_step.TARGET_WIDTH)
    p_vert.add_argument("--height", type=int, default=vertical_step.TARGET_HEIGHT)
    p_vert.add_argument("--crf", type=int, default=20, help="小さいほど高画質・大きいファイル")
    p_vert.add_argument("--overwrite", action="store_true")
    p_vert.set_defaults(func=cmd_vertical)

    p_hl = sub.add_parser("highlights", help="SNS向けの見どころ候補を選ぶ")
    p_hl.add_argument("--manifest", required=True)
    p_hl.add_argument("--video", help="元動画（既定は manifest に記録されたパス）")
    p_hl.add_argument("--match", type=int, help="この番号の試合だけ解析する")
    p_hl.add_argument("--top", type=int, default=3, help="1試合あたりの本数（既定3）")
    p_hl.add_argument("--min-sec", type=float, default=15.0, dest="min_sec")
    p_hl.add_argument("--max-sec", type=float, default=60.0, dest="max_sec")
    p_hl.add_argument("--step", type=float, default=1.0, help="何秒ごとに測るか（既定1秒）")
    p_hl.add_argument("--out", help="出力先（既定 work/<id>/highlights.json）")
    p_hl.set_defaults(func=cmd_highlights)

    p_rh = sub.add_parser("render-highlights", help="highlights.json どおりに短い動画を書き出す")
    p_rh.add_argument("--highlights", required=True)
    p_rh.add_argument("--video", help="元動画（既定は highlights.json に記録されたパス）")
    p_rh.add_argument("--event", help="出力フォルダ名（例 第13回大会）")
    p_rh.add_argument("--out-dir", default=str(DEFAULT_OUT_ROOT))
    p_rh.add_argument("--overwrite", action="store_true")
    p_rh.add_argument("--prune", action="store_true", help="今回作らなかった古いMP4を削除する")
    p_rh.set_defaults(func=cmd_render_highlights)

    p_cap = sub.add_parser("captions", help="投稿文の下書きを作る（送信はしない）")
    p_cap.add_argument("--manifest", required=True)
    p_cap.add_argument("--event", help="大会名（例 第13回大会）")
    p_cap.add_argument("--out-dir", default=str(DEFAULT_OUT_ROOT))
    p_cap.add_argument("--hashtags", help="カンマ区切り（既定 UIZIN,格闘技,アマチュア格闘技）")
    p_cap.set_defaults(func=cmd_captions)

    p_ren = sub.add_parser("render", help="segments.json どおりにMP4を書き出す")
    p_ren.add_argument("--manifest", required=True)
    p_ren.add_argument("--video", help="元動画（既定は manifest に記録されたパス）")
    p_ren.add_argument("--event", help="出力フォルダ名（例 第13回大会）")
    p_ren.add_argument("--out-dir", default=str(DEFAULT_OUT_ROOT))
    p_ren.add_argument("--overwrite", action="store_true")
    p_ren.add_argument("--prune", action="store_true", help="今回作らなかった古いMP4を削除する")
    p_ren.set_defaults(func=cmd_render)

    p_run = sub.add_parser("run", help="取得→検出→書き出しを一気に実行する")
    p_run.add_argument("url")
    p_run.add_argument("--profile", default=str(DEFAULT_PROFILE))
    p_run.add_argument("--event", help="出力フォルダ名（例 第14回大会）")
    p_run.add_argument("--out-dir", default=str(DEFAULT_OUT_ROOT))
    p_run.add_argument("--force", action="store_true", help="解析キャッシュを使わず検出し直す")
    p_run.add_argument("--force-download", action="store_true", help="動画を取り直す")
    add_download_options(p_run)
    p_run.add_argument("--overwrite", action="store_true", help="既にあるMP4も書き直す")
    p_run.add_argument("--prune", action="store_true", help="今回作らなかった古いMP4を削除する")
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
