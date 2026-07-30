# EP09「かった、から、こそ。」— Image-to-Video（i2v）プロンプト集

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

## C01-A｜レンのガッツポーズ（正面・2秒）

**用途**: S1 オープニング  
**入力画像**: C01-A静止画（レンのガッツポーズ）  
**尺**: 2秒  
**フレーム数**: 60 frames @ 30fps

### i2v プロンプト
```
camera: static medium shot, Ren standing with fist pump pose, 
motion: gentle breathing of chest and shoulders, 
slight bounce in the knees as if landing from a jump, 
arms maintain high position with slight oscillation (0.5s cycle), 
facial expression: bright smile remains constant, 
eyes gleam with joy (subtle highlight changes), 
background: FLATUP GYM gym with star floor, warm evening sunlight stable, 
ambient movement: subtle dust particles catching light, 
overall tone: triumphant, celebratory, innocent joy, 
animation intensity: low-medium (subtle, not bouncy)
```

### 動作指示
- 上半身の呼吸感（微細）
- グローブがわずかに上下（喜びが続く感覚）
- 足の着地感を微調整（完全に着地した安定感）
- 顔の輝きが徐々に変わる（喜びの頂点をキープ）

### オーディオシンク
- BGM の高揚感に合わせて、グローブの上下が 1.5 拍分（0.75s）の間隔で繰り返す
- 歓声のピークに合わせて最大の笑み（1.5s 付近）

---

## C01-B｜ユズキが静かに去る（側面・左・2秒）

**用途**: S1 コンテキスト・ショット  
**入力画像**: C01-B 静止画（ユズキが去る、背景奥にレンが見える）  
**尺**: 2秒  
**フレーム数**: 60 frames @ 30fps

### i2v プロンプト
```
camera: medium shot tracking Yuzuki slowly walking away to frame background, 
motion: slow steady walk (1 meter per 2 seconds), 
posture: shoulders slightly dropped, head slightly down, 
arm movement: arms move naturally with walk but tentative, not confident, 
facial expression: downward gaze, no smile, quiet sadness (subtle), 
foreground: blurred Ren celebrating (remains blurred throughout), 
lighting: same warm evening sunlight but Yuzuki appears in cooler tone, 
ambient movement: minimal (only footsteps suggested), 
overall tone: melancholic, isolated despite proximity to joy, 
animation intensity: low (slow, heavy steps, introspective)
```

### 動作指示
- ゆっくりとした歩き（重い足取り）
- 肩が落ちたままキープ
- 顔は下向き（視線が床に）
- 背景のレンの輝きとの対比が際立つ

### オーディオシンク
- 歓声の音量が段階的に下がる（心理的距離の拡大）
- ユズキの足音が聞こえるが、歓声に打ち消されている感覚

### トランジション（C01-A → C01-B）
- 同じフレーム内で 1.5s 時点で フェードイン
- ユズキの登場で雰囲気が沈む感覚

---

## C04-A｜レンが戸惑った表情で立つ（3秒）

**用途**: S4a 心の気づきの入口  
**入力画像**: C04-A 静止画（灰色空間、レンの上半身クローズアップ）  
**尺**: 3秒  
**フレーム数**: 90 frames @ 30fps

### i2v プロンプト
```
camera: static close-up of Ren's upper body and face, 
motion: minimal movement, subtle fidgeting of hands, 
posture: standing still, weight slightly shifted, 
facial expression: confused frown that deepens gradually, 
eyes: scanning left and right as if searching for understanding, 
breathing: visible chest breathing (deeper than usual, anxiety), 
head movement: slight tilt towards right at 1.5s mark (confusion peak), 
lighting: soft gray space with diffuse light, no harsh shadows, 
subtle glow: gentle warm light appearing from above (foreshadowing resolution), 
overall tone: introspective, anxious, questioning, 
animation intensity: very low (psychological, not physical)
```

### 動作指示
- 両手が微かに握り拳になる（不安）
- 眉間に縦線が入る（思考の深まり）
- 視線が彷徨う（「見てなかった」ことへの気付き途中）
- 1.5s で頭がわずかに傾く（「はっ」とする予兆）

### オーディオシンク
- 静寂の中に呼吸音が聴こえ始める
- 1.5s 時点で環境音（風のような音）が徐々に入る
- BGM がまだ始まっていない状態（内面の静寂）

---

## C04-B｜フラットちゃんが優しく問いかけ（2秒）

**用途**: S4b 導き手の登場  
**入力画像**: C04-B 静止画（レンとフラットちゃんのミディアム 2 ショット）  
**尺**: 2秒  
**フレーム数**: 60 frames @ 30fps

### i2v プロンプト
```
camera: medium two-shot, slightly favoring Flat-chan, 
motion: Flat-chan takes one gentle step closer to Ren (0.3m, 0.5s duration), 
Ren shifts weight slightly but doesn't move back, 
arm movement: Flat-chan's right arm raises to open palm gesture (warm, inviting), 
facial expression: Flat-chan's smile is constant and warm, eyes reflect kindness, 
Ren's expression: watches Flat-chan approach (still confused), 
lighting: soft golden light gradually increases around Flat-chan, 
subtle aura: warm light around Flat-chan grows brighter (mentor presence), 
background: gray space remains still and calm, 
overall tone: supportive, safe, the questioning is about to be answered, 
animation intensity: low-medium (gentle approach, no sudden movement)
```

### 動作指示
- フラットちゃんが 0.5s をかけてゆっくり接近
- 開かれた手のひら（受け入れの姿勢）
- 笑顔は一貫性を保つ（責めない、温かい）
- レンの視線が顔を上げる（相手を見始める）

### オーディオシンク
- フラットちゃんの足音（やさしい）
- BGM がここで初めて入り始める（温かいメロディ）
- セリフの前振り（音声がまもなく入ることの予感）

---

## C06-A｜「見てなかったかも」と気づく（1秒）

**用途**: S4b クライマックス予兆  
**入力画像**: C06-A 静止画（レンの顔のみ、極アップ）  
**尺**: 1秒  
**フレーム数**: 30 frames @ 30fps

### i2v プロンプト
```
camera: extreme close-up of Ren's face, static, 
motion: eyes widen significantly in 0.3s, then hold, 
eyebrows raise upward (realization), 
mouth: transitions from small frown to surprised 'O' shape, 
facial animation: sudden, like a light bulb moment, 
breathing: sharp intake of breath (visible chest heave), 
lighting: slight brightening around face (psychological illumination), 
background: still gray space, no distraction, 
overall tone: sudden realization, the moment of recognition, 
animation intensity: medium (quick but natural transition)
```

### 動作指示
- 目が大きく開く（0.3s で完了）
- 眉が上がる（驚き → 気づき）
- 口が「O」字に（言葉が出ない瞬間の表現）
- 吸息が聞こえるほどの呼吸変化

### オーディオシンク
- 環境音が一瞬静まる（時が止まったような感覚）
- 吸息音（SE）
- BGM が一瞬 drop（心の動きを表現）

### 重要
- この 1 秒が **気づきの瞬間** の最初のシグナル
- C06-B（核ショット）への直接的な前振り

---

## C06-B｜決意の顔に変わる（核ショット・3秒・ループ可）

**用途**: S5 最重要ショット - **スローモーション** 推奨  
**入力画像**: C06-B 静止画（レン、決意の表情、上半身）  
**尺**: 3秒  
**フレーム数**: 90 frames @ 30fps

### i2v プロンプト
```
camera: static close-up from face to chest, very slight tilt down to emphasize resolve, 
motion: minimal physical movement - this is ALL about expression, 
face animation: 
  - 0-0.5s: eyes transition from wide (C06-A) to focused and determined, 
  - 0.5-1.5s: eyebrows settle into lowered position (concentration), 
  - 1.5-3s: mouth slowly shifts from 'O' to closed, firm line (quiet resolve), 
eyes: bright, intelligent, filled with newfound understanding and determination, 
subtle detail: inner strength visible in eyes (not anger, not aggression - quiet power), 
lighting transition: 
  - start: cool gray space light (C06-A continuation), 
  - middle: gradual increase of warm golden light (sunrise-like, enlightenment), 
  - end: soft golden-white glow (new understanding achieved), 
breathing: steady, deep, controlled (the boy has found his center), 
overall tone: transformation moment, personal growth, the hero rises to challenge, 
NOT: angry, aggressive, fierce - instead: calm, centered, purposeful, 
animation intensity: very low-medium (expression-focused, not action-focused), 
loop capability: FULL (entire 3s loops seamlessly for extended emotional impact)
```

### 動作指示
- **重要**: 「怒った顔」ではなく「静かな決意」
- 目が焦点を結ぶ（ぼやけた状態から明瞭へ）
- 眉が下がるが、緊張ではなく集中
- 口が一文字に閉じる（言葉ではなく行動の時へ）
- 光が少しずつ暖かくなる（気づき → 朝日のような新しい時間）

### 顔の造形変化
- 眼窩が微かに深くなる（内向的思考から決意へ）
- 目の奥が光を取る（覚悟の決定）
- ほほの筋肉が微かに上がる（強さではなく静かな自信）

### オーディオシンク
- 最初：静寂が続く
- 0.5s ～ 1.5s：BGM が徐々に上昇、朝日のようなメロディ
- 1.5s ～ 3s：BGM が最高潮に（決意の音）
- セリフなし（表情が全てを語る）

### ループ指示
- 3s 末尾の フレーム = 0s 最初のフレームと同じ顔 make
- 複数回ループ時も「決意の瞬間」の重さが失われない
- 放送時は **3s × 2-3 ループ** で 6-9s 確保可能

### 🔴 核ショット（ここが本話の最重要）
- レン（勝者）が「相手を見下すのではなく見守る」という気づき
- 表情だけで「人格的変化」が明確に映る
- 視聴者の心に「自分もこの子のようにありたい」と思わせるカット

---

## C07-A｜レンが照れながら真剣に話しかける（2.5秒）

**用途**: S6a 実行フェーズ  
**入力画像**: C07-A 静止画（レンが照れ笑い、ユズキに向き合う）  
**尺**: 2.5秒  
**フレーム数**: 75 frames @ 30fps

### i2v プロンプト
```
camera: medium two-shot, slight push-in from 1s mark (emotional proximity), 
motion: Ren takes small steps forward (1 meter over 1.5s), approaching Yuzuki, 
arm gesture: Ren's right hand reaches out (not touching, but open invitation), 
facial expression: shy smile (rosy cheeks) remains but eyes serious, 
head: slight forward tilt (engagement, respect), 
body language: shoulders squared, posture confident despite embarrassment, 
breathing: visible nervous breathing (this is hard for Ren), 
lighting: warm soft evening sunlight (S6 gym setting), 
Yuzuki's reaction: subtle - eyes widen slightly, body doesn't move (waiting for words), 
background: pink star floor visible, FLATUP GYM logo in distance, 
overall tone: sincere apology, vulnerability mixed with resolve, 
animation intensity: medium (movement + emotion balanced)
```

### 動作指示
- ゆっくり前に進む（勇気を絞り出す感覚）
- ほほの赤みが維持（照れが続く）
- 目は真っすぐ（でも緊張で微かに揺らぐ）
- 手が開く（受け入れの姿勢）

### カメラ
- 1s 時点でスローズーム・イン（心理的距離が縮まる）
- レンとユズキの関係の修復が始まる瞬間

### オーディオシンク
- 1s 時点で BGM が温かく前向きに変わる
- 足音が聞こえるが、おどおどしていない（真摯さ）
- 環境音：ジムの静かな空気

---

## C07-B｜ユズキが驚いた顔から嬉しそうに（2.5秒）

**用途**: S6b リアクション・シーン  
**入力画像**: C07-B 静止画（ユズキ、表情が遷移する）  
**尺**: 2.5秒  
**フレーム数**: 75 frames @ 30fps

### i2v プロンプト
```
camera: close-up of Yuzuki's face, then slight pull-back to include shoulders, 
motion: minimal physical movement, ALL facial animation, 
expression transition:
  - 0-0.5s: wide-eyed surprise (mouth O-shaped), 
  - 0.5-1.5s: gradual relaxation, realization (not mocking, genuine care), 
  - 1.5-2.5s: bloom into full smile, rosy cheeks, glowing eyes, 
eyes: transition from shock to joy (light enters eyes), 
eyebrows: from high-raised to relaxed and warm, 
breathing: visible intake at start, then calm steady breathing, 
body: slight backward sway as if emotionally moved, small nod at 2s mark, 
lighting: same warm evening light, may strengthen toward 2.5s end (happiness glow), 
overall tone: healing moment, the hurt boy finds validation, joy is genuine relief, 
animation intensity: medium (expression focus with subtle body language)
```

### 動作指示
- 最初（0-0.5s）：驚き（目が大きい、口が O 字）
- 中盤（0.5-1.5s）：理解が進む（表情が柔らかくなる）
- 終盤（1.5-2.5s）：喜びが爆発（笑顔が花開く）
- 2s 時点で小さく頷く（感謝と承認）

### 顔の色
- ほほがだんだん赤くなる（嬉しさ）
- 目の中に光が入る（希望）

### オーディオシンク
- 1.5s 時点で BGM が高揚（ユズキの心の転機）
- 笑顔に合わせてチャイム音（可視化された喜び）

### 時間経過表現
- 静止画では「時間経過した表情」を表示
- i2v で「その間の心の変化」を動画化
- **ポイント**: 一瞬のリアクションではなく「プロセス」として見せる

---

## C09-A｜二人が並んで立つ・ミディアム（2秒）

**用途**: S6 エンディング / 関係修復の象徴  
**入力画像**: C09-A 静止画（レンとユズキが並ぶ）  
**尺**: 2秒  
**フレーム数**: 60 frames @ 30fps

### i2v プロンプト
```
camera: medium two-shot side profile, very slight Dutch angle (visual stability), 
motion: both boys standing still, minimal movement, 
breathing: synchronized chest breathing (emotional synchrony), 
arm gesture: both hands at sides, gloves visible, ready stance, 
facial expression: both calm, focused, looking forward (not at each other), 
eyes: steady, purposeful, ready for next challenge together, 
lighting: warm soft golden evening sunlight, equal illumination on both, 
floor: pink star floor beneath feet (FLATUP GYM identity), 
subtle detail: slight shoulder-to-shoulder proximity (comfortable companionship, not intimacy), 
background: gym interior visible, calm environment, 
overall tone: restored friendship, ready for the future together, 
animation intensity: very low (stillness = peace and resolution)
```

### 動作指示
- ほぼ静止（安定感 = 関係が修復された）
- 呼吸の同期（心が一つになった感覚）
- 視線が前向き（次へ進む覚悟）
- グローブが見える（格闘技ジムの日常が戻った）

### カメラ
- 完全に静止（ストーリー上の「間」）
- 二人の姿が symmetric（関係の対等性）

### オーディオシンク
- BGM が温かく前向き
- 足音がなくなり、純粋な環境音（ジムの静寂）
- セリフなし（雰囲気が全てを語る）

---

## C10-A｜ジム全景 + フラットちゃん + ミット（3秒）

**用途**: S7a エンディング背景・ナレーション層  
**入力画像**: C10-A 静止画（夜のジム全景）  
**尺**: 3秒  
**フレーム数**: 90 frames @ 30fps

### i2v プロンプト
```
camera: wide establishing shot of gym interior at night, very slight slow push-in (intimate), 
motion: minimal overall, subtle ambient movement, 
foreground: Flat-chan and Mitt sitting in circle, 
Flat-chan: gentle rocking motion (0.2s cycle), warm smile unchanging, 
Mitt: slight wobble/nod in sympathy (supportive companion), 
lighting: blue moonlight from windows + warm interior light mix, 
floor: pink star floor glowing softly in mixed light, 
wall: FLATUP GYM logo visible, glowing subtly, 
ambient movement: dust particles catching light (peace, serenity), 
background depth: soft bokeh of other gym equipment, 
overall tone: peaceful nighttime sanctuary, wisdom being shared, 
animation intensity: very low (meditative stillness)
```

### 動作指示
- フラットちゃんが微かに身体をゆらす（話し手のテンポ）
- ミットが小さく頷く（共感の身振り）
- ジム全体が静寂に包まれている（特別な時間）

### 照明
- 月光（青）と室内光（温かい）のミックス
- コントラストが季語感を作る（夜の瞑想）

### オーディオシンク
- フラットちゃんのセリフが入る（背景として機能）
- BGM は温かく、余韻を残す
- 効果音：風の音、わずかな明かりの音

---

## C10-B｜レン + ユズキのシルエット（最終ショット・3秒・ループ可）

**用途**: S7 最終ショット - **スローモーション** 推奨  
**入力画像**: C10-B 静止画（二人のシルエット）  
**尺**: 3秒  
**フレーム数**: 90 frames @ 30fps

### i2v プロンプト
```
camera: wide shot of silhouettes, subtle slow pan-up (looking toward future), 
motion: both boys standing still (strong finale stillness), 
silhouette definition: sharp edges catching moonlight + interior glow, 
body language: shoulders back, posture confident, stance ready for challenge, 
breathing: synchronized slow breathing (visible through silhouette chest), 
arm placement: relaxed at sides, gloves catching subtle light edges, 
lighting transition:
  - start: 50% moonlight (cool), 50% gym interior (warm), 
  - end: 60% gym interior warmth (hope increases), 
floor: pink star floor beneath silhouettes, glowing in mixed light, 
background: FLATUP GYM gym structure visible as dark shapes, 
aura effect: warm light slightly expands around figures (hope spreading), 
overall tone: hope, resolution, future possibilities, quiet strength, 
animation intensity: very low (contemplative finale)
```

### 動作指示
- **シルエット** だからこそ「輪郭のはっきりさ」が重要
- 二人の身体が静止（決定した人生の瞬間）
- 照明の比率が徐々に変わる（夜 → 希望の朝へ）

### 色彩変化
- 開始：月光（青）が強い → 静寂
- 終盤：室内光（温かい）が強くなる → 希望

### オーディオシンク
- 最後のナレーション / テロップが入る背景として機能
- BGM のクレッシェンド（終盤）
- セリフ：「今日も、小さな優しい強さを。」

### ループ指示
- 3s 末尾 = 0s 開始と同じ構図
- テロップ層と重ねるため **最小 3s × 2 ループ** で 6s 確保可能
- シルエット = 観客の心を映す鏡（ループで瞑想効果）

### 🔴 最終ショット（全話の締め）
- 「勝ったあと、相手を見下さない」という学びの完成形
- 二人が対等に並ぶ姿 = メッセージの視覚化
- シルエット = 「これは君たちの物語。君たちが主人公」というメタ・メッセージ

---

## i2v 生成フロー

### Step 1: 基準フレーム確定
- 各カット C01-A ～ C10-B の最高品質版を確定
- 解像度 1024×1024 以上の静止画をロック

### Step 2: i2v 生成（Runway / Pika）
- 各カットを i2v API に投稿
- モーション指定に従い、0.5s ～ 3s のクリップ生成
- 必要に応じて複数テイク生成（モーション強度が異なるバリエーション）

### Step 3: フレームレート・尺確認
- 各クリップが指定秒数 + 正しい fps で生成されたか検証
- ループ可能カット（C06-B, C10-B）は seamless 確認

### Step 4: トランジション・編集
- カット間を 0.3s のクロスフェードで接続
- オーディオ（BGM / SE）のシンク調整
- 最終合成動画を出力

---

## 品質チェック（i2v 版）

- [ ] 各キャラのシルエット / 顔が変わっていない（特にループカット）
- [ ] 動きが「アニメ的滑らかさ」を保っている（3D 感がない）
- [ ] 照明の遷移が「心理状態」を表現している（S1 → S4-5 の温度変化）
- [ ] ループカット（C06-B, C10-B）が完全 seamless か（最後と最初がぴったり一致）
- [ ] 尺がずれていない（各カット ± 0.1s 以内）
- [ ] テキスト / ウォーターマークがない
- [ ] BGM と視覚的動きがズレていない（特に決意の瞬間）

---

## 制作チェックリスト（全工程）

### 画像生成（IMAGE_PROMPTS.md）
- [ ] C01-A: ガッツポーズ（満面の笑み、グローブ見える）
- [ ] C01-B: ユズキが去る（肩が落ちている、視線下）
- [ ] C04-A: 戸惑った顔（眉寄り、小さい口）
- [ ] C04-B: フラットちゃん（優しい笑顔、開かれた手）
- [ ] C06-A: 気づき（目が大きい、口がO字）
- [ ] C06-B ★: 決意（眉下がり、口一文字、光が増加）- **ループ確認**
- [ ] C07-A: 照れながら真剣（ほほ赤い、視線真っすぐ）
- [ ] C07-B: 驚きから喜び（表情遷移、ほほ赤くなる）
- [ ] C09-A: 二人並ぶ（対等、安定感）
- [ ] C10-A: ジム全景（月光 + 温かい光）
- [ ] C10-B ★: シルエット（輪郭明確、希望の光）- **ループ確認**

### ビデオ生成（VIDEO_PROMPTS.md）
- [ ] C01-A: 息遣い・グローブの上下・歓声とシンク
- [ ] C01-B: ゆっくりした歩き・肩の落ち・音の違和感
- [ ] C04-A: 視線彷徨い・呼吸の変化・不安感
- [ ] C04-B: 優しい接近・手のジェスチャー・光の増加
- [ ] C06-A: 目が大きく開く・吸息・環境音が静まる
- [ ] C06-B ★: 表情の遷移（怒りではなく決意）・光の昇華・ループ seamless
- [ ] C07-A: 前への歩み・照れながら真摯・カメラズーム
- [ ] C07-B: 表情の段階的変化・小さな頷き・喜びの光
- [ ] C09-A: 同期呼吸・前向き視線・ジムの日常
- [ ] C10-A: 月光と温かい光のバランス・瞑想的雰囲気
- [ ] C10-B ★: シルエットの輪郭・照明比の徐々の変化・ループ seamless

### 最終統合
- [ ] 全カットが時系列順で接続
- [ ] トランジション 0.3s で滑らか
- [ ] 総尺が 30s (本編 24s + テロップ 6s) に一致
- [ ] BGM / SE とビジュアルが完全シンク
- [ ] 字幕・テロップが間違いなく読める位置に配置
- [ ] エンディング「FLATUP GYM」ロゴが 3s 表示

---

**次のステップ: EP10「のびしろ、無限大。」の制作開始**

このテンプレートを参考に、EP09 の完成を確認した後、EP10 ～ EP13 の制作資料を順次作成します。

