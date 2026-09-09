# 実写→アニメ モーション参照ガイド（実技動画の取り込み）

作成: 2026-09-01
種別: 制作資料（下書き・検証前提）
姉妹文書:
- `docs/FLATUP_ANIME_MARTIAL_ARTS_TUTORIAL_GUIDE.md`（教則動画）
- `docs/FLATUP_ANIME_HIGH_INTENSITY_ACTION_GUIDE.md`（高強度アクション演出）

安全基準: `docs/ai-os/canon/safety_rules.md`
同意関連: `docs/GUARDIAN_CONSENT_LINE_SETUP.md`

---

## 1. 結論（先に読む5行）

1. 実技動画をモーション参照にすると、**フォームの正確さが一段上がる**。教則用途では最も効く手段。
2. ただし **AIはモーションキャプチャではない**。「動きの雰囲気とタイミング」を学習して再生成するだけなので、複数回生成して選ぶ前提で組む。
3. **撮影素材の同意が最優先**（§3）。会員・子どもが写った映像を外部AIへ上げるのは、承認なしでは絶対にやらない。
4. 参照は **役割を明記**する。`@image1 = 見た目` / `@video1 = 動きのみ` と分けて書く。
5. 素材は「全身がはっきり写る・背景がシンプル・5〜10秒」が成功率を大きく上げる。

---

## 2. 検証ステータス

| 項目 | 状態 | 補足 |
|---|---|---|
| MiniMax H3 の参照仕様（画像9枚＋動画＋音声、連続15秒程度） | **二次情報のみ** | 2026-09-01 に複数の解説記事で同趣旨の記載を確認。公式ドキュメントは未確認 |
| MiniMax H3 の推奨プロンプト構造（1クリップ1目的／参照ごとの役割明記／時系列ビート／音声の明示） | **二次情報のみ** | 同上。既存ガイドの8ブロック構造と一致する内容 |
| Kling 3.0 の Motion Control の再現度 | **未検証** | 出典は依頼者提供の資料 |
| Seedance / DomoAI / Runway / Wan / Luma / Pika の各特性 | **未検証** | 同上 |
| 各サービスの商用利用可否・学習利用オプトアウトの有無 | **未確認・要確認** | **課金前に必ず自分で確認する**（§3-3） |

推測を事実として書き換えないこと。確認できない項目は「未確認」と残す。

---

## 3. 撮影素材の同意とプライバシー（最重要・ここを飛ばさない）

実技動画を使うということは、**誰かの体が写った映像を外部のAIサービスへアップロードする**ということです。FLATUPでは次を必須とします。

### 3-1. 誰の映像を使うか

| 被写体 | 可否 | 条件 |
|---|---|---|
| JIN本人・スタッフ | **推奨** | 本人が了解していればよい。迷ったらこれを使う |
| 成人会員 | 条件付き可 | **書面またはLINEで明示的な同意**。用途（AI動画の素材にすること）と公開範囲を伝えたうえで取得 |
| 未成年会員 | **原則見送り** | 保護者の同意が必須。`docs/GUARDIAN_CONSENT_LINE_SETUP.md` の運用に従う。**オーナー承認なしでは進めない** |
| 第三者の動画（SNS・YouTube等） | **不可** | 著作権・肖像権の侵害になる |

### 3-2. 同意で伝えるべき4点

1. 撮影した動画を **AIサービスにアップロードする** こと
2. その動画を元に **アニメ映像を生成し、公開する可能性がある** こと
3. 生成物の **公開範囲**（SNS、LP、店内モニター等）
4. **やめたくなったら取り下げられる** こと

### 3-3. アップロード先の確認

- **学習利用のオプトアウト設定があるか**を確認し、あるなら必ず有効にする
- 商用利用可否と、生成物の権利がどちらに帰属するかを確認する
- 無料プランは学習利用が前提の場合がある。**会員の映像を無料プランへ上げない**

### 3-4. 保管ルール

- 元動画と生成物は **Gitに入れない**（`AGENTS.md`：顧客情報を公開ファイルへ出さない）
- 保管場所とアクセスできる人を決めてから撮影する
- 生成物に、実在の会員だと特定できる特徴（顔・タトゥー・持ち物）が残っていないか公開前に確認する

**判断に迷ったら、JIN本人の映像で作る。** これが最も速く、最も安全です。

---

## 4. ツールの使い分け（§2のとおり大半が未検証）

| 順位 | ツール | 強み | 弱み | 実写参照 |
|---|---|---|---|---|
| 1 | **MiniMax H3（Hailuo）** | 動画を参照として投入でき、動き・カメラ・タイミングを強く反映。アニメの線と粒子を保ちやすい | 長尺は不可 | 強い |
| 2 | **Kling 3.0（Motion Control）** | フルボディの動作再現度が高い。細かいフォームを残したい場合に有利 | アニメ指定を強めると動きがマイルドになることがある | 強い |
| 3 | **DomoAI** | 実写→アニメ変換に特化。手軽で試しやすい | 細かい制御が弱い | 非常に強い |
| 4 | **Gemini Omni / Veo** | 自然言語の理解力が高く、会話で修正できる。本リポジトリに接続実装あり | モーションの精密な転写では上位に譲る | あり（短尺） |
| 5 | **Seedance / Runway / Wan / Luma / Pika** | 一貫性・編集機能・低コストなど個別の強み | 用途が限定的 | あり |

**現実的な組み合わせ**: 動きの取り込みは MiniMax H3 か Kling → 仕上げの粒子・表情調整を別ツール → 編集で連結。1つに固定せず使い分けるのが一般的です。

---

## 5. 参照の役割分担（ここが最重要の書き方）

役割を明記しないと、元動画の人物や背景まで一緒にコピーされます。

```text
[References]
@image1 = strict character identity lock (face, hair, body proportions, clothing, exact colors).
          Never change.
@video1 = motion reference ONLY. Transfer the movement, timing, and body mechanics exactly.
          Do NOT copy the original person, their face, their clothing, or the background.
```

この2行を書くかどうかで結果が変わります。**必ず両方書く。**

---

## 6. プロンプト例

### 6-1. 教則寄り（フォーム最優先・FLATUP標準）

```text
7s | 16:9 | 2K
@image1 = character identity lock (anime version of the instructor). Never alter.
@video1 = primary motion reference. Preserve the exact form, timing, weight transfer, and
          footwork as closely as possible. Do not copy the original person or background.

Clean high-quality anime style, cel-shaded, instructional clarity, beautiful even lighting,
subtle particle effects, one sakuga-level beat on the key impact.

The character performs the exact technique from @video1 in anime form.
Maintain perfect anatomical accuracy and realistic body mechanics while adding elegant
speed lines and a soft impact frame on the final strike. Slight steam and sweat for intensity.

Camera: stable medium full-body shot that slightly tracks the movement,
        clear and readable for teaching purposes. One primary camera move only.
Sound: fabric rustle, sharp whoosh, light impact, controlled breathing. No music.
Constraints: no extra limbs, no identity drift, no floating, no blood, no injury, no text.
```

### 6-2. 演出寄り（強度A・実技の動きを活かした一撃）

```text
8s | 16:9 | 2K
@image1 = strict character identity lock. Never alter face, hair, or uniform.
@video1 = motion reference only. Transfer the exact punching form, hip rotation, weight
          transfer, and timing. Do not copy the original person or background.

High-end TV anime action sequence, top-tier key animation, sakuga quality, varying line weight,
painterly particle effects, volumetric god rays, atmospheric haze,
dark background with bright effects.

0-1.8s: Settles into stance in front of a heavy bag. Muscles tense, eyes fixed,
        slight anticipation lean backward. Dust lifting off the floor.
1.8-2.1s: Explodes forward with the exact mechanics of @video1. Dense afterimages trail,
          the arm becomes a blur.
2.1-2.4s: Contact with the bag - strong impact frame freezes for 0.3 seconds with radial
          distortion, inverted contrast flash, red-gold embers bursting, sweat and dust flying,
          slight camera bump.
2.4-8s: Full follow-through, the body rotates with momentum, snaps back to guard.
        The bag swings, the chain rattles, breathing heavy, steam rising.

Camera: medium full-body, slight lag on the explosion, sudden push-in on the impact,
        center-framed. One primary move only.
Sound: sharp whoosh, deep bass impact, chain rattle, controlled exhale.
Constraints: no person is struck, no identity drift, no floating, particles never obscure
             the body, anatomically correct at speed, no text, no watermark.
```

### 6-3. 連続技（タイミングだけ実技から借りる）

```text
10s | 16:9 | 2K
@image1 = strict identity lock.
@video1 = motion reference for the combination timing and body mechanics only.

High-end TV anime action sequence, sakuga quality, flowing painterly particle bursts,
volumetric lighting, atmospheric haze.

0-2s: Ready stance under a shaft of light, particles floating, held preparation beat.
2-7s: Executes the combination with the exact timing of @video1 - jab, cross, low kick,
      high roundhouse. Each strike leaves a red-gold energy trail and a particle burst.
      Effects trail slightly behind the body and never overlap the silhouette.
      Dense afterimages on the fastest movements.
7-10s: Final impact with a strong impact frame and a radial shockwave, then a held beat,
       returning to guard while breathing hard.

Camera: smooth 3D-like arc that circles slightly, center-framed, slight lag on the fastest strikes.
Sound: layered whooshes, sharp impacts, one deep low hit, heavy breathing.
Constraints: no opponent, no contact with a person, no identity drift, no floating, no text.
```

---

## 7. 撮影のコツ（成功率が変わる）

- **全身が切れずに入る**こと。足元まで映す
- **背景はできるだけシンプル**に。物が多いと動きが拾われにくい
- **カメラは固定**。手持ちで揺れると、その揺れごと転写される
- **5〜10秒に切る**。1本＝1技
- **横または斜め45度**から。真正面は奥行きが出ず、体重移動が読み取られにくい
- 明るく、影が濃すぎない照明
- 服装はシルエットが分かるもの。だぼつく服は動きが潰れる

---

## 8. ワークフロー

1. 撮影対象を決める（§3。迷ったらJIN本人）
2. 同意を取得し、記録を残す（会員が写る場合）
3. 実技動画を撮影し、1技5〜10秒に切る
4. アニメキャラの参照画像を用意（`FLATUP_GYM_ANIME_ART_BIBLE.md` 準拠）
5. 参照の役割を明記して生成（§5）。1技につき3〜4本
6. 検証（§9）→ 崩れた箇所のプロンプトだけ強化して再生成
7. トレーナーがフォームを確認
8. 編集でつなぎ、テロップ・ナレーション・効果音を追加
9. 公開はオーナー承認後

---

## 9. 生成後の検証チェックリスト

- [ ] 元動画の人物の顔・服装・背景が混ざっていないか
- [ ] フォーム（体重移動・軸足・膝の角度）が元動画どおりか
- [ ] キャラの顔・髪・服装が最初から最後まで同一か
- [ ] 手足の本数が正しいか
- [ ] 浮遊していないか、足が接地しているか
- [ ] 実在の会員が特定できる特徴が残っていないか
- [ ] トレーナーのフォーム確認を通したか
- [ ] 元動画・生成物がGitや公開フォルダに入っていないか

---

## 10. 承認ゲート

- AIだけで進めてよい: プロンプト作成、JIN本人素材での試作、社内確認
- **オーナー承認が必要**:
  - **会員（特に未成年）が写った映像の撮影・アップロード**
  - 課金、有料プランへの変更
  - SNS・LP・YouTube等への公開
  - 外部AIサービスへの新規アカウント作成・データ送信
  - commit / push / PR

---

## 11. 関連ファイル

- `docs/FLATUP_ANIME_MARTIAL_ARTS_TUTORIAL_GUIDE.md` — 教則動画のプロンプト構造
- `docs/FLATUP_ANIME_HIGH_INTENSITY_ACTION_GUIDE.md` — 演出強度とタイミング設計
- `docs/GUARDIAN_CONSENT_LINE_SETUP.md` — 保護者同意の運用
- `docs/ai-os/canon/safety_rules.md` — 安全ルール
- `docs/ai-os/canon/approval_matrix.md` — 承認マトリクス
- `animation-studio/README.md` — Image-to-Video 実装
