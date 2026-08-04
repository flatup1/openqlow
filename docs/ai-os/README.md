# FLATUP GYM AI OPERATING SYSTEM

CodexとClaude Codeが、短い指示でもFLATUPの正本・口調・承認ルールを守るための共通基盤です。AIは下ごしらえを担当し、送信・公開・料金・金銭・本番変更の最終判断はJINが行います。

## 最初に読む順番

1. `AGENTS.md` と `COORDINATION.md`
2. `src/shared/canon.ts`（事実の唯一の正本）
3. `docs/ai-os/canon/approval_matrix.md`
4. 依頼に合うSkill

## 構成

- `canon/`: 正本の参照方法、ブランド、安全、承認境界
- `workflows/`: 問い合わせ、体験、発信、週次経営、整理の流れ
- `templates/`: 送信前の下書き雛形
- `skills-source/`: 10個のSkills正本
- `integrations/`: 外部連携と自動化の候補。接続を作った記録ではない

## 重要な区別

- `src/shared/canon.ts` が料金・時間・クラス等の唯一の正本です。
- `docs/ai-os/canon/` は人間とAIが読みやすい同期ビューで、矛盾時はTypeScript正本を優先します。
- `AIKA`は顧客対応の守り、`openQLOW`は営業・経営支援の攻めです。
- 自動化は読み取り・集計から始め、顧客への送信や公開は下書きまでです。

## 検証

```bash
./scripts/validate-ai-os.sh
./scripts/validate-ai-os.test.sh
```

Skillsを変更した場合は、先に `docs/ai-os/skills-source/` を編集し、`./scripts/sync-agent-skills.sh --check` で配置を確認します。
