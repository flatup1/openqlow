"""segments.json のマージ規則テスト。

ここが壊れると「人間の修正が消える」＝運用が続かない。最重要のテスト。
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from uizin_clipper import manifest as mf


def seg(index: int, start: float, end: float, **extra) -> dict:
    base = {
        "index": index,
        "start": "",
        "end": "",
        "start_sec": start,
        "end_sec": end,
        "duration_sec": end - start,
        "core_start_sec": start,
        "core_end_sec": end,
        "confidence": 0.9,
        "flags": [],
        "red": None,
        "blue": None,
        "result": None,
        "title": None,
        "note": None,
        "skip": False,
        "locked": False,
    }
    base.update(extra)
    return base


class OverlapRatioTest(unittest.TestCase):
    def test_no_overlap(self) -> None:
        self.assertEqual(mf.overlap_ratio(seg(1, 0, 10), seg(2, 20, 30)), 0.0)

    def test_full_overlap(self) -> None:
        self.assertEqual(mf.overlap_ratio(seg(1, 0, 100), seg(2, 10, 20)), 1.0)

    def test_half_overlap(self) -> None:
        self.assertAlmostEqual(mf.overlap_ratio(seg(1, 0, 10), seg(2, 5, 15)), 0.5)

    def test_zero_length_is_safe(self) -> None:
        self.assertEqual(mf.overlap_ratio(seg(1, 0, 10), seg(2, 5, 5)), 0.0)


class MergeSegmentsTest(unittest.TestCase):
    def test_detection_only_when_nothing_existed(self) -> None:
        detected = [seg(1, 0, 100), seg(2, 200, 300)]
        merged = mf.merge_segments([], detected)
        self.assertEqual(len(merged), 2)
        self.assertEqual([s["index"] for s in merged], [1, 2])

    def test_locked_segment_survives_redetection(self) -> None:
        """人間が直した区間は、再検出しても時刻が書き換わらない。"""
        existing = [seg(1, 100, 200, locked=True, red="山田", blue="佐藤")]
        detected = [seg(1, 105, 260)]  # 検出はズレた

        merged = mf.merge_segments(existing, detected)

        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["start_sec"], 100)
        self.assertEqual(merged[0]["end_sec"], 200)
        self.assertEqual(merged[0]["red"], "山田")
        self.assertTrue(merged[0]["locked"])

    def test_new_detection_outside_locked_range_is_added(self) -> None:
        existing = [seg(1, 100, 200, locked=True)]
        detected = [seg(1, 100, 200), seg(2, 500, 600)]

        merged = mf.merge_segments(existing, detected)

        self.assertEqual(len(merged), 2)
        self.assertEqual([s["start_sec"] for s in merged], [100, 500])
        self.assertEqual([s["index"] for s in merged], [1, 2])

    def test_human_entered_names_carry_over_to_new_detection(self) -> None:
        """locked していなくても、ほぼ同じ区間なら選手名は引き継ぐ。"""
        existing = [seg(1, 100, 200, red="山田", blue="佐藤", note="KO")]
        detected = [seg(1, 102, 205)]

        merged = mf.merge_segments(existing, detected)

        self.assertEqual(merged[0]["red"], "山田")
        self.assertEqual(merged[0]["blue"], "佐藤")
        self.assertEqual(merged[0]["note"], "KO")
        self.assertEqual(merged[0]["start_sec"], 102)  # 時刻は新しい検出を採用

    def test_names_do_not_carry_over_to_a_different_match(self) -> None:
        existing = [seg(1, 100, 200, red="山田", blue="佐藤")]
        detected = [seg(1, 900, 1000)]

        merged = mf.merge_segments(existing, detected)

        self.assertIsNone(merged[0]["red"])

    def test_skip_flag_carries_over(self) -> None:
        existing = [seg(1, 100, 200, skip=True)]
        detected = [seg(1, 100, 200)]
        merged = mf.merge_segments(existing, detected)
        self.assertTrue(merged[0]["skip"])

    def test_result_is_sorted_by_time_and_renumbered(self) -> None:
        existing = [seg(9, 800, 900, locked=True)]
        detected = [seg(1, 400, 500), seg(2, 100, 200)]

        merged = mf.merge_segments(existing, detected)

        self.assertEqual([s["start_sec"] for s in merged], [100, 400, 800])
        self.assertEqual([s["index"] for s in merged], [1, 2, 3])


class NormalizeTest(unittest.TestCase):
    def test_manual_time_edit_refreshes_duration_and_timecode(self) -> None:
        """人間が秒数だけ直しても、尺と表示が古いまま残らない。"""
        segment = seg(1, 100, 200)
        segment["start_sec"] = 58.0
        segment["end_sec"] = 155.0

        mf.normalize_segment(segment)

        self.assertEqual(segment["duration_sec"], 97.0)
        self.assertEqual(segment["start"], "00:00:58.000")
        self.assertEqual(segment["end"], "00:02:35.000")

    def test_merge_refreshes_locked_segment_derived_values(self) -> None:
        existing = [seg(1, 100, 200, locked=True)]
        existing[0]["end_sec"] = 155.0  # 手編集で尺だけ古くなった状態

        merged = mf.merge_segments(existing, [])

        self.assertEqual(merged[0]["duration_sec"], 55.0)


class RoundTripTest(unittest.TestCase):
    def test_save_and_load(self) -> None:
        manifest = mf.build_manifest(
            source={"video_id": "abc", "path": "/tmp/source.mp4", "duration_sec": 100.0},
            profile={"name": "uizin"},
            segments=[seg(1, 10, 50)],
        )
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "nested" / "segments.json"
            mf.save_manifest(path, manifest)
            loaded = mf.load_manifest(path)

        self.assertEqual(loaded["version"], mf.MANIFEST_VERSION)
        self.assertEqual(loaded["segments"][0]["start_sec"], 10)
        self.assertEqual(loaded["source"]["video_id"], "abc")

    def test_wrong_version_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "segments.json"
            path.write_text('{"version": 999, "segments": []}', encoding="utf-8")
            with self.assertRaises(ValueError):
                mf.load_manifest(path)

    def test_renderable_segments_skips_marked_ones(self) -> None:
        manifest = {"segments": [seg(1, 0, 10), seg(2, 20, 30, skip=True)]}
        self.assertEqual(len(mf.renderable_segments(manifest)), 1)


if __name__ == "__main__":
    unittest.main()
