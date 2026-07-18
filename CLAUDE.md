# CLAUDE.md — FLATUP GYM AI OS（Claude Code 向け）

このファイルは Claude Code 用の簡潔な入口です。詳細な正本は `docs/ai-os/canon/` にあります。
事業情報を `AGENTS.md` と二重管理しないでください。憲法・協業ルールの本体は `AGENTS.md` を参照します。

## 1. 目的
FLATUP GYM（千葉県成田市の「世界一初心者に優しい格闘技ジム」）の業務を、短い指示で同じ品質で回す。最重要は会員100人達成（現在約70人）。

## 2. 作業開始時に読む正本
- `AGENTS.md`（憲法・承認ゲート・協業ルール）
- `COORDINATION.md`（担当・ロック）
- `docs/ai-os/canon/`（gym_profile / pricing_and_schedule / membership_rules / safety_rules / brand_voice / approval_matrix）

## 3. 出力言語と文体
日本語・結論ファースト・中学生にも分かる表現。詳細は `docs/ai-os/canon/brand_voice.md`。

## 4. 人間承認が必要な操作
既存正本の変更 / 料金・営業時間の変更 / 退会・休会・違約金の正式回答 / 顧客情報の保存 / commit / push / PR / デプロイ / メール・LINE・SNS送信 / カレンダー登録 / 請求書送信 / 外部書き込み。→ `docs/ai-os/canon/approval_matrix.md` §2。

## 5. 削除禁止
`rm -rf` / `git reset --hard` / `git clean -fd` / force push / 本番データ・DB削除は禁止（§3）。整理は「提案→承認→実行」。

## 6. テストと検品
変更後は `bash scripts/validate-ai-os.sh`。公開文章は `flatup-content-qc`、変更は `flatup-change-review` で検品。

## 7. Skills の利用方針
正本は `docs/ai-os/skills-source/`。配布は `.claude/skills/`（Claude）/ `.agents/skills/`（Codex）。同期は `bash scripts/sync-agent-skills.sh`。長大な正本を Skill に埋め込まず canon を参照する。

## 8. 既存実装を壊さない
未コミット変更を破棄・stash・resetしない。既存ファイル変更前は `.ai-os-backup/<日時>/` へ退避。既存の `AGENTS.md` / `.claude/skills/run-openqlow-dryrun` などは保持。

## 9. 作業終了時の報告
作成 / 変更 / 保持 / 検証結果 / 未実装 / 人間確認が必要 / Git状態 を報告し、最後に `git status --short` と `git diff --stat` を示す。承認なしに commit / push / PR / デプロイをしない。

## 安全設定
`.claude/settings.json` と `scripts/hooks/flatup-guard.sh` が危険操作を拒否・承認要求する。`--dangerously-skip-permissions` を前提にしない。
