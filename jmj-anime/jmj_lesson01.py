"""JMJ やさしい格闘技教材アニメ — レッスン1「構え → ジャブ」（試作）

使い方（画面なし）:
    blender -b --python jmj_lesson01.py -- --still out.png --frame 44
    blender -b --python jmj_lesson01.py -- --anim frames_dir
    （pip で入れた bpy なら: python jmj_lesson01.py --still out.png --frame 44）
Blender の画面の中で実行した場合は、今のシーンのコレクション「JMJ_Lesson01」に組み立てる。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jmj_core as core  # noqa: E402
from jmj_core import BOUNCE, CROSS, JAB, STANCE  # noqa: E402,F401

LESSON = {
    "collection": "JMJ_Lesson01",
    "number": 1,
    "title": "ジャブ",
    # (フレーム, ポーズ) の並び。30fps。
    "timeline": [
        (1, STANCE), (12, BOUNCE), (24, STANCE),
        (44, JAB), (64, JAB), (80, STANCE),                    # ゆっくり
        (96, STANCE), (100, JAB), (104, JAB), (112, STANCE),   # ふつうの速さ 1回目
        (124, STANCE), (128, JAB), (132, JAB), (140, STANCE),  # 2回目
        (150, STANCE),
    ],
    "end": 150,
    "labels": [("▶ ゆっくり", 24, 84), ("▶▶ ふつうの速さ", 94, 144)],
}

if __name__ == "__main__":
    core.main(LESSON)
