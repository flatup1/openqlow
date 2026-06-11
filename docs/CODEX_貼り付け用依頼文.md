# Codex 貼り付け用 依頼文（タスク別・順番に貼る）

> 使い方：上から順に。**1つ終わって「OK」を確認してから、次を貼る**。
> 共通の大原則：自動送信なし／差分のみ最小変更／`src/crm/`・`src/generators/`（完成済み）は触らない／Python・Flask・SQLite新設禁止。
> 詳細仕様：`docs/CODEX_残作業指示書_2026-06-11.md`

---

## ① タスク1：`npm run test` を緑にする（最優先）

```
リポジトリ flatup1/openqlow、ブランチ claude/flatup-gym-sales-ai-3wfjd5 で作業してください。
今回は「タスク1」だけ。タスク2以降には進まないでください。

【目的】
src/state/file_store.ts が全履歴で未コミットのため、npm run test が最初の tsc --noEmit で止まっています。
state層の整合を取り、npm run test を緑にしてください。

【着手前に必ず出すこと】
1. 今回触らない既存機能
2. 変更/追加するファイルと、その理由
3. npm run test の確認方針

【禁止】
- state層を全面リファクタしない／仕様を勝手に変えない／テストを消して通すだけにしない
- src/crm/ と src/generators/（完成済み）を触らない
- CRMやLINE webhookを同時に触らない

【完了条件】
- npm run test が通る
- 変更差分が最小
- 変更理由が説明できる
```

---

## ② タスク2：LINE webhook → CRM配線（タスク1が緑になってから）

```
タスク1（npm run test 緑）が完了してから着手してください。

【目的】
LINE webhook で受信したテキストを、実装済みの接続口
src/crm/line_intake.ts の intakeFromLineMessage() に渡すだけ。新しいCRMは作らない。

【実シグネチャ（これに合わせる）】
intakeFromLineMessage({ lineUserId, text, displayName? }, store, now?)
  → { prospect, replyDraft, created }
store は openProspectStore(path) で作る（path = (OPENQLOW_DATA_DIR||cwd/data)/prospects.json）

【やること】
- src/line_bot/ の受信ハンドラで、テキストメッセージ受信時に上記を1回呼ぶ
- 重複防止はCRM側の externalId に任せる（webhook側で独自の重複管理を作らない）
- intake が例外でも webhook 全体を落とさない（try/catch、必要なら self_repair の logError）
- オーナー通知は既存の push/approval を再利用（返信案は下書きとして提示）

【着手前に必ず出すこと】
1. 今回触らない既存機能
2. 変更/追加ファイルと理由
3. LINE受信データを intakeFromLineMessage() に渡す流れ
4. 自動返信しないことの確認
5. npm run test の確認方針

【禁止（絶対）】
- 自動返信しない／勝手に送信しない／予約確定しない／料金変更しない
- CRMを作り直さない／src/crm/ を大きく変更しない
- Python/Flask/SQLite を新設しない／SNS投稿生成を重複実装しない

【完了条件】
- LINE受信テキストがCRMへ登録される
- 同じLINEユーザーの再問い合わせは重複登録されず更新される
- 自動返信はされない
- npm run test が通る
- 差分が最小／変更ファイル一覧と diff を提示
```

---

## ③ タスク3：日次日報の自動生成（タスク2のあと）

```
【目的】
毎朝、CRMの日次レポートを自動生成して保存する（保存だけ。送信しない）。

【やること】
- cron もしくは systemd timer で毎朝1回実行する：
  例) 0 8 * * * cd /opt/openqlow && OPENQLOW_DATA_DIR=/home/flatup/openqlow-data npm run crm -- daily-report
- 出力先：${OPENQLOW_DATA_DIR}/reports/daily/YYYY-MM-DD_FLATUP集客日報.md
- 失敗時はログが残る設計（既存 monitor or self_repair）

【禁止】
- LINE/Slack/メール送信しない（保存のみ）
- src/crm/ を変更しない

【着手前に出すこと】
触らない範囲／変更ファイル／確認方針

【完了条件】
- 毎朝レポートMarkdownが生成・保存される
- 自動送信なし
- npm run test が通る
```

---

## ④ タスク4：本番デプロイ設定（最後）

```
【目的】
個人情報をリポジトリの外に保存する。

【やること】
- 本番(VPS /opt/openqlow)で環境変数を設定：
  OPENQLOW_DATA_DIR=/home/flatup/openqlow-data
- 保存先：
  /home/flatup/openqlow-data/{ prospects.json, reports/daily/, logs/self_repair/ }
- data/ reports/ logs/ がGitに入らないことを確認（.gitignore 済み）

【禁止】
- data/ reports/ logs/・顧客情報・LINE userId・問い合わせ本文・APIキーをGitに入れない

【完了条件】
- 本番で OPENQLOW_DATA_DIR が効く
- CRMデータがリポジトリ外に保存される
- .gitignore が効いている
- 秘密情報・個人情報が未コミット
```

---

## 各タスク後にオーナー(JIN)が確認する「OKの合図」
- ① `npm run test` が**全部通った**
- ② LINEで送ると台帳に登録／同じ人は重複しない／**自動返信していない**
- ③ 毎朝、日報ファイルが自動でできる（送信なし）
- ④ お客さん情報が**リポジトリの外**に保存され、Gitに入っていない

OKが出たら次のタスクを貼る。これを4回くり返せば v1 完成。
