# AIKA 移植キット — 世界一優しい回答ゲート

AIKA（守りの受付AI / `flatup-ai-os`）の**返信前ゲート**として、OPENQLOWで完成させた
4観点100点スコアラーをそのまま使えるようにした**依存ゼロ版**です。

## 中身
- `flatup_canon.ts` … **確定版の正本データ**（料金/営業時間/9クラス/親子割/紹介/住所/最寄り駅/アクセス/グローブセット11,000円/禁止行為/ブランド）。AIKAはこの値だけを案内する。
- `response_quality.ts` … 自己完結スコアラー（外部import無し）。`scoreResponseQuality(reply, ctx)` を公開。
- `response_quality.test.ts` … AIKA接客ログの実例（取次ぎスタック／3点要求／住所の出し渋り／曜日の再質問／連投／煽り）で検証。

## 実運営への適用（local の flatup-ai-os で実施）
1. このフォルダ3ファイルを `flatup-ai-os/src/safety/`（または `src/canon/`）へコピー。
2. FAQ・返信生成が **`FLATUP_CANON` だけ**を引くよう差し替え（住所/営業時間/料金などの直書き・推測を廃止）。
3. LINE返信の **送信直前**に `scoreResponseQuality` を通す（下記）。
4. `npx tsx response_quality.test.ts` で動作確認。

## 導入手順（flatup-ai-os 側）
1. このフォルダの `response_quality.ts` を AIKA のソース（例: `src/safety/`）へコピー。
2. LINE返信を**送信する直前**に通す:

```ts
import { scoreResponseQuality } from "./safety/response_quality.js";

const q = scoreResponseQuality(reply, {
  knownFacts: session.collectedSlots,   // 例: ["曜日","種目"] 既に聞いた項目
  recentReplies: session.lastSentReplies, // 直近に送った本文（重複検出）
});

if (q.decision === "reject") {
  // 送らない。安全な定型 or 人間確認へ。
} else if (q.decision === "revise") {
  // q.suggestions をプロンプトに足して1回だけ自動再生成 → 再採点。
  // それでも未達なら人間確認。
}
// "good"/"perfect" はそのまま送信（最終確認は人間）。
```

3. ⚠️ 料金・スケジュール・クラス・住所は、推測せず
   `knowledge/wiki/flatup-canonical-faq.md`（正本FAQ）の値だけで答える。
   出し渋り（「確認できていません→折り返し」）はゲートが減点します。

## 4観点（各25点・合計100点）
| 観点 | 何を見るか | AIKAログの該当失敗 |
| --- | --- | --- |
| ① 寄り添い | 機械的な質問攻めをしない | 「以下の3点を教えてください。1.お名前 2.種目 3.日時」 |
| ② 不自然さ | 取次ぎスタック／既知の再質問／出し渋り | 「只今担当者が対応中」/ 曜日を再質問 / 住所を確認できていません |
| ③ 重複 | 直近返信・文内の反復 | 同じ案内文の連投 |
| ④ 優しさ | 恐怖煽り・選民・体型否定・営業CTAをブロック | 「本気じゃないなら来るな」等 |

判定: 全観点満点=`perfect`(100) / 致命的に低い観点があれば合計が高くても `reject` /
それ以外は `good`(80+) ・ `revise` ・ `reject`。

## 検証
```bash
npx tsx port/aika/response_quality.test.ts
```
本リポジトリの `npm test`（`test:aika-port`）にも組み込み済みで、移植版が壊れていないことを継続的に保証します。

## 補足
- OPENQLOW側の本番実装は `src/safety/response_quality.ts` ＋ `src/generators/reply_gate.ts`。
  こちらは `check.ts` に依存するフル版。移植版はそれを1ファイルに畳んだもので**挙動は同等**。
- 規範ドキュメント: `knowledge/wiki/kindest-ai-response-policy.md` / `24-7-operation-runbook.md`。
