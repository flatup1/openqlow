"""9:16 変換とゴングによる境界寄せのテスト。外部ツール不要。"""

from __future__ import annotations

import unittest

from uizin_clipper.onset import OnsetParams, find_onset, refine_start
from uizin_clipper.steps.vertical import build_filter


class VerticalFilterTest(unittest.TestCase):
    def test_black_fill_pads_without_cropping(self) -> None:
        """★左右を切ってはいけない。試合は横に動くので選手が画面から消える。"""
        graph = build_filter(fill="black")

        self.assertIn("force_original_aspect_ratio=decrease", graph)
        self.assertIn("pad=1080:1920", graph)
        self.assertNotIn("crop=1080:1920,boxblur", graph)

    def test_blur_fill_builds_an_overlay_graph(self) -> None:
        graph = build_filter(fill="blur")

        self.assertIn("split=2", graph)
        self.assertIn("boxblur", graph)
        self.assertIn("overlay=", graph)
        # 前景は縮小して収める（切り取らない）
        self.assertIn("force_original_aspect_ratio=decrease", graph)

    def test_square_pixels_are_forced(self) -> None:
        for fill in ("blur", "black"):
            self.assertIn("setsar=1", build_filter(fill=fill))

    def test_custom_size(self) -> None:
        graph = build_filter(target_width=720, target_height=1280, fill="black")
        self.assertIn("pad=720:1280", graph)

    def test_unknown_fill_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            build_filter(fill="rainbow")

    def test_bad_size_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            build_filter(target_width=0)


class FindOnsetTest(unittest.TestCase):
    def setUp(self) -> None:
        self.params = OnsetParams()

    def test_finds_a_clear_jump(self) -> None:
        values = [0.01] * 10 + [0.5] * 10
        found = find_onset(values, self.params, step_sec=1.0)
        self.assertIsNotNone(found)
        self.assertAlmostEqual(found, 10.0, delta=1.0)

    def test_flat_audio_returns_nothing(self) -> None:
        """★立ち上がりが無ければ動かさない。自信がないのに動かすほうが危ない。"""
        self.assertIsNone(find_onset([0.2] * 20, self.params, step_sec=1.0))

    def test_almost_flat_audio_returns_nothing(self) -> None:
        """★4時間素材で実際に出た誤り。

        ばらつきが 0.000001 しかない平坦な音なのに、偏差値に直すと
        計算上の微小な揺れが「巨大な跳ね」に化けて、開始位置が動いてしまった。
        ゼロ割り防止だけでは足りず、音量の実寸での下限が要る。
        """
        values = [0.08829 + (i % 3) * 0.000001 for i in range(40)]
        self.assertIsNone(find_onset(values, self.params, step_sec=0.25))

    def test_small_but_real_variation_is_still_rejected(self) -> None:
        """ばらつき 0.0004 程度（会場のざわめきの揺らぎ）でも動かさない。"""
        values = [0.088, 0.0885, 0.0875, 0.0888] * 10
        self.assertIsNone(find_onset(values, self.params, step_sec=0.25))

    def test_a_real_gong_still_passes(self) -> None:
        """本物のゴングは 0.02 → 0.3 のように跳ねる。これは見逃さない。"""
        values = [0.02] * 20 + [0.30] * 20
        found = find_onset(values, self.params, step_sec=0.25)
        self.assertIsNotNone(found)
        self.assertAlmostEqual(found, 5.0, delta=0.5)

    def test_gradual_rise_is_not_an_onset(self) -> None:
        """観客が徐々にざわつくのはゴングではない。"""
        values = [0.01 * i for i in range(20)]
        found = find_onset(values, OnsetParams(min_jump=1.5), step_sec=1.0)
        self.assertIsNone(found)

    def test_too_short_input(self) -> None:
        self.assertIsNone(find_onset([0.1, 0.9], self.params, step_sec=1.0))

    def test_invalid_step(self) -> None:
        with self.assertRaises(ValueError):
            find_onset([0.1] * 20, self.params, step_sec=0)


class RefineStartTest(unittest.TestCase):
    def test_start_moves_to_the_gong(self) -> None:
        values = [0.01] * 10 + [0.5] * 10   # 窓の先頭から10秒目で鳴った
        moved, shift = refine_start(
            100.0, values, OnsetParams(), step_sec=1.0, window_start_sec=94.0
        )
        self.assertAlmostEqual(moved, 104.0, delta=1.0)
        self.assertIsNotNone(shift)

    def test_no_onset_keeps_the_original(self) -> None:
        moved, shift = refine_start(
            100.0, [0.2] * 20, OnsetParams(), step_sec=1.0, window_start_sec=94.0
        )
        self.assertEqual(moved, 100.0)
        self.assertIsNone(shift)

    def test_far_jump_is_refused(self) -> None:
        """★窓の端に張り付いたら動かさない。窓の外にもっと大きい音がある疑いがある。"""
        values = [0.01] * 28 + [0.5] * 2
        moved, shift = refine_start(
            100.0, values, OnsetParams(search_sec=3.0), step_sec=1.0, window_start_sec=94.0
        )
        self.assertEqual(moved, 100.0)
        self.assertIsNone(shift)


if __name__ == "__main__":
    unittest.main()
