# FLATUP GYM BRAND FILM — EPISODE 01「今日一番頑張った子は誰?」
## 制作パッケージ(生成AI・編集チーム向け・そのまま実行できる仕様書)

> 上位正本: `docs/FLATUP_BRAND_FILM_MASTER_CONTEXT.md` / `docs/FLATUP_ANIMATION_BIBLE.md`。
> 本書はそれを"作れる状態"に具体化したもの。矛盾したら上位正本が優先。
> 承認ゲート: 公開・本番アップロード・課金は JIN 承認後のみ。AIは制作・検証まで。

---

## 1. 最終コンセプト

夜の静かなFLATUP GYMで、道具たちがその日一番頑張った子どもの話を、ぽつぽつと語り合う。
昼の記憶をたどりながら、子どもの小さな挑戦と、それを見守る親の「今しかない時間」を描く。
**格闘技を売らない。** 先に共感 → 次に安心 → その後にFLATUP GYM → 最後に優しい体験導線。
見終わった親が、今日、子どもを少し抱きしめたくなる。心に「ここなら一緒に見守ってくれるかも」が静かに残る。

**貫く一行**: 強さは、誰かに勝つことじゃない。昨日の自分より、少しだけ前へ進めること。

---

## 2. 3尺の構成(9:16 縦型)

| 尺 | 用途 | 流れ |
|---|---|---|
| **45秒(本編)** | YouTube/LINE VOOM/サイト | 夜→道具の目覚め→「今日一番は?」→昼の記憶(初グローブ→不安→親のうなずき→もう一度→笑顔→手→帰り道)→夜へ→「また明日」→ロゴ+導線 |
| **30秒(広告)** | Instagram/TikTok | 夜の問いかけ→昼(不安→親のうなずき→もう一度→笑顔)→手→夜「また少し強くなったね」→ロゴ+導線 |
| **15秒(フック)** | Reels/Shorts 冒頭検証 | 夜の問い→不安→親のうなずき→小さな一歩→笑顔→ロゴ+導線 |

冒頭1〜3秒で「静かな違和感」(誰もいない夜のジムで道具がわずかに動く)を作り、スクロールを止める。字幕なしでも感情が伝わること。

---

## 3. シーン別秒数(45秒本編・基準タイムライン)

| SCENE | 秒 | 内容 |
|---|---|---|
| S1 閉館後のジム | 0.0–4.0 | 夜のジム、誰もいない。カメラゆっくり前進 |
| S2 道具の目覚め | 4.0–8.0 | ミットが動く/グローブが起きる/サンドバッグ揺れる |
| S3 最初の会話 | 8.0–11.0 | 「今日一番頑張った子は、誰だったかな?」→「あの子じゃない?」 |
| S4 昼の記憶へ | 11.0–14.0 | サンドバッグ表面に昼の光→明るい昼へ。初めてのグローブ、小さな手 |
| S5 不安 | 14.0–18.0 | 子が練習中に止まり、保護者を見る。急かされない |
| S6 親のうなずき | 18.0–22.0 | 親が言葉なく静かにうなずく。子が少し安心 |
| S7 もう一度の一歩 | 22.0–27.0 | 子が前を向く。小さくミットに軽くパンチ。インストラクターが笑顔で受ける |
| S8 笑顔 | 27.0–31.0 | 練習後、汗をかいて笑う。親のもとへ戻る |
| S9 手 | 31.0–35.0 | グローブを外す。小さな手。親の手がタオル。一瞬触れる |
| S10 帰り道 | 35.0–39.0 | 親子がジムを出る。子が少し前、親が背中を見る |
| S11 再び夜 | 39.0–43.0 | 夜へ。「何度もお母さんを見ていたね」「でも最後は笑って帰ったね」「また少し強くなったね」 |
| S12 ラスト | 43.0–45.0 | 「また明日、みんなに会えるかな」→暗転→ロゴ+コピー+体験導線 |

30秒版は S1(短縮)+S3+S5+S6+S7+S8+S9+S11+S12、15秒版は S3+S5+S6+S7+S8+S12 を再利用。

---

## 4. 全シーン共通:美術・スタイル設定(STYLE ブロック)

> すべての画像/動画プロンプトの末尾に貼る共通指定。

```text
[STYLE]
Original warm family-friendly cinematic 3D animated short film. Bright, clean, safe martial-arts gym
interior modeled on a real small studio: white floor, white walls, wood accents, green plants, large
windows, warm soft lighting, physically based materials, soft realistic shadows, gentle cinematic depth
of field. FLATUP GYM accent props: a yellow heavy bag and a pink heavy bag (used gently, never
intimidating). Emotion shown through small gestures, gaze, breath and posture — not exaggerated faces.
Consistent character and prop shapes, consistent lens feel and warm color grade across every scene.
Completely original designs. No existing franchise characters, logos, costumes or compositions.
```

---

## 5. 道具キャラクターの定義

| 名称 | 役割 | 声/性格 | デザイン方針 |
|---|---|---|---|
| **ミットさん** | 語りの中心(年長者) | 落ち着いた・見てきた者の温かさ | パンチングミット。擬人化は最小。わずかな傾き・呼吸だけ |
| **グローブくん** | 応援役 | やさしい・励ます | レッドのボクシンググローブ。小さくうなずく程度 |
| **サンドバッグ** | 記憶のスクリーン | 無口・大きい・見守る | 黄/ピンクの大きなバッグ。表面に昼の記憶が淡く映る |

共通ルール: 完全な人型にしない。顔は"気配"程度、または無し。怖い表情・派手な擬人化・ホラー的な「物が動く」演出を避ける。動きは静かで優しく自然。

---

## 6. 人物設定

- **子ども(主役)**: 5〜7歳の完全オリジナルの可愛い子。最初は少し怖がり・運動が得意でない。**大きめのグローブ**が「自分には大きすぎる挑戦」の象徴。表情は「強そう」でなく「やってみたい」。
- **親(見守る人)**: 温かく静か。急かさない。**背中・うなずき・目線**で語る(顔のアップに頼らない)。しばしば背中越しの構図。
- **インストラクター**: やさしい。子どもの目線までしゃがむ。怒鳴らない・急かさない・待つ。技術より「もう一度やってみたこと」を称える。

全員、全シーンで同一デザイン(顔・髪・服・体型・色)を維持。

---

## 7. シーン別 画像生成プロンプト(S1〜S12・Image用)

> 各プロンプトの末尾に §4 [STYLE] と §11 [NEGATIVE] を必ず付ける。1枚=1構図。人物・道具は同一デザインを維持。

- **S1**: `Empty FLATUP gym at night after closing, only a few soft lights on, moonlight through windows, clean white floor and walls, plants, a yellow and a pink heavy bag, quiet and peaceful, slow cinematic wide shot, no people.`
- **S2**: `Same night gym, a boxing mitt on a shelf tilts ever so slightly as if gently waking, a red glove settles upright, the pink heavy bag sways a little with no wind, subtle magical calm, warm low light.`
- **S3**: `Close, cozy night composition of the mitt and gloves near each other as if quietly talking, soft rim light, gentle shadows, intimate storybook mood.`
- **S4**: `Transition frame: the surface of the heavy bag softly showing a daytime memory; bright daytime gym; a small original child putting on red boxing gloves for the first time, the gloves look a bit too big, tiny hands, curious nervous face.`
- **S5**: `Bright day gym, the small child pauses during practice and glances toward a parent off to the side, slightly unsure; calm supportive atmosphere, no pressure, instructor waiting kindly.`
- **S6**: `Warm medium shot: a parent quietly nods without words, reassuring; the child looks at the parent and relaxes a little; emphasis on gaze and the parent's calm presence, seen partly from behind.`
- **S7**: `The child faces forward again and throws one small soft punch onto a mitt held by a smiling instructor kneeling at the child's eye level; gentle, not a technique showcase, focus on courage.`
- **S8**: `The child after practice, lightly sweating and smiling with quiet satisfaction, turning back toward the waiting parent; soft warm light, no exaggerated pose.`
- **S9**: `Close-up of the child taking off a glove revealing a small hand; the parent's hand offers a towel; for a brief moment the two hands almost touch; tender, warm, shallow depth of field.`
- **S10**: `Parent and child leaving the gym in the evening; the child walks a little ahead, the parent watches the child's small back; warm everyday atmosphere, gentle.`
- **S11**: `Back to the quiet night gym, the mitt and gloves close together remembering the day, soft nostalgic light.`
- **S12**: `Night gym lights slowly dimming to near black, calm and warm, empty and peaceful — final frame before logo.`

---

## 8. シーン別 動画生成プロンプト(Image-to-Video用・1クリップ1動作)

> 各静止画を"短く1動作だけ"動かす。固定〜極ゆっくりカメラ。末尾に §11 動画共通ルールを付ける。

- **S1**: `Very slow dolly-in through the empty night gym. Camera moves gently forward only. Everything else still.`
- **S2**: `The mitt tilts slightly, the glove settles upright, the pink bag sways once and stops. Tiny, gentle motions. Fixed camera.`
- **S3**: `Almost still; the mitt leans a touch as if speaking, the glove gives a small nod. No camera move.`
- **S4**: `Soft cross-dissolve from the bag surface into the bright day; the child finishes pulling a glove on. One motion. Slow.`
- **S5**: `The child stops and turns their gaze toward the parent. Only the head/eyes move. Fixed camera.`
- **S6**: `The parent gives one slow, calm nod; the child's shoulders relax slightly. Subtle. Fixed camera.`
- **S7**: `The child steps once and taps the mitt with a small punch; the instructor's mitt receives it with a smile. One clean motion.`
- **S8**: `The child breathes, smiles softly, and turns toward the parent. Gentle. Slight slow push-in allowed.`
- **S9**: `The glove comes off, the small hand appears, the towel is offered, hands almost touch. One tender motion. Fixed camera.`
- **S10**: `Parent and child walk away from camera toward the exit; the child slightly ahead. Slow, steady. Fixed camera.`
- **S11**: `Return to night; the mitt and glove settle quietly as if finishing a sentence. Barely-there motion.`
- **S12**: `Lights slowly dim to black. No character motion. Only light change.`

---

## 9. ナレーション完成稿(最小限・映像優先。道具の会話で足りる箇所は入れない)

> 落ち着いた・温かい・押しつけない声。親を責めない。全部は使わず、45秒版で下記から3〜4行を選ぶ。

- (S4付近)「子どもの成長は、いつの間にか過ぎていく。」
- (S9 手のカット)「小さな手は、いつか大きくなる。」
- (S10)「何度も振り返って『見ていて』と伝えてくれる時間も、ずっと続くわけじゃない。」
- (S11→S12橋渡し)「強さは、誰かに勝つことじゃない。昨日の自分より、少しだけ前へ進めること。」
- (ロゴ前)「私たちは、キックボクシングを教えたいだけじゃない。挑戦する姿を、安心して見守れる時間を届けたい。」

**推奨(45秒)**: S4「成長は…」/ S9「小さな手は…」/ S11-12「強さは…」/ ロゴ前「私たちは…」の4行のみ。
**30秒**: 「小さな手は…」+「強さは…」の2行。**15秒**: ナレーションなし(道具の会話と字幕だけ)。

---

## 10. 道具たちの会話 完成稿(童話の温度・ぽつぽつと)

- S3 開幕:
  - ミットさん:「今日、一番頑張った子は……誰だったかな。」
  - グローブくん:「んー……あの子じゃない?」
- S11 回想の締め:
  - グローブくん:「何度も、お母さんの方を見てたね。」
  - ミットさん:「でも、最後は……笑って帰ったね。」
  - サンドバッグ(小さく):「また少し、強くなったね。」
- S12 ラスト:
  - ミットさん(ひとりごとのように):「また明日……みんなに会えるかな。」

※ セリフは固定しすぎない指針(正本 §11)。上記は EP01 の確定稿だが、続話では言い回しを変えてよい。押しつけない・答えを出しすぎない。

---

## 11. 字幕版テキスト(音を出せない視聴者向け・9:16 中央下)

```
(S3)「今日、一番頑張った子は 誰だったかな。」
「……あの子じゃない?」
(S6)—— 親が、そっとうなずく。
(S7)もう一度、前を向いた。
(S11)「何度も、お母さんを見てたね。」
「でも、最後は笑って帰ったね。」
「また少し、強くなったね。」
(S12)「また明日、みんなに会えるかな。」
——
強さは、誰かに勝つことじゃない。
昨日の自分より、少しだけ前へ。
FLAT UP GYM ／ 体験受付中
```

---

## 12. 音楽・環境音・効果音の指示

- **音楽**: 静かなピアノ主体、柔らかなストリングスをS6以降で薄く。感動を押しつけない。テーマ曲はS11-S12で"完成"する構成(それまでは断片)。
- **環境音(優先)**: 夜の空調音、時計の針、建物の微かなきしみ(S1-S2)/ 子どもの呼吸、ミットに触れる軽い音、グローブが棚に触れる小さな音、遠くの笑い声、帰り際のドアの音(昼)。
- **効果音**: パンチ音は爆発でなく**低く温かい"ぽすっ"**。成功はファンファーレでなく、小さな拍手 or ピアノ一音。
- **間**: 無音・環境音だけの時間を必ず作り、視聴者が自分の子/自分を重ねる余白を残す(S5前後、S9)。

---

## 13. ネガティブプロンプト(画像・動画共通)

```text
[NEGATIVE]
scary, aggressive, angry, intimidating, violence, injury, blood, KO, hard sparring, competition, match,
shouting, crying-for-pity, guilt-tripping, extra limbs, extra fingers, deformed hands, distorted face,
duplicated body, warped background, flickering, camera shake, motion blur, fast action, watermark, logo
artifacts, unreadable text, existing franchise characters or costumes or logos, overly cartoonish, garish
neon, harsh lighting, horror mood, creepy moving objects, exaggerated anime faces.
```

---

## 14. 破綻防止ルール(画像・動画)

- カメラは固定 or 極ゆっくり。1クリップ=1動作。急なカメラ移動・高速カットをしない。
- 顔・手・指・身体を安定させる。道具の形を変形させない。背景配置・照明を急に変えない。キャラを増減させない。
- 感情は視線・呼吸・姿勢・間で。派手なアクションをしない。パンチ・キックは技術紹介にならない程度。
- 各クリップは自然な静止状態へ戻して終える(次クリップと繋ぎやすく)。
- **一貫性チェック**(生成ごと): 同じ顔/体型/衣装/色/グローブ形状か。道具の形が変わっていないか。左右反転していないか。

---

## 15. 編集タイムライン(45秒・実務用)

1. 各シーンのベストな Image-to-Video クリップを §3 の秒数にトリム。
2. トランジション: シーン間はゆっくりディゾルブ。S4(夜→昼)とS11(昼→夜)は光を重ねる柔らかいディゾルブ。
3. 音楽を敷き、S11-12でテーマが完成するようボリュームを設計。環境音を各シーンに配置。
4. 会話・ナレーションを配置(§9推奨の4行+§10会話)。無音の間を守る。
5. 字幕(§11)を中央下に。読みやすい余白。
6. S12 でロゴ+コピー+「体験受付中」。最後は静かに1.5秒ホールド。
7. 書き出し: 1080×1920 / H.264 / 24fps / ラウドネス -14 LUFS 目安。

---

## 16. ロゴ表示と CTA

- 暗転後、FLATUP GYM ロゴをふわりと表示。コピーは**1〜2個に絞る**:
  - メイン: 「人生の最初の一歩に寄り添う場所。」または「世界一、初心者に優しい格闘技ジム。」
  - 導線: 「体験受付中」または「はじめの一歩を、見に来ませんか。」
- **CTAは感情の後に、明確な行動案内**を。LINE友だち追加(`https://lin.ee/cTSDajPz`)を静かに1つだけ。独創的にしすぎて体験予約と分からなくならないこと。

---

## 17. 媒体別 書き出し案

| 媒体 | 尺 | 仕様 | 冒頭の作り |
|---|---|---|---|
| Instagram リール | 30秒 | 9:16 / 字幕焼き込み版も用意 | 夜の問いかけで"静かな違和感" |
| TikTok | 15/30秒 | 9:16 / 字幕必須 | 1秒目に道具の小さな動き |
| YouTube ショート | 45/30秒 | 9:16 | 本編寄り、余韻を残す |
| LINE VOOM | 45秒 | 9:16 | フルの物語。友だち追加導線を明示 |
| サイト ヒーロー(将来) | 15秒ループ | 無音自動再生+操作で音 | ポスター画像→ループ |

各媒体、音を出せない環境向けに**字幕版**を必ず用意。

---

## 18. A/B テスト案

- **冒頭A/B**: (A)夜の問いかけから / (B)昼の"不安そうに親を見る"から。どちらが3秒維持率が高いか。
- **コピーA/B**: 「人生の最初の一歩に寄り添う場所。」 vs 「世界一、初心者に優しい格闘技ジム。」
- **CTA A/B**: 「体験受付中」 vs 「はじめの一歩を、見に来ませんか。」
- **尺A/B**: 15秒 vs 30秒(保存・シェア・プロフィール遷移で比較)。
- 変数は1回1つ。感情の核(共感→安心→FLATUP)は固定。

---

## 19. 公開後の検証指標

視聴維持率(特に3秒/中盤/完視聴)/ 保存数 / シェア数 / コメントの質(「怖くなかった」「自分にもできそう」「うちの子みたい」)/ プロフィール遷移 / LINE登録 / 問い合わせ / 体験予約 / 入会 / 保護者・女性・初心者からの反応。
**判定は"美しさ"でなく「安心・自分にもできそう・任せられそう」と感じた割合。**

---

## 20. HP・LINEボットへ転用する際の注意点

- 反応の良かった**言葉・シーン・感情構造だけ**を正本へ反映(全部でなく、効いた核を)。
- HP転用時は `girl-power-op/index.html?loop=1` の埋め込み器を活用。CTAは `lin.ee/cTSDajPz` に統一。
- LINEボットは営業化させない(正本 §29)。広告で得た"優しい言葉"をボイスに反映。
- 大規模なサイト変更(四季構成 §30 等)は**広告の検証後**。AIが勝手に実装しない。提案として保持。

---

## 制作上の判断順(迷ったら)

1. 初心者が安心できるか → 2. 実際のFLATUPらしいか → 3. 不安商法になっていないか → 4. 強さでなく"一歩"を描けているか → 5. 親子以外の初心者も排除していないか → 6. 映像だけで伝わるか → 7. 説明しすぎていないか → 8. 体験予約の導線があるか → 9. AI生成として破綻しにくいか → 10. サイト/LINEへ展開できる一貫性があるか。

> **はじめの一歩を、笑わない。／ 世界一、初心者に優しい格闘技ジム FLAT UP GYM**
