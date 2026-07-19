# 成果物4: シーンごとの画像生成プロンプト

- すべて縦型 **9:16**(ツールの縦横比指定: `--ar 9:16` / "vertical 9:16" 等)で生成する
- 各プロンプトの `[STYLE]` `[NIGHT]` `[DAY]` `[CHILD]` 等は `03_ART_BIBLE.md` §5 の共通ブロックをそのまま貼る
- ネガティブプロンプトは全シーン共通(`05_VIDEO_PROMPTS.md` §3)
- 1シーン=1枚を基本に、S6・S7・S9 は表情/手元の当たり違いで2〜3枚生成して選ぶ

---

## S1: 閉館後のジム(夜・エスタブリッシング)

```text
[STYLE] [NIGHT]
Vertical 9:16. Wide shot of the empty gym at night seen from the entrance,
slowly inviting the viewer inside. Only one warm ceiling light remains on over
the heavy bags, the rest of the room in soft blue-grey darkness. Moonlight
through the large window. The round wall clock reads just past nine. The red
mitts and small white gloves rest still on the wooden shelf. Peaceful,
quiet end of a long day. No people.
```

日本語メモ: 「一日の終わり」の静けさ。怖さゼロ。時計を画面内に入れて針の音の根拠を作る。

## S2: 道具たちの目覚め

```text
[STYLE] [NIGHT] [MITTS] [GLOVES] [PINKBAG]
Vertical 9:16. Medium close shot of the wooden wall shelf. The red mitts tilt
very slightly as if waking up, the small white gloves are just beginning to
sit upright, and in the soft-focus background the neon-pink heavy bag sways
almost imperceptibly though there is no wind. Warm shelf-side lighting, the
rest of the gym dim behind. Gentle, magical but subtle — like the gym
remembering its day. No people, no faces on the objects.
```

日本語メモ: 動きの「途中」を静止画にする(起き上がりかけ)。Image-to-Video で動かしやすい。

## S3: 最初の会話

```text
[STYLE] [NIGHT] [MITTS] [GLOVES]
Vertical 9:16. Close shot at shelf height: the red mitts leaning gently toward
the small white gloves as if speaking to them, the gloves tilted a little in
response. Behind them, out of focus, the neon-pink heavy bag hangs in warm
light. Quiet conversational mood between two old friends. No faces, no mouths
— posture only.
```

日本語メモ: 「会話している空気」を傾きと距離だけで作る。口は絶対に描かせない。

## S4: 昼間の記憶へ(トランジション先) — 初めてのグローブ

```text
[STYLE] [DAY] [CHILD]
Vertical 9:16. Close-up on a small child's hands as an adult helps fasten a
slightly-too-big white kids' boxing glove onto one small hand. Bright soft
daylight, white floor bokeh background. The child's small fingers and the
clean white glove fill the frame. Tender, first-time feeling.
```

日本語メモ: 「手が小さく、グローブが大きい」が最重要。顔は入れない(手の記号性を立てる)。

トランジション用の中間画(夜→昼のオーバーラップ):

```text
[STYLE] [PINKBAG]
Vertical 9:16. Close shot of the neon-pink heavy bag surface: on its left side
the cool quiet light of night, on its right side warm bright daylight bleeding
in, as if a memory of the daytime is surfacing on the bag. Dreamlike but
subtle double-exposure feeling.
```

## S5: 不安 — 振り返って母を見る

```text
[STYLE] [DAY] [CHILD] [MOTHER]
Vertical 9:16. Over-the-shoulder shot from slightly behind the child, at the
child's eye level. The child has stopped mid-practice, gloves lowered, looking
back anxiously toward the mother sitting on the wooden bench in the soft-focus
background. The mother's warm presence is visible but not sharp. Nobody is
rushing the child. Quiet, honest moment of hesitation.
```

日本語メモ: 子どもの背中越し+奥にボケた母。不安は「グローブを下げた姿勢」で表現、泣き顔にしない。

## S6: 親のうなずき

```text
[STYLE] [DAY] [MOTHER]
Vertical 9:16. Medium close-up of the mother on the wooden bench, seen from
the child's point of view. She meets the child's eyes and gives one small,
calm, reassuring nod — a gentle almost-smile, saying "it's okay" without
words. Hands resting on a folded towel on her lap. Soft window light on her
face. Warm, understated, no tears.
```

日本語メモ: 感動芝居にしない。「静かなうなずき」一択。膝のタオルはS9への伏線。

切り返し(子の表情):

```text
[STYLE] [DAY] [CHILD]
Vertical 9:16. Close-up of the child's face softening with relief after seeing
the mother's nod — a small breath out, eyes steadying, a tiny nod back.
Subtle expression change only, no big smile yet.
```

## S7: もう一度の一歩

```text
[STYLE] [DAY] [CHILD] [COACH]
Vertical 9:16. Side shot at the child's eye level: the female instructor
kneeling low, holding the red-and-white curved mitts open at the child's chest
height, waiting patiently with a warm smile. The child, one small step
forward, touches a light gentle punch onto the mitt. The contact is soft —
this is about trying again, not about technique or power. Bright encouraging
daylight.
```

日本語メモ: パンチは「触れる」程度。腰の入ったフォームを描かせない。インストラクターは膝立ちで子より低く。

## S8: 笑顔 — 母のもとへ

```text
[STYLE] [DAY] [CHILD] [MOTHER]
Vertical 9:16. The child, slightly sweaty and glowing with a small proud
smile, walks back toward the mother rising gently from the bench with open
posture. Seen from behind the mother's shoulder. Modest happiness — no victory
pose, no high-five, just quiet satisfaction and relief. Warm late-afternoon
light beginning.
```

## S9: 手 — グローブを外す

```text
[STYLE] [DAY] [CHILD] [MOTHER]
Vertical 9:16. Extreme close-up: the white kids' glove slips off, revealing
the child's small bare hand. The mother's hand enters frame offering a soft
towel; for one moment the small hand and the mother's hand touch. Shallow
depth of field, warm light, the touch of hands as the emotional center.
```

日本語メモ: 本編45秒版はここまで。60秒版のみ「少し成長した手」を1.5秒以内で重ねる(別画像):

```text
[STYLE] [DAY]
Vertical 9:16. The same framing as the previous shot, but the child's hand is
now a few years older and slightly bigger, gently overlapping/dissolving with
the small hand — a quiet visual metaphor of time passing. Subtle, dreamlike,
not explanatory.
```

## S10: 帰り道

```text
[STYLE] [CHILD] [MOTHER]
Vertical 9:16. Early evening, warm golden light. Exit of the gym: the child
walks a little ahead carrying their small bag, the mother a step behind
watching the child's back with a soft expression. Seen from behind both, the
warm gym light glowing in the doorway behind them. Everyday tenderness,
returning to ordinary life.
```

日本語メモ: 「親の背中」テーマの反転(親が子の背中を見る)。手つなぎ版も1枚生成してA/B用に保持。

## S11: 再び夜 — 道具たちの回想

```text
[STYLE] [NIGHT] [MITTS] [GLOVES] [PINKBAG]
Vertical 9:16. Back in the quiet night gym. Wider shot than Scene 3: the red
mitts and small white gloves on the shelf in warm lamplight, the neon-pink
heavy bag swaying very gently, all three "looking" toward the empty center of
the gym where the day happened. Nostalgic, warm, softly proud mood. No people,
no faces.
```

## S12: ラスト — 照明が消える

```text
[STYLE] [NIGHT] [MITTS] [GLOVES] [PINKBAG]
Vertical 9:16. The last warm ceiling light is fading out over the gym. The
mitts, gloves and pink bag settle back into perfect stillness, silhouettes in
the deepening dark, moonlight through the window remaining. Peaceful goodnight
feeling — the gym going to sleep, gently waiting for tomorrow. No people.
```

日本語メモ: 完全な黒には落とさない(月明かりを残す)。ロゴ・コピーは編集で載せるため画には入れない。

---

## 生成順序の推奨

1. キャラクターシート+内装基準画像(`03_ART_BIBLE.md` §7)→ オーナー承認
2. 夜シーン一式(S1→S2→S3→S11→S12)— 同一セッション/同一参照で連続生成し照明を揃える
3. 昼シーン一式(S4→S5→S6→S7→S8→S9→S10)— 同上
4. トランジション画(S4前の中間画)
5. 全カットを並べて一貫性チェック(`05_VIDEO_PROMPTS.md` §4)
