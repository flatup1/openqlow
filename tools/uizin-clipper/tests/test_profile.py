"""プロファイル（大会シリーズ設定）のテスト。"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from uizin_clipper.profile import Profile, load_profile, profile_from_dict, save_profile
from uizin_clipper.steps.download import extract_video_id


class ScaledRoiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.profile = Profile(
            path=Path("profiles/uizin.yml"),
            roi=(1180, 55, 620, 130),
            source_size=(1920, 1080),
            templates=["t.png"],
        )

    def test_same_resolution_returns_roi_as_is(self) -> None:
        self.assertEqual(self.profile.scaled_roi(1920, 1080), (1180, 55, 620, 130))

    def test_720p_is_scaled_down(self) -> None:
        """1080pで合わせたROIを720pの動画でもそのまま使える。"""
        self.assertEqual(self.profile.scaled_roi(1280, 720), (787, 37, 413, 87))

    def test_roi_never_exceeds_frame(self) -> None:
        profile = Profile(
            path=Path("p.yml"), roi=(1800, 1000, 500, 200), source_size=(1920, 1080),
            templates=["t.png"],
        )
        x, y, w, h = profile.scaled_roi(1920, 1080)
        self.assertLessEqual(x + w, 1920)
        self.assertLessEqual(y + h, 1080)


class ValidationTest(unittest.TestCase):
    def test_uncalibrated_profile_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            Profile(path=Path("p.yml")).validate()

    def test_profile_without_template_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            Profile(path=Path("p.yml"), roi=(0, 0, 100, 50)).validate()

    def test_calibrated_profile_passes(self) -> None:
        Profile(path=Path("p.yml"), roi=(0, 0, 100, 50), templates=["a.png"]).validate()


class RoundTripTest(unittest.TestCase):
    def test_yaml_round_trip(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "uizin.yml"
            original = Profile(
                path=path,
                name="uizin",
                roi=(10, 20, 300, 60),
                source_size=(1920, 1080),
                template_size=(160, 32),
                templates=["uizin.template01.png"],
                fps=1.0,
            )
            save_profile(original)
            loaded = load_profile(path)

        self.assertEqual(loaded.roi, (10, 20, 300, 60))
        self.assertEqual(loaded.templates, ["uizin.template01.png"])
        self.assertEqual(loaded.segment.enter_threshold, original.segment.enter_threshold)

    def test_segment_thresholds_come_from_the_file(self) -> None:
        profile = profile_from_dict(
            {
                "roi": [0, 0, 10, 10],
                "templates": ["a.png"],
                "fps": 0.5,
                "segment": {"enter_threshold": 0.8, "exit_threshold": 0.5},
            },
            Path("p.yml"),
        )
        self.assertEqual(profile.segment.enter_threshold, 0.8)
        self.assertEqual(profile.segment.fps, 0.5)

    def test_missing_profile_gives_a_helpful_error(self) -> None:
        with self.assertRaises(FileNotFoundError):
            load_profile("/nonexistent/uizin.yml")

    def test_template_paths_are_relative_to_the_profile(self) -> None:
        profile = Profile(path=Path("/a/b/uizin.yml"), templates=["t.png"])
        self.assertEqual(profile.template_paths[0], Path("/a/b/t.png"))


class VideoIdTest(unittest.TestCase):
    def test_live_url(self) -> None:
        self.assertEqual(
            extract_video_id("https://www.youtube.com/live/P8CCcO_wWq0"), "P8CCcO_wWq0"
        )

    def test_watch_url(self) -> None:
        self.assertEqual(
            extract_video_id("https://www.youtube.com/watch?v=P8CCcO_wWq0&t=10"),
            "P8CCcO_wWq0",
        )

    def test_short_url(self) -> None:
        self.assertEqual(extract_video_id("https://youtu.be/P8CCcO_wWq0"), "P8CCcO_wWq0")

    def test_ascii_filename_is_used_as_is(self) -> None:
        self.assertEqual(extract_video_id("/videos/uizin13.mp4"), "uizin13")

    def test_replaced_filename_gets_a_stable_hash_suffix(self) -> None:
        """日本語名などは置換で潰れるため、区別できるようハッシュを付ける。"""
        first = extract_video_id("/videos/第13回大会.mp4")

        self.assertEqual(first, extract_video_id("/videos/第13回大会.mp4"))
        self.assertNotEqual(first, extract_video_id("/videos/第14回大会.mp4"))
        self.assertRegex(first, r"^[A-Za-z0-9_-]+$")


if __name__ == "__main__":
    unittest.main()
