"""枠の中身を文字にする処理のテスト。

ffmpeg を必要としない純ロジックだけを対象にする。
"""

import unittest

import numpy as np

from uizin_clipper.asciiview import RAMP, cell_rows, frame_lines, to_ascii


class CellRowsTest(unittest.TestCase):
    def test_文字の縦長を補正して行数を決める(self):
        # 360x220 を横72文字にすると、素直な比では44行。文字は縦長なので半分。
        self.assertEqual(cell_rows((0, 0, 360, 220), 72), 22)

    def test_正方形なら横の半分の行数になる(self):
        self.assertEqual(cell_rows((0, 0, 100, 100), 40), 20)

    def test_極端に平たくても1行にはしない(self):
        self.assertEqual(cell_rows((0, 0, 1000, 1), 10), 2)

    def test_幅や高さが0なら止める(self):
        with self.assertRaises(ValueError):
            cell_rows((0, 0, 0, 10), 20)


class ToAsciiTest(unittest.TestCase):
    def test_暗いところは薄く明るいところは濃くなる(self):
        gray = np.array([[0, 255]], dtype=np.uint8)
        self.assertEqual(to_ascii(gray), [RAMP[0] + RAMP[-1]])

    def test_一様な画像は最も薄い記号で埋まる(self):
        # ★真っ黒でも真っ白でも「模様が無い」ことが見て分かる必要がある。
        gray = np.full((3, 4), 128, dtype=np.uint8)
        self.assertEqual(to_ascii(gray), [RAMP[0] * 4] * 3)

    def test_その画像の中での相対値で決まる(self):
        # 全体が暗くても、その中の明暗はきちんと出る（絶対値なら全部薄くなる）。
        dark = to_ascii(np.array([[10, 20, 30]], dtype=np.uint8))
        bright = to_ascii(np.array([[210, 220, 230]], dtype=np.uint8))
        self.assertEqual(dark, bright)

    def test_行と列の並びが崩れない(self):
        gray = np.array([[0, 0, 255], [255, 0, 0]], dtype=np.uint8)
        self.assertEqual(to_ascii(gray), ["  " + RAMP[-1], RAMP[-1] + "  "])

    def test_2次元でなければ止める(self):
        with self.assertRaises(ValueError):
            to_ascii(np.array([1, 2, 3], dtype=np.uint8))


class FrameLinesTest(unittest.TestCase):
    def test_座標と枠線が付く(self):
        lines = frame_lines(["ab", "cd"], (10, 20, 30, 40))
        self.assertIn("x=10", lines[0])
        self.assertIn("右下 x=40 y=60", lines[0])
        self.assertEqual(lines[1], "+--+")
        self.assertEqual(lines[2], "|ab|")
        self.assertEqual(lines[-1], "+--+")


if __name__ == "__main__":
    unittest.main()
