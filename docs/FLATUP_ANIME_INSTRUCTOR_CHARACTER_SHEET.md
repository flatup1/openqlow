# 教則・アクション用 キャラクターシート生成プロンプト集

作成: 2026-09-09
種別: 制作資料（オーナー確定待ちの項目あり）
用途: 教則動画と高強度アクション演出で使う **参照画像9枚** を作るためのプロンプト集
関連ガイド:
- `docs/FLATUP_ANIME_MARTIAL_ARTS_TUTORIAL_GUIDE.md`（教則）
- `docs/FLATUP_ANIME_HIGH_INTENSITY_ACTION_GUIDE.md`（高強度演出）
- `docs/FLATUP_ANIME_MOTION_TRANSFER_GUIDE.md`（実写モーション参照）

キャラクター正本: `FLATUP_GYM_ANIME_ART_BIBLE.md`

---

## 1. 結論（先に読む4行）

1. 動画生成を始める前に、**まずこの9枚を作る**。3ガイドが共通して「品質の8割を決める」と書いている最重要工程。
2. 9枚は一度作れば使い回す。以後すべての動画プロンプトで `@image1〜@image9` に指定する。
3. **ブランド13話のちびキャラとは別のシリーズ**。混ぜない（§2）。
4. 名前・年齢感・性別は **オーナー確定待ち**（§3）。決まっていなくても9枚は作れる。

---

## 2. このシートの位置づけ（重要）

FLATUP には現在2つの映像シリーズがある。**キャラクターを混ぜない。**

| シリーズ | 頭身 | キャラクター | 正本 |
|---|---|---|---|
| ブランドアニメ13話 | **2.5頭身ちび** | フラットちゃん、サンドバッグ、ミット、各話の子ども | `FLATUP_GYM_ANIME_ART_BIBLE.md` |
| **教則・アクション（本シート）** | **6.5〜7頭身の通常アニメ体型** | 教則インストラクター（本シートで定義） | 本ファイル |

**なぜ等身を上げるのか**: 教則動画は「体重移動・膝の角度・軸足の向き」を見せるのが目的。2.5頭身のちび体型では関節の位置が読み取れず、教則として機能しない。ブランドアニメの優しさは、体型ではなく**表情とトーン**で引き継ぐ。

---

## 3. オーナー確定待ちの項目

次の3点は JIN の判断です。**未確定のまま9枚を生成しても問題ありません**（プロンプト側は外見仕様で固定されているため）。

| 項目 | 状態 | 暫定の扱い |
|---|---|---|
| キャラクター名 | **未確定** | 作中で名前を呼ばない運用も可（EP01の少年と同じ方式） |
| 性別 | **未確定** | 下記プロンプトは性別を明示していない。中性的に出る。指定したい場合は §5 の Subject に一語足す |
| 年齢感 | **未確定** | 暫定「20代後半〜30代前半」で書いてある。変える場合はその行だけ差し替え |

**決めたらこの表を更新してください。** 決まる前に量産を始めると、後から作り直しになります。

---

## 4. 固定仕様（FLATUP canon 準拠・変更しない）

`FLATUP_GYM_ANIME_ART_BIBLE.md` から引き継ぐ要素です。ここを崩すとブランドが崩れます。

| 項目 | 指定 | 由来 |
|---|---|---|
| 髪色 | **黒髪**（差別化は長さと毛質のみ） | art bible の全キャラ統一規則 |
| グローブ | **赤いボクシンググローブ**（手首まで、指が出ない） | art bible |
| ウェア（上） | **FLATUP GYM ロゴ入りTシャツ**（黒地に白ロゴ） | art bible |
| ウェア（下） | **ムエタイショーツ** | art bible |
| 足元 | **裸足**（靴を履かせない） | art bible |
| 表情の基本 | 落ち着いた、責めない、穏やかな目 | animation bible「怒鳴らない・見下さない」 |
| 頭身 | **6.5〜7頭身**（本シリーズのみ） | 教則の可読性のため |

---

## 5. 共通スタイルブロック（全9枚に貼る）

各プロンプトの先頭に、この共通ブロックを貼ってから個別指定を続けます。

```text
[Common Style — paste into every sheet image]
High-quality Japanese anime character sheet, cel-shaded 2D illustration,
clean hand-inked line art with consistent line weight, flat colour fills,
hard-edged graphic shadows, no 3D shading, no photoreal skin.
Full body visible from head to feet, feet not cropped.
Plain light grey background, even neutral lighting, no cast shadows on the background.
Character centred, no text, no watermark, no logo other than the shirt print.

[Subject — fixed spec, do not alter]
A martial arts instructor, 6.5 to 7 head-body anime proportions, late twenties to
early thirties, black hair, calm and gentle eyes, relaxed friendly expression,
athletic but not exaggerated build, wearing a black FLATUP GYM t-shirt with a simple
white logo print, muay thai shorts, red boxing gloves (wrist-length, no exposed fingers),
barefoot.

[Negative — paste into every sheet image]
chibi proportions, oversized head, extra limbs, extra fingers, distorted anatomy,
photorealistic, 3D render, CGI, angry or aggressive expression, shouting,
wearing shoes, wearing earrings, long gloves with fingers, blood, injury,
cropped feet, busy background, text, watermark.
```

**グローブを外したい枚がある場合**は Subject の `red boxing gloves (...)` を `bare hands with hand wraps` に置き換えます（§6-8, §6-9 で使用）。

---

## 6. 参照画像9枚（1枚ずつコピペ）

順番どおりに作ってください。1〜6が角度、7〜9が用途別です。

### 6-1. 正面（@image1 — 最重要・identity lock の基準）

```text
[Common Style] + [Subject]
Standing straight, facing the camera directly, arms relaxed at the sides,
feet shoulder-width apart, calm neutral expression looking at the viewer.
T-pose is not required. Full body, head to bare feet.
[Negative]
```

### 6-2. 斜め45度（右）（@image2）

```text
[Common Style] + [Subject]
Standing straight, body turned 45 degrees to the right, head facing the same direction,
arms relaxed at the sides, calm neutral expression. Full body, head to bare feet.
[Negative]
```

### 6-3. 側面（右）（@image3）

```text
[Common Style] + [Subject]
Full profile view from the right side, standing straight, arms relaxed at the sides,
calm neutral expression. The silhouette of the posture must be clearly readable.
Full body, head to bare feet.
[Negative]
```

### 6-4. 背面（@image4）

```text
[Common Style] + [Subject]
Standing straight, seen from directly behind, arms relaxed at the sides,
back of the t-shirt visible, hair from behind clearly shown.
Full body, head to bare feet.
[Negative]
```

### 6-5. 側面（左）（@image5）

```text
[Common Style] + [Subject]
Full profile view from the left side, standing straight, arms relaxed at the sides,
calm neutral expression. Full body, head to bare feet.
[Negative]
```

### 6-6. 斜め45度（左）（@image6）

```text
[Common Style] + [Subject]
Standing straight, body turned 45 degrees to the left, head facing the same direction,
arms relaxed at the sides, calm neutral expression. Full body, head to bare feet.
[Negative]
```

### 6-7. 構え（@image7 — 動画生成で最も使う）

```text
[Common Style] + [Subject]
In a relaxed orthodox fighting stance seen from a three-quarter front angle:
feet shoulder-width apart with the front foot forward, knees slightly bent,
weight balanced and slightly forward, hands up at cheek level, elbows in,
chin tucked, shoulders relaxed and down, calm focused expression.
The foot placement and the knee bend must be clearly visible.
Full body, head to bare feet.
[Negative] （+ tense raised shoulders, dropped guard hand）
```

### 6-8. 技の途中（@image8 — 動きの基準）

```text
[Common Style] + [Subject]
Mid-technique pose, three-quarter angle: throwing a straight right cross.
The rear heel is pivoted outward, the hip is fully rotated, the weight has transferred
onto the front foot, the fist is fully extended with the elbow down, the shoulder raised
to cover the chin, the opposite hand still guarding the face.
Anatomically correct at every joint. Full body, head to bare feet.
[Negative] （+ overextended past balance, floating, dropped guard hand）
```

### 6-9. 表情バリエーション（@image9 — バストアップ4面）

```text
[Common Style] + [Subject]
Character sheet of four bust-up expressions of the same face, arranged in a 2x2 grid,
all facing the camera, identical hairstyle and identical face structure across all four:
top-left = calm neutral, top-right = warm gentle smile,
bottom-left = focused and serious (not angry), bottom-right = encouraging nod with soft eyes.
Bust-up only for this sheet. Consistent line weight across all four.
[Negative] （+ angry, sad, crying, exaggerated comedic faces, different faces between panels）
```

---

## 7. 生成後の合否チェック（9枚すべてに適用）

1枚でも落ちたら、その枚だけ作り直します。全部を作り直さないこと。

- [ ] 9枚すべてで **顔の造作が同一** に見えるか（別人になっていないか）
- [ ] 髪型・髪の長さが9枚で一致しているか
- [ ] Tシャツのロゴの位置と大きさが一致しているか
- [ ] グローブが赤・手首まで・指が出ていないか
- [ ] 裸足になっているか（靴・靴下が描かれていないか）
- [ ] 頭身が9枚で揃っているか（1枚だけちび寄りになっていないか）
- [ ] 足が画面で切れていないか（@image9 のバストアップを除く）
- [ ] 手足の本数と指の本数が正しいか
- [ ] 表情が穏やかか（威圧的・怒り顔になっていないか）
- [ ] 背景が無地で、動画生成時に邪魔にならないか

---

## 8. 使い方（動画プロンプトへの接続）

採用した9枚を保存し、以後すべての動画プロンプトの `[Reference]` ブロックで役割を明記します。

```text
[Reference]
@image1 = strict character identity lock (face, hair, body proportions, uniform, exact colors).
          Never alter.
@image7 = stance reference
@image8 = mid-technique reference
```

**保存場所**: ブランド映像の既存構成に合わせ、`brand-film-*/` と同じ命名規則でフォルダを作って保存する。会員が写った素材は入れない（`docs/FLATUP_ANIME_MOTION_TRANSFER_GUIDE.md` §3）。

生成ツールは Flux / Hailuo Image の使用実績あり（`brand-film-ep09〜13/04_IMAGE_PROMPTS.md`）。

---

## 9. この先の手順

1. **本シート §3 をオーナーが確定**（名前・性別・年齢感）※ 未確定でも 2 は進められる
2. **9枚を生成し、§7 で合否判定**
3. 採用9枚を保存し、命名を固定
4. `FLATUP_ANIME_HIGH_INTENSITY_ACTION_GUIDE.md` の強度A実例（夜のジム、溜め→瞬間移動→サンドバッグへの一撃）を **1本だけ生成して検証**
5. 崩れた箇所のプロンプトだけ強化して再生成
6. 良かったプロンプトを各ガイドに追記

---

## 10. 承認ゲート

- AIだけで進めてよい: プロンプト作成、試作生成、社内確認
- **オーナー承認が必要**: キャラクター設定の確定、有料クレジットの購入、SNS・LP・YouTube等への公開、ブランド映像への採用、commit / push / PR

`docs/ai-os/canon/approval_matrix.md` に従う。
