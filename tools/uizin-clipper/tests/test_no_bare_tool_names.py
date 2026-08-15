"""道具を「名前のまま」実行していないか、全モジュールを機械的に見張る。

★実機で出た（2026-08）。

    [probe] キャッシュを使用: .../probe.json
    エラー: [Errno 2] No such file or directory: 'ffmpeg'

`shellcmd.find_tool` は PATH に無くても `/opt/homebrew/bin` などを探すようにしてあり、
`shellcmd.run` はその結果（絶対パス）を使います。ところが一部のモジュールは
`subprocess` を直接呼んでおり、**`require_tool` で場所を調べておきながら
戻り値を捨てて、`"ffmpeg"` という名前のまま渡していました**。

    require_tool("ffmpeg")            # 場所は分かったのに捨てている
    argv = ["ffmpeg", "-v", ...]      # 名前のまま渡すので PATH 頼み

確認だけ通って実行で落ちる、という分かりにくい壊れ方です。しかも
「ffmpeg は入っています」と表示された直後に起きるので、原因が見えません。

同じ形に戻らないよう、`subprocess` を直接呼ぶ行の近くに裸の道具名が無いことを
ファイルの中身から確かめます。1か所直しても別の場所で再発する種類の間違いなので、
**個別のテストではなく全モジュールを一括で見張ります。**
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path

PACKAGE = Path(__file__).resolve().parent.parent / "uizin_clipper"
TOOLS = ("ffmpeg", "ffprobe", "yt-dlp")

# `shellcmd` 自身は道具名を扱うのが仕事なので対象外
EXCLUDED = {"shellcmd.py"}


def python_files() -> list[Path]:
    return [p for p in sorted(PACKAGE.rglob("*.py")) if p.name not in EXCLUDED]


class BareToolNameTest(unittest.TestCase):
    def test_require_tool_result_is_never_thrown_away(self) -> None:
        """★`require_tool("ffmpeg")` の戻り値を捨てないこと。

        捨てると「場所は分かったのに名前のまま渡す」形になり、PATH 頼みに戻る。
        """
        offenders = []
        for path in python_files():
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                stripped = line.strip()
                if re.fullmatch(r'require_tool\("[^"]+"\)', stripped):
                    offenders.append(f"{path.name}:{number}  {stripped}")

        self.assertEqual(
            offenders,
            [],
            "require_tool の戻り値を使ってください（変数に受けて argv[0] に渡す）:\n"
            + "\n".join(offenders),
        )

    def test_direct_subprocess_calls_do_not_use_bare_names(self) -> None:
        """★`subprocess` を直接呼ぶモジュールが、裸の道具名を渡していないこと。

        `shellcmd.run` を通すなら中で場所を解決するので問題ない。
        直接呼ぶ場合は、呼ぶ側が解決しなければならない。
        """
        offenders = []
        for path in python_files():
            text = path.read_text(encoding="utf-8")
            if "subprocess." not in text:
                continue
            for number, line in enumerate(text.splitlines(), 1):
                if line.lstrip().startswith("#"):
                    continue
                for tool in TOOLS:
                    if f'"{tool}",' in line or f"'{tool}'," in line:
                        offenders.append(f"{path.name}:{number}  {line.strip()}")

        self.assertEqual(
            offenders,
            [],
            "subprocess を直接呼ぶ場所で道具名をそのまま渡しています。\n"
            "require_tool の戻り値（絶対パス）を使ってください:\n" + "\n".join(offenders),
        )

    def test_the_check_would_catch_the_real_bug(self) -> None:
        """このテスト自体が効くことの確認（実際に出た形を検出できるか）。"""
        broken = 'import subprocess\nrequire_tool("ffmpeg")\nargv = ["ffmpeg", "-v", "error"]\n'

        found = [line for line in broken.splitlines() if '"ffmpeg",' in line]
        thrown_away = [
            line for line in broken.splitlines()
            if re.fullmatch(r'require_tool\("[^"]+"\)', line.strip())
        ]

        self.assertTrue(found, "裸の道具名を検出できていません")
        self.assertTrue(thrown_away, "戻り値の捨て忘れを検出できていません")


if __name__ == "__main__":
    unittest.main()
