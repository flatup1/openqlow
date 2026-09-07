"""道具（ffmpeg / ffprobe / yt-dlp）の探し方を見張る。

★実機で繰り返し起きた（2026-08）。

    エラー: ffprobe が見つかりません。インストールしてください。

**入っていないのではなく、置き場所が知られていないだけ**だった。
`.zprofile` への登録は新しく開いたターミナルにしか効かないので、
セットアップ直後の同じターミナルでは見つからない。

この状態が一番たちが悪いのは、yt-dlp が映像と音声の合体を ffmpeg にやらせることで、
**合体だけが黙って抜ける**点。ダウンロードは成功したように見えるのに、
できあがるのは音声だけのファイル、という形で表面化した。

置き場所は決まっているので、そこも探せばこの手の事故は起きない。
"""

from __future__ import annotations

import os
import stat
import tempfile
import unittest
from pathlib import Path

from uizin_clipper.shellcmd import EXTRA_DIRS, ToolMissingError, find_tool, require_tool


class FindToolTest(unittest.TestCase):
    def setUp(self) -> None:
        self.saved_path = os.environ.get("PATH", "")
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.addCleanup(lambda: os.environ.__setitem__("PATH", self.saved_path))

    def _make_fake_tool(self, name: str) -> Path:
        path = Path(self.temp.name) / name
        path.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        path.chmod(path.stat().st_mode | stat.S_IXUSR)
        return path

    def test_found_when_the_place_is_known(self) -> None:
        tool = self._make_fake_tool("fake-tool")
        os.environ["PATH"] = self.temp.name

        self.assertEqual(find_tool("fake-tool"), str(tool))

    def test_found_even_when_the_place_is_not_known(self) -> None:
        """★これが本命。PATH に無くても、よくある置き場所から拾う。"""
        tool = self._make_fake_tool("fake-tool")
        os.environ["PATH"] = "/nonexistent"

        self.assertEqual(find_tool("fake-tool", extra_dirs=[self.temp.name]), str(tool))

    def test_missing_tool_is_still_missing(self) -> None:
        """★無い物を「有る」と言わない。探す先を増やしても、そこは変えない。"""
        os.environ["PATH"] = "/nonexistent"

        self.assertIsNone(find_tool("zzz-definitely-not-a-tool"))

    def test_a_folder_is_not_a_tool(self) -> None:
        (Path(self.temp.name) / "fake-tool").mkdir()
        os.environ["PATH"] = "/nonexistent"

        self.assertIsNone(find_tool("fake-tool", extra_dirs=[self.temp.name]))

    def test_a_file_without_permission_is_not_a_tool(self) -> None:
        path = Path(self.temp.name) / "fake-tool"
        path.write_text("#!/bin/sh\n", encoding="utf-8")
        path.chmod(0o644)
        os.environ["PATH"] = "/nonexistent"

        self.assertIsNone(find_tool("fake-tool", extra_dirs=[self.temp.name]))


class ExtraDirsTest(unittest.TestCase):
    def test_both_kinds_of_mac_are_covered(self) -> None:
        """Apple シリコンと Intel で Homebrew の置き場所が違う。両方見る。"""
        self.assertIn("/opt/homebrew/bin", EXTRA_DIRS)
        self.assertIn("/usr/local/bin", EXTRA_DIRS)


class ErrorMessageTest(unittest.TestCase):
    def test_the_message_covers_the_real_case(self) -> None:
        """★「入れてください」だけでは足りない。入れてあるのに出るのが実機の状況だった。"""
        saved = os.environ.get("PATH", "")
        os.environ["PATH"] = "/nonexistent"
        try:
            with self.assertRaises(ToolMissingError) as caught:
                require_tool("zzz-definitely-not-a-tool")
        finally:
            os.environ["PATH"] = saved

        message = str(caught.exception)
        self.assertIn("すでに入れてある", message)
        self.assertIn("brew shellenv", message)


if __name__ == "__main__":
    unittest.main()
