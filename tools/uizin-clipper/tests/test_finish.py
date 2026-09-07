"""対戦表・見どころ抽出・投稿文のテスト。外部ツール不要。"""

from __future__ import annotations

import unittest

from uizin_clipper.captions import CaptionContext, build_all, short_caption
from uizin_clipper.card import CardMismatch, apply_card, parse_card
from uizin_clipper.highlight import (
    HighlightParams,
    combine_scores,
    moving_average,
    pick_highlights,
    zscore,
)


def segment(index: int, start: float, end: float, **extra) -> dict:
    base = {
        "index": index,
        "start_sec": start,
        "end_sec": end,
        "duration_sec": end - start,
        "red": None,
        "blue": None,
        "result": None,
        "skip": False,
        "locked": False,
    }
    base.update(extra)
    return base


class ParseCardTest(unittest.TestCase):
    def test_dict_rows(self) -> None:
        card = parse_card({"matches": [{"red": "赤太郎", "blue": "青次郎", "result": "KO"}]})
        self.assertEqual(card, [{"red": "赤太郎", "blue": "青次郎", "result": "KO"}])

    def test_short_list_rows(self) -> None:
        card = parse_card([["赤太郎", "青次郎"]])
        self.assertEqual(card, [{"red": "赤太郎", "blue": "青次郎"}])

    def test_missing_name_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            parse_card([{"red": "赤太郎"}])

    def test_missing_matches_key(self) -> None:
        with self.assertRaises(ValueError):
            parse_card({"players": []})


class ApplyCardTest(unittest.TestCase):
    def test_names_are_filled_in_order(self) -> None:
        segments = [segment(1, 0, 100), segment(2, 200, 300)]
        card = parse_card([["赤太郎", "青次郎"], ["赤花子", "青梅子"]])

        written = apply_card(segments, card)

        self.assertEqual(written, 2)
        self.assertEqual(segments[0]["red"], "赤太郎")
        self.assertEqual(segments[1]["blue"], "青梅子")

    def test_count_mismatch_writes_nothing(self) -> None:
        """★ずれたまま入れると全部の名前が1つずつずれる。だから止める。"""
        segments = [segment(1, 0, 100), segment(2, 200, 300)]
        card = parse_card([["赤太郎", "青次郎"]])

        with self.assertRaises(CardMismatch):
            apply_card(segments, card)

        self.assertIsNone(segments[0]["red"])

    def test_skipped_segments_are_not_counted(self) -> None:
        segments = [segment(1, 0, 100), segment(2, 200, 300, skip=True)]
        card = parse_card([["赤太郎", "青次郎"]])

        self.assertEqual(apply_card(segments, card), 1)
        self.assertEqual(segments[0]["red"], "赤太郎")
        self.assertIsNone(segments[1]["red"])

    def test_existing_names_are_kept(self) -> None:
        segments = [segment(1, 0, 100, red="人間が直した名前")]
        card = parse_card([["赤太郎", "青次郎"]])

        apply_card(segments, card)

        self.assertEqual(segments[0]["red"], "人間が直した名前")
        self.assertEqual(segments[0]["blue"], "青次郎")

    def test_overwrite_flag(self) -> None:
        segments = [segment(1, 0, 100, red="古い名前")]
        card = parse_card([["赤太郎", "青次郎"]])

        apply_card(segments, card, overwrite=True)

        self.assertEqual(segments[0]["red"], "赤太郎")


class ScoreMathTest(unittest.TestCase):
    def test_zscore_centres_values(self) -> None:
        result = zscore([1.0, 2.0, 3.0])
        self.assertAlmostEqual(sum(result), 0.0, places=6)
        self.assertGreater(result[2], result[0])

    def test_zscore_handles_flat_input(self) -> None:
        self.assertEqual(zscore([5.0, 5.0, 5.0]), [0.0, 0.0, 0.0])

    def test_zscore_empty(self) -> None:
        self.assertEqual(zscore([]), [])

    def test_moving_average_keeps_length(self) -> None:
        values = [0.0, 10.0, 0.0]
        self.assertEqual(len(moving_average(values, 3)), 3)
        self.assertLess(moving_average(values, 3)[1], 10.0)

    def test_combine_uses_shorter_length(self) -> None:
        params = HighlightParams(ending_bonus=0.0, smooth_sec=1.0)
        scores = combine_scores([0.0, 1.0, 0.0, 1.0], [0.0, 1.0], params, step_sec=1.0)
        self.assertEqual(len(scores), 2)

    def test_ending_bonus_lifts_the_tail(self) -> None:
        flat = [1.0] * 100
        with_bonus = combine_scores(
            flat, [], HighlightParams(ending_span_sec=20, smooth_sec=1.0), step_sec=1.0
        )
        self.assertGreater(with_bonus[-1], with_bonus[0])


class PickHighlightsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.params = HighlightParams(top_n=2, ending_bonus=0.0, smooth_sec=1.0)

    def test_picks_the_peaks(self) -> None:
        scores = [0.0] * 300
        scores[100] = 10.0
        scores[200] = 8.0

        picked = pick_highlights(scores, self.params, step_sec=1.0)

        self.assertEqual(len(picked), 2)
        self.assertAlmostEqual(picked[0].peak_sec, 100.0)
        self.assertAlmostEqual(picked[1].peak_sec, 200.0)

    def test_clip_length_is_within_bounds(self) -> None:
        scores = [0.0] * 300
        scores[150] = 10.0

        picked = pick_highlights(scores, HighlightParams(top_n=1), step_sec=1.0)

        self.assertGreaterEqual(picked[0].duration_sec, 15.0)
        self.assertLessEqual(picked[0].duration_sec, 60.0)

    def test_lead_in_starts_before_the_peak(self) -> None:
        """★歓声は出来事のあとに来る。ピークより前から始めないと打撃が映らない。"""
        scores = [0.0] * 300
        scores[150] = 10.0

        picked = pick_highlights(scores, HighlightParams(top_n=1), step_sec=1.0)

        self.assertLess(picked[0].start_sec, picked[0].peak_sec)

    def test_nearby_peaks_are_not_taken_twice(self) -> None:
        scores = [0.0] * 300
        scores[100] = 10.0
        scores[103] = 9.5  # 同じ場面

        picked = pick_highlights(scores, self.params, step_sec=1.0)

        self.assertEqual(len(picked), 1)

    def test_offset_shifts_to_absolute_time(self) -> None:
        scores = [0.0] * 300
        scores[100] = 10.0

        picked = pick_highlights(
            scores, HighlightParams(top_n=1), step_sec=1.0, offset_sec=600.0
        )

        self.assertAlmostEqual(picked[0].peak_sec, 700.0)

    def test_short_match_yields_nothing(self) -> None:
        scores = [1.0] * 8  # 8秒しかない
        self.assertEqual(pick_highlights(scores, self.params, step_sec=1.0), [])

    def test_results_are_sorted_and_numbered(self) -> None:
        scores = [0.0] * 400
        scores[300] = 10.0
        scores[100] = 9.0

        picked = pick_highlights(scores, self.params, step_sec=1.0)

        self.assertEqual([h.index for h in picked], [1, 2])
        self.assertLess(picked[0].start_sec, picked[1].start_sec)

    def test_peak_at_the_very_end_still_fits(self) -> None:
        scores = [0.0] * 100
        scores[99] = 10.0

        picked = pick_highlights(scores, HighlightParams(top_n=1), step_sec=1.0)

        self.assertEqual(len(picked), 1)
        self.assertLessEqual(picked[0].end_sec, 100.0)
        self.assertGreaterEqual(picked[0].duration_sec, 15.0)

    def test_empty_scores(self) -> None:
        self.assertEqual(pick_highlights([], self.params, step_sec=1.0), [])

    def test_invalid_params(self) -> None:
        with self.assertRaises(ValueError):
            pick_highlights([1.0] * 100, HighlightParams(top_n=0), step_sec=1.0)


class CaptionTest(unittest.TestCase):
    def test_uses_player_names(self) -> None:
        context = CaptionContext(event="第13回大会", index=1, red="赤太郎", blue="青次郎")
        drafts = build_all(context)

        self.assertIn("赤太郎 vs 青次郎", drafts["youtube_title"])
        self.assertIn("第13回大会", drafts["youtube_title"])

    def test_falls_back_without_names(self) -> None:
        drafts = build_all(CaptionContext(event="第13回大会", index=3))
        self.assertIn("第3試合", drafts["youtube_title"])

    def test_x_respects_the_limit(self) -> None:
        context = CaptionContext(
            event="と" * 60,
            index=1,
            red="あ" * 40,
            blue="い" * 40,
            hashtags=["UIZIN", "格闘技", "アマチュア格闘技", "成田"],
        )
        self.assertLessEqual(len(short_caption(context, limit=140)), 140)

    def test_result_is_included_when_known(self) -> None:
        context = CaptionContext(event="第13回大会", index=1, red="赤", blue="青", result="1R KO")
        self.assertIn("1R KO", build_all(context)["youtube_description"])

    def test_hashtags_are_normalised(self) -> None:
        context = CaptionContext(event="大会", index=1, hashtags=["#UIZIN", "格闘技"])
        self.assertIn("#UIZIN #格闘技", context.tag_line)


if __name__ == "__main__":
    unittest.main()


class StaleNamesTest(unittest.TestCase):
    """★選手名を入れて書き出し直すと、名前なしの古いMP4が残る。

    12試合なのに24本並ぶことになり、間違ったほうを投稿する事故につながる。
    """

    def test_old_unnamed_files_are_reported(self) -> None:
        from uizin_clipper.naming import stale_names  # noqa: PLC0415

        existing = ["01.mp4", "01_赤vs青.mp4", "02.mp4", "02_赤2vs青2.mp4"]
        produced = {"01_赤vs青.mp4", "02_赤2vs青2.mp4"}

        self.assertEqual(stale_names(existing, produced), ["01.mp4", "02.mp4"])

    def test_nothing_stale_when_names_match(self) -> None:
        from uizin_clipper.naming import stale_names  # noqa: PLC0415

        self.assertEqual(stale_names(["01.mp4"], {"01.mp4"}), [])

    def test_result_is_sorted(self) -> None:
        from uizin_clipper.naming import stale_names  # noqa: PLC0415

        self.assertEqual(stale_names(["03.mp4", "01.mp4"], set()), ["01.mp4", "03.mp4"])
