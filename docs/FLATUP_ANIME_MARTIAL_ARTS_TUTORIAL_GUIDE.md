# アニメ格闘技 教則動画 量産ガイド（v2）

作成: 2026-09-01
更新: 2026-09-01（v2: プロンプト構造を8ブロック形式へ刷新、音声指定・失敗対応表を追加）
種別: 制作資料（下書き・検証前提）
上位文書: `FLATUP_GYM_ANIME_ART_BIBLE.md` / `docs/FLATUP_ANIMATION_BIBLE.md`
姉妹文書:
- `docs/FLATUP_ANIME_HIGH_INTENSITY_ACTION_GUIDE.md`（高強度アクション演出・タイミング設計）
- `docs/FLATUP_ANIME_MOTION_TRANSFER_GUIDE.md`（実写→アニメのモーション参照）
安全基準: `docs/ai-os/canon/safety_rules.md`
承認基準: `docs/ai-os/canon/approval_matrix.md`

---

## 1. 結論（先に読む4行）

1. **1クリップ＝1技**。複数の技を1本に詰め込むと手足の破綻とキャラ崩れが一気に増える。これが品質を決める最大の分岐点。
2. プロンプトは **8ブロック固定** で書く（Reference / Style / Subject / Environment / Timeline / Camera / Sound / Constraints）。毎回同じ順番で埋める。
3. 品質の安定装置は文章力ではなく **参照画像の固定**（キャラシート5〜9枚）。ここに時間を使う。
4. AI映像は参考イメージ。フォームの正誤は必ず人間のトレーナーが確認する。

---

## 2. 検証ステータス（重要）

この文書には **未検証の外部情報** が含まれます。断定して社外に出さないでください。

| 項目 | 状態 | 補足 |
|---|---|---|
| MiniMax H3 の秒数・解像度・Omni Reference の枚数・推奨構造 | **未検証** | 出典は依頼者提供の資料（公式プロンプトガイド由来とされる）。当方で一次情報未確認 |
| Google Gemini Omni の名称・シーン拡張・タイムコード構文 | **未検証** | 同上 |
| Seedance / Kling のバージョンと得意分野 | **未検証** | 同上 |
| 格闘動作特化LoRA（例: wushu_action）の存在・ライセンス | **未検証** | 使用前に配布元のライセンス確認が必須 |
| 本リポジトリでの Hailuo / Flux 利用実績 | 確認済み | `FLATUP_GYM_ANIME_ART_BIBLE.md`、`brand-film-ep09〜12/04_IMAGE_PROMPTS.md` |
| 本リポジトリでの Gemini / Veo 連携実装 | 実装あり・実API未検証 | `animation-studio/README.md` |

**使用前の確認手順**: 各サービスの公式ページで「モデル名・最大秒数・解像度・料金・商用利用可否」を確認し、この表を更新する。確認できない項目は「未確認」と書いたまま残す。

---

## 3. ツールの使い分けと運用パラメータ

数値はいずれも §2 のとおり未検証です。実際に1本試して合わなければ調整してください。

| 用途 | 第一候補 | 運用パラメータ（想定） |
|---|---|---|
| 技の基本カット | MiniMax H3（Hailuo系） | 1クリップ4〜12秒、**教則は6〜10秒**、2K優先。参照は画像＋動画＋音声を同時投入 |
| つなぎ・シーン拡張・微修正 | Gemini Omni（Veo系） | `[0-3s]` 形式のタイムコード構文。会話で部分修正できるため手戻りが少ない |
| 長尺・複雑なカメラ | Seedance系 | 連続ショット向き |
| 打撃の重み・速度感 | Kling系 | 単発の見せ場向き |
| 静止画（キャラシート・絵コンテ） | Flux / Hailuo Image | 既存の brand-film 各話で使用実績あり |

**推奨の組み合わせ**: キャラシート固定（Flux等） → 技ごとの短尺生成（H3） → つなぎと微調整（Gemini Omni） → 編集（CapCut等）。

### MiniMax H3 を使うときの4つの鉄則（未検証・出典は提供資料）

1. **1クリップに主アクションは1つだけ**。連続技は分割して生成し、編集でつなぐ。
2. **カメラの主運動は1つ**。必要なら切り替えを1回まで。動かしすぎると技が隠れる。
3. **音を明示する**。H3は音声を同時生成するため、書かないと不要なBGMや過剰なSEが乗る。
4. **時系列を `0-2s:` `2-6s:` の形式で書く**。曖昧な順序表現は使わない。

---

## 4. FLATUP適合ルール（このガイド固有の必須条件）

FLATUP は「世界一初心者に優しい格闘技ジム」です。教則動画でも次を守ります。

- **怒鳴らない・見下さない**: 指導者が威圧する構図、失敗を笑う表現は使わない。
- **対人ガチスパーを描かない**: シャドー、ミット、サンドバッグ、単独動作を基本にする。相手役が必要な場合はミット保持者までにとどめる。
- **流血・負傷・痛みの誇張を描かない**: 「効かせる」より「安全に正しく動く」を映す。
- **医療・健康効果を断定しない**: 動画の説明文で「痩せる」「治る」等の効果を断定しない。
- **非現実的な動きを禁止**: 空中静止、超人的な跳躍は使わない。プロンプトに `grounded, realistic physics` を必ず入れる。
- **未成年キャラで打撃の被弾表現を作らない**。
- **フォーム監修**: 公開前に人間のトレーナーがフォームを確認する。確認前の素材には「参考イメージ／監修前」と明記する。

演出強度を上げたい場合（OP、ハイライト等）は `docs/FLATUP_ANIME_HIGH_INTENSITY_ACTION_GUIDE.md` を参照。**教則動画に高強度演出を混ぜないこと。**

---

## 5. プロンプトの絶対構造（8ブロック・コピー用）

毎回この順番で埋めます。空欄のブロックを作らないこと。

```text
[Duration]s | 16:9 or 9:16 | 2K

[Reference]
@image1 = strict character identity lock (face, hair, body proportions, uniform, exact colors). Never alter.
@image2 = stance reference (optional)
@image3 = environment style lock (dojo / gym)

[Core Style]
Ultra high-quality Japanese anime style, cel-shaded 2D animation, consistent hand-inked line weight,
flat color fills, hard-edged shadows, fluid hand-drawn motion, clean instructional clarity,
no 3D shading, no photoreal skin.

[Subject]
[固定キャラ記述をここに毎回コピペ。§5-2 参照]

[Environment]
Clean modern dojo / training gym with tatami or foam mats, bright even lighting,
minimal clutter, soft natural light from windows.

[Action Timeline]  ← 必須。1クリップ1技
0-2s: Ready stance. [構えを具体的に]
2-6s: Executes [技名]. [体重移動・股関節の回転・腕/脚の軌道・着地まで完全に記述]
6-8s: Follow-through and return to guard. Clear weight transfer and recovery.

[Camera]
Medium full-body shot -> slight tracking following the limb -> close-up on the key form point.
Stable, readable, instructional. One primary camera move only.

[Sound]
Soft fabric rustle, sharp whoosh of the limb, light impact thud, controlled breathing.
No music, no exaggerated SFX.

[Constraints / Negative]
No extra limbs, no distorted anatomy, no face morphing, no identity drift, no floating,
no rubbery stretch, no excessive speed lines that hide the form, no blood, no injury,
no pain expression, no shouting coach, no shoes, no text, no watermark.
Maintain anatomical accuracy for teaching purpose.
```

### 5-2. FLATUP準拠の Subject ブロック（ブランド動画用）

キャラクター仕様は `FLATUP_GYM_ANIME_ART_BIBLE.md` が正本です。

```text
[Subject]
2.5 head-body chibi anime character, round face, large anime eyes, black hair,
red boxing gloves (wrist-length, no exposed fingers), FLATUP GYM logo t-shirt,
muay thai shorts, barefoot, bright and friendly expression.

[Environment]
Gym interior with star-shaped floor, warm even light.

[Constraints / Negative] （上記に加えて）
adult body proportions, angry expression, wearing shoes, wearing earrings,
long gloves with fingers, sparring against a person, CGI.
```

ブランド動画（13話シリーズ）と教則動画でスタイルを混ぜないこと。教則は等身を上げた通常アニメ体型でも可だが、**1シリーズ内では必ず統一** する。

---

## 6. 技別プロンプト例（教則用・完成形）

### 6-1. ストレート（右クロス）

```text
8s | 16:9 | 2K
@image1 = strict identity lock for the instructor character. Never alter face, hair, or uniform.
Ultra high-quality cel-shaded anime style, clean linework, instructional clarity, no 3D shading.
Subject: martial artist in a white training uniform, orthodox stance, hands up at cheek level.
0-2s: Settles into a perfect orthodox stance, chin tucked, elbows in, weight on the back foot.
2-5.5s: Throws a straight right cross with full hip rotation and weight transfer from back foot
        to front foot. The fist travels in a straight line, the elbow stays down, the rear heel
        pivots outward, the shoulder rotates up to cover the chin.
        Motion blur only on the fist and forearm.
5.5-8s: Follow-through, then snaps back to a tight guard. Balance clearly recovered.
Camera: medium full-body -> tracks the punch -> brief close-up on the extended fist and rotating hip.
        One primary move only.
Sound: fabric snap, sharp whoosh, soft foot pivot, controlled exhale. No music.
Constraints: no extra limbs, no identity drift, no floating, no overextension past balance,
             no dropped guard hand, no blood, no injury, no text.
```

**教則ポイント（ナレーション用）**: 「腕で打たない。後ろ足のかかとを返して、腰から回す。」

### 6-2. ミドルキック（ラウンドハウス）

```text
9s | 16:9 | 2K
@image1 identity lock. Cel-shaded anime, fluid hand-drawn motion, instructional clarity.
0-2s: Fighting stance, guard up, eyes forward.
2-7s: Steps the support foot out at an angle, chambers the rear leg, rotates the hip fully over,
      extends into a mid-height roundhouse kick. The supporting foot pivots about 90 degrees,
      the torso stays upright, the opposite arm swings down for counter-balance.
      Clean arc of the leg, controlled motion blur only on the kicking limb.
7-9s: Retracts the leg along the same arc and returns to stance without wobbling.
Camera: side-medium shot following the kicking leg, slight low angle to show the hip rotation.
Sound: fabric whip, sharp whoosh, foot pivot on the mat, one controlled exhale.
Constraints: no unnatural knee bend, no off-balance fall, no floating, no blood, no injury, no text.
```

**教則ポイント**: 「軸足のかかとを返す。当てにいくより、戻すまでが1本。」

### 6-3. 構え・ガード（初心者向け・最重要）

```text
8s | 16:9 | 2K
@image1 identity lock. Cel-shaded anime, calm and clear instructional tone.
0-3s: Relaxed fighting stance, feet shoulder-width, front foot forward, knees slightly bent,
      hands up at cheek level, shoulders relaxed, calm breathing.
3-6s: Small weight shift forward and back, guard stays steady, posture unchanged.
6-8s: Gentle smile to the camera, still in stance.
Camera: slow orbit around the character, full body in frame at all times.
Sound: quiet room tone, soft footwork on the mat, calm breathing. No music.
Constraints: no aggressive expression, no shouting, no tense raised shoulders, no floating, no text.
```

**教則ポイント**: 「力まない。肩が上がったら、一度息を吐く。」

### 6-4. 前蹴り（最初に覚える蹴り）

```text
8s | 16:9 | 2K
@image1 identity lock. Cel-shaded anime, instructional clarity.
0-2s: Stance with guard up.
2-5s: Lifts the front knee first, then extends the leg straight forward, pushing with the ball
      of the foot. Hips press forward, the guard stays up, the support foot stays planted.
5-8s: Pulls the knee back first, then places the foot down into stance.
Camera: side view full body -> close-up on the knee lift -> back to side view.
Sound: fabric rustle, short whoosh, foot placement on the mat, controlled breath.
Constraints: no swinging the leg without lifting the knee, no dropped hands, no floating, no text.
```

**教則ポイント**: 「まず膝を上げる。蹴ってから膝を戻す、が正しい順番。」

### 6-5. ミット打ちの受け方（2人・安全表現）

```text
10s | 16:9 | 2K
@image1 = coach identity lock. @image2 = student identity lock. Never swap or blend the two.
Cel-shaded anime, friendly supportive atmosphere, instructional clarity.
0-3s: The coach holds focus mitts at chest height, elbows braced, feet staggered.
3-7s: The student throws a jab-cross combination into the mitts. The coach absorbs with a slight give.
      Contact is on the mitts only.
7-10s: Both reset. The coach nods and smiles. The student returns to guard.
Camera: three-quarter view showing both characters -> close-up on the mitt contact. One move only.
Sound: two clean mitt impacts, fabric snap, short exhales, quiet gym tone. No music.
Constraints: no strikes to the face or body of a person, no aggressive or shouting coach,
             no blood, no injury, no fear expression, no identity drift between the two characters.
```

対人カットはここまで。**顔面へのスパーリング描写は作らない。**

---

## 7. 量産ワークフロー

1. **キャラクターシート固定（最重要）**: 正面・斜め45度・側面・背面・構え・技の途中の **5〜9枚** を静止画で作り、毎回 `@image1〜` に指定する。ここが品質の8割を決める。
2. **技リスト化**: 1本1技。カリキュラム順（構え → 前蹴り → ジャブ → ストレート → ミドル）に並べる。
3. **絵コンテ**: 難しい技は9〜16コマの静止画を先に作り、Image-to-Video に渡す。
4. **短尺生成**: 6〜10秒で「構え → 技 → 復帰」。1技につき3〜4本作って良い1本を選ぶ。
5. **検証**（§8）→ **修正ループ**: 崩れた箇所だけを特定し、**その部分のプロンプトだけを強化して再生成**。全体を書き直さない。
6. **フォーム監修**: 人間のトレーナーが確認。NGなら該当秒の記述だけ直す。
7. **編集**: 連結、スロー挿入、テロップ、ナレーション、効果音。打撃音は過度に強調しない。
8. **テンプレ化**: 採用プロンプトを技名だけ差し替え可能な形にして、この文書に追記する。

**実務目安**: 1技あたり生成3〜4本＋編集で1〜2時間。最初の1技は倍かかる前提で見積もる。

---

## 8. 生成直後の検証チェックリスト（全動画に適用）

- [ ] 顔・髪型・服装が最初から最後まで一致しているか（identity drift がないか）
- [ ] 手足の本数が正しいか（特にキックの瞬間）
- [ ] 体重移動と着地が自然か（浮遊していないか）
- [ ] カメラが技を隠していないか
- [ ] 線の太さと色がフレーム間でブレていないか
- [ ] 速度線がフォームを隠していないか
- [ ] 教則としてフォームが正確に見えるか（**トレーナー確認**）

---

## 9. よくある失敗と修正法

| 失敗 | 原因 | 修正 |
|---|---|---|
| 手足がおかしい | 1クリップに動作を詰め込みすぎ | 1技に絞り、軌道を1つずつ詳細に書く |
| キャラが途中で変わる | 参照の優先度が弱い | `strict identity lock` `never alter` を明記し、参照画像を増やす |
| 動きがフワフワする | 物理の記述不足 | `weight transfer` `hip rotation` `planted foot` を必ず入れる |
| 速度線が邪魔でフォームが見えない | 指定が曖昧 | `motion blur only on the moving limb` と限定する |
| 教則として使えない | 誇張が強すぎる | `instructional clarity` `perfect form` `grounded` を追加する |
| 不要なBGMや過剰なSEが乗る | 音の指定なし | `[Sound]` ブロックを必ず書き、`No music` を明示する |
| カメラが技を隠す | カメラ運動が多すぎ | `One primary camera move only` を入れる |

---

## 10. 公開前チェックリスト

- [ ] フォームをトレーナーが確認した（未確認なら公開しない）
- [ ] 流血・負傷・威圧・怒鳴りの表現がない
- [ ] 顔面へのスパーリング描写がない
- [ ] 空中静止など非現実的な動きがない
- [ ] キャラクターが全カットで同一（`docs/FLATUP_CHARACTER_CONSISTENCY_RULE.md`）
- [ ] 説明文に健康効果・医療効果の断定がない
- [ ] 実在の人物・団体・他ジム・特定作品を想起させる要素がない
- [ ] 生成元の利用規約（商用利用可否、クレジット表記）を確認した
- [ ] 監修前素材には「参考イメージ」と明記した
- [ ] `flatup-content-qc` スキルの確認を通した

---

## 11. 承認ゲート

このガイドの範囲で **AIだけで進めてよい** のは、プロンプト作成、下書き生成、社内確認用の試作までです。

次は必ずオーナー承認が必要です（`docs/ai-os/canon/approval_matrix.md`）。

- 有料クレジットの購入・課金プランへの変更
- SNS、LP、YouTube等への公開・投稿
- 料金や入会導線に関わる文言の確定
- 本リポジトリへの commit / push / PR

---

## 12. 情報の再検証（3か月ごと）

生成AIのモデル名と仕様は短期間で変わります。次を定期確認し、§2の表を更新してください。

- 各サービスの公式ドキュメント（モデル名・秒数・解像度・料金・商用利用可否）
- LoRA等の配布元ライセンス
- 競合比較動画やコミュニティの検証投稿（**参考程度**。一次情報を優先する）

確認できない情報は消さずに「未確認」と残す。推測を事実として書き換えないこと。

### 12-1. X（旧Twitter）での探し方 — 全て未検証

出典: Grok の回答スクリーンショット（2026-09-01 受領）。**アカウントの実在、投稿内容、品質、プロンプトの有効性はいずれも未確認** です。そのまま信用せず、実際に開いて自分の目で確かめてください。

**ハッシュタグ候補**

```text
#Seedance  #Kling  #AIFight  #MartialArtsAI  #AIVideoPrompt
```

※ 末尾のタグはスクリーンショットが途切れており、正確な綴りは未確認。

**アカウント候補**

| 手がかり | 内容（出典の記述） |
|---|---|
| RentPrompts 関連の投稿 | Seedance Pro での少林僧の格闘シーンなど。詳細プロンプトをコメント/DMで共有 |
| ai_dreams7 | Seedance 2.5 の香港探偵風アクション。長尺生成・物理・カメラを強調 |
| pabloprompt | Kling 3.0 のボクシング動画 |
| stevenmacgregor03 / sumiko.nakano.art / fightwithmiadanger | Kung Fu、MMAスパーリング等のリアル寄り動画 |
| @realisticaivid / @lexraym / @stat.us.ai | 一般AI動画系で格闘も扱う |

**参考にするときの注意（FLATUP固有）**

- **実在人物風の生成は作らない**。出典には「有名ボクサー同士の対戦風」の例が挙がっているが、肖像権・パブリシティ権の問題があるため FLATUP では採用しない。
- **リアル志向のMMAスパー動画はスタイルの手本にしない**。§4 の「対人ガチスパー・被弾を描かない」に反する。取り込んでよいのは **カメラワークと体重移動の描写方法だけ**。
- **他人のプロンプトを丸ごと流用しない**。投稿には規約や権利表示が付く場合がある。構文の考え方を学び、自分の技・キャラ設定で書き直す。
- **ハッシュタグ検索は一次情報ではない**。モデル名・秒数・料金・商用利用可否は必ず公式ドキュメントで確認する（§2）。

---

## 13. 関連ファイル

- `docs/FLATUP_ANIME_HIGH_INTENSITY_ACTION_GUIDE.md` — 高強度アクション演出（OP・ハイライト用）
- `docs/FLATUP_ANIME_MOTION_TRANSFER_GUIDE.md` — 実写→アニメのモーション参照
- `FLATUP_GYM_ANIME_ART_BIBLE.md` — キャラクター統一基準（正本）
- `docs/FLATUP_ANIMATION_BIBLE.md` — 物語・映像・トーンの基準
- `docs/FLATUP_CHARACTER_CONSISTENCY_RULE.md` — 一貫性の絶対ルール
- `docs/ai-os/canon/safety_rules.md` — 安全ルール
- `docs/ai-os/canon/approval_matrix.md` — 承認マトリクス
- `animation-studio/README.md` — Image-to-Video 実装（Gemini / Veo、実API未検証）
- `brand-film-ep09〜13/04_IMAGE_PROMPTS.md` — 静止画プロンプトの既存例
