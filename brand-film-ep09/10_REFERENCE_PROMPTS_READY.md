# EP09 — コピペ即実行プロンプト集

生成ツールにそのまま貼れる形。**共通ブロックは省略せず毎回貼る**（省略すると別人になる）。

---

## 0. 共通ブロック

### ポジティブ（全カット先頭に付ける）

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

**これを先に作って承認を取る。** 以後の全カットは、この画像を img2img 参照に使う。

### レン（基準）

```
[共通ポジティブ]
cute chibi boy, 8 years old, short spiky black hair, bright cheerful expression,
red and white color-block sporty shirt, red boxing gloves, barefoot,
standing straight facing camera, neutral pose, full body,
plain light background, character reference sheet
```

### ユズキ（基準）

```
[共通ポジティブ]
cute chibi boy, 8 years old, short neat black hair, calm gentle expression,
navy and yellow color-block sporty shirt, red boxing gloves, barefoot,
standing straight facing camera, neutral pose, full body,
plain light background, character reference sheet
```

### 6方向ポーズ（各キャラ）

上記の末尾を差し替えて 6 枚ずつ生成する。

```
… facing front / facing left / facing right / three-quarter left /
three-quarter right / from behind
```

---

## 2. 本番カットプロンプト

各カットの詳細は `04_IMAGE_PROMPTS.md`、動きは `05_VIDEO_PROMPTS.md` を参照。
ここでは**そのまま貼れる連結済み**の形を置く。

### C06-B（★核ショット）

```
[共通ポジティブ]
cute chibi boy, 8 years old, short spiky black hair,
determined serious expression, eyebrows lowered with resolve,
mouth set in quiet confidence, eyes bright and intelligent
filled with newfound understanding,
red and white color-block sporty shirt, red boxing gloves,
standing with quiet strength in soft golden morning-like light,
featureless gray space gradually warming to gold,
moment of personal transformation and growth,
subtle light effects suggesting enlightenment, loop capable

--- negative ---
[共通ネガティブ]
angry, furious, smug, prideful, victorious smirk
```

**注意**: `angry / smug` をネガティブに追加するのは本カットのみ。「怒り」や「勝ち誇り」に転ぶと本話のメッセージが壊れる。

### C10-B（最終シルエット）

```
[共通ポジティブ]
FLATUP GYM gym interior at night, blue moonlight through windows,
star-pattern floor glowing softly, warm interior light mixing,
silhouettes of two chibi boys standing side by side in foreground,
sharp silhouette edges catching moonlight,
mascot characters sitting in circle in background,
peaceful nighttime atmosphere, sense of mutual respect,
calm and serene mood, loop capable

--- negative ---
[共通ネガティブ]
dark and gloomy, lonely, sad atmosphere
```

---

## 3. i2v プロンプト（コピペ用）

### C06-B（3秒・ループ可）

```
camera: static close-up of the boy's upper body
motion: minimal physical movement, expression is everything
face animation:
  0-0.5s   eyes transition from wide to focused
  0.5-1.5s eyebrows settle into lowered determined position
  1.5-3s   mouth shifts from open to closed firm line (quiet resolve)
lighting: cool gray at start, warm golden at end (sunrise-like)
breathing: steady, deep, controlled
tone: quiet determination, NOT anger, NOT pride
animation intensity: low
loop capability: FULL
```

---

## 4. 生成順序

```
1. レン・ユズキの基準画像を生成 → 人間承認
2. 6方向ポーズを生成 → 一貫性チェック（02_QA_CHECKLIST.md §2）
3. 720p プレビューで全10カットを生成 → 構図確認
4. 承認後、本番解像度で再生成（seed 固定）
5. i2v 生成
6. 07_EDIT_DELIVERY.md のタイムラインで編集
```

**本番生成（課金）はステップ 4 から。それ以前で止められるように設計している。**

---

## 5. seed 管理

採用した seed をここに記録する（生成後に追記）。

| カット | seed | 生成日 | 採用版 |
|---|---|---|---|
| レン基準 | — | — | — |
| ユズキ基準 | — | — | — |
| C06-B | — | — | — |
| C10-B | — | — | — |

**seed を記録しないと、後日の差し替え生成で別人になる。**
