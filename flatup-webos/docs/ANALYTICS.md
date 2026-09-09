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

## 計測の目的（数字集めではない）

> **どこをもっと優しくすれば予約しやすくなるかを発見すること。**

Phase 1完成後、最低限これだけは後から計測できる構造にする:

WebOS開始 / Q1回答 / Q2回答 / 途中離脱 / 結果ページ到達 /
体験予約CTAクリック / LINEクリック / AIチャット起動

※「途中離脱」は専用イベントではなく、「ある質問の回答イベントはあるが
次の質問の回答イベントがない」ことから導出する（イベントを増やさない）。

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

## 現在の実装（v13）

- `track(eventName, payload)` の1関数に集約し、`dataLayer` とAIKAの
  `POST /webos-event` の両方へ記録する。計測失敗で画面は止めない。
- AIKA SQLiteが保存するのは、匿名セッションID・イベント名・
  許可済みの選択カテゴリのみ。氏名・電話・自由文・IPは計測DBへ保存しない。
- 行動イベントは90日で自動削除。運用担当者はAIKA VPS内の
  `webos_metrics.py --days 7` で「開始 → 結果 → LINE → 引き継ぎ」を確認する。
- 外部SaaSや月額費用は不要。GA4 / Clarityは、将来必要になった時だけ
  `dataLayer` を利用して追加できる。

## 将来の管理画面（Phase 1では作らない）

将来的には以下を確認できるよう拡張可能な構造とする:

- どの質問で離脱したか
- どのルートが予約されたか
- 女性/キッズ/男性別CVR
- AIへの質問内容（PII除去後）
- CTA別クリック
- 人気の目的

これらは openQLOW（攻めのAI）の日次確認・改善提案の入力になる構想。
