# EP12「どきどき、しても。」— Image-to-Video（i2v）プロンプト集

**生成ツール**: Runway ML / Pika / D-ID / Haiper（予定）  
**入力形式**: 静止画 1024×1024 + i2v プロンプト  
**出力形式**: 動画 1080p / 30fps  
**尺**: カット別に指定

---

## C01｜レイがそわそわする（4秒）

**i2v プロンプト**
```
camera: medium shot of Rei in gym, fixed position, 
motion: Rei standing but swaying slightly side-to-side (1Hz frequency), 
arms fidgeting, shifting weight from foot to foot, 
facial expression: anxious, eyes darting, nervous energy, 
breathing: visible rapid nervous breathing, 
background: other children practicing, gym with purple light stable, 
overall tone: anticipation mixed with anxiety, 
animation intensity: medium (nervous movement, not frantic)
```

### 動作指示
- 左右に揺れる（そわそわ）
- 手が動く（落ち着かない）
- 視線が動く（不安）
- 呼吸が見える（緊張）

---

## C02｜後でいい？と小さく言う（4秒）

**i2v プロンプト**
```
camera: close-up to medium, fixed position, 
motion: Rei standing mostly still but posture shifting, 
head: slight downward tilt as if apologizing, 
mouth: small mouth movement (speaking quietly), 
facial expression: hesitant throughout, 
breathing: shallow nervous breathing, 
overall tone: reluctant submission to fear, 
animation intensity: very low (psychological, minimal physical movement)
```

### 動作指示
- ほぼ立ち尽くす
- 口が動く（話しかけている）
- 视線が下に（躊躇）
- 肩が微かに下がる

---

## C04｜夜のジム・円座（5秒）

**i2v プロンプト**
```
camera: wide shot of circle, slight focus on Sandbag, 
motion: Sandbag and mentor sitting in circle, minimal movement, 
Sandbag movement: gentle rocking (0.3s cycle) expressing emphasis in speech, 
facial expression: both warm, contemplative, 
lighting: blue moonlight + warm interior light balanced, floor glowing, 
overall tone: intimate wisdom-sharing, recognition of complexity, 
animation intensity: very low (conversation focus, meditative)
```

### 動作指示
- ほぼ円座で静止
- 微かな身体の揺れ（話のテンポ）
- 表情は温かく共感的

---

## C05｜象徴世界でレイが話す（5秒）

**i2v プロンプト**
```
camera: medium close-up of Rei, static, 
motion: minimal physical movement, expression focus, 
eye movement: downward gaze (vulnerability) then slight lift, 
facial expression: troubled throughout, gradually opening up, 
breathing: visible shallow breathing (sharing difficult emotion), 
hands: fingers fidgeting slightly (nervous energy), 
lighting: soft gray gradually warming, 
overall tone: self-disclosure moment, 
animation intensity: low (psychological, expression-focused)
```

### 動作指示
- 視線が下に（素直に気持ちを話す）
- 表情に複雑さ（怖さと、やりたい気持ち両立）
- 手が微かに動く

---

## C07★｜決意の顔に変わる（★核ショット・ループ可・6秒）

**i2v プロンプト**
```
camera: medium shot from face to chest, slight tilt suggesting strength, 
motion: minimal physical - this is ALL about expression and internal shift, 
face animation: 
  - 0-2s: eyes transition from anxious to understanding, 
  - 2-4s: eyebrows setting into determined position, 
  - 4-6s: mouth and entire face showing quiet resolve, 
eyes: brightening, intelligent, filled with newfound understanding of courage, 
subtle detail: not anger-like strength but centered, grounded strength, 
lighting transition: 
  - start: cool gray (anxiety), 
  - middle: gradual warm golden-purple glow (understanding), 
  - end: soft purple-blue enlightened glow (courage redefined), 
breathing: transitions from anxious to calm, steady, centered, 
body language: shoulders relax as understanding settles, posture straightens, 
supportive figures: visible in background, witnessing transformation, 
overall tone: transformation moment, courage redefined, understanding blooming, 
NOT: aggressive, angry - instead: calm, centered, grounded, 
animation intensity: low-medium (expression-focused, showing inner growth), 
loop capability: FULL (entire 6s loops seamlessly)
```

### 核ショット（本話最重要）
- 「勇気は、こわくなくなることではなく、ドキドキしたまま進むこと」
- レイが「恐怖を肯定した上での決意」を理解する
- 「不完全なままでいい」というメッセージが顔に表れる

---

## C08｜構えるレイ（翌日・5秒）

**i2v プロンプト**
```
camera: medium shot, fixed position, 
motion: Rei taking ready stance for jump kick (1s duration to assume position), 
posture: building tension in legs, body ready, 
facial expression: nervous but determined, eyes focused forward, 
breathing: visible deep preparation breathing (gathering courage), 
trembling: subtle visible trembling in stance (showing fear persists), 
lighting: warm purple-tinted evening light, 
overall tone: courage in action - still nervous but acting anyway, 
animation intensity: medium (action setup mixed with emotional resolution)
```

### 動作指示
- 構えを取る（その時点では着地まで）
- 微かな震え（恐怖が残っている）
- 表情は真摯（でも緊張）
- 深呼吸（勇気を絞り出す）

---

## C09｜ジャンプする瞬間（結果は見せない・4秒）

**i2v プロンプト**
```
camera: medium shot capturing dynamic jump action, 
motion: explosive jump motion initiating kick, body suspended briefly, 
timing: capture only initial jump phase, ** STOP before landing occurs **, 
body: fully extended in jump, legs and arms in kick position, 
facial expression: focused, committed, 
lighting: purple-tinted gym light, 
overall tone: action taken, commitment shown, result unknown and irrelevant, 
animation intensity: high (action-focused) but cut before resolution

** CRITICAL: Do not show landing. Do not show whether kick succeeds or fails. 
Image/video must cut at apex of jump or mid-air, before landing. **
```

### 動作指示
- ジャンプの初動～頂点まで
- 着地は絶対に描かない
- 結果（成功/失敗）は見せない
- = 「挑戦するプロセスが大事」という演出

---

## C10★｜最終ショット・シルエット（ループ可・6秒）

**i2v プロンプト**
```
camera: wide shot of gym interior, very subtle slow pan-up, 
motion: Rei's silhouette in ready stance, barely moving, 
silhouette definition: sharp edges catching moonlight + interior glow, 
Rei silhouette: standing in ready jump-kick position, balanced and committed, 
body language: shoulders back, posture confident yet grounded, 
breathing: synchronized deep breathing (visible through silhouette chest), 
positioning: confident center of frame, 
lighting transition:
  - start: 50% moonlight (cool), 50% gym interior (warm), 
  - middle: 55% gym interior warmth (courage recognized), 
  - end: 60% gym interior warmth (strength in vulnerability), 
floor: purple star floor beneath silhouette, glowing with mixed light, 
background: FLATUP GYM gym structure visible, Sandbag and mentor in circle, 
aura effect: warm light subtly expands around figure (courage expanding), 
atmospheric feeling: continuation, self-understanding achieved, 
overall tone: quiet strength, vulnerability embraced, growth shown, 
NOT success/failure of jump - but success/courage of person taking jump, 
animation intensity: very low (contemplative finale, emotional not physical), 
loop capability: FULL (entire 6s loops seamlessly)
```

### 最終ショット（全話の締め）
- レイが「ドキドキしたまま挑戦する勇気を理解した」の構え
- 着地結果ではなく「挑戦する勇気」を評価
- シルエット = 「君も、ドキドキしながらでも一歩踏み出せる」というメタ・メッセージ

---

## i2v 生成フロー

### Step 1: 基準フレーム確定
- 各カット → 最高品質版を確定

### Step 2: i2v 生成
- 各カットを i2v API に投稿
- モーション指定に従い生成

### Step 3: フレームレート・尺確認
- ループ可能カット（C07, C10）は seamless 確認

### Step 4: トランジション・編集
- カット間を 0.3s のクロスフェードで接続
- オーディオシンク調整

---

## 品質チェック（i2v 版）

- [ ] 各キャラのシルエット / 顔が変わっていない
- [ ] 動きが「アニメ的滑らかさ」を保っている
- [ ] 照明遷移が「心理状態」を表現している（灰色 → 紫）
- [ ] ループカット（C07, C10）が完全 seamless か
- [ ] 尺がずれていない（各カット ± 0.1s 以内）
- [ ] BGM と視覚的動きがズレていない
- [ ] レイのそわそわ→決意→実行の表情遷移が見えるか
- [ ] C09（ジャンプ）で着地が見えないか（極めて重要）
- [ ] 「勇気とは恐怖と共に進むこと」が表現されているか

---

**次のステップ: EP13「始まり、ここから。」の制作開始**

このテンプレートを参考に、EP12 の完成を確認した後、EP13 の制作資料を作成します。

