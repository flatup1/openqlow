# EP09「かった、から、こそ。」— 画像生成プロンプト集

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
serious, sad, angry, wearing shoes, wearing earrings, long gloves with fingers, 
CGI, illustration inconsistency, low quality, watermark, text
```

---

## C01｜試合直後・レンがガッツポーズで喜ぶ

### C01-A｜レンのガッツポーズ（正面）

**用途**: S1 のメインカット  
**尺**: 2秒  
**カメラ**: ミディアム

**プロンプト**
```
cute chibi boy, 8 years old, short spiky black hair, huge bright smile, 
wide open happy eyes, red and white sporty color-block shirt, red boxing gloves, 
barefoot, performing a victorious fist pump pose with both arms raised high, 
standing in FLATUP GYM gym with pink star floor, warm golden evening sunlight 
shining through windows, energetic and joyful expression, anime style illustration, 
soft pastel colors, detailed background showing gym equipment and logo

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, adult
```

**テンプレート内容**
- 両手を上に、グローブが見える
- 足は開き気味で安定感
- 背景に星型フロアと FLATUP GYM ロゴ
- 夕光で温かみのある色合い

---

### C01-B｜ユズキが静かに去る（側面・左）

**用途**: S1 のバックグラウンドカット  
**尺**: 2秒  
**カメラ**: ミディアム

**プロンプト**
```
cute chibi boy, 8 years old, short black hair, quiet downward gaze, 
calm sad expression, navy blue shirt with yellow shorts, red boxing gloves, 
barefoot, walking away slowly from foreground, shoulders slightly dropped, 
in FLATUP GYM gym with pink star floor, warm golden evening sunlight, 
foreground has another chibi boy celebrating (slightly blurred), 
anime style illustration, melancholic but gentle atmosphere

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, adult
```

**テンプレート内容**
- ユズキが画面奥へ歩いている
- 肩が落ちている
- 背景奥にレンが喜んでいる（少しボケ気味）
- 同じ夕光だが、ユズキの周りは暗めに見える

---

## C04｜象徴世界・レン + フラットちゃん

### C04-A｜レンが戸惑った表情で立つ

**用途**: S4a のメインカット  
**尺**: 3秒  
**カメラ**: クローズアップ（レンの上半身）

**プロンプト**
```
cute chibi boy, 8 years old, short black hair, worried confused expression, 
eyebrows slightly furrowed, small mouth showing uncertainty, red and white shirt, 
red boxing gloves, barefoot, standing calmly in featureless gray space, 
soft gentle lighting, introspective and thoughtful atmosphere, 
anime style illustration, close-up of upper body

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, adult, 
bright colors, busy background
```

**テンプレート内容**
- 背景は色のない灰色の空間
- レンだけが画面中央
- 顔のクローズアップで表情が明確に見える
- フラットちゃんは背景ぼかしで存在感程度

---

### C04-B｜フラットちゃんが優しく問いかけ

**用途**: S4b のバックアップカット  
**尺**: 2秒  
**カメラ**: ミディアム

**プロンプト**
```
cute chibi female character, warm gentle smile, kind eyes, black ponytail, 
red boxing gloves, FLATUP GYM black t-shirt, barefoot, standing beside young boy, 
speaking kindly with open palm gesture, in featureless gray symbolic space, 
soft golden light, supportive mentor role, anime style illustration, 
compassionate and warm atmosphere

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, adult
```

**テンプレート内容**
- フラットちゃんと レンがミディアム2ショット
- フラットちゃんは優しい笑顔で近づく
- 背景は同じ灰色空間

---

## C06｜核ショット: レンの表情が変わる

### C06-A｜「見てなかったかも」と気づく

**用途**: S4b のクローズアップ  
**尺**: 1秒  
**カメラ**: 極アップ（顔のみ）

**プロンプト**
```
cute chibi boy, 8 years old, short spiky black hair, realization dawning 
on face, eyes widening slightly, eyebrows rising with surprise, 
mouth forming small o shape, red and white shirt visible at bottom, 
red boxing gloves, in featureless gray space with soft light, 
moment of insight and awakening, anime style illustration

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, adult, 
bright colors
```

**テンプレート内容**
- レンの顔だけが画面に
- 「はっ」とした瞬間の表情
- 柔らかい灰色の背景

---

### C06-B｜決意の顔に変わる（核ショット）

**用途**: S5 の最重要カット - **ループ可**  
**尺**: 3秒  
**カメラ**: クローズアップ（顔から上半身）

**プロンプト**
```
cute chibi boy, 8 years old, short black hair, determined serious expression, 
eyebrows lowered with resolve, mouth set in quiet confidence, bright 
intelligent eyes, red and white sporty shirt, red boxing gloves, 
in soft golden morning-like light (warm beige and white glow), 
standing with quiet strength, moment of personal transformation and growth, 
anime style illustration, inspiring and hopeful atmosphere, 
subtle light effects suggesting enlightenment

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, adult, 
angry expression, dark colors
```

**テンプレート内容**
- **ポイント**: 「怒った顔」ではなく「静かな決意」
- 顔のクローズアップで表情変化が明確に
- 背景は色のない灰色から、朝日のような柔らかい光へ移行
- **ループ推奨**: 同じ表情で 3 秒間見る（表情変化を強調）

---

## C07｜翌日・レンが構える

### C07-A｜レンが照れながら真剣に話しかける

**用途**: S6a のメインカット  
**尺**: 2.5秒  
**カメラ**: ミディアム

**プロンプト**
```
cute chibi boy, 8 years old, short spiky black hair, shy serious expression, 
slight blush on cheeks, eyes looking directly forward with sincerity, 
red and white shirt, red boxing gloves, barefoot, standing in 
FLATUP GYM gym with pink star floor, warm soft evening sunlight, 
approaching another chibi boy character (navy blue shirt), respectful 
and apologetic but determined posture, anime style illustration, 
warm and heartfelt atmosphere

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, adult, 
angry or mocking expression
```

**テンプレート内容**
- レンが前に進んでいる感覚
- ユズキが視野に入っている
- 温かい夕光でジムが照らされている

---

### C07-B｜ユズキが驚いた顔から嬉しそうに

**用途**: S6b のリアクションカット  
**尺**: 2.5秒  
**カメラ**: クローズアップ（ユズキの顔）

**プロンプト**
```
cute chibi boy, 8 years old, short black hair, expression transitioning 
from surprise (wide eyes, open mouth) to joy (bright smile, glowing eyes), 
navy blue shirt with yellow shorts, red boxing gloves, barefoot, 
receiving praise, rosy cheeks showing happiness, in FLATUP GYM gym 
with pink star floor, warm soft evening light, heartwarming moment, 
anime style illustration, joyful and relieved expression

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, adult, 
sad or angry expression
```

**テンプレート内容**
- **ポイント**: 時間経過で表情が変わる（驚き → 喜び）
- 顔のクローズアップで感情が明確に
- 背景は同じ夕光のジム

---

## C09｜レン + ユズキが並んで練習する後ろ姿

### C09-A｜二人が並んで立つ・ミディアム

**用途**: S6 エンディング / S7 への遷移  
**尺**: 2秒  
**カメラ**: ミディアム

**プロンプト**
```
two cute chibi boys standing side by side in FLATUP GYM gym, 
one in red and white shirt (right), one in navy and yellow shirt (left), 
both wearing red boxing gloves, barefoot, both looking forward with 
calm focused expressions, pink star floor visible, warm soft golden 
evening sunlight, natural comfortable companionship, friendly atmosphere, 
anime style illustration, peaceful and warm tone

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, adult, 
confrontational or angry expression
```

**テンプレート内容**
- レンとユズキが並んでいる
- 関係が修復されたことが表現される
- 背景は温かい夕光

---

## C10｜ラスト: 夜のジム・シルエット

### C10-A｜ジム全景 + フラットちゃん + ミット

**用途**: S7a のバックグラウンド  
**尺**: 3秒  
**カメラ**: ワイド

**プロンプト**
```
FLATUP GYM gym interior at night, blue moonlight streaming through windows, 
pink star floor glowing softly, round punching bag character (beige chibi) 
and ponytail female character (red boxing gloves) sitting in circle in 
foreground, soft warm interior light mixing with moonlight, peaceful 
nighttime gym atmosphere, anime style illustration, calm and serene mood

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, 
dark and gloomy
```

**テンプレート内容**
- ジムの夜景
- 月光が差し込んでいる
- フラットちゃんとミットが見える

---

### C10-B｜レン + ユズキのシルエット（重ね合わせ用）

**用途**: S7 最終ショット - **ループ可**  
**尺**: 3秒  
**カメラ**: シルエット

**プロンプト**
```
silhouettes of two cute chibi boys standing together facing forward, 
one in red and white shirt (right), one in navy and yellow shirt (left), 
both wearing red boxing gloves, in front of FLATUP GYM gym at night 
with blue moonlight, pink star floor, warm light from inside gym, 
hopeful and peaceful ending image, anime style illustration, 
glowing warm and cool light balance

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, adult, 
dark and gloomy atmosphere
```

**テンプレート内容**
- レンとユズキが後ろ姿で並んでいる
- ジムの背景が見える
- シルエットなので、影のコントラストが大事
- **ループ推奨**: 最終メッセージの背景として静止

---

## 生成フロー

### Step 1: 基準画像生成

各カット → 複数ポーズ/角度（6方向）を生成

例）C01-A（レンのガッツポーズ）
- 正面・斜め・側面などで複数パターン生成
- 最も良いものを選択

### Step 2: バリエーション生成

表情・背景・照明の微調整版を生成

例）C06-B（決意の顔）
- 表情の程度（強い決意 / 静かな決意）
- 背景光の強さ（明るめ / 薄め）
- キャラの大きさ（顔のみ / 上半身）

### Step 3: 最終セレクション

品質チェック後、最適なものをロック

---

## 品質チェックリスト

- [ ] 各キャラの顔が話を通じて一貫性がある（同じ子に見える）
- [ ] グローブの赤色が統一されている
- [ ] ウェアの色が各キャラで正確に表現されている（レン赤白、ユズキ紺黄）
- [ ] 表情が話に応じた感情を正確に表現している
- [ ] 背景が各シーンの「場所」を正確に表現している（ジム / 灰色空間 / 月光など）
- [ ] 光の色合いが各シーンのムードを支えている
- [ ] キャラが3D感なく、アニメ風に見える
- [ ] 解像度が十分（1024×1024以上）
- [ ] テキストやウォーターマークがない

---

**次のステップ: VIDEO_PROMPTS.md で i2v（Image-to-Video）プロンプトを定義します。**

**注記**: このプロンプト集は Flux の標準設定を想定しています。  
Hailuo Image やその他の生成AIを使用する場合は、プロンプトの調整が必要な場合があります。
