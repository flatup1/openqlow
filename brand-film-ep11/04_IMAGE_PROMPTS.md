# EP11「となりに、いく。」— 画像生成プロンプト集

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
sad, depressed, wearing shoes, wearing earrings, long gloves with fingers, 
CGI, illustration inconsistency, low quality, watermark, text
```

---

## C01｜ダイが輪の外で一人立ち尽くす

### C01-A｜孤立するダイ（正面・緊張）

**用途**: S1 のメインカット  
**尺**: 4秒  
**カメラ**: ワイド（背景の対比を含む）

**プロンプト**
```
cute chibi boy, 8 years old, short black hair, extremely tense rigid expression, 
eyes wide with fear, mouth closed tightly, light gray shirt with light blue shorts, 
red boxing gloves clutched to chest, barefoot, standing alone in foreground, 
trembling slightly as if frozen, in FLATUP GYM gym with green-tinted star floor, 
warm greenish evening sunlight, background shows other chibi children happily 
practicing (blurred, far away), creating isolation effect, anxious and lonely 
atmosphere, anime style illustration, highlighting the contrast between Dai's 
solitude and the joyful training happening around him

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, adult
```

**テンプレート内容**
- ダイが画面手前で孤立している
- グローブを抱えて立っている（準備ができていない感じ）
- 背景には賑やかに練習する子どもたち（ぼかし）
- 夕光で緑系の色合い
- 孤立感を強調

---

## C02｜ユウが気づくが迷う

### C02-A｜踏み出しかけて引き込める（正面・迷い）

**用途**: S2 のメインカット  
**尺**: 4秒  
**カメラ**: ミディアム

**プロンプト**
```
cute chibi boy, 10 years old, short black hair, conflicted hesitant expression, 
eyebrows slightly furrowed with concern, eyes looking toward distant Dai, 
green and yellow color-block shirt, red boxing gloves, barefoot, standing with 
one foot slightly forward in the motion of stepping out, but body language shows 
pulling back, hand raised uncertainly, in FLATUP GYM gym with green star floor, 
warm evening light, moment of internal struggle between kindness and fear, 
anime style illustration, psychological hesitation visible in posture

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, adult
```

**テンプレート内容**
- ユウが半歩踏み出す
- 手が上がりかけている（話しかけようとする）
- 表情に迷いがある
- 背景にダイが見える

---

## C03｜ユウが自分の練習に戻る

### C03-A｜振り返りながら離れる（後ろ姿）

**用途**: S2 のコンテキスト・ショット  
**尺**: 4秒  
**カメラ**: ミディアム

**プロンプト**
```
cute chibi boy, 10 years old, green and yellow shirt, seen from behind, 
walking away slowly while looking back over shoulder with reluctant expression, 
red boxing gloves, barefoot, returning to own practice area, expression shows 
"後ろ髪を引かれる" (pulled back by a thought), hesitant step, in FLATUP GYM 
gym with green star floor, warm evening sunlight, moment of unresolved choice, 
anime style illustration, internal conflict visible in body language

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, adult
```

**テンプレート内容**
- ユウの後ろ姿が画面を離れる
- 振り返りながら（まだ心が残っている）
- 背景に遠ざかるダイが見える

---

## C04｜フラットちゃんが「私も最初はこわかった」

### C04-A｜円座のフラットちゃん（照れた表情）

**用途**: S3 のシーン  
**尺**: 5秒  
**カメラ**: ミディアム

**プロンプト**
```
cute chibi female character with ponytail, sitting in circle with boxing mitt 
character and other supporting items, warm gentle smile with slight embarrassment, 
rosy cheeks showing vulnerability, kind eyes, red boxing gloves, FLATUP GYM 
black t-shirt, barefoot, in nighttime FLATUP GYM with blue moonlight and warm 
interior light mixing, pink star floor glowing, peaceful circle gathering atmosphere, 
anime style illustration, sharing personal experience of fear with compassion

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, 
dark and gloomy, aggressive
```

**テンプレート内容**
- フラットちゃんが円座の中心にいる
- 少し照れた懐かしそうな表情
- 道具たちが聞き手として見える
- 月光と室内光のミックス

---

## C05｜ユウの気づき・第1段階

### C05-A｜象徴世界でユウが困った顔（クローズアップ）

**用途**: S4 のメインカット  
**尺**: 5秒  
**カメラ**: 中程度のクローズアップ

**プロンプト**
```
cute chibi boy, 10 years old, short black hair, confused and troubled expression, 
eyebrows furrowed, mouth small showing internal struggle, green and yellow shirt, 
red boxing gloves, barefoot, standing in featureless gray space with soft light, 
looking down slightly as if wrestling with a question, introspective and conflicted 
atmosphere, anime style illustration, close-up of upper body and face, 
moment of self-awareness dawning

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, adult, 
bright colors, busy background
```

**テンプレート内容**
- ユウが戸惑った表情
- 背景は灰色の空間
- フラットちゃんが背景ぼかしで見える
- 思考中の表現

---

## C06｜ユウが表情を軽くする（★核ショット・ループ可）

### C06-A｜「完璧でなくていい」で解放（象徴世界）

**用途**: S5 の最重要カット - **ループ可**  
**尺**: 6秒  
**カメラ**: ミディアム（顔から上半身）

**プロンプト**
```
cute chibi boy, 10 years old, short black hair, expression transforming from 
confusion to relief and lightness, eyebrows gradually rising, eyes brightening 
with realization, mouth slowly forming gentle smile, green and yellow sporty shirt, 
red boxing gloves, standing in featureless gray space gradually becoming warmer, 
soft golden morning-like light (warm beige and green glow) increasing throughout, 
standing with relaxed shoulders, moment of permission and courage blooming, 
anime style illustration, inspiring and hopeful atmosphere, 
subtle light effects suggesting enlightenment and freedom

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, adult
```

**テンプレート内容**
- ユウの表情が徐々に軽くなる
- 最初は困った表情 → 最後は少し笑顔
- 光が灰色から黄緑へ移行
- フラットちゃんが見守っている

### 🔴 核ショット（ここが本話の最重要）
- ユウが「完璧でなくていい」という許可を内面化
- 親切心にも勇気がいることを肯定される
- 「短い一言で大丈夫」という解放感が顔に表れる

---

## C07｜ユウがダイに近づく

### C07-A｜近づく瞬間（ミディアム）

**用途**: S6a のメインカット  
**尺**: 5秒  
**カメラ**: ミディアム

**プロンプト**
```
cute chibi boy, 10 years old, short black hair, nervous but determined expression, 
slight tension in shoulders, eyes looking directly at Dai, green and yellow shirt, 
red boxing gloves, barefoot, walking toward another chibi boy (gray/blue shirt), 
in FLATUP GYM gym with green star floor, warm soft evening sunlight, 
moment of courage in action, nervous energy mixed with kindness, 
anime style illustration, warm and gentle atmosphere

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, adult
```

**テンプレート内容**
- ユウがダイに近づく（数歩分の距離を詰める）
- 少し緊張した表情
- ダイが見えている

---

## C08｜ダイが喜びに変わる

### C08-A｜驚きから喜びへ（クローズアップ・表情遷移）

**用途**: S6b のリアクションカット  
**尺**: 5秒  
**カメラ**: クローズアップ（ダイの顔）

**プロンプト**
```
cute chibi boy, 8 years old, short black hair, expression transitioning from 
shock (wide eyes, open mouth) to joy (bright smile, glowing eyes), light gray 
shirt with light blue shorts, red boxing gloves, barefoot, receiving unexpected 
invitation, rosy cheeks showing sudden happiness and relief, in FLATUP GYM gym 
with green star floor, warm soft evening light, heartwarming moment of isolation 
ending, anime style illustration, joyful and relieved expression

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, adult
```

**テンプレート内容**
- ダイの表情が驚き → 喜びに変わる
- 目が輝く
- ほほが赤くなる（喜び）

---

## C09｜二人で準備運動（対等な位置関係）

### C09-A｜並んで準備運動する（ミディアム）

**用途**: S6 エンディング / 新しい関係の始まり  
**尺**: 5秒  
**カメラ**: ミディアム

**プロンプト**
```
two cute chibi boys, Yū (10 years old, green and yellow shirt) and Dai 
(8 years old, gray and blue shirt), standing side by side doing light warm-up 
exercises, both wearing red boxing gloves, barefoot, both looking calm and 
comfortable, equal positioning shows mutual acceptance, in FLATUP GYM gym with 
green star floor, warm soft golden evening sunlight, natural comfortable companionship, 
supportive atmosphere, anime style illustration, peaceful and warm tone

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, adult
```

**テンプレート内容**
- ユウとダイが並んでいる
- 同じポーズの準備運動をしている
- 対等な位置関係
- 背景は温かい夕光

---

## C10｜ラスト：夜のジム・シルエット（★ループ可）

### C10-A｜二人が並ぶ後ろ姿（最終ショット）

**用途**: S7 最終ショット - **ループ可**  
**尺**: 6秒  
**カメラ**: ワイド

**プロンプト**
```
FLATUP GYM gym interior at night, blue moonlight streaming through windows, 
green star floor glowing softly with warm interior light, boxing mitt character 
and ponytail female character (red boxing gloves) sitting in circle in middle, 
silhouettes of two chibi boys (Yū in green-yellow, Dai in gray-blue) with red 
boxing gloves standing together in foreground, soft warm interior light mixing 
with moonlight, peaceful nighttime gym atmosphere showing inheritance and growth, 
anime style illustration, calm and serene mood, sense of circle and community

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, 
dark and gloomy
```

**テンプレート内容**
- ジムの夜景全景
- 月光が差し込んでいる
- フラットちゃんと道具が円座で見守っている
- 手前にユウとダイが並んでいるシルエット
- 「優しさの継承」が表現される

---

## 生成フロー

### Step 1: 基準画像生成
- 各カット → 複数ポーズ/角度を生成
- 最も良いものを選択

### Step 2: バリエーション生成
- 表情・背景・照明の微調整版を生成

### Step 3: 最終セレクション
- 品質チェック後、最適なものをロック

---

## 品質チェックリスト

- [ ] 各キャラの顔が話を通じて一貫性がある
- [ ] グローブの赤色が統一されている
- [ ] ウェアの色が各キャラで正確に表現されている（ユウ緑黄、ダイ薄灰色淡青）
- [ ] 表情が話に応じた感情を正確に表現している
- [ ] 背景が各シーンの「場所」を正確に表現している
- [ ] 光の色合いが各シーンのムードを支えている（緑系 = 希望）
- [ ] キャラが3D感なく、アニメ風に見える
- [ ] 解像度が十分（1024×1024以上）
- [ ] テキストやウォーターマークがない
- [ ] ユウの迷い→勇気の表情遷移が見えるか
- [ ] ダイの孤立→喜びの表情遷移が見えるか

---

**次のステップ: VIDEO_PROMPTS.md で i2v（Image-to-Video）プロンプトを定義します。**

