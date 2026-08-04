# EP11 — コピペ即実行プロンプト集

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

### ユウ（基準）

```
[共通ポジティブ]
cute chibi boy, 10 years old, short black hair, kind gentle expression,
green and yellow color-block sporty shirt, red boxing gloves, barefoot,
standing straight facing camera, neutral pose, full body,
plain light background, character reference sheet
```

**注意**: ユウは 10 歳。ダイ（8歳）より**わずかに背を高く**する。頭身は同じ 2.5 のまま、全身高で差をつける。

### ダイ（基準）

```
[共通ポジティブ]
cute chibi boy, 8 years old, short black hair, nervous uncertain expression,
gray and blue color-block sporty shirt, red boxing gloves, barefoot,
standing straight facing camera, neutral pose, full body,
plain light background, character reference sheet
```

### 6方向ポーズ

```
… facing front / facing left / facing right / three-quarter left /
three-quarter right / from behind
```

---

## 2. 本番カットプロンプト

### C01（ダイの孤立）

```
[共通ポジティブ]
cute chibi boy, 8 years old, short black hair, nervous uncertain expression,
gray and blue color-block sporty shirt, red boxing gloves, barefoot,
standing alone at the edge of the gym floor,
other children practicing together in the background, slightly out of focus,
soft cool light on the boy, warm light on the group behind,
gentle atmosphere, NOT dramatic, NOT tragic

--- negative ---
[共通ネガティブ]
crying, bullied, dramatic shadows, dark and gloomy, pitiful
```

**注意**: `pitiful / bullied` をネガティブに入れる。**「かわいそうな子」に見えた瞬間に本話は失敗する。** 孤立は彩度差だけで表し、影を足さない。

### C06（★核ショット・6秒）

```
[共通ポジティブ]
cute chibi boy, 10 years old, short black hair,
expression transforming from confusion to relief and lightness,
eyebrows gradually rising, eyes brightening with realization,
mouth slowly forming a gentle smile,
green and yellow color-block sporty shirt, red boxing gloves,
standing in featureless gray space gradually becoming warmer,
soft golden and green glow increasing throughout,
moment of permission and courage blooming,
inspiring and hopeful atmosphere, loop capable

--- negative ---
[共通ネガティブ]
forced smile, aggressive, determined-angry, tense
```

**注意**: 本話の核は「決意」ではなく「**軽くなる**」。EP09・EP10・EP12 の核ショットと違い、**力まない表情**にする。

### C08（ダイの喜び）

```
[共通ポジティブ]
cute chibi boy, 8 years old, short black hair,
expression transforming from surprise to bright genuine joy,
eyes widening then softening, mouth breaking into a real smile,
gray and blue color-block sporty shirt, red boxing gloves,
warm green and beige light washing over him,
the moment of being invited in, sense of relief and belonging
```

### C10（最終シルエット・ループ可）

```
[共通ポジティブ]
FLATUP GYM gym interior at night, blue moonlight through windows,
star-pattern floor glowing with warm yellow-green interior light,
silhouettes of two chibi boys standing close together in foreground,
doing warm-up exercises side by side,
mascot characters sitting in circle in background,
peaceful nighttime atmosphere, sense of companionship,
calm and serene mood, loop capable

--- negative ---
[共通ネガティブ]
dark and gloomy, lonely, sad atmosphere
```

---

## 3. i2v プロンプト（コピペ用）

### C06（6秒・ループ可）

```
camera: medium shot from face to chest, static
motion: minimal physical, expression is everything
face animation:
  0-1.5s eyes transition from troubled to understanding
  1.5-3s eyebrows gradually raising (realization and relief)
  3-6s   mouth forming a gentle smile, entire face showing lightness
lighting: cool gray at start, warm golden-green increasing throughout
breathing: shallow tense at start, deep and easy at end
tone: gentle, relieved, empowered
NOT: forced, aggressive, angry
animation intensity: low
loop capability: FULL
```

### C07（ユウが近づく・2.5秒）

```
camera: medium shot, slight follow as the boy walks
motion: taking 3-4 steps toward the isolated boy, slightly hesitant then steady
body language: shoulders relaxing as he commits to the action
facial expression: nervous but warm, a small smile forming
audio cue: footsteps only (BGM drops here in the edit)
tone: courage in a small ordinary act
animation intensity: medium
```

---

## 4. 生成順序

```
1. ユウ・ダイの基準画像を生成 → 人間承認（身長差を確認）
2. 6方向ポーズを生成 → 一貫性チェック
3. 720p プレビューで全10カットを生成 → C01 が「かわいそう」に見えないか確認
4. 承認後、本番解像度で再生成（seed 固定）
5. i2v 生成
6. 07_EDIT_DELIVERY.md のタイムラインで編集
```

---

## 5. seed 管理

| カット | seed | 生成日 | 採用版 |
|---|---|---|---|
| ユウ基準 | — | — | — |
| ダイ基準 | — | — | — |
| C01 | — | — | — |
| C06 | — | — | — |
| C08 | — | — | — |
| C10 | — | — | — |
