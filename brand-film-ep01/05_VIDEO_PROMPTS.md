# 成果物5・13・14: 動画生成プロンプト / ネガティブプロンプト / 破綻防止ルール

- 方式: **Image-to-Video**(`04_IMAGE_PROMPTS.md` で承認済みの静止画を入力し、動きだけを指示する)
- 原則: **1クリップ=1動作**。クリップ長は3〜5秒で生成し、編集で必要秒数に切り出す
- すべてのクリップ共通の語尾指示: 動きは最小限、最後は自然な静止へ戻す
- 各プロンプト末尾に §3 のネガティブプロンプトを必ず併記する

## 1. 共通モーションブロック(全クリップ冒頭に貼る)

```text
[MOTION — always include]
Image-to-video. Preserve the input image exactly: same characters, same
objects, same colors, same background layout, same lighting, same lens.
Camera is locked off (static) unless specified. Only ONE subtle motion happens
in this clip. Slow, gentle, calm pacing. All movement is small and natural.
End the clip settling back toward stillness.
```

## 2. シーン別動画プロンプト

### S1(4.0秒) 閉館後のジム

```text
[MOTION]
Camera: very slow dolly-in toward the center of the night gym, barely
perceptible. Motion: none in the scene itself; the hanging bags are perfectly
still, light is steady. Atmosphere only.
```

### S2(4.0秒) 道具たちの目覚め

```text
[MOTION]
Camera: static. Motion: the red mitts on the shelf tilt upright very slowly,
like someone gently waking; the small white gloves rise to a sitting position
in one soft motion; in the blurred background the neon-pink bag begins one
tiny sway. No other object moves. No deformation of the objects.
```

※1クリップ1動作を厳守する場合は「ミットのみ」「グローブのみ」の2クリップに分けて生成し、編集で繋ぐ(推奨)。

### S3(4.0秒) 最初の会話

```text
[MOTION]
Camera: static close shot on the shelf. Motion: the red mitts lean slightly
toward the gloves and give one small nodding sway, as if speaking; then the
gloves answer with one gentle tilt. Movements are conversational, tiny, warm.
Objects keep their exact shape.
```

### S4(4.0秒) 昼へ — 初めてのグローブ

トランジションクリップ(夜→昼、2.0秒):

```text
[MOTION]
Camera: static close-up on the neon-pink bag surface. Motion: warm daylight
slowly blooms across the bag from one side, night tones dissolving into bright
day. Light change only; the bag itself barely sways once.
```

手元クリップ(2.0秒):

```text
[MOTION]
Camera: static close-up. Motion: adult hands gently fasten the white glove
strap onto the child's small hand; the child's fingers curl once inside the
glove. Slow, careful, tender. Hands stay anatomically correct, five fingers.
```

### S5(3.0秒) 不安 — 振り返り

```text
[MOTION]
Camera: static over-the-shoulder at child eye level. Motion: the child lowers
the gloves a little and slowly turns their head back toward the mother on the
bench, chest rising with one visible nervous breath. The mother in the
background stays soft-focus and still. No one else moves.
```

### S6(3.0秒) 親のうなずき

母クリップ(2.0秒):

```text
[MOTION]
Camera: static medium close-up from the child's point of view. Motion: the
mother meets the gaze and gives exactly one small slow nod with a gentle
almost-smile. Nothing else moves. No tears, no big expression.
```

子の切り返しクリップ(1.5秒):

```text
[MOTION]
Camera: static close-up. Motion: the child's tense face softens — one small
exhale, eyes steadying, the faintest nod back. Micro-expression only.
```

### S7(4.0秒) もう一度の一歩

```text
[MOTION]
Camera: static side shot at child eye level. Motion: the child takes one small
step forward and touches one light, gentle punch onto the mitt held by the
kneeling instructor; the mitt gives slightly; the instructor's smile warms.
The punch is soft contact, not a technique. One action only, then settle.
```

### S8(2.0秒) 笑顔 — 母のもとへ

```text
[MOTION]
Camera: static, from behind the mother's shoulder. Motion: the child walks a
few steps toward the mother with a small proud smile; the mother's posture
opens gently to receive them. Slow walking pace, no running, no jumping.
```

### S9(3.0秒) 手

```text
[MOTION]
Camera: static extreme close-up. Motion: the white glove slips off revealing
the small bare hand; the mother's hand enters frame with a towel and the two
hands touch for one quiet moment. Slow, tender, anatomically correct hands.
```

### S10(3.0秒) 帰り道

```text
[MOTION]
Camera: static, or an extremely slow push from behind. Motion: the child walks
a little ahead toward the warm evening light, the mother follows one step
behind, her head turning slightly to watch the child's back. Natural relaxed
walk, warm and unhurried.
```

### S11(6.0秒) 再び夜 — 回想

```text
[MOTION]
Camera: very slow dolly-out revealing the quiet night gym. Motion: the
neon-pink bag sways once, very gently; the mitts give one slow thoughtful
tilt; the gloves settle a little, like friends remembering a good day.
Movements are spaced out, calm, nostalgic.
```

### S12(5.0秒) ラスト — 消灯

```text
[MOTION]
Camera: static wide. Motion: the warm ceiling light dims slowly to off,
leaving the objects as calm silhouettes in window moonlight; the mitts give
one last tiny settling motion, like falling asleep. Fade toward near-dark but
keep the moonlit window visible. Peaceful.
```

## 3. ネガティブプロンプト(成果物13 — 画像・動画共通)

すべての生成に併記する:

```text
[NEGATIVE]
no text, no captions, no subtitles, no watermark, no logos, no brand names,
no faces or eyes or mouths on objects, no anthropomorphic limbs on objects,
no object deformation or melting, no horror mood, no creepy lighting,
no extra people, no crowd, no duplicated characters, no character change
between frames, no extra fingers, no deformed hands, no distorted faces,
no uncanny smiles, no exaggerated crying, no dramatic tears,
no fighting, no sparring, no powerful punches or kicks, no impact effects,
no boxing ring, no cage, no muscles emphasis, no aggressive poses,
no fast camera movement, no shaky handheld, no zoom, no lens flare,
no color flicker, no lighting jumps, no background changes, no new objects
appearing, no cartoon squash-and-stretch, no oversaturated colors,
no photorealistic real people (keep stylized 3D animation look),
no imitation of existing animation studios or famous characters
```

## 4. 画像と動画の破綻防止ルール(成果物14)

### 生成前

1. 基準画像(キャラシート+内装)未承認のままシーン生成を始めない
2. プロンプトは必ず「共通ブロック+シーン固有部+ネガティブ」の三層構成にする。手打ちで省略しない
3. 参照画像機能があるツールでは、直前に承認した同一キャラのカットを参照に入れる

### 生成時

4. 1クリップ1動作。2つの動きが必要なら2クリップに分けて編集で繋ぐ
5. クリップは3〜5秒で生成する(長尺生成ほど顔・手が崩れる)
6. 手・指が映るカット(S4/S9)は必ず複数テイク生成し、指の本数・関節を静止コマ単位で確認する
7. 台詞と口: 人物に口パクをさせない(台詞は道具のVOのみ、道具に口はない)。人物が話しているように見えるテイクは破棄

### 生成後チェックリスト(全カット共通・1つでもNGなら再生成)

- [ ] 子どもの服(白T+グレー短パン)、母の服(ベージュカーディガン)、インストラクター(白ポロ)が全カットで同一か
- [ ] グローブ/ミット/サンドバッグの色・形が全カットで同一か(夜の道具と昼の道具が同一デザインか)
- [ ] 背景の配置(ベンチ左・棚・時計・バッグ2本)が全カットで矛盾していないか
- [ ] 照明の色温度が「夜=暖色+月光」「昼=自然光」で統一されているか
- [ ] 指は5本か。手・顔に歪みはないか
- [ ] 道具に目・口・手足が生えていないか。形が潰れ・伸びしていないか
- [ ] 動きが速すぎないか。ホラーに見える瞬間がないか
- [ ] パンチが「強そう」に見えていないか(触れる程度か)
- [ ] 不自然な笑顔・過剰な感情表現(AI特有)がないか
- [ ] クリップの最後が静止に向かっているか(編集で繋ぎやすいか)

### 編集段階

8. カット間の色を編集ソフトで統一グレーディングする(夜LUT/昼LUTを各1つ作り全カットに適用)
9. 破綻フレームが数フレームだけの場合は、そのフレームを避けて切り出す(全再生成より先に検討)
10. どうしても安定しないカット(例: S9の手と手)は、実写の手元素材で差し替える逃げ道を持つ(スタイライズ処理で馴染ませる)
