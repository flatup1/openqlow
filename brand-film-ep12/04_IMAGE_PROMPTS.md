# EP12「どきどき、しても。」— 画像生成プロンプト集

**生成ツール**: Flux / Hailuo Image 使用  
**品質**: 高解像度 1024×1024 以上推奨

---

## 共通ブロック

### ポジティブプロンプト共通要素

```
anime style illustration, 2.5 head chibi character, bright and cheerful, 
flat illustration, Studio Ghibli-like aesthetic, soft lighting, 
high quality, detailed background, no 3D, no photorealistic
```

### ネガティブプロンプト（共通）

```
bad quality, blurry, distorted, 3D, realistic, photorealistic, adult, 
wearing shoes, wearing earrings, long gloves with fingers, 
CGI, illustration inconsistency, low quality, watermark, text
```

---

## 主要カット

### C01｜レイがそわそわする（4秒）

**プロンプト**
```
cute chibi boy, 8 years old, short black hair, anxious fidgeting expression, 
eyes darting nervously, purple and blue color-block shirt, red boxing gloves, 
barefoot, standing uneasily with body slightly swaying, in FLATUP GYM gym 
with purple-tinted star floor, warm evening sunlight, nervous anticipation, 
anime style illustration
```

---

### C02｜後でいい？と小さく言う（4秒）

**プロンプト**
```
cute chibi boy, 8 years old, short black hair, hesitant expression, 
eyes looking down slightly, mouth small and uncertain, purple and blue shirt, 
red boxing gloves, barefoot, speaking quietly to unseen instructor, posture 
showing reluctance, in FLATUP GYM gym, soft evening light, moment of difficult 
choice, anime style illustration
```

---

### C04｜夜のジム・円座（5秒）

**プロンプト**
```
cute chibi sandbag character and female character with ponytail, sitting in 
circle, warm gentle expressions, in nighttime FLATUP GYM with blue moonlight 
and warm interior light mixing, pink star floor glowing softly, peaceful 
circle gathering atmosphere, anime style illustration, compassionate mood
```

---

### C05｜象徴世界でレイが話す（5秒）

**プロンプト**
```
cute chibi boy, 8 years old, short black hair, troubled uncertain expression, 
purple and blue shirt, red boxing gloves, barefoot, standing in featureless 
gray space with soft light, looking slightly down as if sharing a secret fear, 
introspective atmosphere, anime style illustration, close-up of upper body
```

---

### C07★｜決意の顔に変わる（★核ショット・ループ可・6秒）

**プロンプト**
```
cute chibi boy, 8 years old, short black hair, expression transforming from 
anxiety to quiet resolve, eyebrows setting with determination, eyes brightening 
with understanding, mouth settling to calm focus, purple and blue sporty shirt, 
red boxing gloves, standing in featureless gray space gradually becoming warmer, 
soft golden-purple light increasing throughout, standing with centered posture, 
moment of courage redefinition, anime style illustration, subtle light effects 
suggesting enlightenment, supportive figures (sandbag and mentor) visible in 
background, loop capable

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, adult
```

**核ショット（本話最重要）**
- 「勇気は、こわくなくなることではなく、ドキドキしたまま進むこと」という理解
- 恐怖を否定ではなく肯定した上での決意
- 表情だけで「勇気の再定義」が明確に見える

---

### C08｜構えるレイ（翌日・5秒）

**プロンプト**
```
cute chibi boy, 8 years old, short black hair, tense but determined expression, 
purple and blue shirt, red boxing gloves, barefoot, taking ready stance for 
jump kick with trembling slightly visible, facing front with serious focus, 
in FLATUP GYM gym with purple-tinted star floor, warm soft evening sunlight, 
moment of courage in action, anime style illustration
```

---

### C09｜ジャンプする瞬間（結果は見せない・4秒）

**プロンプト**
```
cute chibi boy, 8 years old, purple and blue shirt, red boxing gloves, 
barefoot, captured mid-jump in dynamic pose, body suspended in air, 
in FLATUP GYM gym with star floor, purple-tinted light, moment of committed 
action, anime style illustration

** IMPORTANT: Show only the initial jump phase. Do not show landing or 
result of the jump. Cut the image before the landing moment. **
```

**重要**: 着地は描かない = 結果を評価しない という演出

---

### C10★｜最終ショット・シルエット（ループ可・6秒）

**プロンプト**
```
FLATUP GYM gym interior at night, blue moonlight streaming through windows, 
purple star floor glowing softly with warm interior light mixing, sandbag and 
mentor characters sitting in circle in middle, silhouette of chibi boy (Rei) 
in ready stance for jump kick in foreground, sharp silhouette edges catching 
moonlight + interior glow, soft warm interior light mixing with moonlight, 
peaceful nighttime gym atmosphere showing courage and determination, anime style 
illustration, calm and serene mood, sense of growth and self-understanding

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, 
dark and gloomy
```

**最終ショット（全話の締め）**
- レイが「勇気を理解した自分」の構えで立っている
- 結果を超えた「挑戦する過程」を評価する
- シルエット = 観客に「自分もできるかもしれない」と思わせるメタ・メッセージ

---

## 生成フロー

### Step 1: 基準画像生成
- 各カット → 複数ポーズ/角度を生成

### Step 2: バリエーション生成
- 表情・背景・照明の微調整版を生成

### Step 3: 最終セレクション
- 品質チェック後、最適なものをロック

---

## 品質チェック

- [ ] 各キャラの顔が一貫性がある
- [ ] グローブの赤色が統一されている
- [ ] ウェア色（紫青）が正確に表現されている
- [ ] 表情が感情を正確に表現している
- [ ] 背景が場所を正確に表現している（ジム / 灰色空間 / 月光など）
- [ ] 光の色合いが各シーンのムード（紫系統一）を支えている
- [ ] キャラが3D感なく、アニメ風に見える
- [ ] 解像度が十分（1024×1024以上）
- [ ] テキストやウォーターマークがない
- [ ] C09（ジャンプ）で着地が見えないか（結果を見せない）
- [ ] レイのそわそわ→決意の表情遷移が見えるか

---

**次のステップ: VIDEO_PROMPTS.md で i2v（Image-to-Video）プロンプトを定義します。**

