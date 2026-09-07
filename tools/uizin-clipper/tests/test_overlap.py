"""境界を動かしたあとの後始末を見張る。外部ツール不要。

★自己レビューで見つけて実証した不具合。

`detect` は のりしろ が重なったとき中間点で分けています。ところが `refine` は
**そのあとに境界を動かす**ので、そこで重なりが復活します。実測:

    1本目の終了 300秒 → 304秒（終了ゴングへ +4.0秒 寄せた）
    2本目の開始 303秒 のまま        → 1秒ぶん、同じ映像が2本に入る

同じ理由で、動画の尺を超える位置へ動くこともありました（尺500秒に対して502秒）。
書き出しの段階で気づけない種類の壊れ方なので、動かしたあとに必ず整えます。
"""

from __future__ import annotations

import unittest

from uizin_clipper.manifest import normalize_segment, resolve_overlaps


def make(index: int, start: float, end: float, core_start: float, core_end: float) -> dict:
    return normalize_segment(
        {
            "index": index,
            "start_sec": start,
            "end_sec": end,
            "core_start_sec": core_start,
            "core_end_sec": core_end,
        }
    )


class ResolveOverlapsTest(unittest.TestCase):
    def test_the_measured_case_is_fixed(self) -> None:
        """★実証した状況そのもの。終了を +4秒 寄せた結果、次と1秒重なった。"""
        segments = [
            make(1, 100.0, 304.0, 106.0, 300.0),
            make(2, 303.0, 500.0, 309.0, 494.0),
        ]

        notes = resolve_overlaps(segments)

        self.assertTrue(notes)
        self.assertLessEqual(segments[0]["end_sec"], segments[1]["start_sec"])

    def test_the_split_point_keeps_both_matches_whole(self) -> None:
        """★分ける位置は、どちらの試合の中身も欠けない範囲に収める。"""
        segments = [
            make(1, 100.0, 304.0, 106.0, 300.0),
            make(2, 303.0, 500.0, 309.0, 494.0),
        ]

        resolve_overlaps(segments)

        self.assertGreaterEqual(segments[0]["end_sec"], 300.0)   # 1本目の中身は残る
        self.assertLessEqual(segments[1]["start_sec"], 309.0)    # 2本目の中身も残る

    def test_no_overlap_is_left_alone(self) -> None:
        segments = [
            make(1, 100.0, 300.0, 106.0, 294.0),
            make(2, 400.0, 600.0, 406.0, 594.0),
        ]

        self.assertEqual(resolve_overlaps(segments), [])
        self.assertEqual(segments[0]["end_sec"], 300.0)
        self.assertEqual(segments[1]["start_sec"], 400.0)

    def test_past_the_end_of_the_video_is_pulled_back(self) -> None:
        """★尺を超えた位置は書き出しで壊れる。戻す。"""
        segments = [make(1, 100.0, 502.0, 106.0, 496.0)]

        notes = resolve_overlaps(segments, duration_sec=500.0)

        self.assertTrue(notes)
        self.assertEqual(segments[0]["end_sec"], 500.0)

    def test_before_zero_is_pulled_back(self) -> None:
        segments = [make(1, -3.0, 200.0, 3.0, 194.0)]

        notes = resolve_overlaps(segments, duration_sec=500.0)

        self.assertTrue(notes)
        self.assertEqual(segments[0]["start_sec"], 0.0)

    def test_duration_is_recalculated(self) -> None:
        """尺の表示が古いまま残らないこと。"""
        segments = [make(1, 100.0, 502.0, 106.0, 496.0)]

        resolve_overlaps(segments, duration_sec=500.0)

        self.assertAlmostEqual(segments[0]["duration_sec"], 400.0)

    def test_three_in_a_row(self) -> None:
        segments = [
            make(1, 0.0, 110.0, 6.0, 100.0),
            make(2, 105.0, 220.0, 111.0, 210.0),
            make(3, 215.0, 330.0, 221.0, 320.0),
        ]

        resolve_overlaps(segments)

        for previous, current in zip(segments, segments[1:]):
            self.assertLessEqual(previous["end_sec"], current["start_sec"])

    def test_segments_without_core_still_work(self) -> None:
        """手で書いた segments.json には core_* が無いことがある。落ちないこと。"""
        segments = [
            normalize_segment({"index": 1, "start_sec": 0.0, "end_sec": 110.0}),
            normalize_segment({"index": 2, "start_sec": 105.0, "end_sec": 220.0}),
        ]

        resolve_overlaps(segments)

        self.assertLessEqual(segments[0]["end_sec"], segments[1]["start_sec"])


class OneSourceOfTruthTest(unittest.TestCase):
    def test_too_long_uses_the_tournament_shape(self) -> None:
        """★同じ名前で違う基準が2か所にあった。

        `detect` は 1200秒（20分）で too_long、`list` は 330秒で「長すぎます」。
        2試合が繋がった8分の区間を detect 側が見逃していた。
        """
        from uizin_clipper.matchshape import MatchShape
        from uizin_clipper.steps.segment import SegmentParams

        self.assertEqual(SegmentParams().long_segment_sec, MatchShape().max_expected_sec())

    def test_a_merged_pair_is_now_flagged_by_detect(self) -> None:
        from uizin_clipper.steps.segment import SegmentParams

        self.assertLess(SegmentParams().long_segment_sec, 480.0)


if __name__ == "__main__":
    unittest.main()
