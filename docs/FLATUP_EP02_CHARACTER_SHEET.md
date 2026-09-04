# FLATUP GYM BRAND FILM 第2話 キャラクター設定
## 「わたしも、教えられるかな」

> 正本ルール `FLATUP_CHARACTER_CONSISTENCY_RULE.md` 第3条に基づき、
> **絵を生成する前に**この設定書を作成しています。
> 追加カットを生成するときは、この設定と完全に一致させてください。

---

## ★ 主人公:少女(名前は作中で呼ばない)

自分でジムに来る、小学校中学年くらいの女の子。
**EP01の少年とは別人**(別エピソードなので入れ替わりではない)。

| 項目 | 設定 |
|---|---|
| 年齢感 | 8〜10歳(小学校中学年) |
| 髪 | 明るい茶色のポニーテール。ピンクのヘアゴム。前髪は自然に流す |
| 目 | 大きな茶色の瞳。EP01の少年より少しだけ意志の強い目つき |
| 表情の基本 | はじめは伏し目がち → 中盤で真剣 → 終盤でやわらかく笑う |
| 服(上) | 生成りの長袖Tシャツ(小さなプリント入り) |
| 服(下) | 黒×金のムエタイパンツ(FLATUPらしい柄) |
| 足元 | 裸足(マットの上) |
| 小物 | **黄色のフォーム棒**(スパーリング用のやわらかい練習具) |

**この黄色いフォーム棒が象徴。**
最初は「向けられて怖いもの」→ 最後は「誰かに手渡すもの」に変わる。

### 心の変化(EP02の軸)
```
恥ずかしい（うまくできない自分を見られたくない）
  → 夢中になる（気づいたら時間を忘れていた）
  → できた（フォームがきれいに決まる）
  → 見られている（下級生がじっと見ている）
  → 誰かに教える（「こうやるんだよ」と手を添える）
```

**EP01との違い**:
- EP01(少年) = **親に見守られて**、はじめの一歩を踏み出す
- EP02(少女) = **自分で来て**、やがて**誰かに手渡す側**になる

これが「優しさの継承」(Bible §11/§15)そのものです。

---

## ★ 下級生の女の子(終盤に登場)

主人公が教える相手。**EP01の少年ではない**別の子。

| 項目 | 設定 |
|---|---|
| 年齢感 | 5〜6歳 |
| 髪 | 濃い茶色のショートボブ |
| 服 | 淡い水色のTシャツ + 紺のショートパンツ |
| 表情 | 不安げに主人公を見上げる → 教わって笑顔 |
| 小物 | 黄色のフォーム棒(主人公から受け取る) |

---

## ★ 共通(EP01から引き継ぐ)

### 道具たち(語り手)
EP01と**完全に同じデザイン**。ミット(黄の名札)・グローブ(ピンク)・サンドバッグ(オレンジ)。

### 舞台:FLAT UP GYM
| 項目 | 設定 |
|---|---|
| 内装 | 白い床・白い壁・木の温かみ・観葉植物 |
| 象徴 | ピンクと黄色のサンドバッグ |
| マット | 緑のトレーニングマット |
| 照明 | 夜=あたたかい電球色 / 昼=自然光 |

---

## ★ 必要なシーン素材(6枚)

| # | ファイル名 | 内容 | 心の段階 |
|---|---|---|---|
| 1 | `girl-shy.jpg` | マットの隅で、うつむき気味に構える少女 | 恥ずかしい |
| 2 | `girl-focused.jpg` | フォーム棒を握り、真剣な横顔。汗が光る | 夢中になる |
| 3 | `girl-success.jpg` | フォームが決まり、目を見開いて驚く/嬉しい | できた |
| 4 | `girl-noticed.jpg` | 少し離れた場所から、下級生がじっと見ている | 見られている |
| 5 | `girl-teaching.jpg` | 少女が下級生にひざをついて、手を添えて教える | 誰かに教える |
| 6 | `girl-handover.jpg` | 黄色のフォーム棒を、下級生にそっと手渡す | 継承 |

※ `gym-exterior.jpg`(ジム外観)、`toolstalk-night2.jpg` / `night-tools-hero.jpg`
(夜の道具たち)は EP01 の素材を再利用します。

---

## ★ AI画像生成プロンプト(共通指定)

```
warm cinematic 3D animated film style, soft natural lighting,
a 9-year-old Japanese girl with light brown ponytail tied with a pink hair tie,
large brown eyes, cream long-sleeve t-shirt, black and gold muay thai shorts,
barefoot on a green training mat, holding a soft yellow foam training stick,
bright clean gym interior with white floor, wooden accents, green plants,
pink and yellow punching bags in the background,
gentle expression, no aggression, family-friendly, no text
```

### シーン別の追加指定

1. **girl-shy**: `standing at the edge of the mat, looking down shyly, holding the foam stick close to her chest`
2. **girl-focused**: `side profile, gripping the foam stick with both hands, focused serious expression, slight sweat, motion blur in background`
3. **girl-success**: `eyes wide with surprise and joy, foam stick extended in a clean form, soft light from window`
4. **girl-noticed**: `a small 5-year-old girl with short dark brown bob hair in a light blue t-shirt watching from a distance, slightly out of focus foreground`
5. **girl-teaching**: `kneeling down to eye level with the younger girl, gently guiding her hands, warm patient smile`
6. **girl-handover**: `handing the yellow foam stick to the younger girl with both hands, both smiling softly`

**禁止**: 怖い表情 / 攻撃的な構図 / 試合・勝敗の演出 / 既存アニメ作品の模倣 /
EP01の少年や母親を登場させること(別エピソードのため)

---

## ★ 生成後のチェックリスト(正本ルール第6条)

各画像で確認:
- [ ] ポニーテール + ピンクのヘアゴムか
- [ ] 生成りの長袖Tシャツか
- [ ] 黒×金のムエタイパンツか
- [ ] 裸足か
- [ ] 黄色のフォーム棒があるか(1〜3, 5〜6)
- [ ] 年齢感は8〜10歳か
- [ ] 舞台は白い床・ピンクと黄色のサンドバッグか

**1つでも違ったら使わない。作り直す。**

> はじめの一歩を、笑わない。／ 世界一、初心者にやさしい格闘技ジム FLAT UP GYM
