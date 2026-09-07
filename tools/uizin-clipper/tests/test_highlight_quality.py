"""見どころ抽出が「無い物を出さない」ことを確かめるテスト。

本数合わせで平坦な場所を拾う不具合が実際に出たので、その回帰を固定する。
"""

from __future__ import annotations

import unittest

from uizin_clipper.highlight import HighlightParams, combine_scores, pick_highlights


class QuietMatchTest(unittest.TestCase):
    def test_flat_match_yields_no_candidates(self) -> None:
        """★盛り上がりが1つも無い試合からは、1本も作らない。"""
        scores = [0.0] * 600
        picked = pick_highlights(scores, HighlightParams(top_n=3), step_sec=1.0)
        self.assertEqual(picked, [])

    def test_one_peak_yields_one_candidate(self) -> None:
        """山が1つしかなければ、top_n=3 でも1本しか出さない。"""
        scores = [0.0] * 600
        scores[300] = 5.0

        picked = pick_highlights(scores, HighlightParams(top_n=3), step_sec=1.0)

        self.assertEqual(len(picked), 1)

    def test_candidates_never_overlap(self) -> None:
        scores = [0.0] * 1200
        for position in (100, 400, 700, 1000):
            scores[position] = 5.0

        picked = pick_highlights(scores, HighlightParams(top_n=4), step_sec=1.0)

        for earlier, later in zip(picked, picked[1:]):
            self.assertLessEqual(earlier.end_sec, later.start_sec)

    def test_candidates_stay_inside_the_match(self) -> None:
        scores = [0.0] * 200
        scores[0] = 5.0
        scores[199] = 6.0

        picked = pick_highlights(
            scores, HighlightParams(top_n=2), step_sec=1.0, match_duration_sec=200.0
        )

        for highlight in picked:
            self.assertGreaterEqual(highlight.start_sec, 0.0)
            self.assertLessEqual(highlight.end_sec, 200.0)


class SignalBalanceTest(unittest.TestCase):
    """音量と運動量の重み付けが意図どおりかを、作った波形で確かめる。"""

    def test_loudness_outweighs_motion(self) -> None:
        """★カメラ切替だけで運動量は跳ねる。音量のほうを重く見る。"""
        length = 200
        loud = [0.0] * length
        move = [0.0] * length
        loud[50] = 10.0   # 歓声だけ
        move[150] = 10.0  # 動きだけ

        scores = combine_scores(
            loud, move, HighlightParams(ending_bonus=0.0, smooth_sec=1.0), step_sec=1.0
        )

        self.assertGreater(scores[50], scores[150])

    def test_both_signals_together_win(self) -> None:
        length = 300
        loud = [0.0] * length
        move = [0.0] * length
        loud[50] = 10.0
        loud[250] = 10.0
        move[250] = 10.0  # 音も動きも同時に跳ねた場面

        scores = combine_scores(
            loud, move, HighlightParams(ending_bonus=0.0, smooth_sec=1.0), step_sec=1.0
        )

        self.assertGreater(scores[250], scores[50])

    def test_missing_audio_track_still_works(self) -> None:
        """音声トラックが無い動画でも、運動量だけで動く。"""
        length = 200
        move = [0.0] * length
        move[100] = 10.0

        scores = combine_scores(
            [0.0] * length, move, HighlightParams(ending_bonus=0.0, smooth_sec=1.0),
            step_sec=1.0,
        )
        picked = pick_highlights(scores, HighlightParams(top_n=1), step_sec=1.0)

        self.assertEqual(len(picked), 1)
        self.assertAlmostEqual(picked[0].peak_sec, 100.0)

    def test_smoothing_suppresses_a_one_second_bang(self) -> None:
        """1秒だけの物音（マイクを叩いた等）より、続いた盛り上がりを優先する。"""
        length = 300
        loud = [0.0] * length
        loud[50] = 12.0                       # 一瞬だけ
        for position in range(200, 210):
            loud[position] = 6.0              # 10秒続く

        scores = combine_scores(
            loud, [], HighlightParams(ending_bonus=0.0, smooth_sec=7.0), step_sec=1.0
        )

        self.assertGreater(max(scores[200:210]), scores[50])


if __name__ == "__main__":
    unittest.main()
