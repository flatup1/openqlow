# 成果物5: 動画生成プロンプト

- 方式: **Image-to-Video**（承認済みの静止画を開始フレームにし、**動きとカメラだけ**を指示する）
- 原則: 1クリップ＝1動作。3〜6秒で生成し、編集で必要秒数に切り出す
- I2Vでは画像に写っている内容を再説明しない。**何がどう動くか・カメラ・雰囲気**を書く
- 各プロンプトに §共通ネガティブ を必ず併記する（省略禁止）
- 開始フレームは**ジム背景のある画像**を使う。白背景のキャラ設定画は使わない（世界観が切れる）

> **提供元の仕様は未確認。** Seedance 2.5 は提供サービスにより解像度・参照数・Reference-to-Video（画像／動画／音声を役割別に参照）の対応が異なる。
> 参考動画を「動き・カメラの参照」として使えるかは、実際に使うサービス側の実装を確認してから決めること。
> 対応する場合の役割分担は「カメラの速さ・身体の運び・テンポは参照動画に寄せる。人物・衣装・ジムはFLAT UP素材を維持」。

---

## 共通モーションブロック（全クリップ冒頭に貼る）

```text
[MOTION — always include]
Image-to-video. Preserve the input image exactly: same character design,
same 2.5-head chibi proportions, same face, same black hair, same red boxing
gloves, same FLATUP GYM t-shirt, barefoot, same gym with star-pattern floor,
same colors and lighting. Only ONE action happens in this clip.
Expression stays focused and calm at most — never angry, never aggressive.
Impact is created by camera, timing and secondary motion, not by facial
expression. End the clip settling toward stillness.
```

## 共通ネガティブ（`brand-film-series/02_QA_CHECKLIST.md` §4 が正本）

```text
bad quality, blurry, distorted, 3D, realistic, photorealistic, adult,
wearing shoes, wearing socks, wearing earrings, long gloves with fingers,
CGI, octane render, illustration inconsistency, low quality,
watermark, text, signature, extra fingers, deformed hands,
violence, aggressive expression, scary atmosphere
```

---

## CUT 01（4.0秒）ジムの扉が開く

```text
[MOTION]
Camera: very slow dolly-in toward a gym doorway, barely perceptible.
Motion: warm light widens through the opening gap of the door. The gym inside
is empty and still; one hanging punching bag is perfectly motionless.
Dust particles drift slowly through the light beam. Atmosphere only, no people.
Pacing: quiet, held breath.
```

## CUT 02（3.0秒）グローブを締める

```text
[MOTION]
Camera: locked off, tight close-up on the hands.
Motion: the wrist strap of the red boxing glove is pulled tight in ONE single
firm motion, then the fingers close. Nothing else moves. Tiny natural
hesitation before the pull.
Pacing: slow, deliberate.
```

## CUT 03（5.0秒）女性インストラクター × ミット3発

```text
[MOTION]
Camera: smooth arc, orbiting horizontally around the pair from the side.
Motion: three punches into the held mitts, in an even rhythm. On each contact
the mitt compresses slightly and the arm absorbs the impact. Hair and shirt
move a beat after the body. Between hits, both keep a relaxed ready stance.
Both faces stay calm and focused, never aggressive.
Pacing: building energy, confident, controlled.
```

## CUT 04（5.0秒）女の子 × サンドバッグ

```text
[MOTION]
Camera: static medium shot, slight low angle.
Motion: one punch lands on the hanging bag. The bag bends, swings away, and
returns with a slow chain sway. The girl steps back half a step, then looks up
at the swinging bag with a small surprised smile. Hair settles last.
Pacing: one clean impact, then a soft human reaction.
```

## CUT 05（4.0秒）キッズ3人の高速ミット

```text
[MOTION]
Camera: quick lateral track along the row of three children, left to right.
Motion: three children in a row hit their mitts in fast alternating rhythm,
slightly offset from each other so the motion ripples down the line.
Speed streaks in the background suggest tempo. All expressions are bright and
focused, having fun.
Pacing: fast, energetic, rhythmic.
```

## CUT 06（6.0秒）2人のミット交換

```text
[MOTION]
Camera: crane down from a high angle to eye level during the clip.
Motion: two people face each other and trade roles rapidly — one strikes the
mitts, the other receives, then they swap, back and forth. The exchange builds
speed. Impact shows in the mitts compressing and the arms absorbing, never in
any contact with a body. Both stay upright and balanced.
Pacing: fastest section, tight and rhythmic.
```

> 元案は「女性スパーリング」。人物同士の打撃は共通ネガティブの `violence` と衝突するため、対面のミット交換に置き換えている。

## CUT 07（5.0秒）ハイキック・超スロー

```text
[MOTION]
Camera: low angle looking up, slight handheld shake on impact.
Motion: a step in, then a high kick toward the hanging bag. Time ramps into
extreme slow motion just before contact — the shin nearly touching the bag —
then snaps back to full speed on impact. The bag deforms deeply and swings
away. Hair, shirt and sweat droplets move a beat late. Light particles scatter
outward from the point of contact. The kicker lands and settles into a stance.
Pacing: slow — hold — snap — settle. This is the peak of the film.
```

## CUT 08（3.0秒）グローブタッチ

```text
[MOTION]
Camera: static close shot on the two gloves.
Motion: two red boxing gloves move toward each other and touch once, gently.
On contact, a few soft light particles bloom outward. Both hold still for a
beat afterwards. Nothing else moves.
Pacing: sudden calm after the peak. Silence.
```

## CUT 09（4.0秒）全員の笑顔

```text
[MOTION]
Camera: slow pull back, widening to include the whole group.
Motion: the group stands together, relaxed — no fighting stances. Small
natural movements: one child bounces slightly, someone laughs, an instructor
puts a hand on a child's shoulder. Warm evening light sweeps across the star
floor.
Pacing: warm, settled, the emotional payoff.
```

## CUT 10（3.0秒）ロゴ ＋ CTA

編集で作る（生成不要）。暗転 → ロゴ → コピー → 体験ボタンだけ最後に光る。
表示文言の正本は `src/shared/canon.ts`（`trialFirst: 初回体験500円`）。

---

## 生成後チェック（`brand-film-series/02_QA_CHECKLIST.md` に準拠）

- [ ] 顔が同一人物に見える（カット間で崩れていない）
- [ ] グローブの赤が統一
- [ ] Tシャツのロゴが見える／表記揺れがない
- [ ] 裸足
- [ ] 星型フロアが見える
- [ ] 怒り顔・威圧・流血・KOがない
- [ ] 人を打つ画になっていない（対象はミットかサンドバッグ）
- [ ] 既存IPを連想させる衣装・意匠が混ざっていない
