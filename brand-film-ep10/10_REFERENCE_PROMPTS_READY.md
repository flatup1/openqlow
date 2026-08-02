# EP10 — コピペ即実行プロンプト集

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

### ハルナ（基準）

```
[共通ポジティブ]
cute chibi girl, 8 years old, black hair in a ponytail, bright focused expression,
pink and purple color-block sporty shirt, red boxing gloves, barefoot,
standing straight facing camera, neutral pose, full body,
plain light background, character reference sheet
```

### コウ（基準）

```
[共通ポジティブ]
cute chibi boy, 8 years old, short soft black hair, calm gentle expression,
light purple and gray color-block sporty shirt, red boxing gloves, barefoot,
standing straight facing camera, neutral pose, full body,
plain light background, character reference sheet
```

### 6方向ポーズ

上記末尾を差し替えて 6 枚ずつ生成。

```
… facing front / facing left / facing right / three-quarter left /
three-quarter right / from behind
```

### ミット保持ポーズ（EP10 固有・追加で必要）

```
[共通ポジティブ]
cute chibi boy, 8 years old, light purple and gray shirt,
holding boxing mitts up with both arms extended forward,
arms slightly trembling from strain, side view, full body,
plain light background, character reference sheet
```

**このポーズは C01-B・C02 で繰り返し使う。基準画像として先に確定させる。**

---

## 2. 本番カットプロンプト

### C07（★核ショット・6秒）

```
[共通ポジティブ]
cute chibi girl, 8 years old, black hair in a ponytail,
expression transitioning from confusion to resolve,
eyebrows lowered with understanding, mouth set in quiet confidence,
bright intelligent eyes filled with gratitude,
pink and purple color-block sporty shirt, red boxing gloves,
standing with quiet strength in soft golden-pink morning-like light,
featureless gray space gradually warming,
boxing mitt mascot and supportive mentor visible in background,
moment of realizing that others support her practice,
subtle light effects suggesting enlightenment, loop capable

--- negative ---
[共通ネガティブ]
guilty, ashamed, crying, self-blaming
```

**注意**: `guilty / ashamed` をネガティブに入れる理由 — ハルナが「悪いことをした子」に見えると、本話が説教になる。**気づきであって反省ではない。**

### C09（役割交代）

```
[共通ポジティブ]
two cute chibi children in FLATUP GYM,
girl with ponytail in pink and purple shirt holding boxing mitts up,
boy in light purple and gray shirt punching the mitts,
roles reversed from earlier scene, both smiling naturally,
warm pink evening light, star-pattern floor,
sense of mutual support and partnership
```

### C10（最終シルエット・ループ可）

```
[共通ポジティブ]
FLATUP GYM gym interior at night, blue moonlight through windows,
star-pattern floor glowing with warm pink interior light,
silhouettes of two chibi children in foreground, switching positions,
one holding mitts, one punching, motion of exchange,
mascot characters sitting in circle in background,
peaceful nighttime atmosphere, sense of gratitude,
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
  0-1s   eyes transition from worried to understanding
  1-2s   eyebrows settle into lowered position (empathy and resolve)
  2-3s   mouth transitions from open to gentle close
  3-6s   full face glow of realization
lighting: cool gray at start, gradual warm golden-pink through middle,
          soft golden-pink glow at end
breathing: steady, calm, centered
tone: gratitude and resolve, NOT guilt, NOT apology
animation intensity: low
loop capability: FULL
```

### C01-B（コウの腕の震え・2.5秒）

```
camera: side view, static
motion: arms holding mitts, subtle trembling from strain (2-3Hz, small amplitude)
body: absorbing impact from each punch, slight backward push per hit
facial expression: enduring, patient, not complaining
tone: quiet effort, invisible labor
animation intensity: low-medium
```

**震えの振幅を大きくしない。** 大きいとコミカルになり、労力の重さが消える。

---

## 4. 生成順序

```
1. ハルナ・コウの基準画像 + ミット保持ポーズを生成 → 人間承認
2. 6方向ポーズを生成 → 一貫性チェック
3. 720p プレビューで全10カットを生成 → 構図確認
4. 承認後、本番解像度で再生成（seed 固定）
5. i2v 生成
6. 07_EDIT_DELIVERY.md のタイムラインで編集
```

---

## 5. seed 管理

| カット | seed | 生成日 | 採用版 |
|---|---|---|---|
| ハルナ基準 | — | — | — |
| コウ基準 | — | — | — |
| コウ・ミット保持 | — | — | — |
| C07 | — | — | — |
| C10 | — | — | — |
