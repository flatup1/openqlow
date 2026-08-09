"""ラウンド結合と精度評価のテスト。外部ツール不要。"""

from __future__ import annotations

import unittest
from pathlib import Path

from uizin_clipper.evaluate import Interval, evaluate, overlap_fraction
from uizin_clipper.steps.segment import Segment, SegmentParams, merge_rounds


def seg(index: int, start: float, end: float, confidence: float = 0.9) -> Segment:
    return Segment(
        index=index,
        start_sec=start,
        end_sec=end,
        core_start_sec=start,
        core_end_sec=end,
        confidence=confidence,
    )


ALWAYS = lambda prev, cur: True  # noqa: E731
NEVER = lambda prev, cur: False  # noqa: E731


class MergeRoundsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.params = SegmentParams(round_gap_sec=180.0, long_segment_sec=1200.0)

    def test_same_match_rounds_are_merged(self) -> None:
        """テロップが同じなら、25秒空いていても1試合にまとめる。"""
        merged = merge_rounds([seg(1, 60, 110), seg(2, 135, 190)], self.params, ALWAYS)

        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0].start_sec, 60)
        self.assertEqual(merged[0].end_sec, 190)
        self.assertIn("merged_rounds", merged[0].flags)

    def test_different_match_is_not_merged(self) -> None:
        """テロップが違えば、途切れが短くても繋がない。"""
        merged = merge_rounds([seg(1, 60, 110), seg(2, 120, 190)], self.params, NEVER)

        self.assertEqual(len(merged), 2)
        self.assertEqual([s.index for s in merged], [1, 2])

    def test_gap_beyond_round_limit_is_never_merged(self) -> None:
        """判定関数が True でも、上限を超える途切れは繋がない（安全側）。"""
        params = SegmentParams(round_gap_sec=60.0)
        merged = merge_rounds([seg(1, 60, 110), seg(2, 300, 400)], params, ALWAYS)
        self.assertEqual(len(merged), 2)

    def test_three_rounds_merge_into_one(self) -> None:
        merged = merge_rounds(
            [seg(1, 0, 60), seg(2, 90, 150), seg(3, 180, 240)], self.params, ALWAYS
        )
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0].end_sec, 240)

    def test_confidence_is_weighted_by_length(self) -> None:
        merged = merge_rounds(
            [seg(1, 0, 100, confidence=0.9), seg(2, 110, 210, confidence=0.7)],
            self.params,
            ALWAYS,
        )
        self.assertAlmostEqual(merged[0].confidence, 0.8, places=3)

    def test_too_long_flag_is_recomputed_after_merge(self) -> None:
        params = SegmentParams(round_gap_sec=180.0, long_segment_sec=150.0)
        merged = merge_rounds([seg(1, 0, 100), seg(2, 110, 200)], params, ALWAYS)
        self.assertIn("too_long", merged[0].flags)

    def test_single_and_empty_input(self) -> None:
        self.assertEqual(merge_rounds([], self.params, ALWAYS), [])
        self.assertEqual(len(merge_rounds([seg(1, 0, 60)], self.params, ALWAYS)), 1)

    def test_decider_receives_neighbouring_segments(self) -> None:
        seen: list[tuple[float, float]] = []

        def decide(prev, cur):
            seen.append((prev.core_end_sec, cur.core_start_sec))
            return False

        merge_rounds([seg(1, 0, 60), seg(2, 80, 140)], self.params, decide)
        self.assertEqual(seen, [(60, 80)])


class DefaultsTest(unittest.TestCase):
    """4時間・12試合の実測で決めた既定値。理由なく変えると結合・分割が再発する。"""

    def test_round_gap_default_is_between_round_break_and_match_break(self) -> None:
        """ラウンド間(約60秒)より大きく、試合間の休憩(2分以上)より小さいこと。

        180秒にすると 4組の試合が1本に結合した（実測）。
        """
        gap = SegmentParams().round_gap_sec
        self.assertGreater(gap, 70, "ラウンド間(約60秒)を繋げる大きさが必要")
        self.assertLess(gap, 120, "試合間の休憩(2分以上)まで繋いではいけない")

    def test_same_match_threshold_default_is_not_too_strict(self) -> None:
        """0.85 だと同じ試合を2件割った（実測）。0.70〜0.80 が全問正解。"""
        from uizin_clipper.profile import Profile  # noqa: PLC0415

        threshold = Profile(path=Path("p.yml")).same_match_threshold
        self.assertGreaterEqual(threshold, 0.70)
        self.assertLessEqual(threshold, 0.80)


class OverlapTest(unittest.TestCase):
    def test_fraction_uses_the_shorter_interval(self) -> None:
        long_one = Interval(0, 100)
        short_one = Interval(40, 60)
        self.assertAlmostEqual(overlap_fraction(long_one, short_one), 1.0)

    def test_no_overlap(self) -> None:
        self.assertEqual(overlap_fraction(Interval(0, 10), Interval(20, 30)), 0.0)


class EvaluateTest(unittest.TestCase):
    def test_perfect_match(self) -> None:
        truth = [Interval(0, 100), Interval(200, 300)]
        detected = [Interval(0, 100), Interval(200, 300)]

        result = evaluate(truth, detected)

        self.assertEqual(result.correct, 2)
        self.assertEqual(result.missed, [])
        self.assertEqual(result.spurious, [])

    def test_missed_match(self) -> None:
        result = evaluate([Interval(0, 100), Interval(200, 300)], [Interval(0, 100)])
        self.assertEqual(result.missed, [2])
        self.assertEqual(result.correct, 1)

    def test_spurious_detection(self) -> None:
        result = evaluate([Interval(0, 100)], [Interval(0, 100), Interval(500, 600)])
        self.assertEqual(result.spurious, [2])

    def test_split_is_reported(self) -> None:
        """1試合が2本に割れた場合。"""
        result = evaluate([Interval(0, 200)], [Interval(0, 90), Interval(110, 200)])

        self.assertEqual(len(result.split), 1)
        self.assertEqual(result.split[0][0], 1)
        self.assertEqual(result.split[0][1], [1, 2])
        self.assertEqual(result.correct, 0)

    def test_fusion_is_reported(self) -> None:
        """2試合が1本に繋がった場合。"""
        result = evaluate([Interval(0, 100), Interval(200, 300)], [Interval(0, 300)])

        self.assertEqual(len(result.fused), 1)
        self.assertEqual(result.fused[0][1], [1, 2])
        self.assertEqual(result.correct, 0)

    def test_boundary_errors_are_measured(self) -> None:
        result = evaluate([Interval(100, 200)], [Interval(94, 208)])
        self.assertEqual(result.start_errors_sec, [-6.0])
        self.assertEqual(result.end_errors_sec, [8.0])

    def test_boundary_errors_skip_split_and_fusion(self) -> None:
        result = evaluate([Interval(0, 200)], [Interval(0, 90), Interval(110, 200)])
        self.assertEqual(result.start_errors_sec, [])

    def test_summary_counts(self) -> None:
        truth = [Interval(0, 100), Interval(200, 300), Interval(400, 500)]
        detected = [Interval(0, 100), Interval(900, 1000)]

        summary = evaluate(truth, detected).summary(len(truth), len(detected))

        self.assertEqual(summary["正解の試合数"], 3)
        self.assertEqual(summary["検出した試合数"], 2)
        self.assertEqual(summary["正しく検出"], 1)
        self.assertEqual(summary["見逃し"], 2)
        self.assertEqual(summary["余計な検出"], 1)


if __name__ == "__main__":
    unittest.main()
