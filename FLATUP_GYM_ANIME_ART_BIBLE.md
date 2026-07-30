# FLATUP GYM ANIME — 統一キャラクター設定書

**正本版**  
作成: 2026-07-29  
ステータス: 制作資料  

---

## 概要

本資料は、FLATUP GYM ブランドアニメ（全13話）における**キャラクターデザインの統一基準**です。  
全話で一貫性のあるビジュアルを保ちながら、各話のコンセプトに応じた色合い・表情バリエーションを実装します。

**制作方針**
- スタイル: 2.5頭身ちびアニメキャラ（公式設計資料準拠）
- 生成ツール: Flux / Hailuo（i2v も対応）
- 量産方式: 基準画像 → シーン別派生 → i2v ループ

---

## Part 1: 基本スタイル指示

### ビジュアル統一規則

| 項目 | 指示 |
|---|---|
| **頭身** | 2.5頭身（ちび体型） |
| **顔** | 丸顔、大きな目（アニメ風）、厚みのある唇 |
| **髪** | ツインテール（基本）/ アレンジ可（各キャラ） |
| **グローブ** | 赤いボクシンググローブ（手首まで、指が出ない） |
| **ウェア** | FLATUP GYM ロゴ入りTシャツ ＋ ムエタイショーツ |
| **足** | 裸足（靴なし） |
| **表情** | 明るく元気（基本）/ 各話テーマに応じた感情表現 |
| **背景** | ジムの星型フロア（各話で色調変更） |

### 共通ネガティブプロンプト

```
(bad quality, blurry, distorted, 3D, realistic, photorealistic, adult, 
serious expression, sad, angry, wearing shoes, wearing earrings, 
long gloves with fingers, CGI, illustration inconsistency)
```

### ポーズテンプレート（6方向）

各キャラクターについて以下の 6 ポーズを基準画像として固定：

1. **正面** — 両手ガード、微笑み
2. **斜め45°（右）** — 左ジャブのポーズ
3. **側面（右）** — 右ストレートのポーズ
4. **背後** — 背中姿勢
5. **側面（左）** — 左フックのポーズ
6. **斜め45°（左）** — 右ミドルキックのポーズ

### シーンバリエーション（全キャラ共通テンプレート）

| シーン | 表情 | 台詞枠 | 用途 |
|---|---|---|---|
| **満足笑顔** | にっこり、目が笑っている | 明るいシーン用 | 成功・喜び |
| **困った顔** | 眉を寄せる、口が小さい | 悩みシーン用 | 悩み・迷い |
| **真剣顔** | 眉が下がる、口が一文字 | 決意シーン用 | 覚悟・挑戦 |
| **照れ笑い** | 頬が赤い、目が細い | 恥ずかしいシーン用 | 恥ずかしさ・嬉しさ |
| **驚き顔** | 目が大きい、口がO字 | 驚嘆シーン用 | 驚き・発見 |
| **悲しい顔** | 目が下向き、口が下がる | 悲しいシーン用 | 失落・後悔 |
| **疲れた顔** | 目が半開き、肩が落ちる | 疲労シーン用 | 疲れ・諦め |

---

## Part 2: 既存キャラクター

### A. フラットちゃん（マスコット）

**役割**: ナビゲーター、メンター、指導者

**基本設定**
- ジムのマスコット・キャラクター
- 性別: 女性（ただし完全な「人間」ではなく、ジム擬人化的存在）
- 年代: 見た目は30代後半、でも実は「ジムの精」的な存在
- 髪: 黒髪ポニーテール（ツインテールではなく）
- 表情: 温かく優しい笑顔（常に穏やか）

**ビジュアル**
- ウェア: FLATUP GYM 公式Tシャツ（黒地に白ロゴ）
- グローブ: 赤いグローブ（他の子と同じ）
- 特徴: 子どもたちより少し背が高め（大人サイズ感）
- 表情: 責めない、肯定する、導く笑顔が基本

**台詞・トーン**
- 「そっか」「うん」「いいんだよ」という肯定的な返し
- 子どもを上から見ない、横並びの立場で話す
- 子ども本人の気づきを促す問い方

**シーン分類**
1. **円座での夜の会話** — フラットちゃん + 道具たちのシーン
2. **象徴世界での対話** — フラットちゃん + 子ども1人のシーン
3. **心の技レッスン** — フラットちゃん + 子ども + 道具のシーン
4. **ジムの日中** — 背景人物として登場

**生成プロンプト基本形**
```
cute chibi character, 2.5 head, ponytail black hair, warm gentle smile, 
kind eyes, wearing red boxing gloves and FLATUP GYM branded t-shirt, 
barefoot, standing in calm pose in gym with star floor, 
soft sunlight, supportive mentor expression, anime style, 
illustration by Studio Ghibli aesthetic
```

---

### B. サンドバッグ（マスコット）

**役割**: 観察者、共感者、ユーモア担当

**基本設定**
- ジムのサンドバッグの擬人化
- 性別: 中性的（「子どもっぽい」というより「道具が喋ってる」感覚）
- 年代: 見た目年齢なし（道具だから）
- 色: ベージュ・茶色系
- 表情: 柔らかく、時々ユーモラス

**ビジュアル**
- 形状: 丸いサンドバッグの形をしたキャラ（ぬいぐるみのようにキュート化）
- サイズ: フラットちゃんと同じぐらい、または少し小さめ
- 表情: 眉毛と目で表現（シンプル）
- 動き: 小さく首を傾げたり、頷いたりする

**台詞・トーン**
- 短めの返し
- 子どもの気持ちに寄り添う「うん」「そっか」
- フラットちゃんの言葉を補足・拡張する役

**シーン分類**
1. **夜のジム円座** — フラットちゃんとペアで登場
2. **心の技レッスン** — フラットちゃん + 子ども + サンドバッグ

**生成プロンプト基本形**
```
cute chibi sandy beige round punching bag character with simple face, 
small body, gentle expression, in gym with FLATUP GYM logo, 
supportive companion, anime style, soft warm light
```

---

### C. ミット（マスコット）

**役割**: 現場の声、子どもたちの視点を代弁

**基本設定**
- ジムのミット（パッド）の擬人化
- 性別: 中性的
- 年代: 見た目年齢なし
- 色: 黒と赤（実際のパッドの色）
- 表情: サンドバッグより少しエネルギッシュ

**ビジュアル**
- 形状: 丸いミットの形（手のひらサイズ）
- サイズ: サンドバッグと同じか少し小さめ
- 表情: 目と口で表現
- 動き: パタパタと動く感じ

**台詞・トーン**
- 現場での観察を語る
- 「あのときのキック」など、子どもの具体的な動きを褒める
- ユーモアを交える

**シーン分類**
1. **夜のジム円座** — フラットちゃんとペアで登場
2. **心の技レッスン** — フラットちゃん + 子ども + ミット

**生成プロンプト基本形**
```
cute chibi red and black boxing mitt character with simple friendly face, 
small round body, energetic expression, in gym, supportive companion, 
anime style, warm light
```

---

## Part 3: EP09-13 新規キャラクター

### EP09: レン（試合で勝った子）

**基本設定**
- **年代**: 小学3年生（8-9歳）
- **性別**: 男の子
- **性格**: 素直で明るい、でも無邪気に傷つける言葉を言ってしまう
- **髪**: 短髪、黒髪（おデコが見える）
- **髪色・髪型**: 明るい黒、ちょっと立った毛

**ビジュアル特徴**
- グローブ: 赤（共通）
- ウェア: 赤と白のカラーブロック（スポーティーで男の子らしい）
- 表情: にっこり笑顔が基本（素直さを表現）

**各シーンでの表情**
- S1（勝利直後）: 満足笑顔 + ガッツポーズ
- S4（気づき）: 困った顔 → 真剣顔
- S6（翌日）: 照れ笑い + 真摯な表情

**生成プロンプト共通要素**
```
cute chibi boy character, 8 years old, short black hair, bright cheerful 
smile (or specified emotion), red and white sporty shirt, red boxing gloves, 
barefoot, FLATUP GYM gym setting with pink star floor
```

---

### EP09: ユズキ（試合で負けた子）

**基本設定**
- **年代**: 小学3年生
- **性別**: 男の子
- **性格**: 控えめ、傷つきやすい
- **髪**: 短髪、少し長めのボブ感
- **髪色**: 黒

**ビジュアル特徴**
- グローブ: 赤
- ウェア: 紺と黄のカラー（落ち着いた色合い）
- 表情: 静かな表情（控えめさを表現）

**各シーンでの表情**
- S1（負け直後）: 俯いた顔
- S2: 静かに去る（無表情）
- S6（翌日）: 驚き顔 → 嬉しそうな笑顔

**生成プロンプト共通要素**
```
cute chibi boy character, 8 years old, soft black hair, calm quiet expression, 
navy and yellow shirt, red boxing gloves, barefoot, FLATUP GYM gym, 
reserved modest demeanor, anime style
```

---

### EP10: ハルナ（上達に夢中で周りが見えない子）

**基本設定**
- **年代**: 小学3年生
- **性別**: 女の子
- **性格**: 真面目、向上心が高い、でも視野が狭くなりやすい
- **髪**: ツインテール、黒髪
- **髪色・髪型**: しっかりした束ねられたツインテール

**ビジュアル特徴**
- グローブ: 赤
- ウェア: 黄と黒のカラー（エネルギッシュ）
- 表情: 真剣な顔が基本（集中力）

**各シーンでの表情**
- S1-2（練習中）: 真剣顔、疲れた顔
- S4（気づき）: 困った顔 → 気まずい顔
- S6（翌日）: 真剣顔 + 満足笑顔

**生成プロンプト共通要素**
```
cute chibi girl character, 8 years old, twin tails black hair, serious 
focused expression, yellow and black sporty outfit, red boxing gloves, 
barefoot, FLATUP GYM gym, concentrated on training, anime style
```

---

### EP10: コウ（ハルナのパートナー）

**基本設定**
- **年代**: 小学3年生
- **性別**: 男の子
- **性格**: 穏やかで、ハルナを支える（言葉が少ない）
- **髪**: 短髪、黒髪
- **髪色**: 濃い黒

**ビジュアル特徴**
- グローブ: 赤
- ウェア: 緑と紺のカラー（落ち着いた色合い）
- 表情: 穏やかさ（優しい目）

**各シーンでの表情**
- S1-2（ミット持ち）: 我慢する顔、腕をさする
- S6（翌日）: 驚いた顔 → 嬉しそうな笑顔

**生成プロンプト共通要素**
```
cute chibi boy character, 8 years old, short black hair, calm gentle 
expression, green and navy shirt, red boxing gloves, barefoot, 
FLATUP GYM gym, supportive steady demeanor, anime style
```

---

### EP11: ユウ（新入りに声をかける勇気を持つ子）

**基本設定**
- **年代**: 小学4年生（9-10歳）
- **性別**: 男の子
- **性格**: 優しい、ジム経験が長い、でも新しい子に声をかけるのは苦手
- **髪**: 短髪、黒髪（落ち着いた印象）
- **髪色**: 濃い黒

**ビジュアル特徴**
- グローブ: 赤
- ウェア: 灰色と紺のカラー（落ち着き）
- 表情: 優しい顔（基本）

**各シーンでの表情**
- S1-2（悩み）: 迷いの顔 → 困った顔
- S4（気づき）: はっとした顔
- S6（翌日）: 緊張しつつも真剣な顔 → 満足笑顔

**生成プロンプト共通要素**
```
cute chibi boy character, 9 years old, short black hair, kind gentle eyes, 
gray and navy shirt, red boxing gloves, barefoot, FLATUP GYM gym, 
experienced but shy demeanor, anime style
```

---

### EP11: ダイ（新しく入った子）

**基本設定**
- **年代**: 小学低学年（6-7歳）
- **性別**: 男の子
- **性格**: 緊張しやすい、初心者
- **髪**: 短髪、黒髪
- **髪色**: 黒

**ビジュアル特徴**
- グローブ: 赤（持ってる状態が多い）
- ウェア: 緑のシンプルシャツ
- 表情: 緊張した顔（基本）

**各シーンでの表情**
- S1（一人立ち尽くし）: 緊張、怖い顔
- S6（翌日）: 驚き顔 → ぱっと明るい笑顔

**生成プロンプト共通要素**
```
cute chibi boy character, 6 years old, short black hair, nervous 
anxious expression, green simple shirt, holding red boxing gloves, 
barefoot, FLATUP GYM gym, scared but hopeful, beginner, anime style
```

---

### EP12: レイ（挑戦するのが怖い子）

**基本設定**
- **年代**: 小学3年生
- **性別**: 男の子
- **性格**: 慎重、失敗するところを見られるのが怖い
- **髪**: 短髪、黒髪
- **髪色**: 濃い黒

**ビジュアル特徴**
- グローブ: 赤
- ウェア: 紫と白のカラー（慎重さ、落ち着き）
- 表情: 警戒気味（基本）

**各シーンでの表情**
- S1-2（そわそわ）: 不安、そわそわ
- S4（本音）: 困った顔 → はっとした顔
- S6（翌日）: 緊張しながらも決意の顔

**生成プロンプト共通要素**
```
cute chibi boy character, 8 years old, short black hair, cautious careful 
expression, purple and white shirt, red boxing gloves, barefoot, 
FLATUP GYM gym, nervous but determined, anime style
```

---

### EP13: ミオ（他人と比べてしまう子）

**基本設定**
- **年代**: 小学3年生
- **性別**: 女の子
- **性格**: 真面目で向上心がある、でも人と比べてしまう癖がある
- **髪**: ツインテール、黒髪
- **髪色**: 黒、しっかり束ねた感じ

**ビジュアル特徴**
- グローブ: 赤
- ウェア: 紫と黒のカラー（真面目さ）
- 表情: 真剣な顔（基本）、でも落ち込みやすい

**各シーンでの表情**
- S1-2（比較）: 複雑、疲れた顔
- S4（気づき）: 困った顔
- S5（核ショット）: 驚き顔 → 穏やかな納得顔
- S6（翌日）: 満足笑顔

**生成プロンプト共通要素**
```
cute chibi girl character, 8 years old, twin tails black hair, serious 
thoughtful expression, purple and black outfit, red boxing gloves, barefoot, 
FLATUP GYM gym, earnest but introspective, anime style
```

---

### EP13: ノア（上達が早い子）

**基本設定**
- **年代**: 小学3年生
- **性別**: 女の子
- **性格**: 上達が自然に早い、でも悪意はない
- **髪**: ツインテール、茶髪
- **髪色・髪型**: 明るい茶色のツインテール（ミオとの差別化）

**ビジュアル特徴**
- グローブ: 赤
- ウェア: オレンジと黄のカラー（明るさ、華やかさ）
- 表情: 自然な笑顔（基本）

**各シーンでの表情**
- S1（技を決める）: 満足笑顔、華やか
- S6（翌日）: 自然な笑顔、ノアから声をかける

**生成プロンプト共通要素**
```
cute chibi girl character, 8 years old, twin tails light brown hair, 
bright natural smile, orange and yellow sporty outfit, red boxing gloves, 
barefoot, FLATUP GYM gym, talented and kind, anime style
```

---

## Part 4: 各話別カラースキーム

| 話数 | 話タイトル | テーマカラー | ジム背景色 | トーン |
|---|---|---|---|---|
| EP09 | かった、から、こそ | 赤・金 | 温かい夕光 | 誠実・清廉 |
| EP10 | もって、くれてる | ピンク・紫 | 柔らかい昼光 | 感謝・温暖 |
| EP11 | となりに、いく | 緑・黄 | 明るい昼光 | 希望・優しさ |
| EP12 | どきどき、しても | 青・紫 | 落ち着いた昼光 | 勇敢・決意 |
| EP13 | きのうの、じぶん | 橙・紫 | ぬくもりのある昼光 | 成長・充足 |

---

## Part 5: 生成フロー（量産手順）

### Step 1: 基準画像生成（全キャラ）

**出力**: 各キャラ × 6ポーズ = 最小 54 画像

**プロンプト構成**
```
[基本設定] + [ポーズ指示] + [シーン背景] + [表情] + [ネガティブ]
```

**例（ミオ・正面・驚き顔）**
```
cute chibi girl character, 8 years old, twin tails black hair, surprised 
shocked expression with wide eyes, purple and black sporty outfit, 
red boxing gloves, barefoot, standing in FLATUP GYM gym with pink 
star floor, warm sunlight, anime style illustration by Studio Ghibli, 
high quality, no blurry, no 3D, no realistic

(bad quality, blurry, distorted, 3D, realistic, photorealistic, adult, 
serious expression, sad, angry, wearing shoes, wearing earrings, 
long gloves with fingers, CGI, illustration inconsistency)
```

### Step 2: シーン別派生生成

**出力**: 各話 × 10カット × シーンバリエーション

**追加要素**
- 配置（他キャラとの距離感）
- 背景の詳細（夜のジム、象徴世界など）
- 光の角度・色調

### Step 3: i2v（Image-to-Video）生成

**入力**: シーン別派生画像  
**出力**: 各カット 4-6 秒のアニメーション

**例（EP09 C01: ノアがキックを決める）**
```
A cute chibi girl with light brown twin-tails in orange and yellow outfit, 
in FLATUP GYM gym with pink star floor. She is performing a spinning kick 
with red boxing gloves. Motion: smooth and powerful spinning kick motion, 
then landing and posing. Light: warm evening sunlight. Duration: 4 seconds. 
Anime style.
```

---

## Part 6: チェックリスト（品質保証）

生成完了後、以下を確認：

- [ ] キャラの顔の一貫性（6 方向で同じ子に見える）
- [ ] グローブの赤色が統一されている
- [ ] ウェアのロゴが見える
- [ ] 足が裸足（靴がない）
- [ ] 髪型が各キャラで統一されている
- [ ] 表情が話に応じた感情を表現している
- [ ] 背景の星型フロアが見える
- [ ] アニメ風で 3D 感がない
- [ ] i2v でキャラが崩れていない

---

## Part 7: 正本更新・保守

本資料は制作中も随時更新されます。  
変更があった場合は、以下の手順で記録：

1. **日付をつけて追記**
   ```
   [2026-07-30] ミオの髪型を左側で見ると少し不自然 
   → 根元をもっと強くクリップして修正指示
   ```

2. **各話の CONCEPT に反映**
   - キャラクターの見た目が確定したら、その話の CONCEPT.md に記載

3. **プロンプト集を更新**
   - IMAGE_PROMPTS.md に実績のあるプロンプトを追加

---

**本資料は FLATUP GYM 全アニメプロジェクトの最上位ガイドです。  
各話の制作資料（CONCEPT, STRUCTURE_TIMING, IMAGE_PROMPTS など）は、  
常にこの正本を参照して制作してください。**
