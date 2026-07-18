# FLATUP GYM AI OPERATING SYSTEM

FLATUP GYM の業務を、AI に毎回長く説明せず、短い指示で同じ品質を出すための共通基盤です。
Codex と Claude Code の両方で使えるように設計しています。

## 目的

1. 会員数100人達成に向けた集客強化
2. 問い合わせ→体験予約の返信品質向上
3. 体験後の入会率向上
4. SNS・広告・HP制作の効率化
5. 料金・営業時間・退会ルールの誤案内防止
6. 危険なファイル操作・外部送信・公開作業の防止
7. Codex / Claude Code 共通のナレッジと Skills

## 構成

```
docs/ai-os/
├── canon/          正本（唯一の参照元）
│   ├── gym_profile.md
│   ├── pricing_and_schedule.md
│   ├── membership_rules.md
│   ├── safety_rules.md
│   ├── brand_voice.md
│   └── approval_matrix.md
├── workflows/      業務の流れ
├── templates/      返信・投稿・レポートの雛形
├── integrations/   MCP / 自動化の候補（未接続は候補まで）
└── skills-source/  Skills 正本（SKILL.md）
```

Skills の配布先：
- Codex 用：`.agents/skills/<name>/`
- Claude Code 用：`.claude/skills/<name>/`
- 同期：`scripts/sync-agent-skills.sh`（正本は `skills-source/`）

## 最初の10 Skills

1. `flatup-daily-command` — 今日の司令書
2. `flatup-inquiry-reply` — 問い合わせ返信
3. `flatup-trial-followup` — 体験前後のフォロー
4. `flatup-social-repurpose` — SNS媒体別転用
5. `flatup-content-qc` — 公開前検品
6. `flatup-weekly-kpi` — 週次KPIレポート
7. `flatup-faq-update` — FAQ正本更新
8. `flatup-file-audit` — ファイル健診
9. `flatup-campaign-planner` — 集客企画作成
10. `flatup-change-review` — コード・設定変更の検品

## 安全の原則

- 全て下書き。送信・投稿・請求・契約変更・規約判断は人間が実行。
- 承認区分は `canon/approval_matrix.md`。
- 個人情報・秘密情報は Git 管理下へ保存しない。

## 検証

```bash
bash scripts/validate-ai-os.sh
```
