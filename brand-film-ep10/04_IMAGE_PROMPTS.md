# EP10「もって、くれてる。」— 画像生成プロンプト集

**生成ツール**: Flux / Hailuo Image 使用  
**出力形式**: 1カット = 複数バリエーション（正面、側面など）  
**品質**: 高解像度 1024×1024 以上推奨

---

## 共通ブロック（すべてのプロンプトに付加）

### ポジティブプロンプト共通要素

```
anime style illustration, 2.5 head chibi character, bright and cheerful, 
flat illustration, Studio Ghibli-like aesthetic, soft lighting, 
high quality, detailed background, no 3D, no photorealistic
```

### ネガティブプロンプト（共通）

```
bad quality, blurry, distorted, 3D, realistic, photorealistic, adult, 
aggressive, angry, wearing shoes, wearing earrings, long gloves with fingers, 
CGI, illustration inconsistency, low quality, watermark, text
```

---

## C01｜ハルナが連打、コウが腕を震わせながら支える

### C01-A｜ハルナの連打（正面・集中）

**用途**: S1 のメインカット  
**尺**: 4秒  
**カメラ**: ミディアム

**プロンプト**
```
cute chibi girl, 8 years old, short ponytail black hair, intense focused expression, 
eyebrows furrowed with concentration, bright determined eyes, pink and purple 
color-block shirt, red boxing gloves, barefoot, throwing rapid punches with 
high energy, dynamic pose with weight transfer visible, standing in FLATUP GYM 
gym with pink star floor, warm golden evening sunlight shining through windows, 
energetic and powerful expression, anime style illustration, soft pastel colors, 
detailed background showing gym equipment

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, adult
```

**テンプレート内容**
- 両手が連打のリズムで見える
- 目が輝く（集中）
- 足は肩幅で安定
- 背景に星型フロアと FLATUP GYM ロゴ
- 夕光で温かみのある色合い

---

### C01-B｜コウの震える腕でミット保持（側面・支える）

**用途**: S1 のコンテキスト・ショット  
**尺**: 4秒  
**カメラ**: ミディアム

**プロンプト**
```
cute chibi boy, 8 years old, short black hair, calm but strained expression, 
eyes focused, mouth slightly tight with effort, light purple shirt with gray shorts, 
red boxing gloves, barefoot, holding boxing mitt in front with visible trembling 
in arms (slight muscle strain visible), shoulders squared despite fatigue, 
standing in FLATUP GYM gym with pink star floor, warm golden evening sunlight, 
supportive posture, enduring quietly, anime style illustration, 
subtle tension visible but not exaggerated

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, adult, 
pained or angry expression
```

**テンプレート内容**
- 両手でミットを保持（中心に）
- 腕が微かに震えている（疲労の可視化）
- 表情は我慢している
- 背景は同じジム（同じシーン）
- 夕光で温かさ

---

## C02｜コウが腕をさする（疲労表現）

### C02-A｜腕をさするコウ（クローズアップ・疲労）

**用途**: S2 の労力可視化  
**尺**: 4秒  
**カメラ**: クローズアップ（腕と顔）

**プロンプト**
```
cute chibi boy, 8 years old, short black hair, expression transitioning 
from strain to relief, eyes slightly weary, mouth neutral with slight concern, 
light purple shirt, red boxing gloves, barefoot, rubbing right arm with left hand, 
massage motion visible, shoulders slightly dropped from fatigue, in FLATUP GYM 
gym with pink star floor, warm evening sunlight, moment of exhaustion after effort, 
anime style illustration, subtle exhaustion shown with sympathy, 
tender arm-rubbing gesture, bittersweet mood

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, adult
```

**テンプレート内容**
- 右腕をさすりながら、微かに困った表情
- 肩が落ちている（疲労）
- 背景には遠くハルナが水を飲みに行く
- 同じジムの空間だが、コウは孤立した感覚

---

## C03｜ハルナが振り向かずに去る（形だけの「ありがとう」）

### C03-A｜去るハルナの後ろ姿（後ろ向き）

**用途**: S2 のコンテキスト・ショット  
**尺**: 4秒  
**カメラ**: ミディアム

**プロンプト**
```
cute chibi girl, 8 years old, ponytail black hair, seen from behind, 
walking away with water bottle in hand, bright and refreshed expression (not turned), 
pink and purple color-block shirt, red boxing gloves, barefoot, 
walking toward water station with energy, not looking back at practice partner, 
in FLATUP GYM gym with pink star floor, warm evening sunlight, 
cheerful but oblivious to partner's exhaustion, anime style illustration, 
moment of unconscious insensitivity

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, adult, 
sad or guilty expression
```

**テンプレート内容**
- ハルナの後ろ姿が画面を離れる
- 水を飲みに行く仕草
- 振り向かない（相手を見ていない）
- 背景に落ち込むコウが見える（背景ぼかし）

---

## C04｜夜のジム・ミットとフラットちゃんの円座

### C04-A｜円座での会話（ミディアム）

**用途**: S3 のシーン  
**尺**: 5秒  
**カメラ**: ミディアム

**プロンプト**
```
cute chibi round boxing mitt character and cute female character with ponytail, 
sitting in circle in empty nighttime gym, soft gentle expressions, 
kind eyes, red boxing gloves on female character, FLATUP GYM black t-shirt, 
barefoot, sitting close together in companionship, in nighttime FLATUP GYM 
with blue moonlight streaming through windows, pink star floor glowing softly, 
peaceful and contemplative atmosphere, anime style illustration, 
warm supportive moment, wisdom-sharing scene

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, 
dark and gloomy, aggressive
```

**テンプレート内容**
- ミットとフラットちゃんが円座で座っている
- 表情は温かく、話し合っている感じ
- 背景は夜のジム全景
- 月光が入り込んでいる
- ミットは「持つのも疲れるんだよ」と話している

---

## C05｜象徴世界・ハルナが戸惑う

### C05-A｜戸惑ったハルナ（象徴世界・クローズアップ）

**用途**: S4 のメインカット  
**尺**: 5秒  
**カメラ**: 中程度のクローズアップ

**プロンプト**
```
cute chibi girl, 8 years old, ponytail black hair, confused and concerned expression, 
eyebrows slightly furrowed, small mouth showing worry, pink and purple shirt, 
red boxing gloves, barefoot, standing calmly in featureless gray space with soft light, 
looking down slightly as if in thought, introspective and worried atmosphere, 
anime style illustration, close-up of upper body and face, 
moment of realization dawning

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, adult, 
bright colors, busy background
```

**テンプレート内容**
- 背景は色のない灰色の空間
- ハルナが戸惑った表情で立っている
- フラットちゃんが背景ぼかしで見える（問い手）
- 顔のクローズアップで表情が明確に見える
- 思い出している様子が表現される

---

## C06｜ハルナの気づき（クローズアップ）

### C06-A｜「代わってない」と気づく瞬間

**用途**: S4b のクライマックス  
**尺**: 4秒  
**カメラ**: 極アップ（顔のみ）

**プロンプト**
```
cute chibi girl, 8 years old, ponytail black hair, realization dawning on face, 
eyes widening with surprise, eyebrows rising with concern, mouth forming 
small O shape showing realization, pink and purple shirt visible at bottom, 
red boxing gloves, in featureless gray space with soft light, 
moment of guilty insight and understanding, anime style illustration, 
dawning awareness that she made a mistake

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, adult, 
bright colors
```

**テンプレート内容**
- ハルナの顔だけが画面に
- 「ああ、コウの番を交代しなかった」という気づき
- 柔らかい灰色の背景
- 罪悪感が表現される

---

## C07｜決意の顔に変わる（★核ショット・ループ可）

### C07-A｜相手がいるから練習できる、という決意

**用途**: S5 の最重要カット - **ループ可**  
**尺**: 6秒  
**カメラ**: ミディアム（顔から上半身）

**プロンプト**
```
cute chibi girl, 8 years old, ponytail black hair, determined serious expression 
transforming from confusion to resolve, eyebrows lowered with understanding, 
mouth set in quiet confidence, bright intelligent eyes, pink and purple sporty shirt, 
red boxing gloves, surrounded by boxing mitt character and supportive female mentor, 
in soft golden morning-like light (warm beige and white glow), standing with quiet strength, 
moment of personal transformation understanding that others support her practice, 
anime style illustration, inspiring and hopeful atmosphere, 
subtle light effects suggesting enlightenment

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, adult, 
angry expression, dark colors
```

**テンプレート内容**
- **ポイント**: 「怒った顔」ではなく「相手への感謝が芽生えた顔」
- 顔のクローズアップで表情変化が明確に
- 背景は色のない灰色から、朝日のような柔らかい光へ移行
- フラットちゃんとミットが隣で見守っている
- **ループ推奨**: 同じ表情で 6 秒間見る（表情変化を強調）

### 🔴 核ショット（ここが本話の最重要）
- ハルナが「相手がいてくれるから、練習できる」という本質を理解
- 「自分本位」から「相手への感謝」への人格的変化
- 視聴者の心に「相手のおかげで、自分は成長できている」と思わせるカット

---

## C08｜翌日・ハルナがコウを見て挨拶

### C08-A｜顔を見て「お願いします」（ミディアム）

**用途**: S6a のメインカット  
**尺**: 5秒  
**カメラ**: ミディアム（ハルナとコウの対面）

**プロンプト**
```
cute chibi girl, 8 years old, ponytail black hair, serious focused expression, 
eyes looking directly at practice partner with sincerity, pink and purple shirt, 
red boxing gloves, barefoot, standing facing another chibi boy character 
(light purple and gray shirt), in FLATUP GYM gym with pink star floor, 
warm soft evening sunlight, respectful and sincere posture, 
speaking directly to partner with new awareness, anime style illustration, 
warm and heartfelt atmosphere

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, adult, 
mocking or dismissive expression
```

**テンプレート内容**
- ハルナがコウの顔をしっかり見ている
- コウは驚いた表情
- ハルナが「今日は私が持つね」と言っている
- 温かい夕光でジムが照らされている
- 対面構図で向き合う感覚

---

## C09｜役割交代・ハルナがミットを持つ

### C09-A｜ハルナのミット保持、コウのパンチ（ミディアム）

**用途**: S6b の実行シーン  
**尺**: 5秒  
**カメラ**: ミディアム（対等な位置関係）

**プロンプト**
```
two cute chibi children, girl (8 years old, ponytail, pink and purple shirt) 
holding boxing mitt, boy (8 years old, short hair, light purple shirt) 
throwing punch into mitt, both wearing red boxing gloves, barefoot, 
both looking focused and confident, equal positioning shows mutual respect, 
in FLATUP GYM gym with pink star floor, warm soft golden evening sunlight, 
natural supportive companionship, equal partnership atmosphere, 
anime style illustration, joyful and balanced tone

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, adult
```

**テンプレート内容**
- ハルナがミットを構えている（今度は支える側）
- コウがパンチを打っている（今度は打つ側）
- 対等な位置関係が見える
- 背景は温かい夕光
- 関係が修復・対等化した表現

---

## C10｜ラスト：夜のジム・シルエット（★ループ可）

### C10-A｜ジム全景 + マスコット + シルエット

**用途**: S7 最終ショット - **ループ可**  
**尺**: 6秒  
**カメラ**: ワイド

**プロンプト**
```
FLATUP GYM gym interior at night, blue moonlight streaming through windows, 
pink star floor glowing softly with warm interior light, round boxing mitt character 
and ponytail female character (red boxing gloves) sitting in circle in middle area, 
silhouettes of two chibi children (girl in pink-purple, boy in light purple-gray) 
with red boxing gloves in foreground, exchanging mitt-holding roles, soft warm 
interior light mixing with moonlight, peaceful nighttime gym atmosphere, 
anime style illustration, calm and serene mood, sense of growth and partnership

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, 
dark and gloomy
```

**テンプレート内容**
- ジムの夜景全景
- 月光が差し込んでいる
- フラットちゃんとミットが円座で見守っている
- 手前にハルナとコウが交代している後ろ姿シルエット
- シルエットなので、輪郭のはっきりさが大事
- **ループ推奨**: 最終メッセージの背景として静止

---

## 生成フロー

### Step 1: 基準画像生成

各カット → 複数ポーズ/角度（6方向）を生成

例）C01-A（ハルナの連打）
- 正面・斜め・側面などで複数パターン生成
- 最も良いものを選択

### Step 2: バリエーション生成

表情・背景・照明の微調整版を生成

例）C07（決意の顔）
- 表情の程度（強い決意 / 柔らかい決意）
- 背景光の強さ（明るめ / 薄め）
- キャラの大きさ（顔のみ / 上半身）

### Step 3: 最終セレクション

品質チェック後、最適なものをロック

---

## 品質チェックリスト

- [ ] 各キャラの顔が話を通じて一貫性がある（同じ子に見える）
- [ ] グローブの赤色が統一されている
- [ ] ウェアの色が各キャラで正確に表現されている（ハルナピンク紫、コウ薄紫グレー）
- [ ] 表情が話に応じた感情を正確に表現している
- [ ] 背景が各シーンの「場所」を正確に表現している（ジム / 灰色空間 / 月光など）
- [ ] 光の色合いが各シーンのムードを支えている
- [ ] キャラが3D感なく、アニメ風に見える
- [ ] 解像度が十分（1024×1024以上）
- [ ] テキストやウォーターマークがない
- [ ] ハルナの集中度が表現されているか（S1 > S4-5）
- [ ] コウの疲労度が見えるか（S1-2 で最高 > S6 で回復）

---

**次のステップ: VIDEO_PROMPTS.md で i2v（Image-to-Video）プロンプトを定義します。**

**注記**: このプロンプト集は Flux の標準設定を想定しています。  
Hailuo Image やその他の生成AIを使用する場合は、プロンプトの調整が必要な場合があります。

