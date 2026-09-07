# HANDOFF: Claude → Codex（退会トラブルゼロ化OS v1）

作成日時: 2026-08-09
作成者: Claude
受け手: Codex（`src/line_bot/` 担当）＋ AIKA本番側（`flatup1/flatup`）

---

## 0. 最重要

`src/line_bot/` は Codex 担当領域ですが、**JINが 2026-08-09 に変更を承認**したため配線まで行いました
（`AGENTS.md` のAI協業ルール4「触りたい領域が他AI担当だったら、JIN に確認」に従って確認済み）。

承認者（オーナー）の経路は**完全に従来どおり**です。会員の経路を横に追加しただけです。
残っているのは AIKA本番（別リポ）への移植だけです。

---

## 1. 今回やったこと

- [x] 退会ケースの台帳（`data/withdrawal_cases.json`）と append-only 監査ログ（`.jsonl`）を新設
- [x] 正式受付日 = max(退会届, カードキー) の自動確定、翌月末の退会日自動計算（JST固定）
- [x] 固定11状態と、事実からの状態導出（スタッフが状態を選べない構造）
- [x] 会費ペイ未処理を「消えない未完了状態」として保持し、CLIと日報の先頭に警告
- [x] スタッフ画面・オーナー確認の時系列表示（`npm run crm -- withdrawal ...`）
- [x] AIKA移植キット `port/aika/withdrawal.ts`（依存ゼロ）
- [x] 指示書のケース1〜10をすべて自動テスト化

- [x] **LINE Webhookの実配線**（JINが 2026-08-09 に `src/line_bot/` の変更を承認）
- [x] **会員向けLINEへの自動返信**（既定OFFの二重ロック付き。JIN承認済み）

## 2. 未完了で残したこと

- [ ] **AIKA本番（別リポ `flatup1/flatup`）への移植**（理由：本リポの外。移植キットは用意済み）
- [ ] 会費ペイAPI連携（理由：APIも仕様の正本も存在しない。捏造しない方針）
- [ ] 休会の期間管理（原則3か月）（理由：v1のスコープ外）

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
M  package.json              （テスト4本を npm test へ連結）
M  port/aika/README.md       （移植手順を追記）
M  .env.example              （OPENQLOW_WITHDRAWAL_AUTO_REPLY / OPENQLOW_STAFF_NAME）

# JIN承認のうえ変更（Codex担当領域）
A  src/line_bot/withdrawal_intake.ts       会員メッセージ専用ハンドラ
A  src/line_bot/withdrawal_intake.test.ts
M  src/line_bot/webhook.ts                 承認者と会員で経路を分岐
```

`src/scheduler/`・`src/shared/canon.ts`・`docs/ai-os/`・既存の会員データ構造は**未変更**。

## 4. 受け手AIへの注意

### openqlow 側の配線は完了済み

`src/line_bot/webhook.ts` は承認者と会員で経路を分けた。会員のメッセージは
`executeLineWithdrawalIntake` にしか渡らず、`executeApprovalText`（承認・pushコマンド）
へは到達しない。**この分離を壊さないこと。**

### AIKA本番（別リポ）へ移植する場合（`port/aika/withdrawal.ts` を1回呼ぶだけ）

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

- `JIN_LINE_USER_ID` が未設定の環境では、従来どおり全員が承認者扱いになる（既存挙動を保つため）。
  会員経路を有効にするには承認者IDの設定が必須。
- 会員への自動返信は `OPENQLOW_WITHDRAWAL_AUTO_REPLY=true` と `OPENQLOW_DRY_RUN=false` の
  **両方**が揃うまで届かない。片方だけでは下書き＋オーナー通知に留まる。
- 休会（`kind: "suspension"`）は退会と同じ台帳・同じ日付規定で扱っている。
  休会特有の期間管理（原則3か月）は今回のスコープ外。

## 5. JIN確認待ち事項

1. AIKA本番（別リポ）へ `port/aika/withdrawal.ts` をコピーしてよいか
2. 本番で `OPENQLOW_WITHDRAWAL_AUTO_REPLY=true` に切り替えるタイミング
   （切り替える前に、テスト用LINEアカウントで1往復の確認を推奨）
3. 会費ペイの停止手順を運用手順書に落とすか（APIが無いため手作業が前提）
4. 休会の期間管理を v2 でやるか
