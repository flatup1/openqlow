# EP11「となりに、いく。」— Image-to-Video（i2v）プロンプト集

**生成ツール**: Runway ML / Pika / D-ID / Haiper（予定）  
**入力形式**: 静止画 1024×1024 + i2v プロンプト  
**出力形式**: 動画 1080p / 30fps  
**尺**: カット別に指定

---

## C01｜ダイが輪の外で一人立ち尽くす（4秒）

**用途**: S1 オープニング  
**入力画像**: C01-A 静止画（孤立するダイ）  
**尺**: 4秒  
**フレーム数**: 120 frames @ 30fps

### i2v プロンプト
```
camera: wide shot of gym, fixed position with slight focus on Dai in foreground, 
motion: Dai standing motionless (trembling slightly), arms holding gloves to chest, 
breathing: visible shallow nervous breathing (anxiety), 
background motion: blurred children practicing happily (contrast), 
lighting: green-tinted evening light stable, star floor visible, 
overall tone: isolation, anxiety, fear of the new environment, 
animation intensity: very low (psychological, barely physical movement)
```

### 動作指示
- ダイがほぼ立ち尽くす
- 微かな震え（不安感）
- グローブを抱える姿勢が続く
- 背景の子どもたちは賑やか

---

## C02｜ユウが踏み出しかけて引き込める（4秒）

**用途**: S2 のメインカット  
**尺**: 4秒  
**フレーム数**: 120 frames @ 30fps

### i2v プロンプト
```
camera: medium shot of Yū, fixed position, 
motion: half-step forward (1 foot leading, 0.5s duration) then pulling back (1s duration), 
arm movement: hand raises as if to gesture, then lowers (uncertainty), 
facial expression: conflicted, eyebrows furrowed throughout, eyes glancing toward Dai, 
breathing: visible hesitant breathing (internal struggle), 
body language: weight shifts forward then backward (indecision), 
background: gym interior, Dai visible in distance, 
lighting: warm evening green light, 
overall tone: internal conflict, hesitation, missed opportunity, 
animation intensity: medium (emotional movement, subtle physical action)
```

### 動作指示
- 足が半歩前に出る
- すぐに引っ込める
- 手が上がりかけて下がる
- 表情に迷いが続く

---

## C03｜ユウが自分の練習に戻る（4秒）

**用途**: S2 のコンテキスト・ショット  
**尺**: 4秒  
**フレーム数**: 120 frames @ 30fps

### i2v プロンプト
```
camera: medium shot from side, follows Yū walking away, 
motion: slow walk away, turning head back over shoulder (0.5-1s), 
body language: reluctant retreat, "後ろ髪を引かれる" feeling, 
facial expression: still troubled, looking back with regret, 
breathing: steady but somewhat heavy (resigned), 
background: gym with Dai growing smaller (psychological distance), 
lighting: same warm evening green, 
overall tone: unresolved choice, internal guilt, 
animation intensity: medium (walking motion, emotional subtext)
```

### 動作指示
- ユウがゆっくり歩き去る
- 振り返る（心が残っている）
- 背景でダイが遠ざかる

---

## C04｜フラットちゃんが「私も最初はこわかった」（5秒）

**用途**: S3 のシーン  
**尺**: 5秒  
**フレーム数**: 150 frames @ 30fps

### i2v プロンプト
```
camera: wide shot of circle, slight slow zoom-in on Flat-chan, 
motion: Flat-chan and items sitting in circle, minimal movement, 
Flat-chan movement: gentle rocking (0.3s cycle), head tilting thoughtfully, 
facial expression: warm smile transitioning to slight embarrassment (vulnerable), 
breathing: calm, peaceful breathing visible, 
lighting: blue moonlight + warm interior light balanced, floor glowing, 
ambient movement: subtle shadows from objects, 
overall tone: intimate wisdom-sharing, self-disclosure, 
animation intensity: very low (conversation focus, meditative)
```

### 動作指示
- ほぼ円座で静止
- 少し照れた表情
- 微かな身体の揺れ（話のテンポ）

---

## C05｜ユウが困った顔で立つ（5秒）

**用途**: S4 のメインカット  
**尺**: 5秒  
**フレーム数**: 150 frames @ 30fps

### i2v プロンプト
```
camera: medium close-up of Yū's face and upper body, static, 
motion: minimal physical movement, expression focus, 
eye movement: gaze downward (shame/confusion) then back to neutral, 
facial expression: confusion deepening into troubled realization (0-2.5s), 
then acceptance (2.5-5s), 
breathing: visible anxious breathing transitioning to calmer realization, 
hands: fingers fidgeting slightly (nervous energy), 
background: featureless gray space, soft diffuse light, 
lighting: subtle golden glow appearing from above, 
Flat-chan: present in soft focus background, asking gentle question, 
overall tone: internal struggle leading to honesty, 
animation intensity: low (psychological, expression-focused)
```

### 動作指示
- 視線が下に落ちる
- 両手が微かに握る（不安）
- 眉間に皺（思考）
- 2.5s で表情が少し柔らかくなる

---

## C06｜ユウの表情が軽くなる（★核ショット・ループ可・6秒）

**用途**: S5 の最重要カット - **ループ可**  
**尺**: 6秒  
**フレーム数**: 180 frames @ 30fps

### i2v プロンプト
```
camera: medium shot from face to chest, very slight tilt suggesting relief, 
motion: minimal physical movement - this is ALL about expression, 
face animation: 
  - 0-1.5s: eyes transition from troubled (C05 end) to understanding, 
  - 1.5-3s: eyebrows gradually raising (realization and relief), 
  - 3-6s: mouth forming gentle smile, entire face showing lightness, 
eyes: brightening, intelligent, filled with newfound permission and courage, 
subtle detail: internal freedom visible in eyes (not just logic - feeling), 
lighting transition: 
  - start: cool gray space light (C05 continuation), 
  - middle: gradual increase of warm golden-green light (permission), 
  - end: soft golden-green glow (courage to act), 
breathing: transitions from anxious to calm, steady, centered, 
body language: shoulders relax as permission settles in, posture straightens, 
Flat-chan: present in background, smiling warmly, affirming transformation, 
overall tone: transformation moment, permission received, courage blooming, 
NOT: forced, aggressive, angry - instead: gentle, relieved, empowered, 
animation intensity: low-medium (expression-focused, showing liberation), 
loop capability: FULL (entire 6s loops seamlessly for extended emotional impact)
```

### 動作指示
- 表情が徐々に明るくなる
- 眉が上がる（軽くなる）
- 口が微かに笑顔に
- 肩がリラックス

### 核ショット（ここが本話の最重要）
- ユウが「完璧でなくていい」という許可を内面化
- 親切心への勇気が芽生える
- 「短い一言でいい」という解放感が顔に表れる

---

## C07｜ユウがダイに近づく（5秒）

**用途**: S6a のメインカット  
**尺**: 5秒  
**フレーム数**: 150 frames @ 30fps

### i2v プロンプト
```
camera: medium two-shot, slight push-in from 2s mark, 
motion: Yū walking toward Dai (1.5 meters over 2.5s), 
arm movement: natural arm swing as he walks, hand may gesture as he speaks, 
facial expression: nervous but determined, focused on Dai's face, 
breathing: visible nervous breathing (courage in action), 
body language: shoulders squared, posture respectful, 
Dai's reaction: starts to notice Yū approaching, 
lighting: warm soft evening sunlight, 
overall tone: courage in action, nervous kindness, 
animation intensity: medium (walking + emotional balance)
```

### 動作指示
- ユウがダイに近づく
- 少し緊張した歩き方
- 視線はダイの顔に
- 口を開く（話しかける準備）

---

## C08｜ダイが喜びに変わる（5秒）

**用途**: S6b のリアクションカット  
**尺**: 5秒  
**フレーム数**: 150 frames @ 30fps

### i2v プロンプト
```
camera: close-up of Dai's face, then slight pull-back to include shoulders, 
motion: minimal physical movement - this is ALL facial animation, 
expression transition:
  - 0-1.5s: shock (wide eyes, open mouth), 
  - 1.5-3s: dawning realization (softening), 
  - 3-5s: bloom into full smile, eyes glowing with happiness, 
eyes: transition from shock to joy (light enters eyes, tears may form), 
eyebrows: from high-raised to relaxed and warm, 
breathing: visible intake at start, then calm steady breathing, 
body: slight backward sway as if emotionally moved, micro-nod, 
cheeks: flush deepening as happiness settles, 
lighting: same warm evening light, may strengthen toward end (joy glow), 
overall tone: healing moment, loneliness ending, relief and joy commingling, 
animation intensity: medium (expression-focused with subtle body language)
```

### 動作指示
- 目が大きく開く（驚き）
- 口が O 字に
- 2s で表情が緩む
- 3-5s で笑顔が花開く
- ほほが赤くなる

---

## C09｜二人で準備運動（5秒）

**用途**: S6 エンディング  
**尺**: 5秒  
**フレーム数**: 150 frames @ 30fps

### i2v プロンプト
```
camera: medium two-shot showing equal positioning, 
motion: both performing synchronized light warm-up exercises (1 set over 5s), 
arm movement: smooth, mirrored warm-up motions (arm circles, stretches), 
body language: equal height, equal importance, symmetric movement, 
facial expressions: both calm and focused, Yū attentive, Dai relaxed, 
breathing: synchronized breathing (emotional sync achieved), 
lighting: warm evening sunlight illuminating both equally, 
floor: green star floor visible, 
ambient feeling: practice rhythm established, partnership blooming, 
overall tone: companionship, equality, mutual support beginning, 
animation intensity: medium (exercise motion + emotional balance)
```

### 動作指示
- 二人が並んで準備運動
- 同じポーズを繰り返す
- 呼吸が同期している
- 表情は落ち着いている

---

## C10｜ラスト：シルエット（★ループ可・6秒）

**用途**: S7 最終ショット  
**尺**: 6秒  
**フレーム数**: 180 frames @ 30fps

### i2v プロンプト
```
camera: wide shot of gym interior, very subtle slow pan-up, 
motion: silhouettes of two boys standing together, barely moving, 
silhouette definition: sharp edges catching moonlight + interior glow, 
Yū and Dai silhouettes: standing close together after exercise, 
body language: shoulders back, posture relaxed and confident, natural partnership, 
breathing: synchronized slow breathing (visible through silhouette chest), 
arm placement: relaxed at sides, gloves visible, 
lighting transition:
  - start: 50% moonlight (cool), 50% gym interior (warm), 
  - middle: 55% gym interior warmth (hope increases), 
  - end: 60% gym interior warmth (community and continuation), 
floor: green star floor beneath silhouettes, glowing with mixed light, 
background: FLATUP GYM gym structure visible, Flat-chan and items in circle, 
aura effect: warm light subtly expands around figures (connection growing), 
atmospheric feeling: continuation, inheritance, circle of kindness, 
overall tone: future possibilities, quiet strength, community formed, 
animation intensity: very low (contemplative finale, emotional not physical)
```

### 動作指示
- シルエット（輪郭がはっきり）
- 二人が並んでいる
- ほぼ静止（安定感）
- 照明が徐々に暖かくなる（希望）

### 最終ショット（全話の締め）
- 「優しさの継承」の完成形
- ユウとダイが並ぶ姿 = メッセージの視覚化
- シルエット = 「これは君たちの物語」というメタ・メッセージ

---

## i2v 生成フロー

### Step 1: 基準フレーム確定
- 各カット → 最高品質版を確定
- 解像度 1024×1024 以上の静止画をロック

### Step 2: i2v 生成（Runway / Pika）
- 各カットを i2v API に投稿
- モーション指定に従い、4s ～ 6s のクリップ生成

### Step 3: フレームレート・尺確認
- 各クリップが指定秒数 + 正しい fps で生成されたか検証
- ループ可能カット（C06, C10）は seamless 確認

### Step 4: トランジション・編集
- カット間を 0.3s のクロスフェードで接続
- オーディオ（BGM / SE）のシンク調整
- 最終合成動画を出力

---

## 品質チェック（i2v 版）

- [ ] 各キャラのシルエット / 顔が変わっていない
- [ ] 動きが「アニメ的滑らかさ」を保っている
- [ ] 照明の遷移が「心理状態」を表現している（灰色 → 黄緑）
- [ ] ループカット（C06, C10）が完全 seamless か
- [ ] 尺がずれていない（各カット ± 0.1s 以内）
- [ ] BGM と視覚的動きがズレていない
- [ ] ユウの迷い→勇気の表情遷移が見えるか
- [ ] ダイの孤立→喜びの表情遷移が見えるか
- [ ] 「優しさの継承」が最終的に表現されているか

---

**次のステップ: EP12「支える喜び」の制作開始**

このテンプレートを参考に、EP11 の完成を確認した後、EP12 ～ EP13 の制作資料を順次作成します。

