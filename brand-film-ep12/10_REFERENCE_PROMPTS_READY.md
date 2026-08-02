# EP12 — コピペ即実行プロンプト集

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

### レイ（基準）

```
[共通ポジティブ]
cute chibi boy, 8 years old, short black hair, thoughtful cautious expression,
purple and blue color-block sporty shirt, red boxing gloves, barefoot,
standing straight facing camera, neutral pose, full body,
plain light background, character reference sheet
```

### 6方向ポーズ

```
… facing front / facing left / facing right / three-quarter left /
three-quarter right / from behind
```

### 構えポーズ（EP12 固有・追加で必要）

```
[共通ポジティブ]
cute chibi boy, 8 years old, purple and blue color-block shirt,
taking a ready stance for a jump kick, knees slightly bent,
weight on the back foot, arms up in guard position,
side view and three-quarter view, full body,
plain light background, character reference sheet
```

**このポーズは C08・C10 で使う。基準画像として先に確定させる。**

---

## 2. 本番カットプロンプト

### C07（★核ショット・6秒）

```
[共通ポジティブ]
cute chibi boy, 8 years old, short black hair,
expression transforming from anxiety to quiet resolve,
eyebrows setting into a determined position,
eyes brightening with understanding, mouth settling to calm focus,
purple and blue color-block sporty shirt, red boxing gloves,
standing with centered posture in featureless gray space gradually warming,
soft golden-purple light increasing throughout,
moment of courage redefinition,
supportive mascot figures visible in background,
subtle light effects suggesting enlightenment, loop capable

--- negative ---
[共通ネガティブ]
angry, aggressive, gritted teeth, forced, straining, fearless
```

**注意**: `fearless` をネガティブに入れる。本話の勇気は「恐怖がなくなること」ではない。**恐怖を抱えたままの静かな決意**でなければ主題が崩れる。

### C09（🔴 最重要・着地を描かない）

```
[共通ポジティブ]
cute chibi boy, 8 years old, purple and blue color-block sporty shirt,
red boxing gloves, barefoot,
captured mid-jump in a dynamic pose, body suspended in the air,
legs and arms extended in kick position,
FLATUP GYM interior with star-pattern floor, purple-tinted light,
moment of committed action, focused expression

⚠️ CRITICAL: Show ONLY the airborne phase.
Do NOT show landing. Do NOT show the floor contact.
Do NOT show whether the kick succeeds or fails.
The image must be cut at the apex of the jump or mid-air.

--- negative ---
[共通ネガティブ]
landing, feet on ground, falling, success, failure, celebration,
disappointment, audience reaction
```

**運用ルール**: 生成物に着地が写り込んでいたら、**トリミングせずに再生成する**。トリミングで対応すると、後の差し替え時に着地版が混入する事故が起きる。

### C10（最終シルエット・ループ可）

```
[共通ポジティブ]
FLATUP GYM gym interior at night, blue moonlight through windows,
star-pattern floor glowing with warm purple interior light,
silhouette of a chibi boy in a ready jump-kick stance in the foreground,
balanced and committed posture, shoulders back,
sharp silhouette edges catching moonlight,
mascot characters sitting in circle in background,
peaceful nighttime atmosphere, quiet strength and courage,
calm and serene mood, loop capable

--- negative ---
[共通ネガティブ]
dark and gloomy, lonely, sad atmosphere
```

---

## 3. i2v プロンプト（コピペ用）

### C07（6秒・ループ可）

```
camera: medium shot from face to chest, static
motion: minimal physical, expression is everything
face animation:
  0-2s eyes transition from anxious to understanding
  2-4s eyebrows setting into a determined position
  4-6s mouth and entire face showing quiet resolve
lighting: cool gray at start, warm golden-purple through middle,
          soft purple-blue glow at end
breathing: anxious at start, calm and centered at end
body language: shoulders relax as understanding settles, posture straightens
tone: calm, centered, grounded
NOT: aggressive, angry, fearless
animation intensity: low
loop capability: FULL
```

### C09（2.5秒・🔴 着地なし）

```
camera: medium shot capturing the jump
motion: explosive jump initiating the kick, body suspended briefly
timing: capture ONLY the initial jump phase
⚠️ STOP the clip before landing occurs.
⚠️ The final frame must be mid-air.
facial expression: focused, committed
tone: action taken, result unknown and irrelevant
animation intensity: high, but cut before resolution
loop capability: NONE (do not loop — looping implies repetition of the result)
```

---

## 4. 生成順序

```
1. レイの基準画像 + 構えポーズを生成 → 人間承認
2. 6方向ポーズを生成 → 一貫性チェック
3. 720p プレビューで全10カットを生成
   → 🔴 C09 に着地が写っていないか、全フレーム確認
4. 承認後、本番解像度で再生成（seed 固定）
5. i2v 生成 → 🔴 C09 の最終フレームが空中か再確認
6. 07_EDIT_DELIVERY.md のタイムラインで編集
```

---

## 5. seed 管理

| カット | seed | 生成日 | 採用版 |
|---|---|---|---|
| レイ基準 | — | — | — |
| レイ・構え | — | — | — |
| C07 | — | — | — |
| C09 | — | — | — |
| C10 | — | — | — |
