# アニメ格闘技 教則動画 量産ガイド（プロンプト集）

作成: 2026-09-01
種別: 制作資料（下書き・検証前提）
上位文書: `FLATUP_GYM_ANIME_ART_BIBLE.md` / `docs/FLATUP_ANIMATION_BIBLE.md`
安全基準: `docs/ai-os/canon/safety_rules.md`
承認基準: `docs/ai-os/canon/approval_matrix.md`

---

## 1. 結論（先に読む3行）

1. 教則動画は「美しさ」より **動作の正確さと安全表現** を優先する。AI映像は参考イメージであり、フォームの正誤は必ず人間のトレーナーが確認する。
2. プロンプトは **時系列（0-2秒 / 2-5秒 / 5-8秒）＋カメラ＋スタイル＋ネガティブ** の4点セットで書く。曖昧語は使わない。
3. 量産の鍵はプロンプトの巧さではなく **参照素材の固定**（キャラシート・構え・中間・終了の静止画）である。

---

## 2. 検証ステータス（重要）

この文書には、依頼文から取り込んだ **未検証の外部情報** が含まれます。断定して社外に出さないでください。

| 項目 | 状態 | 補足 |
|---|---|---|
| MiniMax H3 / Hailuo系の最新モデル名・解像度・秒数・参照枚数 | **未検証** | 出典は依頼文の貼り付け内容のみ。公式ドキュメント未確認 |
| Google Gemini Omni の名称・連続生成の上限秒数 | **未検証** | 同上 |
| Seedance 2.0/2.5、Kling 3.0 のバージョンと得意分野 | **未検証** | 同上 |
| 格闘動作特化LoRA（例: wushu_action）の存在・ライセンス | **未検証** | 使用前に配布元のライセンス確認が必須 |
| 本リポジトリでの Hailuo / Flux 利用実績 | 確認済み | `FLATUP_GYM_ANIME_ART_BIBLE.md`、`brand-film-ep09〜12/04_IMAGE_PROMPTS.md` |
| 本リポジトリでの Gemini / Veo 連携実装 | 実装あり・実API未検証 | `animation-studio/README.md` |

**使用前の確認手順**: 各サービスの公式ページで「モデル名・最大秒数・解像度・料金・商用利用可否」を確認し、この表を更新する。確認できない項目は「未確認」と書いたまま残す。

---

## 3. ツールの使い分け（想定）

| 用途 | 第一候補 | 理由（未検証を含む） |
|---|---|---|
| 技の基本カット（5〜10秒） | MiniMax（Hailuo）系 | 複数画像参照でキャラ一貫性を保ちやすい。アニメ調の躍動表現に強いとされる |
| 長めの連続カット・カメラワーク | Seedance系 | 長尺と複雑なカメラに強いとされる |
| 打撃のスピード感・重み | Kling系 | 打撃表現に強いとされる |
| 会話形式での修正・シーン拡張 | Gemini / Veo系 | 対話で微修正でき、量産の手戻りが少ない。本リポジトリに接続実装あり |
| 静止画（キャラシート・絵コンテ） | Flux / Hailuo Image | 既存の brand-film 各話で使用実績あり |

MacBookでの運用は基本ブラウザ完結。まず無料枠または最小クレジットで1技だけ試し、採用プロンプトを固めてから有料枠で量産する。

---

## 4. FLATUP適合ルール（このガイド固有の必須条件）

FLATUP は「世界一初心者に優しい格闘技ジム」です。教則動画でも次を守ります。

- **怒鳴らない・見下さない**: 指導者が威圧する構図、失敗を笑う表現は使わない。
- **対人ガチスパーを描かない**: シャドー、ミット、サンドバッグ、単独動作を基本にする。相手役が必要な場合はミット保持者までにとどめる。
- **流血・負傷・痛みの誇張を描かない**: 「効かせる」より「安全に正しく動く」を映す。
- **医療・健康効果を断定しない**: 動画の説明文で「痩せる」「治る」等の効果を断定しない。
- **非現実的な動きを禁止**: 空中静止、超人的な跳躍は使わない。プロンプトに `grounded, realistic physics within anime style` を必ず入れる。
- **未成年キャラで打撃の被弾表現を作らない**。
- **フォーム監修**: 公開前に人間のトレーナーがフォームを確認する。確認前の素材には「参考イメージ／監修前」と明記する。

---

## 5. プロンプトの基本構造

### 5-1. 汎用テンプレート（英語推奨）

```text
[Duration]s | [16:9 or 9:16] | ultra high quality anime style, cel-shaded 2D animation,
hand-inked line art with consistent line weight, flat colour fills, hard-edged graphic shadows,
no 3D shading, dynamic motion lines, impact frames, detailed anatomy,
fluid martial arts choreography, grounded realistic physics within anime style

Character: [外見・服装・体型を固定。参照画像がある場合は "strictly follow @image1"]

Scene: clean training gym with mats, bright even lighting, minimal background

Action timeline:
0-2s: [構え・準備姿勢を具体的に]
2-5s: [技の実行。体重移動と回転を明記]
5-8s: [フォロースルーと構えへの復帰]

Camera: medium full-body shot -> close-up on the technique -> tracking shot, readable at all times

Style: crisp details on muscles, fabric folds, foot placement, correct form for instructional purpose

Negative: distorted limbs, extra fingers, morphing face, blurry, low detail, photorealistic,
blood, injury, pain expression, shouting coach, floating in mid-air, shoes, weapons
```

### 5-2. FLATUP準拠テンプレート（ブランド動画に使う場合）

キャラクター仕様は `FLATUP_GYM_ANIME_ART_BIBLE.md` を正本とし、次を固定します。

```text
Character (FLATUP fixed spec):
2.5 head-body chibi anime character, round face, large anime eyes, black hair,
red boxing gloves (wrist-length, no exposed fingers), FLATUP GYM logo t-shirt,
muay thai shorts, barefoot, bright and friendly expression,
gym interior with star-shaped floor

Negative (FLATUP common):
bad quality, blurry, distorted, 3D, realistic, photorealistic, adult body proportions,
angry expression, wearing shoes, wearing earrings, long gloves with fingers,
blood, injury, sparring against a person, floating, CGI
```

ブランド動画（13話シリーズ）と教則動画でスタイルを混ぜないこと。教則は等身を上げた通常アニメ体型でも可だが、**1シリーズ内では必ず統一** する。

---

## 6. 技別プロンプト例（教則用）

すべて「構え → 実行 → 復帰」の3段構成にしています。秒数は8秒想定。

### 6-1. ストレート（右クロス）

```text
8s | 16:9 | anime style martial arts instructional clip, cel-shaded, clean line art
Character: martial artist in orthodox stance, hands up at cheek level
0-2s: orthodox stance, weight on the back foot, elbows in, chin tucked
2-5s: throws a straight cross, rear heel pivots outward, hip rotates fully,
      weight transfers from back foot to front foot, fist fully extended, shoulder covers the chin
5-8s: retracts the arm along the same line, returns to guard, balanced
Camera: medium full-body -> close-up on the rotating rear heel and hip -> back to full body
Style: motion blur on the arm, speed lines, one impact frame, visible muscle tension, readable form
Negative: overextending past balance, dropping the guard hand, blood, injury, floating, photorealistic
```

**教則ポイント（ナレーション用）**: 「腕で打たない。後ろ足のかかとを返して、腰から回す。」

### 6-2. ミドルキック（回し蹴り）

```text
8s | 16:9 | anime style instructional clip, cel-shaded
0-2s: fighter in stance, guard up, eyes forward
2-5s: steps the support foot out at an angle, support heel turns, hip rotates over,
      leg swings in a clean arc, shin makes contact line, arm swings down for counter-balance
5-8s: leg returns along the same arc, lands back into stance without wobbling
Camera: low angle following the arc -> medium shot on landing
Style: speed lines on the kicking leg, radial blur, detailed knee and ankle position
Negative: knee bending unnaturally, off-balance fall, blood, injury, floating, extra limbs
```

**教則ポイント**: 「軸足のかかとを返す。当てにいくより、戻すまでが1本。」

### 6-3. 構え・ガード（初心者向け・最重要）

```text
8s | 16:9 | anime style instructional clip, calm and clear
0-3s: character in relaxed fighting stance, feet shoulder-width, front foot forward,
      knees slightly bent, hands up, shoulders relaxed, breathing calmly
3-6s: small weight shift forward and back, keeping the guard steady
6-8s: gentle smile to the camera, still in stance
Camera: slow orbit around the character, full body in frame
Style: soft even lighting, detailed foot placement, relaxed posture, welcoming atmosphere
Negative: aggressive expression, clenched angry face, shouting, blood, tense shoulders, floating
```

**教則ポイント**: 「力まない。肩が上がったら、一度息を吐く。」

### 6-4. 前蹴り（初心者が最初に覚える蹴り）

```text
8s | 16:9 | anime style instructional clip, cel-shaded
0-2s: stance with guard up
2-5s: lifts the front knee first, then extends the leg straight forward,
      pushing with the ball of the foot, hips pressing forward, guard stays up
5-8s: pulls the knee back first, then places the foot down into stance
Camera: side view full body -> close-up on the knee lift -> side view
Style: clear knee-then-extend sequence, speed lines, correct posture
Negative: swinging the leg without lifting the knee, dropping hands, blood, injury, floating
```

### 6-5. ミット打ちの受け方（2人・安全表現）

```text
10s | 16:9 | anime style instructional clip, two characters, friendly atmosphere
0-3s: coach character holds focus mitts at chest height, elbows braced, feet staggered
3-7s: student throws a jab-cross combination into the mitts, coach absorbs with slight give
7-10s: both reset, coach nods and smiles, student returns to guard
Camera: three-quarter view showing both characters -> close-up on the mitt contact
Style: supportive coaching atmosphere, no shouting, clean gym, impact frames on contact
Negative: sparring to the face, aggressive coach, shouting, blood, injury, fear expression
```

対人カットはここまで。**顔面へのスパーリング描写は作らない。**

---

## 7. 量産ワークフロー（7ステップ）

1. **キャラシート固定**: 正面・斜め45度・側面・背面の4〜6枚を静止画で作り、`brand-film-*/` と同じ命名で保存する。以後すべてこれを参照する。
2. **技リスト化**: 1本1技。教則カリキュラム順（構え → 前蹴り → ジャブ → ストレート → ミドル）に並べる。
3. **絵コンテ**: 難しい技は9〜16コマの静止画を先に作り、Image-to-Video に渡す。
4. **短尺生成**: 5〜10秒で「構え → 技 → 復帰」を生成。1技につき3〜4本作って良い1本を選ぶ。
5. **フォーム監修**: 人間のトレーナーが確認。NGなら該当秒のプロンプトだけ直して再生成する。
6. **編集**: 連結、テロップ、ナレーション、効果音を追加。効果音は打撃音を過度に強調しない。
7. **テンプレ化**: 採用プロンプトを技名だけ差し替え可能な形にして、この文書に追記する。

**量産の実務目安**: 1技あたり生成3〜4本＋編集で、慣れれば1〜2時間。最初の1技は倍かかる前提で見積もる。

---

## 8. 公開前チェックリスト

- [ ] フォームをトレーナーが確認した（未確認なら公開しない）
- [ ] 流血・負傷・威圧・怒鳴りの表現がない
- [ ] 顔面へのスパーリング描写がない
- [ ] 空中静止など非現実的な動きがない
- [ ] キャラクターが全カットで同一（`docs/FLATUP_CHARACTER_CONSISTENCY_RULE.md`）
- [ ] 説明文に健康効果・医療効果の断定がない
- [ ] 実在の人物・団体・他ジムを想起させる要素がない
- [ ] 生成元の利用規約（商用利用可否、クレジット表記）を確認した
- [ ] 監修前素材には「参考イメージ」と明記した
- [ ] `flatup-content-qc` スキルの確認を通した

---

## 9. 承認ゲート

このガイドの範囲で **AIだけで進めてよい** のは、プロンプト作成、下書き生成、社内確認用の試作までです。

次は必ずオーナー承認が必要です（`docs/ai-os/canon/approval_matrix.md`）。

- 有料クレジットの購入・課金プランへの変更
- SNS、LP、YouTube等への公開・投稿
- 料金や入会導線に関わる文言の確定
- 本リポジトリへの commit / push / PR

---

## 10. 情報の再検証（3か月ごと）

生成AIのモデル名と仕様は短期間で変わります。次を定期確認し、§2の表を更新してください。

- 各サービスの公式ドキュメント（モデル名・秒数・解像度・料金・商用利用可否）
- LoRA等の配布元ライセンス
- 競合比較動画やコミュニティの検証投稿（**参考程度**。一次情報を優先する）

確認できない情報は消さずに「未確認」と残す。推測を事実として書き換えないこと。

---

## 11. 関連ファイル

- `FLATUP_GYM_ANIME_ART_BIBLE.md` — キャラクター統一基準（正本）
- `docs/FLATUP_ANIMATION_BIBLE.md` — 物語・映像・トーンの基準
- `docs/FLATUP_CHARACTER_CONSISTENCY_RULE.md` — 一貫性の絶対ルール
- `docs/ai-os/canon/safety_rules.md` — 安全ルール
- `docs/ai-os/canon/approval_matrix.md` — 承認マトリクス
- `animation-studio/README.md` — Image-to-Video 実装（Gemini / Veo、実API未検証）
- `brand-film-ep09〜13/04_IMAGE_PROMPTS.md` — 静止画プロンプトの既存例
