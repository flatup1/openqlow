# 退会トラブルゼロ化OS v1 設計書

作成: 2026-08-09 / 担当: Claude / 対象リポジトリ: `openqlow`

目的は「退会を難しくすること」ではない。**正しく退会でき、勘違いが起きず、処理漏れが残らず、証拠が残る**状態を作る。
FLATUPらしさ（初心者に優しい・威圧しない・分かりやすい）は文面・UIの両方で維持する。

---

## 1. 現在の関連構成（調査結果）

先に既存実装を全部読んだ。**新しいDBもSaaSも要らない**という結論になった。

| 領域 | 実体 | 場所 |
|---|---|---|
| 会員・見込み客DB | **JSONファイルストア**（依存ゼロ・原子的書き込み） | `src/crm/store.ts` / `data/prospects.json` |
| データモデル | `Prospect`（状態・温度感・体験日など） | `src/crm/prospect.ts` |
| 管理画面 | **CLI**（`npm run crm -- <コマンド>`） | `src/crm/crm_cli.ts` |
| 入会時の重要事項・同意履歴 | 保護者同意ストア（管理番号・版・同意日時） | `src/crm/guardian_consent.ts` / `data/guardian_consents.json` |
| LINE Webhook | **オーナー専用**。`allowedApproverIds` で承認者以外を無視 | `src/line_bot/webhook.ts` |
| 会員向けLINE（AIKA） | 別リポ（`flatup1/flatup`・AIKA VPS）。本リポは**依存ゼロの移植キット**を配布 | `port/aika/` |
| 正本（料金・退会規定） | `FLATUP_CANON.cancellation` / `.cardKeyReturn` | `src/shared/canon.ts` |
| 日報 | Markdown生成＋保存 | `src/crm/daily_report.ts` |
| scheduler | daily / daily_check / morning_briefing / reminder | `src/scheduler/` |
| テスト | `tsx` で走る素の assert スクリプト（`npm test` に列挙） | `*.test.ts` |
| 権限 | LINE承認者は env（`JIN_LINE_USER_ID` 等）。CLIはローカル実行者＝スタッフ | `src/line_bot/webhook_auth.ts` |

**会費ペイ**: リポジトリ全体を検索した結果、**APIも連携コードも存在しない**。
`docs/canon/01_CONFLICT_AND_DECISION_TABLE.md` #7 に「正本が存在しない／仕様確定までAIは一切断定しない」と明記されている。
よって **APIは捏造せず、人が操作し、システムは「未完了」を持ち続ける**方式にする（§9）。

### 担当領域（COORDINATION.md §1）

- `src/crm/` = **Claude担当** → 今回の実装はここに置く。
- `src/line_bot/`, `src/scheduler/`, `docs/ai-os/` = **Codex担当** → **今回は一切触らない**。
- LINE配線は `port/aika/` の移植キットとして渡し、実配線はAIKA側（別リポ）で行う。

---

## 2. 再利用できる既存機能

| 使うもの | 何に使うか |
|---|---|
| JSONストアの型（`openProspectStore` の read/write/atomic rename パターン） | 退会ケースストアをそのまま同じ形で作る |
| `guardian_consent.ts` の設計（独立ストア＋管理番号＋版＋JST日付処理） | 退会も同じ形にする。学習コストゼロ |
| `jstYmd()` 相当のJST日付処理 | 退会日計算をTZ非依存にする（VPSがUTCでも1日ズレない） |
| `crm_cli.ts` のサブコマンド構造・`parseFlags` | `crm withdrawal ...` を追加するだけ |
| `data/` が `.gitignore` 済み | 個人情報がリポジトリに乗らない |
| `daily_report.ts` | 会費ペイ未処理の警告をここにも出す |
| `port/aika/` 移植キット方式 | LINE検知・文面をAIKAへ渡す |
| `guardian_consents.json` | 入会時の重要事項送信/確認は**再保存しない**。時系列生成時に参照する |

**新規作成しないもの**: DB、テーブル基盤、Webhook、管理画面フレームワーク、通知基盤、有料SaaS、cron基盤。

---

## 3. 追加するファイル

| ファイル | 役割 |
|---|---|
| `src/crm/withdrawal.ts` | **純粋ドメイン**。状態・遷移・退会日計算・正式受付判定・LINE文面・キーワード検知。I/Oなし |
| `src/crm/withdrawal_store.ts` | 退会ケースJSONストア ＋ **append-only 監査ログ（JSONL）** ＋ 高レベル操作（受領・返却・会費ペイ済 等） |
| `src/crm/withdrawal.test.ts` | ドメインのテスト（ケース1〜6・9・10） |
| `src/crm/withdrawal_store.test.ts` | ストア・監査ログ・重複防止・警告のテスト（ケース7・8） |
| `port/aika/withdrawal.ts` | AIKA移植キット（依存ゼロ・LINE検知＋文面＋日付計算） |
| `port/aika/withdrawal.test.ts` | 移植キットのテスト（本体とズレたら落ちる） |
| `docs/withdrawal-zero-v1-design.md` | 本書 |

## 4. 変更するファイル

| ファイル | 変更内容 | 影響 |
|---|---|---|
| `src/crm/crm_cli.ts` | `withdrawal` サブコマンド群とヘルプを追加 | 既存コマンドは無変更 |
| `src/crm/daily_report.ts` | 引数に**任意**の退会ケースを追加し、会費ペイ未処理を警告表示 | 引数省略時は従来と完全に同一出力（既存テストそのまま通る） |
| `package.json` | `test:withdrawal` / `test:withdrawal-store` / `test:aika-withdrawal` を追加し `npm test` に連結 | 追加のみ |
| `port/aika/README.md` | 移植キットの説明に退会を追記 | 追記のみ |

`src/shared/canon.ts` は**変更しない**。「翌月末退会」「退会届」「カードキー返却」は既に `cancellation` / `cardKeyReturn` に記載済みで、二重管理を避ける。

---

## 5. DB変更（＝JSONストアの追加）

既存の `prospects.json` / `guardian_consents.json` は**スキーマ変更しない**（壊さない）。
退会は独立した2ファイルを新設する。

### `data/withdrawal_cases.json`（現在状態・1会員1レコード）

| 項目 | 型 | 備考 |
|---|---|---|
| `id` | number | 連番 |
| `caseNumber` | string | `FG-WD-YYYY.MM.DD.NNNN`。紙の退会届に転記して突合 |
| `memberId` | string | 会員番号。会員台帳の鍵 |
| `prospectId` | number | 既存 `prospects.json` との紐付け（無ければ 0） |
| `lineUserId` | string | LINE userId（名寄せ用） |
| `memberName` | string | 表示用 |
| `onboardingTermsVersion` / `onboardingTermsSentAt` / `onboardingTermsConfirmedAt` | string | **原則空**。既存 `guardian_consents.json` にある場合はそちらが正本で、ここには複製しない（§22の重複禁止）。同意記録が無い会員だけ補記する |
| `firstWithdrawalInquiryAt` | string(ISO) | **一度入ったら上書きしない** |
| `withdrawalInquiryChannel` | string | `LINE` / `電話` / `メール` / `来館` |
| `procedureGuidedAt` | string(ISO) | 手続き案内の送信日時 |
| `withdrawalFormReceivedAt` | string(ISO) | 退会届の受領日時 |
| `cardKeyReturnedAt` | string(ISO) | カードキー返却日時 |
| `formalReceivedAt` | string(ISO) | **max(退会届, カードキー)**。自動確定・手入力不可 |
| `scheduledWithdrawalDate` | string(YYYY-MM-DD) | 正式受付日の**翌月末**。自動計算 |
| `finalMembershipMonth` | string(YYYY-MM) | 退会予定日の年月。自動 |
| `paymentStopStatus` | `""｜pending｜completed｜not_applicable` | 会費ペイ |
| `paymentStopCompletedAt` | string(ISO) | スタッフが処理済ボタンを押した日時 |
| `withdrawalConfirmationSentAt` | string(ISO) | 正式受付LINEの送信日時 |
| `closedAt` | string(ISO) | 退会完了 |
| `currentWithdrawalStatus` | 固定11状態 | **導出値**（後述） |
| `handledBy` | string | 最後に操作したスタッフ |
| `ownerReviewRequired` | 0/1 | |
| `ownerReviewReason` | string | |
| `memo` | string | |
| `createdAt` / `updatedAt` | string(ISO) | |

### `data/withdrawal_audit_logs.jsonl`（append-only）

1行1JSON。**既存行は書き換えない・消さない**（`appendFile` のみ使用）。

`id` / `memberId` / `caseId` / `eventType` / `oldStatus` / `newStatus` / `actorType` / `actorId` / `source` / `metadata` / `createdAt`

`eventType`: `WITHDRAWAL_INQUIRY_RECEIVED` / `PROCEDURE_GUIDE_SENT` / `FORM_RECEIVED` / `CARD_KEY_RETURNED` /
`FORMAL_RECEIPT_COMPLETED` / `PAYMENT_STOP_COMPLETED` / `CONFIRMATION_MESSAGE_SENT` / `OWNER_REVIEW_REQUESTED` /
`OWNER_REVIEW_RESOLVED` / `ADMIN_CORRECTION` / `WITHDRAWAL_CLOSED`

`actorType`: `member` / `staff` / `owner` / `system`

---

## 6. 状態遷移

内部状態は固定11種。自由入力は受け付けない。

| コード | 表示 |
|---|---|
| `ACTIVE` | 在籍中 |
| `WITHDRAWAL_INQUIRY` | 退会相談 |
| `PROCEDURE_GUIDED` | 手続き案内済 |
| `FORM_RECEIVED` | 退会届受領 |
| `KEY_RETURNED` | カードキー返却済 |
| `FORM_AND_KEY_RECEIVED` | 正式受付 |
| `PAYMENT_STOP_PENDING` | 会費処理待ち |
| `PAYMENT_STOPPED` | 会費処理済 |
| `WITHDRAWAL_CONFIRMED` | 退会確定 |
| `CLOSED` | 退会完了 |
| `OWNER_REVIEW_REQUIRED` | オーナー確認 |

```
ACTIVE → WITHDRAWAL_INQUIRY → PROCEDURE_GUIDED ─┬→ FORM_RECEIVED ─┐
                                                └→ KEY_RETURNED ──┴→ FORM_AND_KEY_RECEIVED
   → PAYMENT_STOP_PENDING → PAYMENT_STOPPED → WITHDRAWAL_CONFIRMED → CLOSED

CLOSED以外のどの状態からでも → OWNER_REVIEW_REQUIRED（戻りはオーナー権限＋理由必須）
```

### 飛び越し防止の考え方

状態は**スタッフが選ぶものではなく、事実（日時）から導出する**（`deriveWithdrawalStatus`）。
「退会届も出ていないのに正式受付」は、そもそも表現できない。
`canTransition()` も併せて公開し、管理者修正の経路だけはこのガードを通す。

導出の優先順位:
1. `closedAt` あり → `CLOSED`
2. `ownerReviewRequired` → `OWNER_REVIEW_REQUIRED`
3. 正式受付＋退会日＋会費ペイ完了＋正式受付LINE送信済 → `WITHDRAWAL_CONFIRMED`
4. `paymentStopCompletedAt` あり → `PAYMENT_STOPPED`
5. 正式受付済かつ会費ペイ `pending` → `PAYMENT_STOP_PENDING`
6. 正式受付済 → `FORM_AND_KEY_RECEIVED`
7. 退会届のみ → `FORM_RECEIVED` ／ カードキーのみ → `KEY_RETURNED`
8. 案内済 → `PROCEDURE_GUIDED`
9. 相談日時あり → `WITHDRAWAL_INQUIRY`
10. それ以外 → `ACTIVE`

---

## 7. LINEフロー

```
会員: 「退会したいです」
  ↓ detectWithdrawalIntent() がキーワード検知（AIだけで判断しない）
  ↓ firstWithdrawalInquiryAt を記録（初回のみ・上書きしない）
  ↓ 状態: WITHDRAWAL_INQUIRY   ← ここでは絶対に正式退会にしない
AIKA: 手続き案内テンプレート（§9の定型文）を送信
  ↓ procedureGuidedAt を記録・状態: PROCEDURE_GUIDED
  ↓ 同一 messageId／案内済みなら再送しない（idempotency）
（来館）退会届記入 → withdrawalFormReceivedAt
（来館）カードキー返却 → cardKeyReturnedAt
  ↓ 両方揃った瞬間、formalReceivedAt = max(2つ) を自動確定
AIKA/スタッフ: 正式受付LINE（受付日・退会予定日・最終在籍月をDB値から差し込み）
  ↓ withdrawalConfirmationSentAt を記録
退会予定日到来 → 退会完了LINE（任意）→ CLOSED
```

- LINE・電話・メール**だけ**では正式受付にしない。文面にもそう書いてある。
- 日付はすべてDBの確定値。AIに計算させない。
- 特殊ケース語（返金・クレーム・弁護士・入院・カードキー紛失 等）を検知したら自動判断せず `OWNER_REVIEW_REQUIRED` 候補として提示する。

## 8. スタッフフロー（管理画面＝CLI）

```
npm run crm -- withdrawal alerts                    ← 毎日ここから。会費ペイ未処理◯件
npm run crm -- withdrawal list                      ← 対応中の一覧
npm run crm -- withdrawal show <番号>               ← 【退会管理】1人分
npm run crm -- withdrawal open --member M-001 ...   ← 退会相談を受けた
npm run crm -- withdrawal guide <番号> --sent       ← ［手続き案内送信済］
npm run crm -- withdrawal form <番号>               ← ［退会届受領］
npm run crm -- withdrawal key <番号>                ← ［カードキー返却］
npm run crm -- withdrawal notice <番号> --sent      ← ［正式受付LINE送信済］
npm run crm -- withdrawal payment-done <番号>       ← ［会費ペイ処理済］
npm run crm -- withdrawal owner-review <番号> --reason "…"  ← ［オーナー確認へ］
npm run crm -- withdrawal timeline <番号>           ← オーナー確認画面（時系列）
npm run crm -- withdrawal close <番号>              ← 退会完了（退会予定日以降のみ）
```

スタッフは**退会日・最終在籍月・ステータス・LINE文面を入力しない**。全部システムが決める。
修正が必要なときだけ `withdrawal correct <番号> --field … --value … --reason … --owner` を使い、
オーナー権限＋変更理由＋監査ログを必須にする。

## 9. 会費ペイ処理方法

**APIは無い（捏造しない）。**

1. 正式受付が成立した瞬間、`paymentStopStatus = "pending"`（＝`PAYMENT_STOP_PENDING`）を自動でセットする。
2. `withdrawal alerts` と `withdrawal list` の先頭に「会費ペイ未処理 ◯件」を出す。日報にも出る。
3. スタッフが会費ペイ側で実際に停止操作を行う。
4. `withdrawal payment-done <番号> --staff 名前` を実行 → `paymentStopCompletedAt` / `handledBy` / 監査ログを記録。

「人の記憶」ではなく**システム上の未完了状態**として残り続けるので、押すまで消えない。

## 10. 想定リスク

| リスク | 対策 |
|---|---|
| キーワード誤検知（「今日は休みたい」等） | 検知は**相談フラグを立てるだけ**。正式受付には一切影響しない（安全側） |
| キーワード見落とし | 完全一致に頼らず部分一致＋表記ゆれ。加えてスタッフが手動で `withdrawal open` できる |
| TZずれで退会日が1日ずれる | 日付判定はすべてJST固定（`jstYmd`）。UTCサーバーでも同じ結果 |
| 同じ案内を連投 | `procedureGuidedAt` と messageId の二重チェック |
| 監査ログの改ざん | JSONL の追記のみ。更新・削除APIを実装しない |
| 個人情報の流出 | `data/` は `.gitignore` 済み。ログにLINE userIDや本文を全文出さない（`safeLineLog` 方針を踏襲） |
| 会費ペイの仕様を勝手に断定 | 断定しない。停止の成否は人が押したときだけ真とする |
| 既存機能の破壊 | 既存ファイルのスキーマは無変更。`daily_report` の引数は任意追加 |

## 11. テスト方法

```bash
npm run test:withdrawal        # ドメイン（ケース1〜6・9・10）
npm run test:withdrawal-store  # ストア・監査ログ・重複防止・警告（ケース7・8）
npm run test:aika-withdrawal   # 移植キット（本体とズレたら落ちる）
npm test                       # 既存全部＋上記
npm run typecheck
./scripts/validate-ai-os.sh
```

指示書のケース1〜10をすべて自動テスト化する。

## 12. ロールバック方法

1. コード: 追加ファイルの削除と、変更3ファイル（`crm_cli.ts` / `daily_report.ts` / `package.json`）のrevertだけで戻る。
   既存スキーマを触っていないので**データ移行は不要**。
2. データ: `data/withdrawal_cases.json` と `data/withdrawal_audit_logs.jsonl` を退避すれば元の状態。
   既存の `prospects.json` / `guardian_consents.json` には一切書き込まない。
3. LINE: AIKA側へは移植キットを渡すだけなので、コピーしなければ本番LINEの挙動は変わらない。

---

## 付録: AIに許可すること／禁止すること

**許可**: 問い合わせ分類、返信文の下書き、履歴要約、クレーム時系列の整理、オーナー確認案件の要約。

**禁止**（コード上も、日付・金額はDB確定値からしか作れないようにしてある）:
規約変更／正式受付日の変更／退会日の手入力／金額の推測／返金決定／特例承認／会費免除／
会費ペイ停止の成功を推測／カードキー返却済みを推測。
