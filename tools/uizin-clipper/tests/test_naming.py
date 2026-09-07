"""ファイル名生成のテスト。"""

from __future__ import annotations

import unittest

from uizin_clipper.naming import (
    build_clip_filename,
    build_event_dirname,
    ensure_unique,
    sanitize_component,
)


class SanitizeTest(unittest.TestCase):
    def test_forbidden_characters_are_removed(self) -> None:
        self.assertEqual(sanitize_component('a/b\\c:d*e?f"g<h>i|j'), "abcdefghij")

    def test_whitespace_is_collapsed(self) -> None:
        self.assertEqual(sanitize_component("  山田   太郎  "), "山田 太郎")

    def test_trailing_dot_is_removed(self) -> None:
        self.assertEqual(sanitize_component("name."), "name")

    def test_empty_falls_back(self) -> None:
        self.assertEqual(sanitize_component("///"), "untitled")

    def test_windows_reserved_name_is_escaped(self) -> None:
        self.assertEqual(sanitize_component("CON"), "_CON")

    def test_long_japanese_name_is_truncated_without_breaking_utf8(self) -> None:
        result = sanitize_component("あ" * 200)
        self.assertLessEqual(len(result.encode("utf-8")), 150)
        self.assertEqual(result, result.encode("utf-8").decode("utf-8"))


class ClipFilenameTest(unittest.TestCase):
    def test_both_names_present(self) -> None:
        self.assertEqual(build_clip_filename(1, "山田", "佐藤"), "01_山田vs佐藤.mp4")

    def test_zero_padded_to_two_digits(self) -> None:
        self.assertEqual(build_clip_filename(13, "A", "B"), "13_AvsB.mp4")
        self.assertEqual(build_clip_filename(101, "A", "B"), "101_AvsB.mp4")

    def test_missing_name_falls_back_to_number_only(self) -> None:
        self.assertEqual(build_clip_filename(2, "山田", None), "02.mp4")
        self.assertEqual(build_clip_filename(3, None, None), "03.mp4")
        self.assertEqual(build_clip_filename(4, "", ""), "04.mp4")

    def test_names_with_slashes_are_sanitized(self) -> None:
        self.assertEqual(build_clip_filename(5, "山田/太郎", "佐藤"), "05_山田太郎vs佐藤.mp4")

    def test_index_must_be_positive(self) -> None:
        with self.assertRaises(ValueError):
            build_clip_filename(0)


class EventDirTest(unittest.TestCase):
    def test_normal_event_name(self) -> None:
        self.assertEqual(build_event_dirname("第13回大会"), "第13回大会")

    def test_event_name_with_path_separator(self) -> None:
        self.assertEqual(build_event_dirname("2026/08 第13回"), "202608 第13回")


class EnsureUniqueTest(unittest.TestCase):
    def test_untaken_name_is_unchanged(self) -> None:
        self.assertEqual(ensure_unique("01.mp4", set()), "01.mp4")

    def test_duplicate_gets_suffix(self) -> None:
        taken = {"01_AvsB.mp4"}
        self.assertEqual(ensure_unique("01_AvsB.mp4", taken), "01_AvsB_2.mp4")

    def test_multiple_duplicates(self) -> None:
        taken = {"01.mp4", "01_2.mp4"}
        self.assertEqual(ensure_unique("01.mp4", taken), "01_3.mp4")


if __name__ == "__main__":
    unittest.main()
