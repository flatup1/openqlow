# FLATUP GYM AI OS 実装レポート

実装日: 2026-07-18
対象: `openqlow` 最新 `origin/main`（開始時 `cc3b92f`）
作業ブランチ: `codex/flatup-ai-os-setup`
作業コピー: `/Users/jin/Desktop/OPENQLOW HelMES/openqlow-flatup-ai-os-setup`

## 1. 調査した既存構成

- ルート `AGENTS.md`、`COORDINATION.md`、`.gitignore`
- 既存 `.claude/skills/run-openqlow-dryrun/SKILL.md`
- 唯一の事実正本 `src/shared/canon.ts`
- Vault入口、AIKA OS憲法、AIKA本番人格、`line_reply`、`trial_booking`、`aika_tone`
- Codex CLI 0.142.3。`hooks`はstable/enabled、`execpolicy`利用可能
- Claude Code CLIはこのMacに未インストール

開始時、元の `openqlow/main` は `origin/main` より20コミット遅れ、ローカル固有コミット1件と未コミット変更1件がありました。混在を避けるため最新 `origin/main` から分離worktreeを作り、元の作業状態には触れていません。

## 2. 作成したファイル

- ルート `CLAUDE.md`
- `docs/ai-os/` のREADME、6 canon、5 workflow、5 template、2 integration文書、本レポート
- `docs/ai-os/skills-source/` の10 Skills
- `.agents/skills/flatup-*` と `.claude/skills/flatup-*` の共通正本シンボリックリンク
- `.codex/config.toml`、`.codex/rules/flatup-safety.rules`、`.codex/hooks.json`、安全Hook
- `.claude/settings.json`、安全Hook
- `scripts/sync-agent-skills.sh`
- `scripts/validate-ai-os.sh` とテスト

## 3. 変更した既存ファイル

- `AGENTS.md`: AI OS入口、正本、承認、検証の短い参照を追記
- `COORDINATION.md`: 新規AI OS領域をCodex担当として登録
- `.gitignore`: バックアップ、秘密情報、個人情報候補を除外

既存内容は削除・全面上書きせず保持しました。

## 4. バックアップ

変更前の `AGENTS.md`、`COORDINATION.md`、`.gitignore` を `.ai-os-backup/20260718T-ai-os-setup/` に保存しました。このフォルダはGit管理対象外です。

## 5. 実装したSkills

1. `flatup-daily-command`
2. `flatup-inquiry-reply`
3. `flatup-trial-followup`
4. `flatup-social-repurpose`
5. `flatup-content-qc`
6. `flatup-weekly-kpi`
7. `flatup-faq-update`
8. `flatup-file-audit`
9. `flatup-campaign-planner`
10. `flatup-change-review`

正本は `docs/ai-os/skills-source/` です。CodexとClaude Codeは同じ内容をシンボリックリンクで参照します。

## 6. Claude Code側の安全設定

- 公式形式の `.claude/settings.json`
- 秘密用の環境ファイルと鍵ファイルのRead/Edit/Write拒否（共有用の `.env.example` は閲覧可能）
- 破壊操作の拒否
- 削除、外部通信、公開、deploy、commit、push、PR/Issue/Project操作の確認要求
- PreToolUse Hookでコマンド文字列を再検査
- Hook内部エラー、入力不正、Node.js不在時はexit 2で拒否

Claude Code CLIが未インストールのため、実CLIによる設定ロードは未確認です。JSON構文、公式現行スキーマ、Hookのdeny/ask出力は検証済みです。

## 7. Codex側の安全設定

- プロジェクト設定を `on-request` と `workspace-write` に設定
- Rulesで破壊操作を禁止し、削除、commit、push、PR、外部通信、deploy、公開系を確認対象化
- PreToolUse Hookで強制削除、履歴破棄、force push、リポジトリ削除、全DB削除を拒否
- `codex execpolicy check` で `forbidden` と `prompt` の実判定を確認

プロジェクトローカルのRulesとHooksは、Codexでこのworktreeをtrustedとして開き、初回Hookレビューを承認した後に有効になります。

## 8. 検証結果

- 変更前基準 `npm test`: 成功
- 変更後 `npm test`: 成功
- `./scripts/validate-ai-os.test.sh`: 成功
- `git diff --check`: 成功
- 秘密情報候補: 0件
- 顧客個人情報らしいファイル: 0件
- 壊れたSkillリンク: 0件
- 10 SkillsのCodex/Claude同期: 成功

## 9. 未実装項目

- 外部MCP・コネクタの新規接続
- Gmail、LINE、SNS、カレンダー等への実書き込み
- 定時実行
- 自動投稿、自動返信、予約確定、課金、デプロイ
- Claude Code CLIでの実ロード確認

## 10. 外部連携に必要な作業

各連携を使う直前に、接続状態、読み取り範囲、書き込み権限、個人情報、費用、停止方法を確認します。最初は読み取りか下書きだけに限定し、書き込みは毎回人間承認を通します。

## 11. 人間が確認すべき事項

- Vaultの `1_AIKA人格_本番.md` はレディース土曜14:00、現行 `src/shared/canon.ts` は土曜14:30です。今回のAI OSは現行正本14:30を採用しました
- Codexでworktreeをtrustedとして開いた際のRules/Hookレビュー
- Claude Code導入後の `.claude/settings.json` 実ロード
- commit、push、PR作成、デプロイは未実施

## 12. 次の優先順位

1. JINが差分と「土曜14:30」を確認する
2. 日常利用で問い合わせ返信、公開前検品、週次KPIの3 Skillsから試す
3. 読み取り専用の外部連携を1つずつ検証する

## 参照した公式資料

- Codex Rules: https://developers.openai.com/codex/rules
- Codex Hooks: https://learn.chatgpt.com/docs/hooks
- Claude Code Settings: https://code.claude.com/docs/en/settings
- Claude Code Permissions: https://code.claude.com/docs/en/permissions
- Claude Code Hooks: https://code.claude.com/docs/en/hooks
