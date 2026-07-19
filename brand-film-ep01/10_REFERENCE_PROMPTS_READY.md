# 基準画像8枚: コピペ用・展開済みプロンプト集

`03_ART_BIBLE.md` §6-7 の「最初に基準画像を確定する」ステップを、**コピペ1回で実行できる形**に展開したものです。共通ブロックの組み立ては不要——各プロンプトをそのまま画像生成AI(Midjourney / ChatGPT(DALL-E) / Gemini / Nano Banana 等)に貼ってください。

## 使い方

1. 下の①〜⑧を順に生成する(各3〜4枚ずつ出して良いものを選ぶ)
2. 各プロンプト末尾の「✅承認チェック」を満たすものだけ採用する
3. 採用した8枚が以後の全シーン生成の**参照画像**になる(シード値が出るツールでは番号を控える)
4. 8枚承認後、`04_IMAGE_PROMPTS.md` のシーン生成へ進む

- Midjourney の場合は末尾に ` --ar 2:3 --no text, watermark, logo` などを追加
- 「NEGATIVE(避けるもの)」をプロンプト欄と分けて入力できるツールでは、分けて入力する

---

## ① ジム内装・夜(全夜シーンの基準)

```text
Original heartwarming family-friendly cinematic 3D animation style (original style, not imitating any existing studio or film). Physically-based rendering, soft shadows, warm cinematic lighting, shallow cinematic depth of field, 35mm lens feel. Vertical 9:16 composition.

Wide establishing shot of an empty small boxing-fitness gym at night, after closing time. White floor, white walls, one wood-panel accent wall, potted monstera plants, a large window with a quiet night view and soft moonlight, a wooden bench on the left, a wall shelf holding a pair of red-and-white curved punch mitts and a pair of small white kids' boxing gloves, a round wall clock, and two hanging heavy bags center-right: one soft neon-pink, one white. Only one warm ceiling light remains on; the rest of the room rests in gentle blue-grey darkness. Calm, clean, safe, peaceful — never scary. No people. No text, no logos.

NEGATIVE: no text, no watermark, no logos, no people, no faces on objects, no horror mood, no creepy lighting, no boxing ring, no cage, no clutter, no oversaturated colors, no photorealism (keep stylized 3D animation look)
```

✅承認チェック: ベンチ左/棚に道具/時計/バッグ2本(ピンク+白)の配置が揃っているか。怖く見えないか。

## ② ジム内装・昼(全昼シーンの基準)

```text
Original heartwarming family-friendly cinematic 3D animation style (original style, not imitating any existing studio or film). Physically-based rendering, soft shadows, warm cinematic lighting, shallow cinematic depth of field, 35mm lens feel. Vertical 9:16 composition.

Wide establishing shot of the same small boxing-fitness gym in bright daytime, empty. White floor, white walls, one wood-panel accent wall, potted monstera plants, soft natural sunlight streaming through the large window, airy and clean, gentle warm daylight bouncing off the white walls. Wooden bench on the left, wall shelf with red-and-white curved punch mitts and small white kids' boxing gloves, round wall clock, one soft neon-pink heavy bag and one white heavy bag hanging center-right. Welcoming, safe, zero intimidation. No people. No text, no logos.

NEGATIVE: no text, no watermark, no logos, no people, no boxing ring, no cage, no aggressive equipment, no clutter, no oversaturated colors, no photorealism (keep stylized 3D animation look)
```

✅承認チェック: ①と同じ部屋に見えるか(配置・木目・植物が一致)。明るく安心感があるか。

## ③ ミット(道具キャラ・進行役)

```text
Original heartwarming family-friendly cinematic 3D animation style (original style, not imitating any existing studio or film). Physically-based rendering, soft shadows, warm studio lighting.

Character reference sheet on a neutral warm grey background: a pair of well-used red-and-white curved boxing punch mitts, slightly softened edges from years of gentle use, clean but not brand-new synthetic leather. Show three angles: front view, three-quarter view, side view. Consistent proportions, colors and materials across all angles. The mitts have NO face, NO eyes, NO mouth, NO limbs — they are ordinary training mitts with a quietly warm, kind presence, like a gentle old teacher. No text, no logos.

NEGATIVE: no face, no eyes, no mouth, no arms or legs, no cartoon deformation, no text, no watermark, no logos, no scratches or damage, no aggressive design
```

✅承認チェック: 顔がない/普通のミットに見えるが温かい存在感があるか。赤×白の配色。

## ④ グロー(道具キャラ・子どもの相棒)

```text
Original heartwarming family-friendly cinematic 3D animation style (original style, not imitating any existing studio or film). Physically-based rendering, soft shadows, warm studio lighting.

Character reference sheet on a neutral warm grey background: a pair of small white kids' boxing gloves (child size, about 8oz look), clean white synthetic leather with a hook-and-loop wrist strap. Show three angles: front view, three-quarter view, side view. Consistent proportions, colors and materials across all angles. The gloves have NO face, NO eyes, NO mouth, NO limbs — ordinary children's gloves with an innocent, honest, endearing presence. No text, no logos.

NEGATIVE: no face, no eyes, no mouth, no arms or legs, no cartoon deformation, no text, no watermark, no logos, no adult-size gloves, no aggressive design
```

✅承認チェック: 子どもサイズに見えるか(後で子どもが着けるグローブと同一デザインになる)。

## ⑤ バッグさん(道具キャラ・見守り役)

```text
Original heartwarming family-friendly cinematic 3D animation style (original style, not imitating any existing studio or film). Physically-based rendering, soft shadows, warm studio lighting.

Character reference sheet on a neutral warm grey background: a soft neon-pink hanging heavy bag on a ceiling chain, smooth matte surface, gentle rounded cylinder form. Show three angles: front view, three-quarter view, side view. Consistent proportions, color and materials across all angles. The bag has NO face, NO eyes, NO mouth, NO limbs — an ordinary heavy bag with a quiet, deeply calm, protective presence, like the oldest one in the room. No text, no logos.

NEGATIVE: no face, no eyes, no mouth, no arms or legs, no cartoon deformation, no text, no watermark, no logos, no damage, no aggressive design, no oversaturated harsh pink
```

✅承認チェック: 蛍光ピンクが「優しいアクセント」に見えるか(攻撃的・派手すぎないか)。

## ⑥ 子ども(ハル)

```text
Original heartwarming family-friendly cinematic 3D animation style (original style, not imitating any existing studio or film). Physically-based rendering, soft shadows, warm studio lighting. Stylized 3D animation character, not photorealistic.

Character reference sheet on a neutral warm grey background: a 6-year-old Japanese child, about 110cm tall, short black hair, round cheeks, gentle neutral design not strongly gendered. Wearing a plain white short-sleeve t-shirt, grey shorts, white socks. Expression: shy but earnest, a little nervous, honest eyes. Show full body from three angles: front view, three-quarter view, side view. Consistent face, proportions, hair and clothing across all angles. Natural five-fingered hands. No text, no logos.

NEGATIVE: no photorealistic real child, no uncanny smile, no exaggerated cartoon face, no extra fingers, no deformed hands, no text, no watermark, no logos, no fighting pose, no muscles
```

✅承認チェック: 顔が可愛いが幼稚すぎないか。手の指5本。服(白T+グレー短パン)固定。

## ⑦ 母(見守る保護者)

```text
Original heartwarming family-friendly cinematic 3D animation style (original style, not imitating any existing studio or film). Physically-based rendering, soft shadows, warm studio lighting. Stylized 3D animation character, not photorealistic.

Character reference sheet on a neutral warm grey background: a Japanese mother in her 30s, natural shoulder-length black hair, calm gentle features, warm quiet presence. Wearing a beige cardigan over a white top, simple trousers, holding a small folded towel. Expression: soft, composed, quietly loving — the face of someone who watches over a child without rushing them. Show full body from three angles: front view, three-quarter view, side view. Consistent face, proportions, hair and clothing across all angles. No text, no logos.

NEGATIVE: no photorealistic real person, no uncanny smile, no tears, no dramatic expression, no extra fingers, no deformed hands, no text, no watermark, no logos, no glamorous styling
```

✅承認チェック: 「静かに見守る」空気が出ているか。ベージュカーディガン固定。

## ⑧ インストラクター(受け止める人)

```text
Original heartwarming family-friendly cinematic 3D animation style (original style, not imitating any existing studio or film). Physically-based rendering, soft shadows, warm studio lighting. Stylized 3D animation character, not photorealistic.

Character reference sheet on a neutral warm grey background: a Japanese female instructor in her late 20s, small build, soft friendly features, black hair in a low ponytail. Wearing a clean white polo shirt and black training pants. Expression: patient warm smile, kind eyes — someone who kneels to a child's eye level and waits without rushing. Show full body from three angles: front view, three-quarter view, side view. Consistent face, proportions, hair and clothing across all angles. No text, no logos.

NEGATIVE: no photorealistic real person, no muscular intimidating build, no fighting pose, no uncanny smile, no extra fingers, no deformed hands, no text, no watermark, no logos
```

✅承認チェック: 威圧感ゼロか。白ポロ+黒パンツ固定。

---

## 承認後の進め方

1. 採用した8枚を `brand-film-ep01/reference/`(ローカルまたは共有フォルダ)に保存し、ファイル名を `ref_01_gym_night.png` 〜 `ref_08_coach.png` で統一する
2. 以後のシーン生成(`04_IMAGE_PROMPTS.md`)では、参照画像機能があるツールで該当refを添付してから生成する
3. 途中でデザインを直したくなったら、**基準画像を直してから**シーンを再生成する(シーン側だけ直さない)
