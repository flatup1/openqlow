# HANDOFF: Claude → Codex（退会トラブルゼロ化OS v1）

作成日時: 2026-08-09
作成者: Claude
受け手: Codex（`src/line_bot/` 担当）＋ AIKA本番側（`flatup1/flatup`）

---

## 0. 最重要

`src/line_bot/` は Codex 担当のため、**今回は一切触っていません**。
LINEの実配線だけが残っています。ロジックと文面は依存ゼロの移植キットとして用意済みです。

---

## 1. 今回やったこと

- [x] 退会ケースの台帳（`data/withdrawal_cases.json`）と append-only 監査ログ（`.jsonl`）を新設
- [x] 正式受付日 = max(退会届, カードキー) の自動確定、翌月末の退会日自動計算（JST固定）
- [x] 固定11状態と、事実からの状態導出（スタッフが状態を選べない構造）
- [x] 会費ペイ未処理を「消えない未完了状態」として保持し、CLIと日報の先頭に警告
- [x] スタッフ画面・オーナー確認の時系列表示（`npm run crm -- withdrawal ...`）
- [x] AIKA移植キット `port/aika/withdrawal.ts`（依存ゼロ）
- [x] 指示書のケース1〜10をすべて自動テスト化

## 2. 未完了で残したこと

- [ ] **LINE Webhookの実配線**（理由：`src/line_bot/` は Codex 担当領域）
- [ ] **AIKA本番（別リポ `flatup1/flatup`）への移植**（理由：本リポの外）
- [ ] 会員向けLINEへの自動push（理由：`AGENTS.md`「送信は人間承認後」。文面表示＋送信記録までに留めた）
- [ ] 会費ペイAPI連携（理由：APIも仕様の正本も存在しない。捏造しない方針）

## 3. 触ったファイル

```
A  docs/withdrawal-zero-v1-design.md
A  src/crm/withdrawal.ts
A  src/crm/withdrawal_store.ts
A  src/crm/withdrawal.test.ts
A  src/crm/withdrawal_store.test.ts
A  port/aika/withdrawal.ts
A  port/aika/withdrawal.test.ts
M  src/crm/crm_cli.ts        （withdrawal サブコマンド追加。既存コマンドは無変更）
M  src/crm/daily_report.ts   （任意引数を追加。省略時の出力は従来と完全に同一）
M  package.json              （テスト3本を npm test へ連結）
M  port/aika/README.md       （移植手順を追記）
```

`src/line_bot/`・`src/scheduler/`・`src/shared/canon.ts`・`docs/ai-os/` は**未変更**。

## 4. 受け手AIへの注意

### 配線してほしいこと（`port/aika/withdrawal.ts` を1回呼ぶだけ）

```ts
import { decideWithdrawalTurn } from "./withdrawal.js";

const d = decideWithdrawalTurn(text, {
  firstWithdrawalInquiryAt: member.firstWithdrawalInquiryAt,
  procedureGuidedAt: member.procedureGuidedAt,
  handledMessageIds: member.handledMessageIds,
}, new Date().toISOString(), event.message.id);
```

- `d.shouldSendGuide === true` のときだけ `d.message` を送る
- `d.recordFirstInquiryAt` が空でなければ保存（**空なら上書きしない**）
- `d.ownerReviewSignals` が空でなければオーナーへ通知

### 絶対に壊さないでほしいルール

- LINEの発言だけで正式受付にしない（`FORM_AND_KEY_RECEIVED` へ進めない）
- 退会日・最終在籍月をAIやLINE側で計算しない。台帳の確定値だけを差し込む
- 会費ペイの停止成功を推測しない。人が押したときだけ `completed`
- 監査ログの行を書き換えない（更新APIは意図的に用意していない）

### 既知の制限

- 現状の `src/line_bot/webhook.ts` は `allowedApproverIds` によりオーナー以外のメッセージを無視する。
  会員からの退会相談はこの経路には届かないため、**会員向けLINEはAIKA側で配線する必要がある**。
- 休会（`kind: "suspension"`）は退会と同じ台帳・同じ日付規定で扱っている。
  休会特有の期間管理（原則3か月）は今回のスコープ外。

## 5. JIN確認待ち事項

1. AIKA本番（別リポ）へ `port/aika/withdrawal.ts` をコピーしてよいか
2. 会員向けLINEの自動送信を許可するか（現状は「文面表示 → 人が送信 → `--sent` で記録」）
3. 会費ペイの停止手順を運用手順書に落とすか（APIが無いため手作業が前提）
4. 休会の期間管理を v2 でやるか
