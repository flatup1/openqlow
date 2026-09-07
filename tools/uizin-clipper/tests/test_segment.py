"""区間検出（状態機械）のテスト。外部ツール不要で走る。"""

from __future__ import annotations

import unittest

from uizin_clipper.steps.segment import SegmentParams, detect_segments


def scores_from(pattern: list[tuple[float, int]]) -> list[float]:
    """(値, 秒数) の並びからスコア列を作る。"""
    out: list[float] = []
    for value, count in pattern:
        out.extend([value] * count)
    return out


class DetectSegmentsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.params = SegmentParams(
            fps=1.0,
            enter_threshold=0.6,
            exit_threshold=0.4,
            min_duration_sec=45,
            max_gap_sec=20,
            pre_roll_sec=6,
            post_roll_sec=8,
        )

    def test_empty_scores(self) -> None:
        self.assertEqual(detect_segments([], self.params), [])

    def test_all_low_scores_means_no_match(self) -> None:
        self.assertEqual(detect_segments([0.1] * 600, self.params), [])

    def test_single_match_gets_pre_and_post_roll(self) -> None:
        scores = scores_from([(0.05, 100), (0.9, 300), (0.05, 100)])
        segments = detect_segments(scores, self.params, duration_sec=500)

        self.assertEqual(len(segments), 1)
        segment = segments[0]
        self.assertEqual(segment.index, 1)
        self.assertEqual(segment.core_start_sec, 100)
        self.assertEqual(segment.core_end_sec, 400)
        self.assertEqual(segment.start_sec, 94)  # 100 - pre_roll 6
        self.assertEqual(segment.end_sec, 408)  # 400 + post_roll 8
        self.assertAlmostEqual(segment.confidence, 0.9, places=3)

    def test_short_blip_is_discarded(self) -> None:
        """リプレイ等の10秒だけのテロップ再表示は試合として拾わない。"""
        scores = scores_from([(0.05, 60), (0.95, 10), (0.05, 60)])
        self.assertEqual(detect_segments(scores, self.params), [])

    def test_brief_dropout_is_bridged_into_one_match(self) -> None:
        """試合中に一瞬テロップが消えても1試合にまとめる。"""
        scores = scores_from([(0.05, 30), (0.9, 100), (0.1, 10), (0.9, 100), (0.05, 30)])
        segments = detect_segments(scores, self.params, duration_sec=270)

        self.assertEqual(len(segments), 1)
        self.assertEqual(segments[0].core_start_sec, 30)
        self.assertEqual(segments[0].core_end_sec, 240)

    def test_long_dropout_splits_into_two_matches(self) -> None:
        """休憩（20秒超の途切れ）はきちんと別試合に分ける。"""
        scores = scores_from([(0.9, 100), (0.05, 120), (0.9, 100)])
        segments = detect_segments(scores, self.params, duration_sec=320)

        self.assertEqual(len(segments), 2)
        self.assertEqual([s.index for s in segments], [1, 2])
        self.assertEqual(segments[0].core_end_sec, 100)
        self.assertEqual(segments[1].core_start_sec, 220)

    def test_hysteresis_keeps_state_in_the_middle_band(self) -> None:
        """入口0.6と出口0.4の間の値では状態が変わらない（チラつき防止）。"""
        scores = scores_from([(0.9, 60), (0.5, 60), (0.9, 60)])
        segments = detect_segments(scores, self.params, duration_sec=180)

        self.assertEqual(len(segments), 1)
        self.assertEqual(segments[0].core_end_sec, 180)

    def test_pre_roll_never_goes_negative(self) -> None:
        scores = scores_from([(0.9, 100)])
        segments = detect_segments(scores, self.params, duration_sec=100)
        self.assertEqual(segments[0].start_sec, 0.0)

    def test_post_roll_is_clamped_to_video_duration(self) -> None:
        scores = scores_from([(0.9, 100)])
        segments = detect_segments(scores, self.params, duration_sec=100)
        self.assertEqual(segments[0].end_sec, 100)

    def test_overlapping_rolls_are_split_at_midpoint(self) -> None:
        """のりしろで前後の試合が重なったら中間点で分ける（同じ映像を二重に入れない）。"""
        params = SegmentParams(
            fps=1.0,
            enter_threshold=0.6,
            exit_threshold=0.4,
            min_duration_sec=45,
            max_gap_sec=5,
            pre_roll_sec=20,
            post_roll_sec=20,
        )
        scores = scores_from([(0.9, 60), (0.05, 10), (0.9, 60)])
        segments = detect_segments(scores, params, duration_sec=130)

        self.assertEqual(len(segments), 2)
        self.assertLessEqual(segments[0].end_sec, segments[1].start_sec)
        self.assertEqual(segments[0].end_sec, 65.0)  # (60 + 70) / 2

    def test_half_fps_doubles_the_time_per_sample(self) -> None:
        params = SegmentParams(fps=0.5, enter_threshold=0.6, exit_threshold=0.4,
                               min_duration_sec=45, max_gap_sec=20,
                               pre_roll_sec=0, post_roll_sec=0)
        scores = scores_from([(0.9, 50)])
        segments = detect_segments(scores, params, duration_sec=200)
        self.assertEqual(segments[0].core_end_sec, 100)

    def test_flags_are_set_for_long_and_low_confidence(self) -> None:
        params = SegmentParams(
            fps=1.0, enter_threshold=0.6, exit_threshold=0.4,
            min_duration_sec=45, max_gap_sec=20,
            pre_roll_sec=0, post_roll_sec=0, long_segment_sec=100,
        )
        scores = scores_from([(0.65, 50), (0.5, 100)])
        segments = detect_segments(scores, params, duration_sec=150)

        self.assertEqual(len(segments), 1)
        self.assertIn("too_long", segments[0].flags)
        self.assertIn("low_confidence", segments[0].flags)

    def test_invalid_thresholds_are_rejected(self) -> None:
        with self.assertRaises(ValueError):
            SegmentParams(enter_threshold=0.3, exit_threshold=0.8).validate()
        with self.assertRaises(ValueError):
            SegmentParams(fps=0).validate()


if __name__ == "__main__":
    unittest.main()
