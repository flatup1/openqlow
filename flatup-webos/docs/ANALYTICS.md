# ANALYTICS — KPIとイベント設計

## 最重要KPI

最初は指標を増やしすぎない。

> **体験予約への到達率**

## 副指標

- Q1回答率
- 各質問通過率
- 質問途中離脱率
- パーソナライズページ到達率
- AIチャット利用率
- 予約CTAクリック率
- LINE遷移率

## イベント設計

```text
webos_started            # WebOS表示・冒険開始
audience_selected        # Q1回答
goal_selected            # 目的回答
experience_selected      # 経験回答
availability_selected    # 時間帯回答
personalized_view        # 専用ページ到達
chat_opened              # AIチャット起動
booking_clicked          # 体験予約CTAクリック
line_clicked             # LINE遷移
booking_completed        # 予約完了（Phase 2で予約システム接続後）
```

## プライバシー原則

- **個人情報を不要にanalyticsへ送らない。**
- 送るのはイベント名と選択カテゴリ（例: `audience=self`）まで。
  氏名・連絡先・自由入力テキストは送らない。

## Phase 1の実装

- 計測基盤（GA4等）はまだ接続しない。
- `track(eventName, payload)` の1関数に集約し、Phase 1では
  console + `dataLayer` 互換の配列へ記録するだけのスタブとする。
- 後からGA4 / Clarity等を「track関数の中身の差し替え」だけで接続できる構造にする。
  （既存LPに GA4 / Clarity / Meta Pixel のタグ挿入枠の前例あり）

## 将来の管理画面（Phase 1では作らない）

将来的には以下を確認できるよう拡張可能な構造とする:

- どの質問で離脱したか
- どのルートが予約されたか
- 女性/キッズ/男性別CVR
- AIへの質問内容（PII除去後）
- CTA別クリック
- 人気の目的

これらは openQLOW（攻めのAI）の日次確認・改善提案の入力になる構想。
