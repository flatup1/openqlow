# 実験: クラフト採点 / 投稿批評器 (craft_score)

> ステータス: **実験 (spike)** — 2026-06 / 提案: Fable 5 (Claude)
> 捨てやすさ最優先。不要になったら下記2ファイルを消すだけで完全に撤去できる。

## これは何か

投稿ドラフトを「面白いか・刺さるか・新鮮か」で採点し、**なぜ弱いか＋改善案**を返すモジュール。

`src/safety/check.ts` の `KindnessScore` が「危険・冷たくないか」の**ガードレール（減点・ブロック型）**なのに対し、本モジュールは**クラフト（品質）採点**。両者は別レイヤーで、片方が他方を置き換えない。

| 観点 | safety: KindnessScore | distribution: CraftScore（本実験） |
|---|---|---|
| 問い | 出して安全か？ | 出して面白いか？ |
| 方向 | 減点・ブロック | 良し悪しのランク付け |
| 軸 | notScary / beginnerFriendly / noShameOrPressure / memberDignity / flatupLike | hook / specificity / platformFit / invitation / freshness |

## なぜ作ったか（背景）

`src/distribution/expand.ts` は**テーマ文字列で固定テンプレを引くだけ**で、テーマがローテーションで戻ると過去とほぼ同一の本文が出る。それを測る仕組みが無かった。`freshness` 軸は直近投稿との文字bigram類似度でこの「使い回し」を検出する（本実験の核心機能）。

将来の「分析・改善ループ」の**種データ**にもなる（スコアを register に貯めれば、実パフォーマンスと突き合わせられる）。

## 使い方

```bash
# CLI（引数 or 標準入力）
npx tsx src/distribution/craft_score.ts --platform x "本文..."
echo "本文" | npx tsx src/distribution/craft_score.ts --platform threads

# register の直近本文を覗く
npx tsx src/distribution/recent_bodies.ts threads 12

# テスト
npm run test:craft-score
npm run test:recent-bodies
```

## register からの直近本文の自動読み込み（recent_bodies）

`freshness` 軸は「直近投稿との非類似度」を測るが、当初は呼び出し側が `recentBodies`
を手で渡す必要があった。`src/distribution/recent_bodies.ts` がこれを自動化する。

- 本文の出どころ: adapters が保存する `drafts/<platform>/index.jsonl`（= register）と、
  そこから参照される本文 `.md`。registers の JSONL（approval-register 等）は theme/angle
  しか持たないため、**本文の唯一の出どころはドラフト .md** である。
- `loadRecentBodies(platform, { root?, limit?, excludeId? })` が新しい順に本文を返す。
  index が無ければ `[]`（freshness は中立3）。
- `scoreCraftWithHistory(draft, opts)` が「register の直近本文」と突き合わせて採点する。
  採点対象自身（同一ID）は自動で比較から除外。
- adapters (Codex領域) は**読み取りのみ**。`.md` 形式に読み取り側で軽く依存し、形式が
  変わったら `extractBody` だけ直せばよい。

```ts
import { scoreCraft, formatCraftReport } from "./craft_score.js";

const score = scoreCraft(body, { platform: "x", recentBodies: lastWeekBodies });
console.log(formatCraftReport(score));
// score.total (0-25), score.verdict ("ship"|"polish"|"rework"), score.topFix
```

## 採点軸（各0-5 / 合計25）

- **hook** 冒頭がつかむか（問い・声・数字・短さ）
- **specificity** 数字・固有名詞・情景があるか
- **platformFit** 媒体の型（X長さ / IGリール構成 / Threads会話調 / LINE短文）
- **invitation** 押しつけない誘いがあるか（煽りは減点）
- **freshness** 直近投稿との非類似度（比較対象なしは中立3）

verdict: `>=20 ship` / `>=15 polish` / `<15 rework`

## 設計上の「捨てやすさ」担保

- 依存ゼロ。
- 既存フロー（daily / approval / safety / publish）に**一切ワイヤリングしていない**。
- 型は `craft_score.ts` 内に閉じ、`src/types.ts` を汚さない。
- 撤去手順: `src/distribution/craft_score.ts` `src/distribution/recent_bodies.ts` と各 `*.test.ts`、本ドキュメント、`package.json` の `test:craft-score`/`test:recent-bodies` 行を削除するだけ。

## 既知の限界 / 次の一手（未実装）

- 採点はヒューリスティック。LLM批評ではない（依存ゼロ方針のため）。
- `expand.ts` に組み込んで「生成→採点→低スコアは再生成」ループにするのが次の自然な拡張（= 方向性B バリアント生成）。`scoreCraftWithHistory` で freshness は実データ判定できるので、再生成の判定材料に使える。
- register が本文を持たない問題（approval-register は theme/angle のみ）。本文を register に持たせると突合が楽になるが、それは Codex領域（adapters）の変更なので要相談。
