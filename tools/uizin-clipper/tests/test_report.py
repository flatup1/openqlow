"""report コマンドの出力動画点検テスト。"""

from __future__ import annotations

import argparse
import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from uizin_clipper import manifest as mf
from uizin_clipper.cli import cmd_report
from uizin_clipper.steps.inspect_output import OutputCheck


class ReportOutputDurationTest(unittest.TestCase):
    def test_keyframe_lead_in_is_included_in_expected_duration(self) -> None:
        """無劣化カットの正常な前のりしろを尺ずれNGにしない。"""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source.mp4"
            source.touch()
            manifest_path = root / "segments.json"
            mf.save_manifest(
                manifest_path,
                mf.build_manifest(
                    source={"video_id": "abc", "path": str(source), "duration_sec": 200.0},
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
            (root / "probe.json").write_text(
                json.dumps({"keyframes": [0.0, 100.0, 105.0]}), encoding="utf-8"
            )

            out_root = root / "out"
            (out_root / "event").mkdir(parents=True)
            (out_root / "event" / "01.mp4").touch()

            def fake_inspect(path: Path, expected_sec: float, *, deep: bool = True) -> OutputCheck:
                if path == source:
                    return OutputCheck(name=path.name, exists=True, video_codec="h264")
                return OutputCheck(
                    name=path.name,
                    exists=True,
                    video_codec="h264",
                    audio_codec="aac",
                    duration_sec=50.0,
                    expected_sec=expected_sec,
                )

            args = argparse.Namespace(
                manifest=str(manifest_path),
                truth=None,
                min_overlap=0.3,
                out_dir=str(out_root),
                event="event",
                quick=True,
            )
            stdout = io.StringIO()
            with patch("uizin_clipper.cli.inspect_output.inspect", side_effect=fake_inspect):
                with contextlib.redirect_stdout(stdout):
                    cmd_report(args)

        self.assertIn("尺 50.0s（想定 50.0s, 差 +0.0s）", stdout.getvalue())
        self.assertIn("問題のあったファイル: 0 / 1", stdout.getvalue())


if __name__ == "__main__":
    unittest.main()
