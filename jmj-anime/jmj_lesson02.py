"""JMJ やさしい格闘技教材アニメ — レッスン2「ワンツー（ジャブ → ストレート）」（試作）

使い方は jmj_lesson01.py と同じ。
    blender -b --python jmj_lesson02.py -- --still out.png --frame 66
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jmj_core as core  # noqa: E402
from jmj_core import BOUNCE, CROSS, JAB, STANCE  # noqa: E402,F401

LESSON = {
    "collection": "JMJ_Lesson02",
    "number": 2,
    "title": "ワンツー",
    # (フレーム, ポーズ) の並び。30fps。
    "timeline": [
        (1, STANCE), (12, BOUNCE), (22, STANCE),
        (38, JAB), (48, JAB), (66, CROSS), (82, CROSS), (100, STANCE),       # ゆっくり
        (114, STANCE), (118, JAB), (120, JAB), (126, CROSS), (130, CROSS), (140, STANCE),  # ふつうの速さ 1回目
        (150, STANCE), (154, JAB), (156, JAB), (162, CROSS), (166, CROSS), (176, STANCE),  # 2回目
        (186, STANCE),
    ],
    "end": 186,
    "labels": [("▶ ゆっくり", 22, 104), ("▶▶ ふつうの速さ", 112, 180)],
}

if __name__ == "__main__":
    core.main(LESSON)
