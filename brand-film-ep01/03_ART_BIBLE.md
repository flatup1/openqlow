# 成果物6・7・8: アートバイブル(全シーン共通設定・道具キャラ定義・人物設定)

このファイルの定義は**全シーンで固定**する。画像・動画生成のたびに、ここの「共通スタイルブロック」をプロンプト冒頭へ必ず貼り付けること。

## 1. 作品全体のビジュアル定義

- 様式: **オリジナルの家族向けシネマティック3Dアニメーション**(既存の映画・スタジオ・キャラクターの名前をプロンプトに入れない)
- 質感: 物理ベースレンダリング。革・布・木・観葉植物の葉に丁寧なマテリアル感。過度に漫画的なデフォルメはしない
- 光: 映画的で柔らかい。夜=暖色の残り照明+窓からの月明かり。昼=大きな窓からの自然光+白い壁のバウンス
- 色調: 白+木目+緑(観葉植物)が基調。夜はやや暖色(3200K寄り)、昼はニュートラル〜やや暖かい昼光(5000K寄り)。彩度は控えめ、蛍光ピンクのサンドバッグだけが優しいアクセント
- レンズ: フルフレーム換算 35mm〜50mm 相当。浅めの被写界深度。歪みの強い広角・望遠圧縮は使わない
- カメラ: 固定またはごくゆっくりのドリー/パンのみ

## 2. 舞台: FLATUP GYM(モデル化した架空スタジオ)

実在のFLATUP GYMの雰囲気に基づく、明るく清潔な格闘技ジム。**豪華にしすぎない。実際に存在しそうな規模感を守る。**

固定する空間要素(全シーンで配置を変えない):

- 白いフローリング調の床、明るい白壁
- 壁は白+植物モチーフの装飾(実店舗準拠。実写確認 2026-07-21)。木目はベンチ等の小物のみ(壁一面の木目パネルは実店舗に無いため必須から外す)
- 観葉植物(モンステラ系の鉢植え)が2〜3箇所
- 大きな窓(昼: 自然光 / 夜: 街の静かな夜景)
- 木製ベンチ(保護者観覧用。S5/S6/S8で母が座る位置)
- 壁付きの木製棚(ミットとグローブの定位置)
- 天井から下がるサンドバッグ2本: **蛍光ピンク1本(キャラクター「バッグさん」)**、蛍光イエロー1本(実店舗はピンク+イエローが複数吊り。実写確認 2026-07-21。映像では2本に整理する)
- 壁の丸時計(夜のシーンで針の音の根拠になる)
- 威圧的な要素(リング、金網、トロフィー、闘争的ポスター)は置かない

## 3. 道具キャラクターのデザイン定義

**大原則: 顔パーツ(目・口・眉)を追加しない。** 感情は「傾き・揺れ・呼吸のような膨らみ・間」だけで表現する。声はボイスオーバーとして載せ、口の動きは存在しない。これによりホラー感と既存作品類似の両方を回避する。

### ミット(呼称: ミット / 会話の進行役)

- 形状: 赤×白のカーブドパンチミット1組。棚の上が定位置
- 素材: 使い込まれて角が少し柔らかくなった合成革。清潔だが新品ではない
- 動き: 「傾く」=聞いている/考えている、「小さくうなずくように前へ揺れる」=同意
- 性格: 穏やかな年長者。話し始めるのはいつもミット
- 声: 低めで温かい中性的な声(詳細は `06_SCRIPT_AUDIO.md`)

### グローブ(呼称: グロー / 子ども想いの相棒)

- 形状: 子どもサイズの白いボクシンググローブ1組(8oz程度の見た目)。ミットの隣が定位置
- 素材: 白い合成革、手首に面ファスナーベルト。昼のシーンで子どもが着けるグローブと**同一デザイン**(夜の語り手=昼の道具、という繋がりを画で示す)
- 動き: 「ゆっくり起き上がる」=目覚め、「左右にわずかに揺れる」=うれしい
- 性格: 素直で少し子どもっぽい。答えるのはいつもグロー
- 声: 明るく柔らかい、やや高めの声

### バッグさん(呼称: バッグさん / 静かな見守り役)

- 形状: 蛍光ピンクのサンドバッグ(FLATUP GYMの実物の個性を反映)。天井チェーン吊り
- 動き: 「風がないのに小さく揺れる」=相づち。台詞は最少(45秒版で1本のみ)
- 性格: 寡黙。一番長くジムにいて、一番よく見ている
- 声: ゆっくりで深い、包み込む声

### 禁止事項(道具キャラ共通)

- 目・口・手足・表情の追加、人型化
- 素早い移動、跳ね回る、飛ぶ
- 形状の変形(潰れ・伸び等のカートゥーン的スカッシュ&ストレッチ)
- 3体以外の道具が動くこと(世界の魔法は「この3つだけ」に限定して統一感を守る)

## 4. 人物設定

### 子ども: ハル(演出用呼称。作中で名前は呼ばれない)

- 6歳前後、110cm程度。性別を強く記号化しない中性的なデザイン(髪は短めの黒髪、丸い頬)
- 服装: 白い半袖Tシャツ、グレーのハーフパンツ、裸足または白ソックス(全シーン固定)
- 装備: 白い子ども用グローブ(グローと同一デザイン)。手に対して少し大きく見えるのが重要
- 芝居のキーワード: 「初めて」「不安」「振り返る」「小さな一歩」。上手なパンチは打たない。打つのは1回、軽く、ミットに触れる程度
- 表情の上限: 泣かない。大笑いしない。「泣きそう→安心→小さな笑顔」のグラデーションのみ

### 母: 見守る保護者

- 30代の母親。優しく落ち着いた雰囲気。ナチュラルなセミロングの黒髪
- 服装: ベージュのカーディガン+白のインナー(全シーン固定)。バッグとタオルを持っている
- 芝居のキーワード: 「静かに見守る」「言葉を使わないうなずき」。泣かない。立ち上がって駆け寄らない。ベンチから動かない(S9のタオル以外)
- ※第一話は正本の台詞(「何度もお母さんを見ていたね」)に合わせ母親とする。父親版はA/B候補として `08_TESTING_METRICS.md` に記載

### インストラクター: 受け止める人

- 20代後半の女性インストラクター。小柄で柔らかい印象。黒髪のひとつ結び
- 服装: 白のポロシャツ+黒のジャージパンツ(FLATUPスタッフ風の清潔な装い)
- 芝居のキーワード: 「膝を落として子どもの目線に合わせる」「待つ」「急かさない」「笑顔で受け止める」。大声を出さない。指導的なジェスチャーをしない
- 設計意図: 女性インストラクターにすることで「怖い格闘技ジム」の先入観を画面の中で静かに崩し、ブランド第二層(女性・初心者の安心)への伏線にする。※男性の優しいインストラクター版も許容(その場合も「柔らかい体格・白ポロシャツ・膝を落とす芝居」は不変)
- 実在整合の根拠: 女性インストラクターの在籍は `docs/ai-os/canon/gym_profile.md`(女性インストラクター: AIKA)と `docs/HANDOFF_brief_FLATUP集客エンジン.md`(強み「女性インストラクター在籍」)で確認済み。舞台となる土曜13:00のキッズクラス(canon.ts `scheduleKids`)は女性の体験予約可能日(`bookingWomen` 月・水・土)とも重なるため、女性インストラクターがキッズを受け止める描写は実態と矛盾しない。特定の実在スタッフの容姿は模写しない(キャラクターはオリジナル)

### 背景の人物(60秒版のみ)

- 昼の全景カットにのみ、他の子ども2〜3人と大人の会員1〜2人(女性含む)を小さく配置してよい。全員リラックスした雰囲気。スパーリングや激しい打撃はさせない

## 5. 共通スタイルブロック(全プロンプト冒頭に貼る)

画像生成・動画生成の**すべてのプロンプトの先頭**に、以下の英文ブロックをそのまま貼り付ける。

```text
[STYLE — always include]
Original heartwarming family-friendly cinematic 3D animation (original style,
not imitating any existing studio or film). Physically-based rendering, soft
shadows, warm cinematic lighting, shallow cinematic depth of field, 35-50mm
lens feel. A bright, clean, welcoming small boxing-fitness gym: white floor,
white walls decorated with gentle green plant motifs, potted monstera plants,
large window, wooden bench, wall shelf, a round wall clock, two hanging heavy
bags (one soft neon-pink, one soft neon-yellow). Calm, gentle, safe atmosphere
with zero intimidation.
Consistent set layout, consistent color grading, consistent lens across all
scenes. Emotions are shown through tiny gestures only. No exaggerated cartoon
faces, no added facial features on objects, no text, no logos.
```

夜シーンには追記:

```text
[NIGHT] After closing time, empty gym at night. Only a few warm lights remain
on, moonlight through the window, quiet and peaceful, slightly dim but never
scary.
```

昼シーンには追記:

```text
[DAY] Bright daytime, soft natural sunlight through the large window, airy and
clean, gentle warm daylight bouncing off white walls.
```

キャラクター登場時には該当ブロックを追記:

```text
[CHILD] A 6-year-old Japanese child with short black hair and round cheeks,
wearing a plain white t-shirt and grey shorts, white kids' boxing gloves that
look slightly too big for their small hands. Shy but earnest.
[MOTHER] A Japanese mother in her 30s with natural shoulder-length black hair,
beige cardigan over a white top, calm and gentle, sitting on the wooden bench.
[COACH] A Japanese female instructor in her late 20s, small build, soft
friendly features, black hair in a low ponytail, white polo shirt and black
training pants, kneeling to the child's eye level, patient warm smile.
[MITTS] A pair of well-used red-and-white curved punch mitts resting on the
wooden wall shelf. No face, no eyes, no mouth.
[GLOVES] A pair of small white kids' boxing gloves next to the mitts, same
design as the gloves the child wears. No face, no eyes, no mouth.
[PINKBAG] A soft neon-pink hanging heavy bag on a ceiling chain. No face, no
eyes, no mouth.
```

## 6. 一貫性の運用ルール

1. まず本ファイル末尾の「キャラクターシート生成」を行い、基準画像(道具3種・子ども・母・インストラクター・ジム内装の夜/昼)を**オーナー承認**で確定する
2. 以後の全シーン生成は、その基準画像への image reference(参照画像機能)+共通スタイルブロック併用を原則とする
3. シード値が使えるツールでは、承認カットのシードを記録し流用する
4. 服装・髪型・道具の色をシーンごとに変えない。迷ったら本ファイルが正
5. 生成物が本ファイルと矛盾した場合は、生成物を破棄して再生成する(定義側を画に合わせて変えない)

## 7. キャラクターシート生成プロンプト(最初に実行)

```text
[STYLE ブロックを貼る]
Character reference sheet, neutral grey background, soft studio lighting.
Subject: [CHILD / MOTHER / COACH / MITTS / GLOVES / PINKBAG のいずれかを貼る]
Show the subject from three angles: front view, three-quarter view, side view,
full body, consistent proportions, consistent colors and materials.
```

ジム内装の基準画像:

```text
[STYLE ブロックを貼る] + [NIGHT または DAY]
Wide establishing shot of the empty gym interior showing the full set layout:
white floor, white walls with green plant-motif decorations, potted plants,
large window, wooden bench on the left, wall shelf with the red mitts and small
white gloves, round wall clock, neon-pink heavy bag and neon-yellow heavy bag
hanging center-right. Empty, no people. Camera at chest height, 35mm lens feel.
```
