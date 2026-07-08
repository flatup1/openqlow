# FLATUP AI OS SDL Final Hardening Design

## Goal

既存の3リポジトリ統合を作り直さず、顧客情報をログへ残さないこと、依存脆弱性をゼロにすること、本番の自動復帰と公開経路を再検証することに絞って改善する。

## Scope

- openQLOWのLINE webhook、通知、返信ログから本文、ユーザーID、外部APIエラー本文を除く。
- webhook本文を1 MiBに制限し、過大リクエストによるメモリ消費を防ぐ。
- openqlowとflatup-ai-osの既知npm脆弱性を、破壊的変更なしで解消する。
- flatup-ai-osの全Git履歴を秘密情報パターンで検査する。
- 既存の自動送信禁止、人間確認、正本、安全ゲート、Vault loopを維持する。

## Architecture

LINE固有の安全処理を `src/line_bot/webhook_security.ts` に小さく分離する。webhookは安全な固定ログ、固定エラー応答、受信バイト上限だけを利用し、顧客本文や識別子は処理中のメモリ以外へ出さない。

## Error Handling

- 内部例外は顧客本文を含まない固定メッセージだけをサーバーログへ出す。
- HTTP応答は `internal_error` の固定値とし、例外詳細を返さない。
- 1 MiB超過はHTTP 413で終了し、本文を処理しない。
- LINE API失敗はHTTPステータスだけを保持し、レスポンス本文はログ・戻り値に含めない。

## Verification

- TDDで安全ログ、固定エラー、サイズ上限のテストを先に失敗させる。
- `npm test`、`npm audit --audit-level=low`、秘密情報履歴スキャンを実行する。
- VPS反映後にsystemd状態、loop timer、ローカルhealth、公開URLを再確認する。
- 固定Cloudflare URLに必要なアカウント資格情報がない場合は、100点と偽らず外部ブロッカーとして残す。

## Non-Negotiable Constraints

- 自動送信、予約確定、料金変更、返金、退会、謝罪送信を追加しない。
- 秘密情報と個人情報をGit、ログ、チャットへ出さない。
- Python/Flaskへ作り直さない。
- 既存機能を壊さず、差分のみとする。
