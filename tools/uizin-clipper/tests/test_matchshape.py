"""大会の進行から決まる「試合の形」の検査。外部ツール不要。

オーナーから示された実際の進行:

    入場曲 → 青コーナー紹介 → 赤コーナー紹介 → 試合 → 終了のゴング
    1ラウンド 1分30秒 × 2ラウンド、インターバル 1分。KOならもっと短い。

つまり 1試合そのものは最長 1:30 + 1:00 + 1:30 = **4分00秒**。
この形を知っているだけで、中身を見ずに「あやしい検出」に気づけます。
"""

from __future__ import annotations

import unittest

from uizin_clipper.matchshape import (
    KoHintParams,
    MatchShape,
    duration_flags,
    ending_spike,
    ko_hint,
    looks_like_two_matches,
)
from uizin_clipper.onset import OnsetParams, refine_end


class MatchShapeTest(unittest.TestCase):
    def test_the_real_tournament_shape(self) -> None:
        """1:30 × 2R ＋ インターバル1分 = 4分00秒。"""
        self.assertAlmostEqual(MatchShape().core_sec(), 240.0)

    def test_a_normal_match_is_not_flagged(self) -> None:
        shape = MatchShape()
        for duration in (60.0, 150.0, 240.0, 300.0):
            self.assertEqual(duration_flags(duration, shape, min_duration_sec=30.0), [])

    def test_a_merged_pair_is_flagged(self) -> None:
        """★2試合が繋がると 8分前後になる。中身を見なくても気づける。"""
        self.assertIn("too_long", duration_flags(480.0, MatchShape(), min_duration_sec=30.0))

    def test_a_replay_flash_is_flagged(self) -> None:
        self.assertIn("too_short", duration_flags(12.0, MatchShape(), min_duration_sec=30.0))

    def test_a_ko_finish_is_not_flagged_as_too_short(self) -> None:
        """★KOは31秒で決着した実例がある。短い決着を「異常」にしてはいけない。"""
        self.assertEqual(duration_flags(31.0, MatchShape(), min_duration_sec=30.0), [])

    def test_two_match_suspicion(self) -> None:
        shape = MatchShape()
        self.assertFalse(looks_like_two_matches(300.0, shape))
        self.assertTrue(looks_like_two_matches(500.0, shape))

    def test_tolerance_is_wide_enough_for_rolls(self) -> None:
        """前後の余白（pre 6秒 + post 60秒）を足しても警告が出ないこと。

        ★毎回警告が出ると誰も読まなくなる。警告は少ないから効く。
        """
        shape = MatchShape()
        self.assertEqual(
            duration_flags(shape.core_sec() + 66.0, shape, min_duration_sec=30.0), []
        )


class EndingSpikeTest(unittest.TestCase):
    def setUp(self) -> None:
        self.params = KoHintParams()

    def test_a_loud_finish_shows_a_spike(self) -> None:
        values = [0.05] * 40 + [0.6] * 10
        spike = ending_spike(values, self.params, step_sec=1.0)
        self.assertIsNotNone(spike)
        self.assertGreater(spike, 1.0)

    def test_a_quiet_finish_does_not(self) -> None:
        values = [0.5] * 40 + [0.05] * 10
        spike = ending_spike(values, self.params, step_sec=1.0)
        self.assertIsNotNone(spike)
        self.assertLess(spike, 0.0)

    def test_flat_audio_is_refused(self) -> None:
        """★平坦な音で偏差値を出すと、微小な揺れが巨大な跳ねに化ける。"""
        self.assertIsNone(ending_spike([0.088] * 50, self.params, step_sec=1.0))

    def test_almost_flat_audio_is_refused(self) -> None:
        values = [0.08829 + (i % 3) * 0.000001 for i in range(50)]
        self.assertIsNone(ending_spike(values, self.params, step_sec=1.0))

    def test_too_short_input(self) -> None:
        self.assertIsNone(ending_spike([0.1, 0.9], self.params, step_sec=1.0))

    def test_the_roar_after_the_finish_is_caught(self) -> None:
        """★★実際に動かして見つけた設計ミス。

        歓声は決着の**あと**に来ます。スコアボードは決着とほぼ同時に消えるので、
        「終了より前の10秒」だけを見ていると、一番大きい音を窓の外に置くことになります。
        合成素材のKO2試合で、偏差 +0.4 / +0.6 しか出ず1件も反応しませんでした。
        """
        # 決着は40秒目。歓声はその直後（40〜52秒）に来る。
        values = [0.05] * 40 + [0.7] * 12
        spike = ending_spike(values, self.params, step_sec=1.0, finish_at_sec=40.0)

        self.assertIsNotNone(spike)
        self.assertGreater(spike, self.params.min_spike)

    def test_looking_only_before_the_finish_would_miss_it(self) -> None:
        """同じ音でも、決着より前だけを見ると見逃すことの確認。"""
        values = [0.05] * 40 + [0.7] * 12
        before_only = ending_spike(
            values,
            KoHintParams(after_finish_sec=0.1),   # 決着より後ろを見ない設定
            step_sec=1.0,
            finish_at_sec=40.0,
        )

        self.assertIsNotNone(before_only)
        self.assertLess(before_only, self.params.min_spike)

    def test_the_winner_announcement_is_not_included(self) -> None:
        """★勝ち名乗り（数十秒）まで入れると薄まる。窓は決着まわりだけ。"""
        values = [0.05] * 40 + [0.7] * 8 + [0.3] * 60
        spike = ending_spike(values, self.params, step_sec=1.0, finish_at_sec=40.0)

        self.assertIsNotNone(spike)
        self.assertGreater(spike, self.params.min_spike)


class KoHintTest(unittest.TestCase):
    def setUp(self) -> None:
        self.shape = MatchShape()
        self.params = KoHintParams()

    def test_a_short_loud_finish_looks_like_ko(self) -> None:
        values = [0.05] * 40 + [0.7] * 10
        looks_ko, reason = ko_hint(60.0, values, self.shape, self.params, step_sec=1.0)

        self.assertTrue(looks_ko)
        self.assertIn("早い決着", reason)

    def test_a_full_length_loud_finish_is_not_ko(self) -> None:
        """★判定決着でも最後は盛り上がる。長さと両方そろって初めて示唆する。"""
        values = [0.05] * 40 + [0.7] * 10
        looks_ko, reason = ko_hint(240.0, values, self.shape, self.params, step_sec=1.0)

        self.assertFalse(looks_ko)
        self.assertIn("規定どおり", reason)

    def test_a_short_quiet_finish_is_not_ko(self) -> None:
        values = [0.5] * 40 + [0.05] * 10
        looks_ko, _ = ko_hint(60.0, values, self.shape, self.params, step_sec=1.0)

        self.assertFalse(looks_ko)

    def test_flat_audio_says_it_cannot_tell(self) -> None:
        """★分からないときは「分からない」と言う。当て推量で KO と書かない。"""
        looks_ko, reason = ko_hint(60.0, [0.088] * 50, self.shape, self.params, step_sec=1.0)

        self.assertFalse(looks_ko)
        self.assertIn("判断できません", reason)


class RefineEndTest(unittest.TestCase):
    def test_end_moves_to_the_closing_gong(self) -> None:
        values = [0.01] * 10 + [0.5] * 10
        moved, shift = refine_end(
            100.0, values, OnsetParams(), step_sec=1.0, window_start_sec=94.0
        )

        self.assertAlmostEqual(moved, 104.0, delta=1.0)
        self.assertIsNotNone(shift)

    def test_the_end_is_never_pulled_earlier(self) -> None:
        """★★決着の瞬間を落とさない。迷ったら後ろに残す。

        ゴングが検出位置より前に見つかっても、切り詰める方向には動かさない。
        """
        values = [0.01] * 2 + [0.5] * 18   # 窓の先頭から2秒目＝96秒（検出より前）
        moved, shift = refine_end(
            100.0, values, OnsetParams(), step_sec=1.0, window_start_sec=94.0
        )

        self.assertEqual(moved, 100.0)
        self.assertIsNone(shift)

    def test_no_gong_keeps_the_original(self) -> None:
        moved, shift = refine_end(
            100.0, [0.2] * 20, OnsetParams(), step_sec=1.0, window_start_sec=94.0
        )

        self.assertEqual(moved, 100.0)
        self.assertIsNone(shift)

    def test_far_jump_is_refused(self) -> None:
        values = [0.01] * 28 + [0.5] * 2
        moved, shift = refine_end(
            100.0, values, OnsetParams(search_sec=3.0), step_sec=1.0, window_start_sec=94.0
        )

        self.assertEqual(moved, 100.0)
        self.assertIsNone(shift)


if __name__ == "__main__":
    unittest.main()
