# EP13 — コピペ即実行プロンプト集

**共通ブロックは省略せず毎回貼る。**

---

## 0. 共通ブロック

### ポジティブ（全カット先頭）

```
anime style illustration, 2.5 head chibi character, flat illustration,
Studio Ghibli-like aesthetic, soft lighting, bright and cheerful,
high quality, detailed background, barefoot, red boxing gloves,
FLATUP GYM interior with star-pattern floor
```

### ネガティブ（全カット共通）

```
bad quality, blurry, distorted, 3D, realistic, photorealistic, adult,
wearing shoes, wearing socks, wearing earrings, long gloves with fingers,
CGI, octane render, illustration inconsistency, low quality,
watermark, text, signature, extra fingers, deformed hands,
violence, aggressive expression, scary atmosphere
```

---

## 1. キャラクター基準画像（最初に確定する）

### ミオ（基準）

```
[共通ポジティブ]
cute chibi girl, 8 years old, short black hair, earnest serious expression,
blue and purple color-block sporty shirt, red boxing gloves, barefoot,
standing straight facing camera, neutral pose, full body,
plain light background, character reference sheet
```

### ノア（基準）

```
[共通ポジティブ]
cute chibi girl, 8 years old, medium-length black hair, bright natural expression,
yellow and white color-block sporty shirt, red boxing gloves, barefoot,
standing straight facing camera, neutral pose, full body,
plain light background, character reference sheet

--- negative ---
[共通ネガティブ]
smug, arrogant, condescending, showing off
```

**注意**: ノアに `smug / arrogant` をネガティブで入れる。**「嫌味な天才」に見えた瞬間に本話は失敗する。** 悪意なく自然に上手い子でなければならない。

### 6方向ポーズ（各キャラ）

```
… facing front / facing left / facing right / three-quarter left /
three-quarter right / from behind
```

### キック動作ポーズ（EP13 固有・2種）

C01 と C07 の対比に使う。**同一アングルで 2 パターン**生成する。

```
【ぎこちない版（C01用）】
[共通ポジティブ]
cute chibi girl, 8 years old, blue and purple color-block shirt,
attempting a kick with stiff awkward form, balance slightly off,
body tense and uncoordinated, side view, full body,
plain light background

【滑らかな版（C07用）】
[共通ポジティブ]
cute chibi girl, 8 years old, blue and purple color-block shirt,
executing a kick with smooth confident form, good balance,
body relaxed and coordinated, side view, full body,
plain light background
```

**🔴 重要**: この 2 枚は**同じ seed・同じアングル・同じ画角**で生成する。違いは動きの質だけ。構図が変わると対比が伝わらない。

---

## 2. 本番カットプロンプト

### C05（★核ショット・6秒）

```
[共通ポジティブ]
cute chibi girl, 8 years old, short black hair,
expression transforming from surprise to peaceful realization,
eyes widening then softening, eyebrows gradually raising,
mouth transitioning from open surprise to a gentle knowing smile,
blue and purple color-block sporty shirt, red boxing gloves,
standing in soft golden morning-like light,
watching a translucent ghostly image of herself from six months ago,
the past self attempting the same kick with clumsier form,
golden warm light increasing throughout,
mascot figures visible in soft background,
moment of growth recognition and self-compassion,
subtle light effects suggesting inner awakening, loop capable

--- negative ---
[共通ネガティブ]
self-criticism, judgment, sadness, regret, pride, boastful
```

**注意**: `self-criticism / judgment` をネガティブに入れる。本話の気づきは**自分への優しさ**であって、過去の自分を否定することではない。

### C09（ノアが話しかける）

```
[共通ポジティブ]
two cute chibi girls in FLATUP GYM,
girl in blue and purple shirt standing with quiet satisfaction,
girl in yellow and white shirt approaching with a natural warm smile,
casual friendly moment between practice partners,
no condescension, genuine peer recognition,
warm golden evening light, star-pattern floor

--- negative ---
[共通ネガティブ]
smug, condescending, pitying, teaching, superior
```

### C10（最終シルエット・ループ可）

```
[共通ポジティブ]
FLATUP GYM gym interior at night, blue moonlight through windows,
star-pattern floor glowing with warm interior light,
silhouette of a chibi girl making a small fist pump gesture in the foreground,
understated victory pose, centered and grounded posture,
sharp silhouette edges catching moonlight,
mascot characters sitting in circle in background,
peaceful nighttime atmosphere, quiet sense of personal growth,
calm and serene mood, loop capable

--- negative ---
[共通ネガティブ]
dark and gloomy, lonely, sad atmosphere, triumphant, exaggerated celebration
```

**注意**: `triumphant / exaggerated` をネガティブに入れる。ガッツポーズは**小さい**。大きいと「勝った」話になり、本話の主題（自分の中の進歩）が崩れる。

---

## 3. i2v プロンプト（コピペ用）

### C05（6秒・ループ可）

```
camera: medium close-up of the girl's face, static
motion: minimal physical, expression is everything
face animation:
  0-1.5s eyes widen in surprise seeing her past self, eyebrows raise
  1.5-3s realization dawns, eyes brighten
  3-6s   entire face softens into a peaceful knowing smile
lighting: soft cool gray at start, warm golden through middle,
          soft golden-pink glow at end
breathing: stabilizes from anxious to calm and centered
body language: posture straightens, shoulders relax
tone: gentle growth awareness, self-compassion
NOT: self-criticism, judgment, pride
animation intensity: low
loop capability: FULL
```

### C01（対比・3秒）

```
camera: wide shot capturing both girls, static
motion: Noah executes a smooth confident kick combination (0.5s, fluid)
        Mio attempts the same kick, movement stiff and hesitant (1.5s)
contrast: fluid grace vs struggling awkwardness
facial expression: Noah confident and cheerful, Mio concentrated and struggling
background: other children clapping for Noah
tone: comparison made visible, NOT mockery, NOT bullying
animation intensity: medium
```

### C07（対比・2.5秒）

```
camera: ⚠️ SAME angle and framing as C01. Do not change the composition.
motion: Mio executes the same kick, now visibly smoother and more confident (1.5s)
posture: body control evident, movement fluid compared to C01
facial expression: focused but relaxed, quietly determined
tone: growth in action, personal best
animation intensity: medium
```

---

## 4. 生成順序

```
1. ミオ・ノアの基準画像を生成 → 人間承認
   → ノアが「嫌味」に見えないか必ず確認
2. キック動作ポーズ 2 種を同一 seed / 同一アングルで生成
   → 🔴 C01 と C07 の構図一致を確認
3. 6方向ポーズを生成 → 一貫性チェック
4. 720p プレビューで全10カットを生成
5. 承認後、本番解像度で再生成（seed 固定）
6. i2v 生成
7. 07_EDIT_DELIVERY.md のタイムラインで編集
   → 過去映像（C05）は編集側で 30% 透過・12fps 間引き
```

---

## 5. seed 管理

| カット | seed | 生成日 | 採用版 |
|---|---|---|---|
| ミオ基準 | — | — | — |
| ノア基準 | — | — | — |
| キック・ぎこちない版 | — | — | — |
| キック・滑らか版 | — | — | — |
| C05 | — | — | — |
| C09 | — | — | — |
| C10 | — | — | — |

**シリーズ最終話のため、ここで全話の seed が揃っているか確認する。** 次シリーズで同じキャラを再登場させる際に必要になる。
