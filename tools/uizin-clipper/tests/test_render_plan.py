"""無劣化カットの切り出し計画・時刻変換・ffmpegフィルタ組み立てのテスト。"""

from __future__ import annotations

import unittest

from uizin_clipper.steps.calibrate import suggest_template_size
from uizin_clipper.steps.render import plan_cut
from uizin_clipper.steps.score import build_filter, crop_filter
from uizin_clipper.timecode import format_duration, format_timecode, parse_timecode


class PlanCutTest(unittest.TestCase):
    def setUp(self) -> None:
        # 2秒間隔のキーフレーム（YouTube配信でよくある間隔）
        self.keyframes = [float(i) for i in range(0, 400, 2)]

    def test_snaps_back_to_previous_keyframe(self) -> None:
        plan = plan_cut(101.0, 150.0, self.keyframes)
        self.assertEqual(plan.seek_sec, 100.0)
        self.assertEqual(plan.lead_in_sec, 1.0)
        self.assertEqual(plan.duration_sec, 50.0)
        self.assertEqual(plan.end_sec, 150.0)

    def test_exact_keyframe_has_no_lead_in(self) -> None:
        plan = plan_cut(100.0, 150.0, self.keyframes)
        self.assertEqual(plan.seek_sec, 100.0)
        self.assertEqual(plan.lead_in_sec, 0.0)

    def test_far_keyframe_is_not_used(self) -> None:
        """キーフレームが遠すぎるときは戻らない（別の場面が混ざるのを防ぐ）。"""
        plan = plan_cut(100.0, 150.0, [0.0, 50.0], max_lead_in_sec=12.0)
        self.assertEqual(plan.seek_sec, 100.0)
        self.assertEqual(plan.lead_in_sec, 0.0)

    def test_no_keyframes_falls_back_to_requested_start(self) -> None:
        plan = plan_cut(100.0, 150.0, [])
        self.assertEqual(plan.seek_sec, 100.0)

    def test_start_before_first_keyframe(self) -> None:
        plan = plan_cut(0.5, 30.0, [0.0, 2.0, 4.0])
        self.assertEqual(plan.seek_sec, 0.0)
        self.assertEqual(plan.duration_sec, 30.0)

    def test_negative_start_is_clamped(self) -> None:
        plan = plan_cut(-5.0, 30.0, [0.0, 2.0])
        self.assertEqual(plan.seek_sec, 0.0)

    def test_end_before_start_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            plan_cut(100.0, 100.0, self.keyframes)


class TimecodeTest(unittest.TestCase):
    def test_parse_full_timecode(self) -> None:
        self.assertEqual(parse_timecode("01:02:03"), 3723.0)

    def test_parse_minutes_seconds(self) -> None:
        self.assertEqual(parse_timecode("12:34"), 754.0)

    def test_parse_fraction(self) -> None:
        self.assertAlmostEqual(parse_timecode("00:00:01.5"), 1.5)

    def test_parse_plain_seconds(self) -> None:
        self.assertEqual(parse_timecode("754.5"), 754.5)
        self.assertEqual(parse_timecode(754.5), 754.5)

    def test_invalid_timecode(self) -> None:
        for bad in ("", "abc", "1:99:00", "00:00:99"):
            with self.assertRaises(ValueError):
                parse_timecode(bad)

    def test_format_timecode(self) -> None:
        self.assertEqual(format_timecode(3723.5), "01:02:03.500")
        self.assertEqual(format_timecode(3723.5, with_millis=False), "01:02:03")
        self.assertEqual(format_timecode(-5), "00:00:00.000")

    def test_round_trip(self) -> None:
        self.assertAlmostEqual(parse_timecode(format_timecode(4567.89)), 4567.89, places=2)

    def test_format_duration(self) -> None:
        self.assertEqual(format_duration(389), "6:29")
        self.assertEqual(format_duration(59.7), "1:00")
        self.assertEqual(format_duration(0), "0:00")


class FfmpegFilterTest(unittest.TestCase):
    def test_crop_filter(self) -> None:
        self.assertEqual(crop_filter((10, 20, 300, 40)), "crop=300:40:10:20")

    def test_crop_filter_rejects_bad_roi(self) -> None:
        with self.assertRaises(ValueError):
            crop_filter((10, 20, 0, 40))
        with self.assertRaises(ValueError):
            crop_filter((-1, 20, 30, 40))

    def test_build_filter_chain(self) -> None:
        self.assertEqual(
            build_filter((10, 20, 300, 40), (160, 20), 1.0),
            "fps=1.0,crop=300:40:10:20,scale=160:20,format=gray",
        )

    def test_build_filter_without_fps(self) -> None:
        self.assertEqual(
            build_filter((10, 20, 300, 40), (160, 20), None),
            "crop=300:40:10:20,scale=160:20,format=gray",
        )


class TemplateSizeTest(unittest.TestCase):
    def test_keeps_aspect_ratio_and_even_numbers(self) -> None:
        width, height = suggest_template_size((0, 0, 620, 130), target_width=160)
        self.assertEqual(width, 160)
        self.assertEqual(height, 34)  # 130 * 160 / 620 = 33.5 -> 34

    def test_small_roi_is_not_upscaled(self) -> None:
        width, _ = suggest_template_size((0, 0, 100, 40), target_width=160)
        self.assertEqual(width, 100)


if __name__ == "__main__":
    unittest.main()
