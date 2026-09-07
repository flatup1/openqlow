"""CLI の通し実行で見つかった不具合の回帰テスト（外部ツール不要）。

`tests/test_report.py` は「キーフレームがある場合」を押さえている。
ここではそれ以外の2つ、
  - 元動画が手元にない場合のフォールバック
  - run --force-download の二重ダウンロード
を固定する。どちらも実配信を1回通すときにだけ表面化する。
"""

from __future__ import annotations

import argparse
import contextlib
import io
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

from uizin_clipper import cli
from uizin_clipper import manifest as mf
from uizin_clipper.steps.inspect_output import OutputCheck


class ReportWithoutSourceTest(unittest.TestCase):
    """元動画が手元にないときは、区間の秒数をそのまま想定尺として使う。

    キーフレームが分からない以上、吸着ぶんは足しようがない。
    ここで落ちると「動画を消したあとに report が動かない」ことになる。
    """

    def test_falls_back_to_segment_duration(self) -> None:
        seen: list[float] = []

        def fake_inspect(path, expected_sec, *, deep=True):
            seen.append(expected_sec)
            return OutputCheck(
                name=Path(path).name,
                exists=True,
                video_codec="h264",
                audio_codec="aac",
                duration_sec=expected_sec,
                expected_sec=expected_sec,
            )

        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest_path = root / "segments.json"
            mf.save_manifest(
                manifest_path,
                mf.build_manifest(
                    source={
                        # すでに削除された元動画を指している状態
                        "video_id": "abc123",
                        "path": str(root / "source.mp4"),
                        "duration_sec": 200.0,
                    },
                    profile={"name": "uizin"},
                    segments=[
                        {
                            "index": 1,
                            "start": "00:01:44.000",
                            "end": "00:02:30.000",
                            "start_sec": 104.0,
                            "end_sec": 150.0,
                            "duration_sec": 46.0,
                            "core_start_sec": 104.0,
                            "core_end_sec": 150.0,
                            "confidence": 1.0,
                            "flags": [],
                            "skip": False,
                            "locked": False,
                        }
                    ],
                ),
            )
            out_root = root / "out"
            (out_root / "event").mkdir(parents=True)
            (out_root / "event" / "01.mp4").touch()

            args = argparse.Namespace(
                manifest=str(manifest_path),
                truth=None,
                min_overlap=0.3,
                out_dir=str(out_root),
                event="event",
                quick=True,
            )
            with mock.patch.object(cli.inspect_output, "inspect", fake_inspect):
                with contextlib.redirect_stdout(io.StringIO()):
                    code = cli.cmd_report(args)

        self.assertEqual(code, 0)
        self.assertEqual(seen, [46.0])  # 元動画を見に行かないので1回だけ


class RunForceDownloadTest(unittest.TestCase):
    """run --force-download で4時間・数GBの動画を二度落とさない。

    run はダウンロード後に detect を呼ぶが、detect も内部で resolve_source を
    通り、そこでも download を呼ぶ。force を渡したままだと2回取得してしまう。
    """

    def test_detect_does_not_force_download_again(self) -> None:
        forces: list[bool] = []

        # このテストが見たいのは force が二重に渡らないことだけ。
        # download 側に無関係な引数（cookies_from_browser 等）が増えても
        # 壊れないよう、残りは **kwargs で受け流す。
        def fake_download(url, work_dir, *, force=False, **_kwargs):
            forces.append(force)
            target = Path(work_dir)
            target.mkdir(parents=True, exist_ok=True)
            video = target / "source.mp4"
            video.write_bytes(b"dummy")
            return video

        def fake_detect(args) -> int:
            cli.resolve_source(args, Path(args.work_dir))
            return 0

        with TemporaryDirectory() as tmp:
            with mock.patch.object(cli.dl, "download", fake_download), mock.patch.object(
                cli, "cmd_detect", fake_detect
            ):
                with contextlib.redirect_stdout(io.StringIO()):
                    code = cli.main(
                        [
                            "--work-dir",
                            tmp,
                            "run",
                            "https://www.youtube.com/live/P8CCcO_wWq0",
                            "--force-download",
                            "--stop-after",
                            "detect",
                        ]
                    )

        self.assertEqual(code, 0)
        self.assertEqual(forces, [True, False])


if __name__ == "__main__":
    unittest.main()
