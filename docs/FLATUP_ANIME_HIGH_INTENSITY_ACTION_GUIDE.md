# アニメ 高強度アクション演出ガイド（v2：速度＋映像美）

作成: 2026-09-01
更新: 2026-09-01（v2: 撮影処理・カメラ設計・属性エフェクトの5要素を追加）
種別: 制作資料（下書き・検証前提）
姉妹文書:
- `docs/FLATUP_ANIME_MARTIAL_ARTS_TUTORIAL_GUIDE.md`（教則動画）
- `docs/FLATUP_ANIME_MOTION_TRANSFER_GUIDE.md`（実写→アニメのモーション参照）

上位文書: `docs/FLATUP_ANIMATION_BIBLE.md` / `FLATUP_GYM_ANIME_ART_BIBLE.md`
安全基準: `docs/ai-os/canon/safety_rules.md`

---

## 1. 結論（先に読む5行）

1. 「息を飲む迫力」は速度だけでは出ない。**カメラの立体感 → 属性エフェクト → 溜めと爆発のリズム → 光と空気感 → 環境の反応**、この順で効く。
2. 土台は **タイミング設計**（溜め2〜4秒 : 本動作0.1〜0.5秒 : 余韻1〜2秒）。次に効くのが **カメラの立体感とセンターフレーミング**。
3. 高強度の本質は **時間を歪ませる** こと。溜め → 消失 → 出現 → 一瞬のスローを秒単位で書き分ける。
4. **特定の作品名・スタジオ名は、商用公開する映像のプロンプトには使わない**（§3）。技術は描写指定で再現できる。
5. FLATUPで使えるのは **強度A（対人打撃なし）** まで。強度Bは記録に留める。

---

## 2. 使用範囲（先に決める）

| 強度 | 内容 | FLATUP での扱い |
|---|---|---|
| **A: 使用可** | 溜め、残像、瞬間移動的なステップ、速度線、空間歪み、インパクトフレーム、粒子エフェクト、カメラの追随遅れ、汗、荒い呼吸。**打撃対象はサンドバッグ・ミット・空（シャドー）のみ** | OP・ハイライト・告知に使用可。**オーナー承認後に公開** |
| **B: FLATUP名義では不採用** | 人物への打撃、被弾、吹き飛ばし、痛みの表情、唾が飛ぶ、血管の誇張、苦悶 | 技法として §10 に記録するが、FLATUP の作品・広告には使わない |

**なぜBを外すのか**: `docs/FLATUP_ANIMATION_BIBLE.md` の約束「怒鳴らない・笑わない・比べない」と、中心メッセージ「はじめの一歩を、笑わない」に反するためです。初心者が「怖い」と感じた瞬間、集客導線としては逆効果になります。強度BをFLATUPの外側で使う判断はオーナーが行ってください。

---

## 3. スタイル指定と権利リスク（重要・判断はオーナー）

特定作品名・スタジオ名を出して模倣を指示するプロンプトには、次のリスクがあります。

1. 生成サービスの利用規約で、特定IPを狙った生成が制限される場合がある
2. 商用ブランドの映像として公開した場合、著作権・不正競争上の指摘を受けうる
3. サービス側のフィルタで弾かれ、生成が安定しない

**結論**: 社内検証・研究では作品名を使ってよい。**FLATUP名義で公開する映像では、下表の右列（描写指定）に置き換える。** 同じ絵は描写でも出ます。

| 出典の原文（研究用途では機能する） | 公開用の置き換え（描写で指定） |
|---|---|
| `ufotable style, Demon Slayer (Kimetsu no Yaiba) anime aesthetic` | `high-end TV anime action sequence, top-tier key animation, painterly particle effects, seamless blend of 2D characters and 3D environmental effects` |
| `more intense than the Frieza fight` | `higher intensity than a standard TV fight scene, feature-film level impact` |
| 特定キャラ名 | 自分のキャラシート（`@image1`）で固定する |
| 特定の必殺技名（呼吸の型など） | 属性を描写で指定（§4-B の色・粒子・筆致） |

`sakuga` は特定作品を指さない一般的なアニメーション用語なので使用可。

---

## 4. 映像美の5要素（優先順）

「作画が上手い」ではなく、複数の技術の組み合わせが迫力を作ります。効く順に並べています。

### A. カメラの立体感（最優先）

- 3D空間を意識した大胆な移動（回り込み、追い越し、上下動）。キャラは2Dのまま、背景が立体的に動く
- カメラが動作に遅れる／追いつけない表現で速度を出す
- アクションを画面中央に圧縮して見やすくする（センターフレーミング）

```text
dynamic 3D-like camera movement circling the fighter,
camera tracks closely and lags slightly during high-speed movement,
center-framed action, aggressive whip pan on impact
```

### B. 属性エフェクト（技ごとの固有の色と粒子）

ただの光ではなく、**その技固有の粒子・色・筆致**を与えると個性が出ます。

| 属性 | 描写指定 |
|---|---|
| 水 | `flowing blue-white water waves, ink-wash brush strokes, scattering droplets` |
| 炎 | `swirling orange embers, heat distortion, golden sparks rising` |
| 雷 | `sharp golden lightning arcs, crackling afterimages` |
| 風・霞 | `pale drifting mist, soft trailing afterimages that dissolve` |

FLATUPで使うなら、ブランドカラー（赤グローブ・星型フロア）に合わせて **赤〜金の粒子** に統一するのが自然です。

### C. 溜めと爆発のリズム

- 長い溜めポーズ → 一瞬の激しい動き → 余韻。この3拍を必ず作る
- 打撃の瞬間に **インパクトフレーム**（極端にコントラストの強い1フレーム）を入れる
- 動きのベースは粗く、カメラの揺れは滑らかに重ねると速く見える

```text
long preparation pose -> sudden explosive strike -> lingering aftermath,
impact frame with extreme contrast and radial distortion, camera shake on impact
```

### D. 光と空気感（撮影処理）

- **背景を暗く落とし、エフェクトを鮮やかに**。この明暗差が「息を飲む」の正体
- ボリューメトリックライト（光線）、大気の霞、リムライト
- 粒子（火の粉、水滴、埃、煙）が画面を埋めるが、動作を隠さない

```text
volumetric god rays, atmospheric haze, dramatic rim lighting,
dense particle effects that never obscure the action,
high contrast between a dark background and bright effects
```

### E. 環境の反応

- 地面が割れる、埃が舞う、サンドバッグのチェーンが暴れる、照明が揺れる
- 力の大きさは「相手の痛み」ではなく **環境の反応** で見せる。これは強度Aのまま迫力を出す最良の手段です

```text
environmental destruction reacting realistically to the force,
floor dust bursting outward, hanging light swinging violently
```

---

## 5. Sakuga のタイミング設計（最重要・速さの正体）

速さは「速く動かす」のではなく **情報の圧縮と解放** で作ります。溜めで期待を溜め、本動作で一気に解放し、インパクトフレームで脳に刻み、余韻で重さを残す。このリズムをタイムラインに落とすだけで結果が変わります。

### 5-1. 4つの原則

| 原則 | 内容 | 効果 | プロンプト例 |
|---|---|---|---|
| **Anticipation（予備動作）** | 本動作の前に逆方向へ動く | 「来る」という予感で衝撃が増幅する | `slight wind-up leaning back before exploding forward` |
| **Impact Frame（衝撃フレーム）** | 打撃の瞬間を極端に強調 | 「当たった感」が脳に残る | `strong impact frame freezes for 0.3 seconds with radial distortion` |
| **Follow-through（余韻）** | 動作後に体が自然に流れる | 重さと慣性が出る | `body continues rotating slightly after the strike` |
| **Spacing（間隔の変化）** | 動きの幅を変える | 加速・減速が表現できる | `slow build-up then sudden extreme spacing on the attack` |

### 5-2. 黄金比「溜め → 爆発 → 余韻」

| 区間 | 長さの目安 | 中身 |
|---|---|---|
| 溜め（Anticipation） | **2〜4秒** | 筋肉の緊張、視線の固定、微かな震え |
| 本動作 | **0.1〜0.5秒** | ポーズが瞬間的に激変。ここが速さの核 |
| 余韻（Follow-through） | **1〜2秒** | 着地後の呼吸、蒸気、体の揺れ |

**溜めが本動作の何倍もあるのが正解**です。この比率を崩すと「ただの速い動き」になり、迫力が消えます。

### 5-3. インパクトフレームの正しい書き方

打撃の瞬間に1フレームだけ極端な絵を入れ、すぐ通常に戻し、カメラをわずかに揺らします。

```text
On impact: extreme impact frame freezes for 0.3 seconds with radial distortion,
inverted contrast flash, particles suspended in mid-air, slight camera bump,
then motion resumes explosively.
```

### 5-4. コマ打ちの感覚を言葉に変換する

アニメは2コマ打ちが基本で、作画では意図的に変えます。プロンプトでフレーム数は直接指定できないため、次のように言い換えます。

| 実際の技法 | プロンプトでの言い換え |
|---|---|
| 1コマ打ち（超高速部分） | `extremely fast motion with dense smear frames and afterimages` |
| 2コマ打ち（通常の動き） | （指定不要） |
| 3コマ以上（溜め・余韻） | `held poses with strong follow-through and visible body weight` |

### 5-5. 映像美系のタイミング（読みやすさとの両立）

- 予備動作は丁寧に、本動作は短く鋭く
- **エフェクトを本体の動きよりわずかに遅らせる** — これが「エフェクトが本体を隠さない」最大のコツ
- カメラは暴れさせすぎず、動作の軌跡を追う
- 着地後に「間」を作り、次の動作への余韻を残す

```text
Effects trail slightly behind the body movement, never overlapping the silhouette.
A brief held beat after the landing before the next motion.
```

### 5-6. 弱い指定と強い指定の違い

弱い（これでは崩れる）:

```text
A character punches very fast with impact.
```

強い（Sakugaタイミングを時系列に落とす）:

```text
0-1.8s: Settles into a deep stance, muscles tense, slight anticipation lean backward.
1.8-2.1s: Explodes forward with extreme speed, dense afterimages trailing, body becomes a blur.
2.1-2.4s: Contact - strong impact frame freezes for 0.3 seconds with radial distortion,
          inverted contrast flash, sweat and dust flying, slight camera bump.
2.4-4.0s: Full follow-through, the body rotates with momentum, lands in guard,
          breathing heavily, steam rising.
```

### 5-7. タイミングの失敗と対策

| 失敗 | 原因 | 対策 |
|---|---|---|
| 動きがただ速いだけ | 溜めと余韻が不足 | Anticipation と Follow-through を必ず入れる |
| 打撃感がない | インパクトフレームがない | 打撃の瞬間を0.2〜0.4秒フリーズさせる |
| カメラが暴れて見づらい | カメラ指示が多すぎる | 主カメラ運動を1つに絞る |
| エフェクトが本体を隠す | エフェクトが同時すぎる | エフェクトを少し遅らせる指定を入れる |

---

## 6. なぜ普通のプロンプトでは足りないか

1. **時間の圧縮と爆発** — 動作の「間」を削り、衝撃だけを残す。→ タイムラインを0.3秒単位まで刻む。
2. **速度の二段階表現** — 高速移動は残像・速度線・背景の流れで、打撃の瞬間だけ極端なスローで見せる。**スローがないと速すぎて何も見えない**。
3. **物理と誇張のハイブリッド** — リアルな体重移動・筋肉の収縮を保ったまま、空間を歪ませる速度を足す。物理記述を省くと「フワフワした速い何か」になる。

AIは「連続した自然な動き」が得意な一方、**時間を意図的に歪める表現が苦手**なので、明示的に書く必要があります。

---

## 7. 表現技法 → プロンプト対応表

| 狙う表現 | 再現方法 | キーワード例 |
|---|---|---|
| 瞬間移動 | 位置を一瞬で変える＋残像＋空間の歪み | `vanishes in a flash of light, leaves multiple afterimages, reappears instantly with a shockwave` |
| 超高速移動 | 残像を複数残す＋背景が流れる | `extreme speed with dense afterimages of decreasing opacity, background streaks heavily` |
| 息を飲む衝撃 | インパクトフレーム＋画面歪み | `impact frame, screen shake, radial distortion, expanding shockwave ring` |
| 力の入った肉体 | 筋肉・汗・呼吸を詳細に（強度A範囲） | `muscles straining under the skin, sweat flying, sharp exhale, intense focused expression` |
| 本格作画の質感 | 線の太さの変化＋描き込み | `sakuga quality, varying line weight, highly detailed impact frames` |
| 溜め | 静止と微振動 | `energy building, slight tremble, dust lifting off the floor, hair rising` |

---

## 8. 高強度プロンプトの構造（9ブロック）

```text
[Duration]s | 16:9 | 2K

[Reference]
@image1 = strict character identity lock (face, hair, body, uniform, exact colors). Never alter.
@image2 = charged-up expression reference
@image3 = environment style lock

[Core Style]
High-end TV anime action sequence, top-tier key animation, sakuga quality,
cel-shaded with dynamic line weight variation, painterly particle effects,
seamless blend of 2D character animation and 3D environmental depth,
intense speed lines, multiple afterimages, impact frames, radial shockwaves.

[Core Principle]
Prioritize explosive speed and instantaneous position changes over continuous fluid motion.
Time is compressed. Insert one extreme slow-motion beat at the moment of impact.

[Subject]
[固定キャラ記述]

[Environment & Light]
[場所] + volumetric god rays, atmospheric haze, dramatic rim lighting,
high contrast between a dark background and bright effects.

[Action Timeline]   ← 0.3秒単位まで刻む
0-1.5s: [溜め]
1.5-2.0s: [消失・残像]
2.0-2.3s: [出現・衝撃波]
2.3-4.0s: [打撃＋インパクトフレーム＋スロー＋粒子爆発]
4.0-6.0s: [余韻・環境の反応・呼吸]

[Camera]
Dynamic 3D-like camera movement, center-framed action, slight lag during high-speed movement,
aggressive whip pan and sudden push-in on impact. The camera struggles to keep up.

[Sound]
Deep bass impact, sharp sonic boom on the teleport, heavy breathing, fabric snap, low energy rumble.

[Constraints]
No slow continuous movement. No floaty physics. No weak impacts.
Maintain anatomical correctness even during extreme speed.
Particles must never obscure the action. No text, no watermark, no identity drift.
```

---

## 9. 強度A の実例プロンプト（FLATUPで使える）

対人打撃を含まず、速度・映像美・衝撃だけを最大化した3本です。

### 8-1. 溜め → 瞬間移動 → サンドバッグへの一撃

```text
7s | 16:9 | 2K
@image1 = strict identity lock. Never alter face, hair, or uniform.
High-end TV anime action sequence, top-tier key animation, sakuga quality,
varying line weight, painterly particle effects, cel-shaded 2D character with 3D environmental depth.
Core principle: time is compressed. Explosive speed over continuous motion.
Environment: dim gym at night, one heavy bag under a single overhead light,
volumetric god rays through the dust, atmospheric haze, dark background with bright effects.
0-1.5s: The fighter stands still before the heavy bag. Energy building, slight tremble,
        dust lifting off the floor, hair rising, intense focused eyes. Long held preparation pose.
1.5-2.0s: VANISHES in a flash, leaving 4-5 dense afterimages of decreasing opacity.
          The background warps slightly. Golden particles drift in the disturbed air.
2.0-2.3s: REAPPEARS beside the bag with a sonic boom and an expanding shockwave ring.
          The camera whip-pans and briefly fails to keep up.
2.3-3.2s: One devastating high-speed body kick into the heavy bag. The limb is a blur.
          At contact, an extreme slow-motion impact frame holds for 0.3 seconds:
          extreme contrast, radial distortion, screen shake, a burst of red-gold embers,
          sweat and dust exploding outward.
3.2-7s: The bag swings violently, the chain rattles, the overhead light swings and throws
        moving shadows. The fighter lands in stance, breathing hard, steam rising from the shoulders.
Camera: static wide -> violent whip pan -> sudden push-in on the impact -> slow circling pull back.
        Center-framed throughout.
Sound: low rumble, sharp sonic boom, deep bass impact, chain rattle, heavy breathing.
Constraints: no person is struck, no floaty physics, no weak impact, particles never obscure
             the body, anatomically correct at extreme speed, no identity drift, no text.
```

### 8-2. 瞬間移動のようなステップワーク（連続）

```text
8s | 16:9 | 2K
@image1 identity lock. High-end TV anime action sequence, sakuga quality, cel-shaded,
painterly particles, 3D-like environmental depth.
Core principle: instantaneous position changes, dense afterimages, compressed time.
Environment: empty gym, hard morning light through high windows, volumetric light shafts,
floating dust, polished floor with strong reflections.
0-1s: Fighter in stance, absolutely still, eyes sharp.
1-2s: Explodes laterally. The body is nearly invisible except for 4 afterimages of decreasing
      opacity. The background streaks into horizontal lines. Dust trails mark the path.
2-3s: Stops dead in a new position with a hard foot plant, floor dust bursting outward in a ring.
3-5s: Repeats in three more directions. Each stop is absolutely still, each burst leaves afterimages.
      The camera lags half a beat behind every time and overshoots.
5-8s: Final stop facing the camera, one sharp exhale, breath visible in the cold air, guard up.
Camera: 3D-like circling wide shot that whip-pans to chase and repeatedly overshoots. Center-framed.
Sound: sharp foot plants, air displacement whoosh, controlled breathing. No music.
Constraints: no opponent, no floating, feet always plant with visible weight, anatomically correct,
             no identity drift, no text.
```

### 8-3. シャドーの超高速コンビネーション（映像美重視）

```text
10s | 16:9 | 2K
@image1 identity lock. High-end TV anime action sequence, top-tier key animation,
varying line weight, flowing painterly particle effects, volumetric god rays, atmospheric haze.
Core principle: explosive bursts separated by absolute stillness.
Environment: dark gym, a single shaft of light from a high window, dust suspended in the beam.
0-2s: Ready stance inside the light shaft, particles floating, dramatic rim lighting on the shoulders.
2-7s: A blistering shadow-boxing combination into empty air - jab, cross, low kick, high roundhouse.
      Each strike leaves a flowing red-gold energy trail and a painterly particle burst.
      Dense afterimages during the fastest movements. Thin shockwave rings at each full extension.
      One 0.3-second extreme slow-motion beat with a high-contrast impact frame on the final kick.
7-10s: Freezes in the finishing position, then relaxes into guard. Chest heaving, sweat flying off
       the shoulders, steam rising, particles settling slowly through the light shaft.
Camera: one smooth 3D-like arc around the fighter, center-framed, with a single sudden push-in
        on the final kick and a slight lag on the fastest strikes.
Sound: layered whooshes, fabric snaps, one deep low hit on the final strike, heavy breathing,
       subtle low hum.
Constraints: no opponent, no contact with a person, no floating, planted feet with clear weight
             transfer, particles never obscure the form, anatomically correct, no identity drift.
```

---

## 10. 強度B の技法（記録のみ・FLATUP名義では使わない）

対人の打撃・被弾を含む表現です。**FLATUPの作品・広告には使いません**（§2）。技術記録として残します。

- 対人の瞬間移動攻撃は「溜め → 消失 → 相手の背後に出現 → 打撃 → 吹き飛び → 着地」の6段構成。
- 迫力の記述: `veins bulging on the neck, teeth clenched, eyes wide with effort, spit and sweat flying on impact`。
- 被弾側の物理: `launched backward with realistic body physics plus exaggerated force`。
- これらは痛み・苦悶の描写を伴うため、初心者向けブランドの導線では逆効果になります。用途と掲載先を決めたうえでオーナー承認を取ってください。

---

## 11. 速さを「見える」ようにする3つのコツ

1. **瞬間移動は3段に分ける** — 「消える → 残像が残る → 別の場所に現れる」を必ず別の時間帯として書く。`afterimages that fade slowly` `flash of light` `spatial distortion` を入れる。
2. **カメラを追いつかせない** — `whip pan`、`camera lag`、`the camera struggles to keep up`。カメラが完璧に追うと速く見えない。
3. **打撃の瞬間だけ極端なスロー** — `extreme slow-motion for 0.2-0.4 seconds at the moment of impact`。これがないと速すぎて視認できず、迫力が消えます。

背景の処理も効きます: `background completely streaks into horizontal lines`、`body becomes nearly invisible except for afterimages`。

---

## 12. 生成後の検証チェックリスト

- [ ] 瞬間移動時に、消えた場所へ残像が残っているか
- [ ] 残像の濃度が段階的に薄くなっているか（`decreasing opacity`）
- [ ] 動きが「流れる」のではなく「爆発している」か
- [ ] 溜め → 爆発 → 余韻の3拍になっているか
- [ ] 溜めが本動作より明らかに長いか（2〜4秒 : 0.1〜0.5秒）
- [ ] 予備動作（逆方向への溜め）が入っているか
- [ ] エフェクトが本体よりわずかに遅れているか
- [ ] 打撃の瞬間にスローとインパクトフレームが入っているか
- [ ] 線の太さが打撃の瞬間で変化しているか
- [ ] 粒子エフェクトが動作を隠していないか
- [ ] 背景の暗さとエフェクトの明るさに差があるか
- [ ] 環境（埃・チェーン・照明）が力に反応しているか
- [ ] 足が必ず接地し、体重が乗っているか
- [ ] 顔・髪・服装が最初から最後まで同一か
- [ ] 強度Aの範囲内か（人物への打撃・痛みの表情が入っていないか）
- [ ] 特定作品・実在人物を想起させる要素がないか（公開用）

---

## 13. 編集での底上げ

- 打撃の瞬間に **手動で0.3秒の極端なスロー** を挿入する
- 衝撃音を重い低音に差し替える（生成音は軽くなりがち）
- 1〜2フレームの白フラッシュを衝撃に重ねる
- 画面端に微細なレンズ歪みを加える
- 生成で爆発的な動きを作り、別ツールで表情の微調整とシーン拡張を行う

---

## 14. 参考の見方（研究用）

有名バトルアニメの戦闘シーンをスロー再生し、次の3点だけを観察するとプロンプトの精度が上がります。**絵を真似るのではなく、時間と空間の設計を読み取る** のが目的です。

- カメラがどの軌道で動き、どこで遅れているか
- エフェクトが空間のどこまで広がり、いつ消えるか
- 溜めの長さと、爆発の長さの比率

観察結果は「秒数と描写」に翻訳してこの文書に追記してください。作品名そのものは、公開用プロンプトには持ち込まないこと（§3）。

---

## 15. 承認ゲート

- AIだけで進めてよい: プロンプト作成、試作生成、社内確認
- **オーナー承認が必要**: 課金、SNS・LP・YouTube等への公開、ブランド映像への採用、強度Bの使用判断、作品名を含むスタイル指定の公開利用、commit / push / PR

---

## 16. 関連ファイル

- `docs/FLATUP_ANIME_MARTIAL_ARTS_TUTORIAL_GUIDE.md` — 教則動画（この文書と混ぜない）
- `docs/FLATUP_ANIME_MOTION_TRANSFER_GUIDE.md` — 実写→アニメのモーション参照
- `docs/FLATUP_ANIMATION_BIBLE.md` — ブランドの約束とトーン
- `docs/FLATUP_CHARACTER_CONSISTENCY_RULE.md` — キャラ一貫性の絶対ルール
- `FLATUP_GYM_ANIME_ART_BIBLE.md` — キャラクター統一基準（正本）
- `girl-power-op/README.md` — OP動画の既存実装
- `docs/ai-os/canon/safety_rules.md` — 安全ルール
