"""座標の目盛りを見張る。外部ツール不要。

★実機で失敗して分かったこと（第13回大会）。

縮小された画面写真から目分量で ROI を当てたところ、外しました。

    一致度 0.20〜0.63（当たりなら 0.95 以上）
    26試合のうち 5試合しか検出できず

目分量をやめて、**画像そのものに座標を焼き込む**ようにしました。
読み取るだけで決まるので、当て推量の往復が要りません。
"""

from __future__ import annotations

import unittest

from uizin_clipper.steps.calibrate import grid_filter


class GridFilterTest(unittest.TestCase):
    def test_two_scales_are_drawn(self) -> None:
        """細かい線と、目印になる太い線。両方ないと数えにくい。"""
        graph = grid_filter()

        self.assertIn("drawgrid=width=100:height=100", graph)
        self.assertIn("drawgrid=width=500:height=500", graph)

    def test_labels_cover_the_frame(self) -> None:
        graph = grid_filter()

        for expected in ("x=500", "x=1000", "x=1500", "y=500", "y=1000"):
            self.assertIn(expected, graph, f"{expected} の目盛りがありません")

    def test_labels_stop_before_the_edge(self) -> None:
        """画面の外に数字を置かない。"""
        graph = grid_filter()

        self.assertNotIn("x=2000", graph)
        self.assertNotIn("y=1500", graph)

    def test_custom_size(self) -> None:
        graph = grid_filter(width=1280, height=720, major=200)

        self.assertIn("x=1200", graph)
        self.assertNotIn("x=1400", graph)

    def test_bad_step_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            grid_filter(step=0)


if __name__ == "__main__":
    unittest.main()
