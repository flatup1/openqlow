# EP10「もって、くれてる。」— Image-to-Video（i2v）プロンプト集

**生成ツール**: Runway ML / Pika / D-ID / Haiper（予定）  
**入力形式**: 静止画 1024×1024 + i2v プロンプト  
**出力形式**: 動画 1080p / 30fps  
**尺**: カット別に指定

---

## 共通i2v設定

### アニメ風スムーズネス
```
smooth anime motion, consistent 2.5 head proportion throughout, 
no jittering or distortion, natural lighting continuity, 
maintain character identity across frames, gentle acceleration curves
```

### トランジション指示（カット間）
```
cross-fade 0.3s, subtle color temperature match, 
audio continuity (no jarring cuts), emotional momentum preserved
```

---

## C01-A｜ハルナが連打（集中・4秒）

**用途**: S1 オープニング  
**入力画像**: C01-A 静止画（ハルナの連打）  
**尺**: 4秒  
**フレーム数**: 120 frames @ 30fps

### i2v プロンプト
```
camera: medium shot of Haruna, fixed position, 
motion: continuous rapid punch motion (1.5 punches per second), 
arm movement: left-right alternating punches with natural recoil, 
upper body: slight weight shift with each punch (rhythm visible), 
facial expression: intense concentration remains constant, eyes bright, 
breathing: visible chest breathing with exertion, 
feet: firm stance, no foot movement (rooted position), 
background: FLATUP GYM with star floor, warm evening light stable, 
ambient movement: dust particles catching light with punch wind, 
overall tone: energetic, focused, unstoppable effort, 
animation intensity: high (action-focused, dynamic)
```

### 動作指示
- 連打のリズムが見える（1.5 回/秒）
- 上半身が微かに揺れる（全身で打つ感覚）
- 表情は集中したまま（周りが見えていない）
- 足はしっかり地面に（安定感）

### オーディオシンク
- 連続する打撲音のリズムに合わせて腕が動く
- 呼吸音（激しい）
- BGM の集中力あるリズムに完全同期

---

## C01-B｜コウが腕を震わせながらミット保持（4秒）

**用途**: S1 コンテキスト・ショット  
**入力画像**: C01-B 静止画（コウが震える腕でミット保持）  
**尺**: 4秒  
**フレーム数**: 120 frames @ 30fps

### i2v プロンプト
```
camera: medium shot of Kō and mitt, fixed position, 
motion: holding mitt steady against incoming punches, 
arm movement: subtle trembling throughout (0.1-0.2Hz frequency), 
visible strain: shoulders squared but trembling, arms absorbing impact, 
facial expression: focused but strained, eyes slightly narrowed, 
breathing: controlled but labored (visible chest heaving), 
feet: firm stance, weight shifting slightly with punch impact, 
background: same gym as C01-A, warm evening light continuous, 
impact feeling: each punch creates micro-movement in arms (recoil), 
overall tone: enduring, focused, quietly struggling, 
animation intensity: medium (holding pattern with subtle strain)
```

### 動作指示
- 腕が微かに震える（疲労を表現）
- ミットが前後にわずかに動く（パンチの衝撃を受ける）
- 表情は我慢している
- 足は安定（でも全身に疲労が出ている）

### オーディオシンク
- パンチの音に反応（ミットが揺れる）
- 呼吸音が聞こえる（努力している）
- BGM は不変（ハルナの リズムと共存）

---

## C02｜コウが腕をさする（疲労・4秒）

**用途**: S2 の労力可視化  
**入力画像**: C02-A 静止画（腕をさするコウ）  
**尺**: 4秒  
**フレーム数**: 120 frames @ 30fps

### i2v プロンプト
```
camera: close-up of Kō's right side and arm, slightly pull-back to show shoulders, 
motion: right arm rubbing/massaging motion (slow, deliberate), 
arm movement: left hand massaging right arm from shoulder to elbow (soothing gesture), 
facial expression: exhausted but stoic, eyes slightly weary, mouth neutral, 
breathing: deep, slow recovery breathing (relief phase), 
shoulders: dropping as tension releases, posture relaxing, 
head movement: slight down-tilt (fatigue), 
background: gym interior, warm evening light (Haruna has left), 
lighting: slightly dimmer where Kō stands (psychological isolation), 
overall tone: relief mixed with fatigue, quiet endurance, 
animation intensity: low (recovery motion, contemplative)
```

### 動作指示
- 右腕をさする一動作（ゆっくり）
- 肩が落ちる（疲労から解放）
- 顔は困った表情（相手に伝えられない痛み）
- 奥でハルナが水を飲みに去る

### オーディオシンク
- 腕をさする音（SE）
- 呼吸音が落ち着く
- BGM は変わらず（でも心理的に遠ざかる感じ）

---

## C03｜ハルナが振り向かずに去る（4秒）

**用途**: S2 のコンテキスト・ショット  
**入力画像**: C03-A 静止画（去るハルナの後ろ姿）  
**尺**: 4秒  
**フレーム数**: 120 frames @ 30fps

### i2v プロンプト
```
camera: medium shot following Haruna walking away, 
motion: steady walk away from camera (1 meter per 2 seconds), 
arm movement: arms swing naturally with walk, holding water bottle, 
posture: upright, energetic gait (not looking back), 
facial expression: bright (assumed from back view), unaware of partner, 
breathing: normal, recovered from exertion, 
water bottle: held in hand, occasionally brought up to drink, 
background: gym interior with star floor, pink evening light, 
Kō in background: small blurred figure (psychological distance), 
overall tone: innocent obliviousness, cheerful departure, 
animation intensity: medium (walking motion, natural cadence)
```

### 動作指示
- ゆっくり水を飲みに向かう（元気な足取り）
- 振り向かない（相手を見ていない）
- 自然な歩き方（悪意がない）
- 背景のコウの距離が徐々に広がる

### オーディオシンク
- 水を飲む音が聞こえ始める
- 足音はなく、歩みの轻さ
- BGM が心理的に遠のく感じ

---

## C04｜ミットとフラットちゃんの円座（5秒）

**用途**: S3 のシーン  
**入力画像**: C04-A 静止画（円座での会話）  
**尺**: 5秒  
**フレーム数**: 150 frames @ 30fps

### i2v プロンプト
```
camera: wide shot of gym interior, slight slow zoom-in on circle (intimate), 
motion: Mitt and Flat-chan sitting in circle, minimal movement, 
Mitt movement: small gentle rocking (0.3s cycle), supportive sway, 
Flat-chan movement: slight head tilt listening, nurturing posture, 
facial expressions: both warm, contemplative, wise, 
breathing: slow, peaceful breathing visible in sitting figures, 
lighting: blue moonlight + warm interior light balanced, star floor glowing, 
ambient movement: moonlight reflecting subtly on floor and figures, 
overall tone: intimate wisdom-sharing, peaceful nighttime sanctuary, 
animation intensity: very low (meditative, conversation focus)
```

### 動作指示
- ミットが微かに身体をゆらす（話し手のテンポ）
- フラットちゃんが小さく頷く（聞き手の共感）
- ジム全体が静寂に包まれている
- 月光と室内光が調和している

### オーディオシンク
- フラットちゃんのセリフが入る（会話シーン）
- 穏やかな環境音（ジムの夜）
- BGM は温かいピアノ

---

## C05｜象徴世界・ハルナが戸惑う（5秒）

**用途**: S4 のメインカット  
**入力画像**: C05-A 静止画（戸惑ったハルナ）  
**尺**: 5秒  
**フレーム数**: 150 frames @ 30fps

### i2v プロンプト
```
camera: medium close-up of Haruna's face and upper body, static, 
motion: minimal physical movement, expression focus, 
head movement: slight tilt as if thinking deeply, 0.5s cycle, 
eye movement: gaze shifts downward (introspection), then back to neutral, 
facial expression: confusion deepening into concern (0-2.5s), then realization (2.5-5s), 
breathing: visible anxious breathing (slight) transitioning to calm realization, 
hands: fingers fidgeting slightly (nervous energy), 
background: featureless gray space, soft diffuse light, 
lighting: subtle golden glow appearing from above (hope beginning), 
Flat-chan: present in soft focus background, waiting for Haruna's realization, 
overall tone: internal struggle leading to epiphany, 
animation intensity: low (psychological, expression-focused)
```

### 動作指示
- 視線が下に落ちる（思い出す）
- 両手が微かに握り拳になる（不安）
- 眉間に縦線が入る（思考）
- 2.5s で頭がわずかに傾く（「はっ」とする予兆）

### オーディオシンク
- 静寂の中に呼吸音が聞こえ始める
- 2.5s 時点で環境音（風のような音）が徐々に入る
- BGM がまだ始まっていない状態

---

## C06｜ハルナの気づき（4秒）

**用途**: S4b のクライマックス  
**尺**: 4秒  
**フレーム数**: 120 frames @ 30fps

### i2v プロンプト
```
camera: extreme close-up of Haruna's face, static, 
motion: expression transformation primary focus, 
eyes: transition from downcast/worried to suddenly wide-open (realization), 
eyebrows: raise upward sharply at 1s mark (dawning awareness), 
mouth: transitions from small frown to surprised 'O' shape (0.5-1.5s), 
facial animation: sudden, like a light bulb moment, guilt setting in, 
breathing: sharp intake of breath (visible chest reaction), 
skin tone: subtle change (slight flushing from realization), 
lighting: slight brightening around face (psychological moment), 
background: still gray space, emphasizing internal focus, 
overall tone: sudden guilty realization mixed with understanding, 
animation intensity: medium (quick but natural transition)
```

### 動作指示
- 目が大きく開く（0.5s で完了）
- 眉が上がる（驚き → 気づき）
- 口が「O」字に（言葉が出ない瞬間）
- 吸息が聞こえるほどの呼吸変化

### オーディオシンク
- 環境音が一瞬静まる（時が止まったような感覚）
- 吸息音（SE）
- BGM が一瞬 drop（心の動きを表現）

---

## C07｜決意の顔に変わる（★核ショット・ループ可・6秒）

**用途**: S5 の最重要カット - **ループ可**  
**尺**: 6秒  
**フレーム数**: 180 frames @ 30fps

### i2v プロンプト
```
camera: medium shot from face to chest, very slight tilt suggesting inner strength, 
motion: minimal physical movement - this is ALL about expression, 
face animation: 
  - 0-1s: eyes transition from worried (C06 end) to focused and understanding, 
  - 1-2s: eyebrows settle into lowered position (empathy and resolve), 
  - 2-3s: mouth transitions from O-shape to gentle, thoughtful close, 
  - 3-6s: full face glow of realization - "相手がいるから", 
eyes: bright, intelligent, filled with newfound gratitude and resolve, 
subtle detail: internal strength visible in eyes (not anger - understanding), 
lighting transition: 
  - start: cool gray space light (C06 continuation), 
  - middle: gradual increase of warm golden light (sunrise-like), 
  - end: soft golden-pink glow (enlightenment + emotional warmth), 
breathing: steady, deep, centered (the girl has found her center), 
body language: shoulders relax as realization settles, quiet confidence emerges, 
Mitt and Flat-chan: present in background, smiling warmly, witnessing transformation, 
overall tone: transformation moment, understanding another's effort, gratitude blooming, 
NOT: angry, aggressive, fierce - instead: calm, centered, grateful, 
animation intensity: low-medium (expression-focused, showing growth not action), 
loop capability: FULL (entire 6s loops seamlessly for extended emotional impact)
```

### 動作指示
- **重要**: 「怒った顔」ではなく「相手への感謝が芽生えた顔」
- 目が焦点を結ぶ（ぼやけた状態から明瞭へ）
- 眉が下がるが、緊張ではなく思いやり
- 口が一文字に閉じる（言葉ではなく行動へ）
- 光が少しずつ暖かくなる（気づき → ピンク色の朝日）

### 顔の造形変化
- 眼窩が微かに深くなる（内向的思考から感謝へ）
- 目の奥が光を取る（相手への思慮）
- ほほの筋肉が微かに上がる（温かさ）

### オーディオシンク
- 最初：静寂が続く
- 1-2s：環境音が静かに入り始める（ミットの気配）
- 2-3s：BGM が徐々に上昇、ピンク色のメロディ
- 3-6s：BGM が柔らかく盛り上がる（感謝の気づき）
- セリフなし（表情が全てを語る）

### ループ指示
- 6s 末尾のフレーム = 0s 最初のフレーム（顔の表情が同じ）
- 複数回ループ時も「感謝と決意」の重さが失われない
- 放送時は **3s × 2 ループ** で 6s 確保可能

### 🔴 核ショット（ここが本話の最重要）
- ハルナが「相手がいてくれるから、練習できる」という本質を理解
- 「自分本位」から「相手への感謝」への人格的変化が表現される
- 視聴者の心に「相手のおかげで、自分は成長できている」と思わせるカット

---

## C08｜翌日・ハルナがコウを見て挨拶（5秒）

**用途**: S6a のメインカット  
**尺**: 5秒  
**フレーム数**: 150 frames @ 30fps

### i2v プロンプト
```
camera: medium two-shot, Haruna front-center, slight push-in from 1.5s mark, 
motion: Haruna stands still (focused), Kō in background watching, 
arm movement: both at sides initially, Haruna's hand gesture opening (invitation), 
facial expression: Haruna = serious, focused, looking directly at Kō, 
eye contact: Haruna maintains steady gaze on Kō throughout (crucial), 
head position: Haruna's head up, engaged (not looking down), 
breathing: visible nervous breathing (this is hard for Haruna to do), 
body language: shoulders squared, posture respectful and sincere, 
Kō reaction: starts surprised, gradually shifts to understanding, 
lighting: warm soft evening sunlight (S6 gym setting), 
floor: pink star floor visible, 
background: quiet gym interior preparing for practice, 
overall tone: sincere gratitude, vulnerability mixed with resolve, specific action, 
animation intensity: medium (emotion + minor movement balance)
```

### 動作指示
- ハルナがコウを見つめ続ける（最重要）
- 少し緊張した呼吸（勇気を絞り出す）
- 身体は動かない（言葉に集中）
- コウは最初驚く → 理解に変わる

### 表情
- ハルナ：真剣（ほぼ無表情に近い）
- コウ：驚き → 信頼

### オーディオシンク
- 1s 時点で BGM が温かく前向きに変わる
- セリフ：「今日は私が持つね」
- 環境音：ジムの静かな空気

---

## C09｜役割交代・ハルナがミット持ち、コウがパンチ（5秒）

**用途**: S6b の実行シーン  
**入力画像**: C09-A 静止画（対等な位置関係）  
**尺**: 5秒  
**フレーム数**: 150 frames @ 30fps

### i2v プロンプト
```
camera: medium two-shot showing equal positioning, 
motion: Kō throwing one punch into mitt (slow, controlled), Haruna holding steady, 
Haruna arm movement: mitt absorbing punch impact (slight recoil visible), 
Kō arm movement: extending punch slowly into mitt (practicing, not explosive), 
facial expressions: both focused and calm, Haruna concentrating as supporter, 
breathing: synchronized breathing (emotional sync), 
body language: equal height, equal importance, symmetric positioning, 
lighting: warm evening sunlight illuminating both equally, 
floor: pink star floor, FLATUP GYM identity visible, 
ambient feeling: practice rhythm established together, 
overall tone: partnership, equality, mutual support beginning, 
animation intensity: medium (punch action + emotional balance)
```

### 動作指示
- コウがゆっくりパンチを打つ（一動作）
- ハルナがしっかりミットを保持（支える喜び）
- 二人の身体が symmetric（対等性）
- 視線は前向き（次への信頼）

### オーディオシンク
- パンチ音が聞こえる（でも激しくない）
- BGM は温かく前向き
- 環境音：ジムの日常が戻った感覚

---

## C10｜ラスト：夜のジム・交代するシルエット（★ループ可・6秒）

**用途**: S7 最終ショット - **ループ可**  
**尺**: 6秒  
**フレーム数**: 180 frames @ 30fps

### i2v プロンプト
```
camera: wide shot of gym interior, very subtle slow pan-up (looking toward future), 
motion: silhouettes of two children, minimal movement showing support exchange, 
silhouette definition: sharp edges catching moonlight + interior glow, 
Haruna and Kō silhouettes: standing close, passing mitt gesture visible (0.5-3s), 
body language: shoulders back, posture confident, stance ready, natural partnership, 
breathing: synchronized slow breathing (visible through silhouette chest), 
arm placement: relaxed at sides after exchange, mitt transfer motion subtle, 
lighting transition:
  - start: 50% moonlight (cool), 50% gym interior (warm), 
  - middle: 55% gym interior warmth (hope increases subtly), 
  - end: 60% gym interior warmth (growth and partnership visible), 
floor: pink star floor beneath silhouettes, glowing with mixed light, 
background: FLATUP GYM gym structure visible as dark shapes, 
Mitt and Flat-chan: seated in circle, watching with satisfied expressions, 
aura effect: warm light slightly expands around figures (partnership growing), 
atmospheric feeling: hope, resolution, partnership cemented, 
overall tone: future possibilities, quiet strength, mutual support, 
animation intensity: very low (contemplative finale, emotional not physical)
```

### 動作指示
- **シルエット**だからこそ「輪郭のはっきりさ」が重要
- 0.5-3s：二人がミットを交代する仕草（接近の感覚）
- 3-6s：両者が対等に並ぶ（安定した関係）
- 照明の比率が徐々に変わる（夜 → 希望）

### 色彩変化
- 開始：月光（青）が強い → 静寂
- 終盤：室内ピンク光（温かい）が強くなる → 希望

### オーディオシンク
- 最後のナレーション/テロップが入る背景として機能
- BGM のクレッシェンド（終盤で高まる）
- セリフ：「相手がいてくれるから、練習できる」

### ループ指示
- 6s 末尾 = 0s 開始と同じ構図（シルエットの角度が同じ）
- テロップ層と重ねるため **最小 6s × 1 ループ** で 6s、複数可
- シルエット = 観客の心を映す鏡（ループで思考促進）

### 🔴 最終ショット（全話の締め）
- 「相手がいてくれるから、練習できる」という学びの完成形
- ハルナとコウが対等に並ぶ姿 = メッセージの視覚化
- シルエット = 「これは君たちの物語。君たちが主人公」というメタ・メッセージ

---

## i2v 生成フロー

### Step 1: 基準フレーム確定
- 各カット C01-A ～ C10-A の最高品質版を確定
- 解像度 1024×1024 以上の静止画をロック

### Step 2: i2v 生成（Runway / Pika）
- 各カットを i2v API に投稿
- モーション指定に従い、4s ～ 6s のクリップ生成
- 必要に応じて複数テイク生成（モーション強度が異なるバリエーション）

### Step 3: フレームレート・尺確認
- 各クリップが指定秒数 + 正しい fps で生成されたか検証
- ループ可能カット（C07, C10）は seamless 確認

### Step 4: トランジション・編集
- カット間を 0.3s のクロスフェードで接続
- オーディオ（BGM / SE）のシンク調整
- 最終合成動画を出力

---

## 品質チェック（i2v 版）

- [ ] 各キャラのシルエット / 顔が変わっていない（特にループカット）
- [ ] 動きが「アニメ的滑らかさ」を保っている（3D 感がない）
- [ ] 照明の遷移が「心理状態」を表現している（S1 → S4-5 の変化）
- [ ] ループカット（C07, C10）が完全 seamless か（最後と最初がぴったり一致）
- [ ] 尺がずれていない（各カット ± 0.1s 以内）
- [ ] テキスト / ウォーターマークがない
- [ ] BGM と視覚的動きがズレていない
- [ ] ハルナの集中度が表現されているか（S1 が最高 > S4-5 で変わる）
- [ ] コウの疲労度が見えるか（S1-2 で最高 > S6 で回復）
- [ ] 相手への感謝が最終的に表現されているか（S7 のシルエット）

---

## 制作チェックリスト（全工程）

### 画像生成（IMAGE_PROMPTS.md）
- [ ] C01-A: ハルナの連打（集中、目が輝く）
- [ ] C01-B: コウの震える腕（疲労が見える）
- [ ] C02-A: 腕をさするコウ（疲労感が顕著）
- [ ] C03-A: 振り向かずに去るハルナ（相手を見ていない）
- [ ] C04-A: 円座のミットとフラットちゃん（温かい雰囲気）
- [ ] C05-A: 戸惑ったハルナ（象徴世界、気づき途中）
- [ ] C06-A: 「代わってない」と気づく（目が大きい）
- [ ] C07-A ★: 決意（相手への感謝が芽生えた顔）- **ループ確認**
- [ ] C08-A: 顔を見て挨拶（真摯、相手の目を見ている）
- [ ] C09-A: 役割交代（対等な位置関係）
- [ ] C10-A ★: シルエット（希望の光）- **ループ確認**

### ビデオ生成（VIDEO_PROMPTS.md）
- [ ] C01-A: 連打のリズム・呼吸・目の輝き
- [ ] C01-B: 腕の震え・ミット保持・疲労感
- [ ] C02-A: 腕をさする動作・疲労の解放・孤立感
- [ ] C03-A: 振り向かずに歩く・相手を見ていない
- [ ] C04-A: 円座の安定感・ミットの小さな揺れ・相談風景
- [ ] C05-A: 視線が落ちる・思考の過程・気づきへの移行
- [ ] C06-A: 目が開く・吸息・罪悪感と気づきの混在
- [ ] C07-A ★: 表情の遷移（感謝が芽生える）・光の昇華・ループ seamless
- [ ] C08-A: 相手の目を見続ける・勇気・真摯さ
- [ ] C09-A: パンチ音・ミット保持の喜び・対等性
- [ ] C10-A ★: シルエットの輪郭・照明比の変化・ループ seamless

### 最終統合
- [ ] 全カットが時系列順で接続
- [ ] トランジション 0.3s で滑らか
- [ ] 総尺が 30s (本編 24s + テロップ 6s) に一致
- [ ] BGM / SE とビジュアルが完全シンク
- [ ] 字幕・テロップが間違いなく読める位置に配置
- [ ] エンディング「FLATUP GYM」ロゴが 3s 表示
- [ ] 「相手のおかげ」という感覚が伝わるか（最後の評価）

---

**次のステップ: EP11「支える喜び」の制作開始**

このテンプレートを参考に、EP10 の完成を確認した後、EP11 ～ EP13 の制作資料を順次作成します。

