# FLATUP ANIMATION ENGINE 2027 — 正本計画

作成: 2026-07-11（JIN承認済みの方針をリポジトリ正本化）
基礎: girl-power-op + PR #51（複数ポーズ / story.js / サイト埋め込みループ）

## 目的

既存アニメの再現ではなく、**かわいくて、強くて、初心者に優しい FLATUP GYM だけの映像世界**を作る。
最終的にサイト・広告・LINE・グッズ・UIZIN・YouTube まで展開できる **FLATUP GYM 所有のアニメーションIP** にする。

---

## ⚠️ 絶対ルール: 既存IPを本番に使わない

検討した Civitai の LoRA は**パワーパフガールズ（Cartoon Network / Warner Bros. 系IP）の画風再現 LoRA**。
本番サイト・広告・グッズに使うと「公式コラボ」「派生作品」と誤認されるリスクがある。

> **試作と方向性確認には使う。最終作品は FLATUP GYM 専用のオリジナル LoRA に置き換える。**

### 使わない要素（禁止リスト）

- ブロッサム / バブルス / バターカップ本人、同じ髪型・配色の3人組、同じ服装
- 目と身体の比率のほぼそのまま再現、ケミカルX等の設定、タウンズヴィル風の街
- 特徴的な飛行ポーズ・構図の複製、ロゴ・タイトルの類似表現

### 抽出してよいのは「原則」だけ

小さくても強い / 一瞬で感情が分かる / 遠くから見ても誰か分かる / 3色程度の強い配色 /
シンプルで動かしやすい / 少ないポーズでも動いて見える

---

## 3段階ロードマップ

| Stage | 内容 | 使うもの | 成果物の扱い |
|---|---|---|---|
| 1. 技術検証 | ポーズ生成・目/グローブの安定・OpenPose・背景透過・girl-power-op での切り替わりを確認 | 参考LoRA（強度 **0.25〜0.45**、`0.8〜1.0` は使わない） | **内部テスト専用**。公開しない |
| 2. オリジナル化 | 顔・目・服・配色・ロゴ・身体比率・世界設定を独自化。キャラクター設定資料を完成 | Stage 1 の知見 + 手作業デザイン | 設定資料が正本になる |
| 3. 専用LoRA化 | FLATUP専用LoRA を学習し、参考LoRA を外す（または影響が分からないほど低く） | SDXL + FLATUP専用LoRA + OpenPose + IP-Adapter | 本番資産。全ポーズ・全シーンを生成 |

※ Civitai モデルの正確なファイル名・推奨ベースモデル・トリガーワード・**ライセンス**は、ダウンロード前にモデルページのバージョン詳細とライセンス欄で必ず確認する（ページ本文が取得できなかったため未確定）。

---

## 制作環境（画像生成）

**ComfyUI + SDXL**

```text
SDXLベースモデル → FLATUPキャラクターLoRA → 参考用スタイルLoRA
→ IP-Adapter → ControlNet OpenPose → 背景・照明・表情調整 → PNG書き出し
```

| 要素 | 役割 |
|---|---|
| SDXL | 画像生成の土台 |
| 参考LoRA | ポップで読みやすい表現の試作（Stage 1のみ） |
| FLATUP専用LoRA | 顔・服・配色・体型の固定 |
| IP-Adapter | 元画像のキャラクターらしさを維持 |
| ControlNet OpenPose | パンチ・構え・ジャンプなどの姿勢指定 |
| Depth ControlNet | カメラ角度・奥行きの維持 |
| Inpaint | 手・目・グローブの破綻修正 |

---

## オリジナルキャラクター案: フラッピー（仮称）

### 見た目

- 太陽を思わせる丸い輪郭、胸元に FLATUP 独自の太陽マーク
- 少し大きめのキックボクシンググローブ（形はオリジナル）
- 配色: 白・蛍光ピンク・蛍光イエロー・グリーン（ジムの白床と緑マットに映える = visual_brand.md と同系）
- 大きな目だが既存作品とは異なる形。手足は実際のパンチ・キックが読める長さ
- 表情は「強そう」より「やってみたい」

### 性格

最初は怖がり / 運動が得意ではない / 失敗してももう一度立つ / 他人を急かさない / 最後には新人へ手を差し出す
（= 「はじめの一歩を、笑わない」ブランドの体現）

---

## Stage 1 試作プロンプト

LoRA 指定は `<lora:対象LoRA名:0.35>` 程度から。

```text
an entirely original FLATUP GYM mascot character,
small friendly kickboxing hero,
sun-inspired rounded silhouette,
oversized but original training gloves,
warm smile, slightly nervous beginner personality,
white, neon pink, neon yellow and green color palette,
simple readable shapes, highly expressive face,
family-friendly cartoon character, dynamic clean silhouette,
inside a bright welcoming Japanese kickboxing gym,
soft cinematic lighting, original character design,
no existing franchise character, no recognizable costume, no copyrighted logo,
full body, front view, character design sheet
```

ネガティブ:

```text
Powerpuff Girls, Blossom, Bubbles, Buttercup, Cartoon Network,
existing franchise character, recognizable copyrighted character,
three identical superhero girls, black horizontal dress stripe,
Townsville, Chemical X, copied costume, copied hairstyle,
copied character proportions, text, watermark, logo,
extra fingers, extra arms, deformed gloves, asymmetrical eyes, cropped body
```

※ LoRA 自体が特定作品を学習しているため、ネガティブだけで影響は消えない。だから Stage 1 は内部テスト専用。

---

## Stage 2 で固定するもの（動画量産より先）

**キャラクター設定シート**: `01_front / 02_three_quarter / 03_side / 04_back / 05_top_angle / 06_low_angle`
**表情シート**: neutral / nervous / afraid / embarrassed / sad / relief / small_smile / big_smile / determined / kind
**衣装・素材**: outfit_front / outfit_back / gloves_detail / shoes_detail / logo_detail / color_palette / material_reference

ここで目の形・瞳・鼻と口・頭身・手足の長さ・グローブ・靴・ロゴ・**色番号**を確定する。

---

## Stage 3: FLATUP専用LoRA

- 学習画像: 最低 30〜40枚、推奨 60〜100枚
  （角度20 / 表情15 / 構え・パンチ・キック20 / 座る・歩く・転ぶ10 / 交流10 / 照明・カメラ違い15）
- トリガーワード: `flatup_hero`（または `flappy_flatup`）— 独自トークンにする
- 学習後の基本プロンプト: `flatup_hero, same original FLATUP GYM mascot, exact same face, exact same eye design, exact same gloves, exact same outfit, exact same body proportions, full body` + 各ポーズ

---

## girl-power-op への実装マッピング

### 現状（PR #51 の API）

- ランタイムのポーズは `girl-power-op/poses/` 直下の固定名: `idle.png` / `punch1.png` / `punch2.png` / `jump.png` / `win.png`（無ければ `chara.png` にフォールバック）
- シナリオは `story.js` の `window.STORY`、シーン型は entrance / punch / closeup / jump / sky / finale の6種

### 拡張（PR #51 マージ後の次コードタスク）

1. **素材庫**（LoRA学習・参照用。ランタイムとは分離）を `assets/characters/flappy/` に置く。
   ディレクトリ構成・ポーズ命名の正本は **`FLATUP_ANIMATION_BIBLE.md` §27–28**（bible / reference / poses / approved の4層。`approved/` 外の画像は本番使用禁止）

2. **1動作=最低4段階**への改修（punch1/2 の交互だけでは短編に足りない）:
   - パンチ: 構える → 腕を引く → 当たる → 振り抜く → 戻る
   - 転ぶ: 空振り → バランスを崩す → 落下 → 床に座る → 恥ずかしそうに周囲を見る
   - 手を差し出す: 新人を見る → 少し迷う → 近づく → 手を伸ばす → 笑う
   - 枚数より**感情が変わる瞬間**を優先する
3. **新シーン型の追加**: `fall`（空振り→転倒）と `help`（手を差し出す）。現行6種では下の15秒版の6〜9秒と12〜15秒が表現できない

### サイト用15秒版（目標シナリオ）

| 秒 | 内容 | 必要シーン型 |
|---|---|---|
| 0〜3 | 夜のジム。主人公が箱から顔を出す | entrance（流用可） |
| 3〜6 | パンチを打つが空振りして転ぶ | **fall（新規）** |
| 6〜9 | 仲間が笑わずに手を差し出す | **help（新規）** |
| 9〜12 | もう一度立ち、小さなパンチを成功 | punch（流用可） |
| 12〜15 | 新しく来た小さな仲間へ手を差し出す + 文字 | **help（新規）** + finale |

表示文字:
> 怖いままでも、大丈夫。
> はじめの一歩を、笑わない。

ボタン: **500円体験を予約する**（→ https://lin.ee/cTSDajPz ）
埋め込みは PR #51 の `index.html?loop=1` iframe モードを使う（HP_design のトップページ案のヒーロー枠が置き場所候補）。

### 現行シーン型だけで今すぐ試せる仮15秒版（story.js に貼るだけ）

```js
window.STORY = [
  { type: 'entrance', sec: 3.75, text: 'ようこそ!' },
  { type: 'punch',    sec: 3.75, text: 'えい!' },
  { type: 'closeup',  sec: 3.0,  text: 'もういっかい!' },
  { type: 'finale',   sec: 4.5,  title: 'はじめの一歩を、笑わない。', subtitle: 'FLATUP GYM' },
];
```

---

## 次のアクション

- [ ] JIN: Civitai モデルページでライセンス・トリガーワードを確認してから DL（Stage 1）
- [ ] PR #51 をレビュー・マージ（この計画の土台）
- [ ] Stage 1 検証（内部のみ）→ 結果をこのファイルに追記
- [ ] Stage 2 のキャラ設定シート確定 → `assets/character/flappy/reference/` へ
- [ ] コード: `fall` / `help` シーン型 + ポーズ4段階対応（PR #51 マージ後に着手）
