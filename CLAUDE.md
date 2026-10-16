# FLATUP GYM AI GLOBAL BRAIN — Claude Code

最初に読むのは `AGENTS.md` だけ。ほかは必要になったときに読む。

## 必要になったら読む

| 場面 | 読むもの |
|---|---|
| 料金・時間・クラス・規約の事実が要る | `src/shared/canon.ts`（唯一の正本） |
| 担当領域やロックを確認する | `COORDINATION.md` |
| 承認が要るか迷う | `docs/ai-os/canon/approval_matrix.md` |
| 顧客対応・投稿・KPI・監査の実務 | 該当する `docs/ai-os/skills-source/` のSkill |
| AI OSの全体像 | `docs/ai-os/README.md` |

必要のない資料は読まない。存在しないファイルは推測で補わず「未確認」と書く。

## 確認なしで進めてよいこと

読み取り、検索、分析、下書き、新規ドキュメント作成、テスト・lint・typecheck、
`./scripts/validate-ai-os.sh`、環境変数を隔離したdry-run（Skill: `run-openqlow-dryrun`）。

ここは**最後まで進めてよい**。作る → 動かす → 結果を見る → おかしければ直す、まで一度に行う。
途中で「進めてよいですか」と聞き返さない。

## 人間承認が要ること

送信、予約確定、料金・返金・退会・休会の確定、外部への書き込み、公開、課金、本番反映、commit、push、PR。
一覧は `docs/ai-os/canon/approval_matrix.md`、止まり方は `AGENTS.md` の承認ゲート。

## 書き方

- 日本語、結論ファースト、短く、中学生にも分かる表現。
- AIKAは守りの顧客対応、openQLOWは攻めの営業・経営支援。混同しない。
- 既存実装と未コミット差分を保持する。原本（`knowledge/sources/`、canon）は上書きしない。
- 秘密情報と顧客個人情報を表示・保存・コミットしない。
- `docs/ai-os/`・`.claude/`・`.codex/`・canon・Skillを変えたときは `./scripts/validate-ai-os.sh` を実行する。
