# ハンドオフ: LINE受信 → 見込み客CRM 自動下書き登録

- From: Claude（コンテンツ層 / `src/crm/`・`src/generators/`）
- To: Codex（フロー層 / `src/line_bot/`）
- 日付: 2026-06-11
- 関連: PR `claude/flatup-gym-sales-ai-3wfjd5`（見込み客CRM一式）

## 1. 今やったこと（Claude側・実装済み）

LINE webhook から呼ぶだけで見込み客を下書き登録できる**接続口**を `src/crm/` に用意した。
`src/line_bot/` には一切触れていない。

- `src/crm/line_intake.ts` … `intakeFromLineMessage(inquiry, store, now?)`
- `src/crm/store.ts` … `findByExternalId()` を追加（LINE userId 名寄せ）
- `src/crm/prospect.ts` … `externalId` フィールド追加
- テスト `src/crm/line_intake.test.ts`（新規作成・重複更新・別ユーザー・空文字）

## 2. Codex にお願いしたいこと（line_bot 側の配線）

`src/line_bot/webhook.ts` の **メッセージ受信ハンドラ**から、以下を1回呼ぶだけ。

```ts
import path from "node:path";
import { openProspectStore } from "../crm/store.js";
import { intakeFromLineMessage } from "../crm/line_intake.js";

const store = openProspectStore(
  path.join(process.env.OPENQLOW_DATA_DIR || path.join(process.cwd(), "data"), "prospects.json"),
);

// LINE の message(text) イベント1件につき:
const result = await intakeFromLineMessage(
  { lineUserId: event.source.userId, text: event.message.text /*, displayName 任意 */ },
  store,
);
// result.prospect … 登録/更新された見込み客
// result.replyDraft … オーナーが確認して送る返信案（★自動送信しない★）
// result.created … 新規 true / 既存更新 false
```

### 通知（任意・既存の仕組みを再利用）
- 既存の push/approval 通知で、オーナーに「新規問い合わせ #id ＋ 返信下書き」を提示する。
- これは既存の openQLOW 承認フローと同じ思想（人間が確認してから送信）。

## 3. 厳守事項（両AI合意済みの禁止事項）

- **自動返信しない**。`replyDraft` はあくまで下書き。送信はオーナー操作のみ。
- **予約確定・料金変更をしない**。
- webhook の既存ルート（承認フロー等）を壊さない。intake はメッセージ受信の**追加処理**として足す。
- 既存の署名検証・エラーハンドリングはそのまま。intake が例外を投げても webhook 全体を落とさない（try/catch で握り、必要なら `src/crm/self_repair.ts` の `logError("line_webhook_error", ...)` を呼ぶ）。

## 4. プライバシー方針

- `externalId`（LINE userId）は擬似ID。名寄せキーとしてのみ使用。
- `displayName` を保存する場合も、保存先 `data/prospects.json` は **`.gitignore` 済み**でコミットされない（オーナーのローカル台帳）。
- Obsidian / Git / ログには生PIIを出さない（既存方針 `src/privacy/rules.ts` を踏襲）。

## 5. 受け入れ確認（Codex作業後）

1. LINEにテキストを送ると `data/prospects.json` に下書きが1件増える。
2. 同じユーザーが再送しても重複せず更新される（件数が増えない）。
3. **自動返信が飛ばない**（下書きのみ）。
4. `npm run crm -- list` / `followups` / `daily-report` に反映される。

## 6. territory メモ

- 本ハンドオフに伴い `src/crm/`（Claude）と `src/line_bot/`（Codex）の境界は
  **`intakeFromLineMessage` という関数1点**のみ。インターフェースが変わる場合は事前共有する。
