# Codex 残作業指示書 — 永久機関を100点にする（AIKA配線＋24時間化）

> 版 v1.0 / 2026-06-26 / 設計者: Claude（ダ・ヴィンチ） / 実装者: **Codex**
> 既存の上に積む。作り直さない。`npm test` を常に緑に保つ。秘密はgitに入れない。
> 現状: **約89/100**。本書の T1〜T3 を完了で **100点**。

## 0. 前提（すでに main にある完成品）
- 単一正本 `openqlow/src/shared/canon.ts`（`FLATUP_CANON`）
- 優しさゲート `openqlow/src/shared/response_quality.ts`（`scoreResponseQuality`）
- 障害フォールバック `openqlow/src/shared/fallback_reply.ts`（`fallbackReply` / `safeReply`）
- **合体の接点** `openqlow/src/aika/receptionist.ts`（`receptionReply` / **`receptionReplyAsync`** / `canonContext`）
- 自己改善ループ `openqlow/src/loop/*`（`npm run loop`）
- 外部AIKA配布用の依存ゼロ複製 `openqlow/port/aika/{flatup_canon,response_quality}.ts`

## 対象リポジトリ
- `flatup1/openqlow`（母体・安全網・正本）
- `flatup1/flatup-ai-os`（守りAIKA本体・LLM型。`src/modules/` に `line_reply.ts` `followup.ts` `review_request.ts` `daily_manager.ts` `risk_check.ts` … 各 `(system: SystemBlocks, input: string): Promise<string>`）

---

## T1【最優先】AIKAの返信を安全網に通す（flatup-ai-os 側の配線）
**目的**: AIKAのLLM返信を、送信前に「正本注入＋優しさゲート＋障害フォールバック」に通す。`receptionReplyAsync` を呼ぶだけ。

### T1-1. 安全網ファイルを flatup-ai-os に取り込む
`flatup-ai-os/src/safety/` を作り、**依存ゼロの4ファイル**を入れる（openqlow からコピー、相互は相対import）:
- `canon.ts`        ← `openqlow/src/shared/canon.ts`（`FLATUP_CANON`/`BRAND`）
- `response_quality.ts` ← `openqlow/src/shared/response_quality.ts`（import を `./` 同階層に直す。`../safety/check.js` 依存は使わず、`openqlow/port/aika/response_quality.ts`（依存ゼロ版）を採用する）
- `fallback_reply.ts` ← `openqlow/src/shared/fallback_reply.ts`（import を `./canon.js` に直す）
- `receptionist.ts`  ← `openqlow/src/aika/receptionist.ts`（import を `./canon.js` `./response_quality.js` `./fallback_reply.js` に直す）
> ※ `port/aika/` の依存ゼロ版を使えば `check.ts` 連鎖を持ち込まずに済む。挙動は同等（理想返信=100、煽り=reject）。

### T1-2. 各モジュールの出力をゲート経由にする
`line_reply` を例に、**呼び出し箇所（src/index.ts またはwebhookハンドラ）**でラップする:
```ts
import { receptionReplyAsync, canonContext } from "./safety/receptionist.js";

// 旧: const reply = await lineReply(system, input);
// 新:
const out = await receptionReplyAsync(input, () => lineReply(system, input), {
  knownFacts: session?.collectedSlots ?? [],   // 例 ["曜日","種目"]
  recentReplies: session?.lastSentReplies ?? [],
});
if (out.approved) {
  // out.reply を「送信候補」として人間確認に出す（自動送信はしない）
} else {
  // out.quality.suggestions を付けて再生成 or 人間確認
}
```
- `followup` / `review_request` / `daily_manager` も同様にラップ（顧客に出る文は全てゲート通過）。
- **正本注入**: 各モジュールのプロンプト（system）に `canonContext()` の文字列を必ず含め、料金/住所/予定をLLMに作らせない。

### T1-3. 受け入れ基準
- [ ] AIKAの顧客向け返信が**送信前に必ず `receptionReplyAsync` を通る**。
- [ ] LLMが401/タイムアウトでも**フォールバックで返る（沈黙しない）**。
- [ ] reject級のLLM出力は**正本返信に差し替わり、送られない**。
- [ ] 料金/住所/予定は **`FLATUP_CANON` のみ**（直書き・推測ゼロ）。
- [ ] flatup-ai-os の `npm test`（無ければ追加）と `tsc --noEmit` が緑。

---

## T2 24時間インフラ（VPS 162.43.41.182）
- [ ] **固定トンネル**: `cloudflared` で固定ドメイン。`OPENQLOW_PUBLIC_WEBHOOK_URL` を固定化（ngrok動的URL廃止）。
- [ ] **自動再起動**: webhook / トンネル / LLM を死活監視し落ちたら `systemctl restart`（既存 `systemd_self_heal` を拡張）。
- [ ] **ループ常駐**: `openqlow/deploy/systemd/openqlow-loop.{service,timer}` を有効化（毎日04:30）。
- [ ] **AIKAサービス**: flatup-ai-os の本番サービス（/line/webhook・:8000）も systemd 化＋自動再起動。
- 受け入れ: 落ちても自動復帰・沈黙しない・二重送信なし（冪等）。

## T3 認証・秘密（オーナー操作と連動）
- [ ] `.env.example` に必要キー全列挙（空値）: `OPENROUTER_API_KEY` `LINE_CHANNEL_SECRET` `LINE_CHANNEL_ACCESS_TOKEN` `JIN_LINE_USER_ID` `THREADS_ACCESS_TOKEN` `IG_ACCESS_TOKEN` `FB_PAGE_TOKEN` `GOOGLE_BUSINESS_ACCESS_TOKEN`。
- [ ] 実値はオーナーが各管理画面で発行→**サーバーの`/etc/.../*.env`へ**。**gitに入れない**（`.env` は `.gitignore`）。
- [ ] **公開リポジトリに鍵が無いか**確認（flatup-ai-os は公開中。`git log -p` / secret scan）。

---

## 完了の定義（100点）
T1〜T3 が全てチェック済みで、
1. AIKA・openQLOW の全顧客向け返信が**1つの正本・1つの優しさゲート**を通る、
2. LLM障害でも沈黙しない、
3. VPSで24時間自動復帰、
4. 秘密はgitに無い、
5. 自己改善ループが毎日 採点→改善提案を出す。

## 不可侵ルール
自動送信・予約確定・料金変更・返金・退会・謝罪送信なし（人間確認）。秘密・個人情報をgit/ログ/チャットに出さない。Python/Flask化しない（依存ゼロTS）。既存(AIKA/openQLOW/SNS)を壊さない・差分のみ。

## 参照
- 合体の接点: `openqlow/src/aika/receptionist.ts`
- 正本/ゲート/フォールバック: `openqlow/src/shared/*`・`openqlow/port/aika/*`
- 設計/ロードマップ: `openqlow/knowledge/wiki/{perpetual-engine,100-point-roadmap,24-7-operation-runbook}.md`
- 全体要件: `openqlow/docs/PERPETUAL_ENGINE_REQUIREMENTS.md`
