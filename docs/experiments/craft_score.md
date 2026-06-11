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
- 撤去手順: `src/distribution/` の `craft_score.ts` `recent_bodies.ts` `expand_scored.ts` `score_ledger.ts` `score_insight.ts` `publish_kit.ts` と各 `*.test.ts`、本ドキュメント、`package.json` の `test:craft-score`/`test:recent-bodies`/`test:expand-scored`/`test:score-ledger`/`test:score-insight`/`test:publish-kit` 行を削除するだけ。生成された `craft-score-ledger.jsonl` も消す。

## 生成→採点→修復ループ（expand_scored / 方向性B）

`src/distribution/expand_scored.ts` が「生成→採点→低い軸を修復→再採点→最良の安全な版を選ぶ」
ループを実装する。**`expand.ts` 本体は改変しない**非侵襲ラッパー。

- `improveDraft(platform, body, { recentBodies? })` — 本文の候補（原文＋決定的修復）を作り、
  `checkDraftSafety` を通った中から「総合→新鮮さ→短さ」で最良を選ぶ。
- `expandIdeaScored(idea, { recentByPlatform? })` — `expandIdea` を回し、各媒体を改善して
  `{ drafts, improvements }` を返す。`recent_bodies.loadRecentBodies` の結果を渡せば freshness も効く。
- 決定的修復（依存ゼロ・ブランド安全のみ）:
  - やわらかい誘いが無ければ末尾に1行（誘い軸）
  - X が長さ超過なら末尾行を削って収める（媒体適合軸）
- LLM を使わないので“創作的再生成”ではなく“決定的修復”。全候補は安全チェックを必ず通る。

実測: defaultBody フォールバックの idea で 3媒体すべて **+3点**（誘い修復）、安全維持。

## スコアの永続化＋実測突合（score_ledger / score_insight / 方向性C）

改善ループの入口。craft スコアを“データ化”し、実エンゲージメントと突き合わせて
「どの軸が効くか」を出す。

- `src/distribution/score_ledger.ts` — craft スコアを追記型 JSONL（`craft-score-ledger.jsonl`）に貯める。
  既存の register/log 形式は触らず独自ファイルに書く。`entriesFromImprovements` で
  `expandIdeaScored` の結果をそのまま台帳化できる。
- `src/distribution/score_insight.ts` — 台帳と Codex の `performance-log.jsonl`（**読み取り専用**）を
  `recordId` で突合し、各軸とエンゲージメント（いいね/コメント/保存/シェアの重み付き和）の
  **相関(Pearson)** を計算。`buildCraftInsight` / `formatInsight` / CLI。

```bash
npx tsx src/distribution/score_insight.ts   # 台帳×実測のインサイトを表示
npm run test:score-ledger
npm run test:score-insight
```

実測が貯まるまでは相関を出さず「採点 N 件 / 実測あり M 件」と進捗を返す（3件以上で相関表示）。
媒体ごとのスコアは recordId 単位に平均集約してから突合する。

## 公開キット生成（publish_kit / 外部公開を簡単に × 安全そのまま）

承認済みドラフトを「コピー用本文 ＋ X/Threads の投稿画面起動リンク」に変換する。
**ネットワーク送信も自動投稿もしない。最後に投稿を押すのは人間のまま＝安全モデル不変。**

- `buildKitItem(draft)` / `buildPublishKit(record)` — 各本文を `checkDraftSafety` で
  **公開直前に再ゲート(C)** し、通ったものだけ起動リンク付きキットにする。危険・営業CTAが
  混ざっていればリンクは作らない（安全はそのまま、むしろ少し堅い）。
- 起動リンク: **X** = `https://twitter.com/intent/tweet?text=…`、**Threads** =
  `https://www.threads.net/intent/post?text=…`（どちらも本文プリフィル対応の公式機能）。
  Instagram 等はプリフィルが無いので `copy_only`（コピー用本文だけ提供）。

```bash
npx tsx src/distribution/publish_kit.ts --platform x --tags 成田市,FLATUPGYM "本文..."
npm run test:publish-kit
```

「簡単さ」＝タップで本文入りの投稿画面が開く（コピペ・打ち直しゼロ）。
LINEに流す配線(B) は Codex領域なので、ここでは「キットを作る」までに留める。

## 既知の限界 / 次の一手（未実装）

- 採点も修復もヒューリスティック。LLM批評・LLM再生成ではない（依存ゼロ方針のため）。
- 修復は「誘い」「X長さ」の2軸のみ。フック／具体性の自動修復は文意を壊しうるので未対応。
- `expandIdeaScored` も score_ledger 記録も本番 daily にはまだ**未配線**（使わなければ挙動は変わらない）。配線は要相談。
- `performance-log.jsonl` は現状 metrics が pending（null）。実測の取り込みは Codex領域の運用なので、
  相関が出るのは実数値が入り始めてから。相関 n は少数のうちは過信しない（3件は最低ライン）。
- register が本文を持たない問題（approval-register は theme/angle のみ）。本文を register に持たせると
  突合が楽になるが、それは Codex領域（adapters）の変更なので要相談。
