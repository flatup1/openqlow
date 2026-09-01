# アニメ 高強度アクション演出ガイド（瞬間移動・超高速・衝撃）

作成: 2026-09-01
種別: 制作資料（下書き・検証前提）
姉妹文書: `docs/FLATUP_ANIME_MARTIAL_ARTS_TUTORIAL_GUIDE.md`（教則動画）
上位文書: `docs/FLATUP_ANIMATION_BIBLE.md` / `FLATUP_GYM_ANIME_ART_BIBLE.md`
安全基準: `docs/ai-os/canon/safety_rules.md`

---

## 1. 結論（先に読む4行）

1. 高強度アクションの本質は「速く動かす」ことではなく **時間を歪ませる** こと。溜め → 消失 → 出現 → 一瞬のスロー、を秒単位で書き分ける。
2. **特定の作品名・スタジオ名をプロンプトに書かない**。§3の言い換え辞書を使う。権利と規約の両面でリスクがある。
3. FLATUPで使えるのは **強度A（対人打撃なし）** まで。唾・血管・痛みの表情・吹き飛ばしは **強度B** として分類し、FLATUP名義では公開しない。
4. この演出を **教則動画には混ぜない**。用途はOP、ハイライト、イベント告知などの演出カットに限る。

---

## 2. 使用範囲（先に決める）

| 強度 | 内容 | FLATUP での扱い |
|---|---|---|
| **A: 使用可** | 溜め、残像、瞬間移動的なステップ、速度線、空間歪み、インパクトフレーム、カメラの追随遅れ、汗、荒い呼吸。**打撃対象はサンドバッグ・ミット・空（シャドー）のみ** | OP・ハイライト・告知に使用可。**オーナー承認後に公開** |
| **B: FLATUP名義では不採用** | 人物への打撃、被弾、吹き飛ばし、痛みの表情、唾が飛ぶ、血管の誇張、苦悶 | 技法として §8 に記録するが、FLATUP の作品・広告には使わない |

**なぜBを外すのか**: `docs/FLATUP_ANIMATION_BIBLE.md` の約束「怒鳴らない・笑わない・比べない」と、「はじめの一歩を、笑わない」という中心メッセージに正面から反するためです。初心者が「怖い」と感じた瞬間に、集客導線としては逆効果になります。強度Bは技術研究として持っておき、FLATUPの外側で使う判断はオーナーが行ってください。

---

## 3. 作品名・スタジオ名は書かない（言い換え辞書）

特定作品の名前を出して模倣を指示するプロンプトは、(1) 生成サービスの利用規約で制限される場合があり、(2) 商用ブランドの映像としては著作権・不正競争上のリスクを抱えます。**同じ絵は、描写で指定すれば出ます。**

| 書かない | 代わりに書く（描写で指定） |
|---|---|
| 特定バトル作品名 / 特定の名場面名 | `high-power shonen battle animation, explosive fight choreography` |
| 特定スタジオ名 | `high-budget TV anime action sequence, top-tier key animation` |
| 「〇〇より激しく」 | `higher intensity than a standard TV fight scene, feature-film level impact` |
| 特定キャラ名 | 自分のキャラシート（`@image1`）で固定する |

`sakuga`（作画）は特定作品を指さない一般的なアニメーション用語なので使用可。

---

## 4. なぜ普通のプロンプトでは足りないか

高強度アクションの構成要素は3つです。AIは「連続した自然な動き」が得意な一方、**時間を意図的に歪める表現が苦手**なので、明示的に書く必要があります。

1. **時間の圧縮と爆発** — 動作の「間」を削り、衝撃だけを残す。→ タイムラインで0.3秒単位まで刻む。
2. **速度の二段階表現** — 高速移動は残像・速度線・背景の流れで、打撃の瞬間だけ極端なスローで見せる。**スローがないと速すぎて何も見えない**。
3. **物理と誇張のハイブリッド** — リアルな体重移動・筋肉の収縮は保ったまま、空間を歪ませる速度と衝撃を足す。物理記述を省くと「フワフワした速い何か」になる。

---

## 5. 表現技法 → プロンプト対応表

| 狙う表現 | AIでの再現方法 | キーワード例 |
|---|---|---|
| 瞬間移動 | 位置を一瞬で変える＋残像＋空間の歪み | `vanishes in a flash of light, leaves multiple afterimages, reappears instantly with a shockwave` |
| 超高速移動 | 残像を複数残す＋背景が流れる | `extreme speed with dense afterimages, background streaks heavily, body becomes a blur` |
| 息を飲む衝撃 | インパクトフレーム＋画面歪み | `impact frame, screen shake, radial distortion, expanding shockwave ring` |
| 力の入った肉体 | 筋肉・汗・呼吸を詳細に（強度A範囲） | `muscles straining under the skin, sweat flying, sharp exhale, intense focused expression` |
| 本格作画の質感 | 線の太さの変化＋描き込み | `sakuga quality, varying line weight, highly detailed impact frames, fluid but explosive animation` |
| 溜め | 静止と微振動 | `energy building, slight tremble, dust lifting off the floor, hair rising` |

---

## 6. 高強度プロンプトの構造（8ブロック・高強度版）

教則版（`..._TUTORIAL_GUIDE.md` §5）と同じ8ブロックですが、`[Core Principle]` を追加します。

```text
[Duration]s | 16:9 | 2K

[Reference]
@image1 = strict character identity lock (face, hair, body, uniform, exact colors). Never alter.
@image2 = charged-up expression reference
@image3 = environment style lock

[Core Style]
High-end Japanese shonen battle anime, sakuga quality, cel-shaded with dynamic line weight variation,
intense speed lines, multiple afterimages, impact frames, radial shockwaves, screen distortion on hits.
Realistic body physics and muscle strain combined with exaggerated speed.

[Core Principle]   ← 高強度版で必須
Prioritize explosive speed and instantaneous position changes over continuous fluid motion.
Time is compressed. Movement should feel faster than the eye can track, with clear afterimages
and spatial distortion. Insert one extreme slow-motion beat at the moment of impact.

[Subject]
[固定キャラ記述]

[Environment]
[場所。強度Aならジム内・サンドバッグの前など]

[Action Timeline]   ← 0.3秒単位まで刻む
0-1.5s: [溜め]
1.5-2.0s: [消失・残像]
2.0-2.3s: [出現・衝撃波]
2.3-4.0s: [打撃＋インパクトフレーム＋スロー]
4.0-6.0s: [余韻・着地・呼吸]

[Camera]
Aggressive and dynamic: whip pans, sudden push-in on impact, slight Dutch angle during high speed.
The camera struggles to keep up with the movement (intentional camera motion blur during the teleport).

[Sound]
Deep bass impact, sharp sonic boom on the teleport, heavy breathing, fabric snap, low energy rumble.

[Constraints]
No slow continuous movement. No floaty physics. No weak impacts.
Maintain anatomical correctness even during extreme speed.
No text, no watermark, no identity drift.
```

---

## 7. 強度A の実例プロンプト（FLATUPで使える）

対人打撃を含まず、速度と衝撃だけを最大化した3本です。

### 7-1. 溜め → 瞬間移動 → サンドバッグへの一撃

```text
7s | 16:9 | 2K
@image1 = strict identity lock. Never alter face, hair, or uniform.
High-end shonen battle anime style, sakuga quality, dynamic line weight, cel-shaded.
Core principle: time is compressed. Explosive speed over continuous motion.
Environment: dim gym at night, a single heavy bag hanging under one overhead light, dust in the air.
0-1.5s: The fighter stands still in front of the heavy bag, energy building, slight tremble,
        dust lifting off the floor, hair rising, intense focused eyes.
1.5-2.0s: VANISHES in a bright flash, leaving 3-5 dense afterimages of decreasing opacity.
          The background warps slightly.
2.0-2.3s: REAPPEARS beside the bag with a sonic boom and an expanding shockwave ring.
          The camera whip-pans and briefly fails to keep up.
2.3-3.2s: Delivers one devastating high-speed body kick into the heavy bag. The limb is a blur.
          At contact the image holds in an extreme slow-motion impact frame for 0.3 seconds
          with radial distortion, screen shake, sweat and dust flying outward.
3.2-7s: The bag swings violently. The fighter lands in stance, breathing hard, steam rising
        from the shoulders, the light swinging overhead.
Camera: static wide -> violent whip pan -> sudden push-in on the impact -> slow pull back.
Sound: low rumble, sharp sonic boom, deep bass impact on the bag, chain rattle, heavy breathing.
Constraints: no person is struck, no floaty physics, no weak impact, anatomically correct
             even at extreme speed, no identity drift, no text, no watermark.
```

### 7-2. 瞬間移動のようなステップワーク（連続）

```text
8s | 16:9 | 2K
@image1 identity lock. High-end shonen battle anime, sakuga quality, cel-shaded.
Core principle: instantaneous position changes, dense afterimages, compressed time.
Environment: empty gym, morning light through high windows, polished floor.
0-1s: Fighter in stance, calm, eyes sharp.
1-2s: Explodes laterally. The body becomes nearly invisible except for 4 afterimages of
      decreasing opacity. The background streaks into horizontal lines.
2-3s: Stops dead in a new position with a hard foot plant, floor dust bursting outward.
3-5s: Repeats the movement three more times in different directions, each stop absolutely still,
      each burst leaving afterimages. The camera lags half a beat behind every time.
5-8s: Final stop facing the camera, one sharp exhale, steam in the cold air, guard up.
Camera: handheld-feeling wide shot that whip-pans to chase the fighter and repeatedly overshoots.
Sound: sharp foot plants, air displacement whoosh, controlled breathing, no music.
Constraints: no opponent, no floating, feet must always plant with visible weight,
             anatomically correct, no identity drift, no text.
```

### 7-3. シャドーの超高速コンビネーション

```text
8s | 16:9 | 2K
@image1 identity lock. High-end shonen battle anime, sakuga quality, varying line weight.
Core principle: explosive bursts separated by absolute stillness.
0-1.5s: Stance, energy building, slight tremble, focused expression.
1.5-4.5s: Throws a blistering shadow-boxing combination into empty air - jab, cross, hook, body kick.
          Limbs blur into afterimages, sharp speed lines follow each strike, the air distorts
          in thin shockwave rings at the end of each extension.
          One 0.3-second extreme slow-motion beat on the final kick.
4.5-8s: Freezes in the finishing position, then relaxes into guard, chest heaving, sweat flying
        off the shoulders, steam rising.
Camera: one slow arc around the fighter, with a single sudden push-in on the final kick.
Sound: sharp whooshes, fabric snaps, a deep low hit on the final strike, heavy breathing.
Constraints: no opponent, no contact with a person, no floating, planted feet with clear weight
             transfer, anatomically correct, no identity drift, no text.
```

---

## 8. 強度B の技法（記録のみ・FLATUP名義では使わない）

対人の打撃・被弾を含む表現です。**FLATUPの作品・広告には使いません**（§2）。技術記録として残します。

- 対人の瞬間移動攻撃は「溜め → 消失 → 相手の背後に出現 → 打撃 → 吹き飛び → 着地」の6段構成で書く。
- 迫力の記述: `veins bulging on the neck, teeth clenched, eyes wide with effort, spit and sweat flying on impact`。
- 被弾側の物理: `launched backward with realistic body physics plus exaggerated force`。
- これらは**痛み・苦悶の描写**を伴うため、初心者向けブランドの導線では逆効果になります。使う場合は用途・掲載先を決めたうえでオーナー承認を取ってください。

---

## 9. 速さを「見える」ようにする3つのコツ

1. **瞬間移動は3段に分ける** — 「消える → 残像が残る → 別の場所に現れる」を必ず別の時間帯として書く。`afterimages that fade slowly` と `flash of light` `spatial distortion` を入れる。
2. **カメラを追いつかせない** — `whip pan`、`camera lag`、`the camera struggles to keep up`。カメラが完璧に追うと速く見えない。
3. **打撃の瞬間だけ極端なスロー** — `extreme slow-motion for 0.2-0.4 seconds at the moment of impact`。これがないと速すぎて視認できず、結果として迫力が消える。

背景の処理も効きます: `background completely streaks into horizontal lines`、`body becomes nearly invisible except for afterimages`。

---

## 10. 生成後の検証チェックリスト

- [ ] 瞬間移動時に、消えた場所へ残像が残っているか
- [ ] 残像の濃度が段階的に薄くなっているか（`decreasing opacity`）
- [ ] 動きが「流れる」のではなく「爆発している」か
- [ ] 打撃の瞬間にスローとインパクトフレームが入っているか
- [ ] 線の太さが打撃の瞬間で変化しているか
- [ ] 足が必ず接地し、体重が乗っているか（浮遊していないか）
- [ ] 顔・髪・服装が最初から最後まで同一か
- [ ] 強度Aの範囲内か（人物への打撃・痛みの表情が入っていないか）
- [ ] 特定作品・実在人物を想起させる要素がないか

---

## 11. 編集での底上げ

生成物をそのまま出さず、編集で以下を足すと完成度が一段上がります。

- 打撃の瞬間に **手動で0.3秒の極端なスロー** を挿入する
- 衝撃音を重い低音に差し替える（生成された音は軽くなりがち）
- 画面端に微細なレンズ歪みを加える
- 1〜2フレームの白フラッシュを衝撃に重ねる
- MiniMax H3 で爆発的な動きを作り、Gemini Omni で表情の微調整とシーン拡張を行う

---

## 12. 承認ゲート

- AIだけで進めてよい: プロンプト作成、試作生成、社内確認
- **オーナー承認が必要**: 課金、SNS・LP・YouTube等への公開、ブランド映像への採用、強度Bの使用判断、commit / push / PR

---

## 13. 関連ファイル

- `docs/FLATUP_ANIME_MARTIAL_ARTS_TUTORIAL_GUIDE.md` — 教則動画（この文書と混ぜない）
- `docs/FLATUP_ANIMATION_BIBLE.md` — ブランドの約束とトーン
- `docs/FLATUP_CHARACTER_CONSISTENCY_RULE.md` — キャラ一貫性の絶対ルール
- `FLATUP_GYM_ANIME_ART_BIBLE.md` — キャラクター統一基準（正本）
- `girl-power-op/README.md` — OP動画の既存実装（プログラム描画方式）
- `docs/ai-os/canon/safety_rules.md` — 安全ルール
