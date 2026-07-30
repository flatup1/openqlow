# EP13「きのうの、じぶん。」— 画像生成プロンプト集

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

### C01｜ノアが華やかに決める、ミオがぎこちない（4秒）

**プロンプト**
```
anime style illustration, contrast scene in FLATUP GYM gym with star floor,
cute chibi girl (Noah), 8 years old, short black hair, bright cheerful expression,
yellow and white color-block shirt, red boxing gloves, barefoot, 
executing smooth confident kick combination, surrounded by other children clapping,
in foreground: cute chibi girl (Mio), 8 years old, short black hair, 
complex troubled expression, blue and purple color-block shirt, 
red boxing gloves, barefoot, attempting same kick but movement is awkward and stiff,
warm purple-tinted evening light in FLATUP GYM, 
contrast between Noah's grace and Mio's difficulty, comparison visual
```

---

### C02｜ミオが座り込む（4秒）

**プロンプト**
```
cute chibi girl (Mio), 8 years old, short black hair, exhausted resigned expression,
blue and purple color-block shirt, red boxing gloves, barefoot,
sitting down on star floor of FLATUP GYM, shoulders dropped, 
looking tired and discouraged, loss of motivation visible in posture,
warm purple-tinted evening light, solitary moment, 
anime style illustration, melancholic mood
```

---

### C03｜夜のジム・円座（5秒）

**プロンプト**
```
nighttime FLATUP GYM gym interior, blue moonlight streaming through windows,
purple star floor glowing softly with warm interior light mixing,
cute chibi sandbag character and cute chibi character with ponytail (Flat-chan),
sitting in circle on the floor, warm gentle compassionate expressions,
peaceful circle gathering atmosphere for discussion,
calm nighttime gym setting, anime style illustration
```

---

### C04｜象徴世界でミオが話す（5秒）

**プロンプト**
```
cute chibi girl (Mio), 8 years old, short black hair, tired exhausted expression,
blue and purple color-block shirt, red boxing gloves, barefoot,
standing in featureless gray space with soft light,
looking slightly down as if sharing difficult feelings, introspective atmosphere,
small cute mascot character (Flat-chan) beside her with gentle smile,
subtle purple-gray gradient background transitioning to light,
anime style illustration, emotional vulnerable moment
```

---

### C05★｜ミオが半年前の自分を見る（★核ショット・ループ可・6秒）

**プロンプト**
```
cute chibi girl (Mio), 8 years old, short black hair, 
expression transforming from surprise to peaceful realization,
blue and purple color-block shirt, red boxing gloves, barefoot,
standing in soft golden morning-like light space,
watching translucent ghostly image of herself from 6 months ago (same child but slightly clumsier movement, 
more struggle in same kick technique),
eyes widening with "I didn't know I improved" realization,
eyebrows gradually raising as understanding dawns,
mouth transitioning from O-shape surprise to gentle knowing smile,
entire face showing growth recognition and self-compassion,
golden-warm light increasing throughout creating enlightenment effect,
supportive figures (Sandbag and Flat-chan) visible in soft background,
loop capable, anime style illustration, moment of personal growth awareness,
subtle light effects suggesting inner awakening
```

---

### C06｜フラットちゃんが語りかける（5秒）

**プロンプト**
```
cute chibi mascot character (Flat-chan) with kind expression,
standing in soft golden morning-like light,
warm gentle smile while speaking wisdom to Mio,
soft beige and gold light creating warm compassionate atmosphere,
peaceful educational moment, kind teacher energy,
anime style illustration, kindness and guidance, subtle glow effect
```

---

### C07｜翌日・ミオが上達した動きを見せる（5秒）

**プロンプト**
```
cute chibi girl (Mio), 8 years old, short black hair, satisfied focused expression,
blue and purple color-block shirt, red boxing gloves, barefoot,
in FLATUP GYM gym with star floor, 
executing same kick technique with notably smoother more confident movement compared to S1,
visible progress in execution, body control improved,
warm golden evening light, moment of personal achievement,
anime style illustration, quiet satisfaction and inner growth
```

---

### C08｜ミオの小さなガッツポーズ（4秒）

**プロンプト**
```
cute chibi girl (Mio), 8 years old, short black hair, small satisfied happy expression,
blue and purple color-block shirt, red boxing gloves, barefoot,
making small fist pump gesture (victory pose), understated joy,
successful moment after smooth execution, internal happiness,
anime style illustration, quiet celebration of progress
```

---

### C09｜ノアが話しかける（5秒）

**プロンプト**
```
two cute chibi girls in FLATUP GYM, 
Mio: 8 years old, short black hair, blue and purple shirt, red gloves, barefoot, 
standing with satisfied posture after successful technique,
Noah: 8 years old, short black hair, yellow and white shirt, red gloves, barefoot, 
approaching with natural cheerful smile, bright eyes, 
saying "That movement got smoother" with warmth and no condescension,
natural friendly moment between practice partners, 
supportive teammate energy, warm evening light in gym,
anime style illustration, positive peer recognition
```

---

### C10★｜最終ショット・シルエット（ループ可・6秒）

**プロンプト**
```
FLATUP GYM gym interior at night, blue moonlight streaming through windows,
purple star floor glowing softly with warm interior light mixing,
sandbag and Flat-chan characters sitting in circle in middle of gym,
silhouette of chibi girl (Mio) in foreground making small fist pump gesture,
standing in ready confident posture with small victory pose,
sharp silhouette edges catching moonlight and interior glow,
soft warm interior light mixing with moonlight creating hopeful atmosphere,
peaceful nighttime gym setting showing quiet strength and determination,
anime style illustration, calm and serene mood,
sense of growth and self-understanding,
feeling of "I can see my own progress" expanding outward from the figure,
aura effect: warm light subtly expanding around figure,
atmospheric feeling: continuation, self-understanding achieved,
overall tone: quiet strength, growth recognized, small daily victory celebrated,
loop capability: FULL (entire 6s loops seamlessly)

negative: bad quality, blurry, distorted, 3D, realistic, photorealistic, dark and gloomy
```

---

## 生成フロー

### Step 1: 基準画像生成
- 各カット → 複数ポーズ/角度を生成

### Step 2: バリエーション生成
- 表情・背景・照明の微調整版を生成
- 特にC05（核ショット）は表情遷移の細かさが重要

### Step 3: 最終セレクション
- 品質チェック後、最適なものをロック

---

## 品質チェック

- [ ] ミオの髪型が全シーンで短黒髪
- [ ] ノアの髪型が全シーンで落ち着いた黒髪（少し長め）
- [ ] グローブが赤色で統一されている
- [ ] ウェア色：ミオ＝青紫、ノア＝黄白が正確
- [ ] 表情が感情を正確に表現している
- [ ] C01でノアの華やかさ vs ミオのぎこちなさが対比として見える
- [ ] C05（核ショット）で驚き→納得の表情遷移が見えるか
- [ ] C07でC01との動きの改善が視覚的に明確か
- [ ] 背景が場所を正確に表現している（ジム / 灰色空間 / 月光など）
- [ ] 光の色合いが各シーンのムード（紫系・黄金系統一）を支えている
- [ ] キャラが3D感なく、アニメ風に見える
- [ ] 解像度が十分（1024×1024以上）
- [ ] テキストやウォーターマークがない
- [ ] ミオの比較→喪失→気づき→喜びの表情遷移が見えるか
- [ ] ノアが「嫌味な天才」ではなく「親切な同級生」として見えるか

---

**次のステップ: VIDEO_PROMPTS.md で i2v（Image-to-Video）プロンプトを定義します。**
