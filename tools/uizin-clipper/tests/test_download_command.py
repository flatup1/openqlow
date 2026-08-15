"""yt-dlp に渡すコマンドの組み立てを見張る。外部ツール不要。

★実機で YouTube に断られた（2026-08）。

    WARNING: YouTube is forcing SABR streaming for this client
    ERROR: [youtube] P8CCcO_wWq0: The page needs to be reloaded.

動画が消えたわけではなく、**YouTube が自動取得を止めるしくみを変えた**だけです。
この種の締め付けは今後も変わります。だから回避方法をコードに埋め込まず、
**その場で追加指定を渡せる口**を用意しました。ここではその口が塞がらないよう固定します。
"""

from __future__ import annotations

import unittest
from pathlib import Path

from uizin_clipper.steps.download import BLOCKED_HINT, build_command, extract_video_id

WORK = Path("/tmp/work/XXXX")
URL = "https://www.youtube.com/live/P8CCcO_wWq0"


class BuildCommandTest(unittest.TestCase):
    def test_plain_command_has_no_extra_options(self) -> None:
        command = build_command(URL, WORK)

        self.assertEqual(command[0], "yt-dlp")
        self.assertEqual(command[-1], URL)
        self.assertNotIn("--cookies-from-browser", command)

    def test_output_and_url_stay_at_the_end(self) -> None:
        """★-o と URL は最後。途中に追加指定が割り込むと yt-dlp が読み違える。"""
        command = build_command(
            URL, WORK, cookies_from_browser="chrome", extra_args=["--extractor-args", "x=y"]
        )

        self.assertEqual(command[-3], "-o")
        self.assertEqual(command[-1], URL)

    def test_cookies_option_is_passed(self) -> None:
        command = build_command(URL, WORK, cookies_from_browser="safari")

        position = command.index("--cookies-from-browser")
        self.assertEqual(command[position + 1], "safari")

    def test_extra_args_are_passed_in_order(self) -> None:
        command = build_command(
            URL, WORK, extra_args=["--extractor-args", "youtube:player_client=ios"]
        )

        position = command.index("--extractor-args")
        self.assertEqual(command[position + 1], "youtube:player_client=ios")

    def test_no_extra_args_is_the_same_as_empty(self) -> None:
        self.assertEqual(build_command(URL, WORK), build_command(URL, WORK, extra_args=[]))

    def test_lossless_settings_are_kept(self) -> None:
        """★再エンコードしない設定を落とさない。画質が落ちたら切り抜きの価値が下がる。"""
        command = build_command(URL, WORK)

        self.assertIn("--merge-output-format", command)
        self.assertIn("--write-info-json", command)
        self.assertIn("--no-playlist", command)

    def test_output_path_goes_into_the_work_folder(self) -> None:
        command = build_command(URL, WORK)

        self.assertEqual(command[command.index("-o") + 1], str(WORK / "source.%(ext)s"))


class BlockedHintTest(unittest.TestCase):
    def test_hint_tells_the_user_what_to_do(self) -> None:
        """★エラー文だけでは次の一手が分からない。手順を出す。"""
        for expected in ("pip install -U", "--cookies-from-browser", "--video"):
            self.assertIn(expected, BLOCKED_HINT)


class ExtractVideoIdTest(unittest.TestCase):
    def test_live_url(self) -> None:
        self.assertEqual(extract_video_id(URL), "P8CCcO_wWq0")

    def test_watch_url(self) -> None:
        self.assertEqual(
            extract_video_id("https://www.youtube.com/watch?v=P8CCcO_wWq0"), "P8CCcO_wWq0"
        )


if __name__ == "__main__":
    unittest.main()
