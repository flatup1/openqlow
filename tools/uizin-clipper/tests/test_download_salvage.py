"""合体が抜けたときの後始末を見張る。外部ツール不要。

★実機で「成功したように見えて、実は失敗していた」事故が起きた（2026-08）。

    [download] 完了: .../work/P8CCcO_wWq0/source.f140.m4a

隣に 8.3GB の `source.f299.mp4`（映像）があるのに、**248MB の音声だけのファイル**を
「完了」として返していた。原因は、合体（映像＋音声を1つのmp4にする工程）が抜けたときの
受け皿が `sorted(...)[0]`、つまり**名前順の1つ目**を黙って返す作りだったこと。
`source.f140.m4a` は `source.f299.mp4` より名前が前なので、音声が選ばれた。

**映像が無いものを成功にしてはいけない。** このシステムは映像を見て試合を判定するので、
音声だけでは何もできず、しかも利用者は成功したと思い込んで先へ進んでしまう。
"""

from __future__ import annotations

import unittest

from uizin_clipper.steps.download import FORMAT_SELECTOR, classify_leftovers


class ClassifyLeftoversTest(unittest.TestCase):
    def test_the_real_case_is_split_correctly(self) -> None:
        """★実機で残っていた組み合わせ。音声が名前順で先に来る。"""
        video, audio = classify_leftovers(
            ["source.f140.m4a", "source.f299.mp4", "source.info.json"]
        )

        self.assertEqual(video, ["source.f299.mp4"])
        self.assertEqual(audio, ["source.f140.m4a"])

    def test_audio_is_never_mistaken_for_video(self) -> None:
        for name in ("source.m4a", "source.opus", "source.aac", "source.mp3"):
            video, audio = classify_leftovers([name])
            self.assertEqual(video, [], f"{name} を映像と誤認しています")
            self.assertEqual(audio, [name])

    def test_side_files_are_ignored(self) -> None:
        video, audio = classify_leftovers(
            ["source.info.json", "source.mp4.part", "source.tmp", "source.mp4"]
        )

        self.assertEqual(video, ["source.mp4"])
        self.assertEqual(audio, [])

    def test_nothing_downloaded(self) -> None:
        self.assertEqual(classify_leftovers([]), ([], []))

    def test_only_audio_is_reported_as_audio(self) -> None:
        """音声しか無いと分かれば、上位で失敗として止められる。"""
        video, audio = classify_leftovers(["source.f140.m4a"])

        self.assertEqual(video, [])
        self.assertEqual(audio, ["source.f140.m4a"])


class FormatSelectorTest(unittest.TestCase):
    def test_last_resort_still_requires_video(self) -> None:
        """★受け皿が音声だけを拾わないようにする。

        `b`（best）は映像が無ければ音声を選ぶ。最後の受け皿にこそ条件が要る。
        """
        fallbacks = FORMAT_SELECTOR.split("/")
        self.assertIn("vcodec!=none", fallbacks[-1])

    def test_the_best_choice_is_still_video_plus_audio(self) -> None:
        self.assertTrue(FORMAT_SELECTOR.startswith("bv*"))


if __name__ == "__main__":
    unittest.main()
