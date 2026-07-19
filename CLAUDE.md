# FLATUP GYM AI GLOBAL BRAIN — Claude Code

このリポジトリでは、最初に `AGENTS.md` と `COORDINATION.md` を読み、担当領域と承認境界を確認する。

## 参照順

1. `AGENTS.md`
2. `COORDINATION.md`
3. `src/shared/canon.ts`（料金・時間・クラス等の唯一の正本）
4. `docs/ai-os/canon/`
5. 依頼に合う `docs/ai-os/skills-source/` のSkill

## 実行ルール

- 日本語、結論ファースト、短く、中学生にも分かる表現を使う。
- AIKAは守りの顧客対応、openQLOWは攻めの営業・経営支援として混同しない。
- 既存実装、未コミット差分、原本を保持し、削除や全面上書きをしない。
- 下書き・分析・テストは進めてよい。送信、予約確定、料金判断、返金、退会、休会、外部書き込み、公開、課金、本番反映、commit、push、PRは人間承認後。
- 秘密情報や顧客個人情報を表示・保存・コミットしない。
- 変更後は `./scripts/validate-ai-os.sh` と関連テストを実行する。

詳細は `docs/ai-os/README.md` と `docs/ai-os/canon/approval_matrix.md` を参照する。
