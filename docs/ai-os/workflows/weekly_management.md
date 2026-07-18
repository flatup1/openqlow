# ワークフロー：週次・日次の経営管理

対応する Skill：`flatup-daily-command`, `flatup-weekly-kpi`

## 日次（朝）

1. `flatup-daily-command` を実行。
2. タスク・進行中プロジェクトを確認。
3. 会員100人達成に直結する順に並べ、今日やる3項目を出す。
4. 後回し項目と理由を出す。

## 週次

1. `flatup-weekly-kpi` を実行。
2. 数値を整理：会員数 / 新規問い合わせ / 体験予約 / 体験実施 / 入会 / 退会 / LINE登録 / 広告費 / 体験単価 / 入会単価 / 転換率。
3. データがない項目は捏造せず「未取得」と表示。
4. テンプレ `templates/weekly_report.md`。

## 原則

- 読み取り・集計は AI 単独可（`canon/approval_matrix.md` §1）。
- 数値の捏造禁止。根拠のない断定は「推測」と明記。
