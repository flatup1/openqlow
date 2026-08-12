"""setup-mac.sh が実機で壊れた形に戻らないよう見張る。

★実機（macOS・jin さんのMac）で 5/5 が失敗して分かったことを、ここで固定します。

    no such option: --break-system-packages
    ✗ 部品のインストールに失敗しました。

原因は2つ重なっていました。

1. **本当のエラーを隠していた** … 最初の pip を `2>/dev/null` で黙らせていたので、
   なぜ失敗したのかが誰にも分からない状態で2段目に進んでいた。
2. **回避策が使えない環境があった** … `--break-system-packages` は新しい pip の
   オプション。古い pip では「そんなオプションは無い」で終わる。

直し方は「回避策を増やす」ではなく「**そもそも拒否されない場所に入れる**」でした。
この道具専用の置き場所（venv）なら、システムのPythonに触らないので拒否されません。
"""

from __future__ import annotations

import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "setup-mac.sh"


class SetupScriptTest(unittest.TestCase):
    def setUp(self) -> None:
        self.assertTrue(SCRIPT.exists(), f"{SCRIPT} がありません")
        self.text = SCRIPT.read_text(encoding="utf-8")
        # コメント行は「なぜそうしないか」の説明なので、実行される中身とは分けて見る
        self.code = "\n".join(
            line for line in self.text.splitlines() if not line.lstrip().startswith("#")
        )

    def test_uses_a_dedicated_place_for_parts(self) -> None:
        """★システムのPythonに直接入れない。拒否されるし、壊すと戻すのが大変。"""
        self.assertIn("-m venv", self.text)
        self.assertIn(".venv", self.text)

    def test_does_not_depend_on_break_system_packages(self) -> None:
        """★古い pip には無いオプション。これに頼る形へ戻さない。

        コメントでの言及（なぜ使わないかの説明）は残してよい。
        """
        self.assertNotIn("--break-system-packages", self.code)

    def test_pip_errors_are_not_hidden(self) -> None:
        """★失敗の理由を隠さない。隠すと次に詰まったとき誰も直せない。"""
        for line in self.code.splitlines():
            if "pip install" in line and "--upgrade pip" not in line:
                self.assertNotIn(
                    "2>/dev/null",
                    line,
                    f"pip の失敗理由を隠しています: {line.strip()}",
                )

    def test_python_version_is_checked(self) -> None:
        """★yt-dlp が 3.9 を非推奨にした（実機で警告）。3.10 以上を要求する。

        Mac に最初から入っている python3 は 3.9 のことが多い。
        古いまま進むと、あとで分かりにくい形で壊れる。
        """
        self.assertIn("version_info", self.code)
        self.assertIn("(3, 10)", self.code)

    def test_an_old_place_is_rebuilt(self) -> None:
        """★古い Python で作った置き場所が残っていると、直しても効かない。"""
        self.assertIn("venv --clear", self.code)

    def test_final_instructions_use_the_dedicated_place(self) -> None:
        """★案内が `python3 -m uizin_clipper` のままだと、入れた部品を使わない。

        venv に入れたのにシステムのPythonで起動したら `ModuleNotFoundError` になる。
        """
        self.assertIn("source .venv/bin/activate", self.text)

    def test_it_is_executable(self) -> None:
        self.assertTrue(SCRIPT.stat().st_mode & 0o111, "実行権限がありません")


if __name__ == "__main__":
    unittest.main()
