# Codex Rules — FLATUP GYM 安全ルール

> Codex のバージョンにより Rules の解釈が異なる場合がある。無効な設定は作らず、
> 未対応時は `docs/ai-os/IMPLEMENTATION_REPORT.md` に理由を記録する。
> このファイルは人間・AI 双方が読める安全規約として機能する。

## 拒否（実行しない）

以下は理由に関わらず実行しない：

- `rm -rf`
- `git reset --hard`
- `git clean -fd`
- `git push --force` / `git push -f`
- リポジトリ削除 / プロジェクト削除
- データベース全削除
- APIキー・トークン・個人情報のコミット
- 承認なしの自動投稿・自動送信・金銭処理

## 確認（実行前に人間承認）

- 通常の `git push`
- Pull Request 作成
- デプロイ
- 外部 API への書き込み
- 課金につながる操作
- 既存正本（`docs/ai-os/canon/`）の変更
- 料金・営業時間・退会・休会・違約金の正式回答
- メール / LINE / SNS への送信・投稿

## 参照

- 承認区分の正本：`docs/ai-os/canon/approval_matrix.md`
- 全体ルール：`AGENTS.md`
