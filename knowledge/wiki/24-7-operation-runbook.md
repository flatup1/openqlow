---
type: wiki
title: "24時間快適運用 ランブック（両AIを止めない設定）"
tags: [operations, runbook, reliability, 24-7, aika, openqlow]
created: 2026-06-25
updated: 2026-06-25
sources:
  - "[[../sources/20260625-aika-line-log-summary]]"
  - "[[../sources/20260625-line-ops-log-summary]]"
---

# 24時間快適運用 ランブック

両AIを「快適に24時間回す」ための設定方針。ログで起きた**応答停止・無応答・取りこぼし**を防ぐ。

## A. 落ちない（可用性）
- **死活監視 + 自動再起動**: webhook / トンネル(ngrok・cloudflared) / LLM API を監視し、落ちたら自動再起動。
  OPENQLOW は `deploy/systemd/*` と healthcheck（`systemd_self_heal`）あり → AIKA側にも同等を必ず用意。
- **トンネルURL固定**: ngrok の動的URLで承認が届かなかった事例（Webhook URL古い）→ 固定ドメイン(cloudflared)へ。
- **LLM障害時フォールバック**: OpenRouter 401/タイムアウト時は、定型の安心メッセージ＋[[flatup-canonical-faq|正本FAQ]]のルールベース回答に自動切替（沈黙させない）。

## B. 固まらない（スタック回復）
- **「只今担当者が対応中」で停止しない**: 取次ぎ中でも 時刻/曜日/料金/住所 等の基本Q&Aは答え続ける。
- **自動タイムアウト復帰**: 取次ぎ/フォーム状態は一定時間で自動リセット（`/reset`を人に押させない）。
- **多重起動防止・冪等**: 同じ承認/投稿/保存を二重実行しない（投稿IDで重複排除）。

## C. 取りこぼさない（入力の頑健化）
- **コマンド正規化**（OPENQLOWは実装済み: `src/line_bot/normalize_command.ts`）。AIKAにも同方針を適用:
  - NFKC正規化（全角/半角・`／`→`/`・半角ｶﾅ `ﾒﾓ`→`メモ`）。
  - 表記ゆれ吸収（`ok/OK/了解`、`日報/日報まとめ/にっぽう`、前後スペース）。
  - 承認(approve)と日報(report)と修正(revise)の**ルーティングを明確分離**（誤爆を防ぐ）。
- **未知コマンドでも会話継続**: 「対応していません」で突き放さず、意図を推測して案内へ繋ぐ。

## D. 安全と境界（24時間でも崩さない）
- 自動投稿しても**最終責任は人間**。禁止行為（→ [[forbidden-actions]]）は時間帯に関係なく throw で停止。
- 個人情報・APIキーはログ/公開ファイルに出さない（[[openqlow-safety-rules]]）。
- 安全フィルタの**誤検知**（投稿IDを電話番号と誤判定した事例）を是正し、正規の保存を止めない。

## E. 夜間・定休の振る舞い
- 定休日・営業時間外でも、**翌営業日の案内＋代案**を優しく返す（沈黙/塩対応にしない）。
- 朝の日報・投稿候補の定時配信(05:15/07:00/08:00)は維持しつつ、**入口を1つに**（/日報 に集約）して混乱を減らす。

## チェックリスト（毎日自動で確認したい）
- [ ] webhook 200 / トンネル生存 / LLM API 応答
- [ ] 直近の「No approval command found」「対応していません」率が低いか
- [ ] スタック状態(取次ぎ/フォーム)が放置されていないか
- [ ] 二重投稿・二重保存が無いか
- [ ] ⚠️未確認の正本(スケジュール/クラス)が放置されていないか（[[flatup-canonical-faq]]）

## 関連
- [[kindest-ai-response-policy]] — 出力の質
- [[flatup-canonical-faq]] — 事実の単一正本
- [[ops-scorecard-2026-06]] — 改善の根拠

## 出典
- [[../sources/20260625-aika-line-log-summary]] / [[../sources/20260625-line-ops-log-summary]]
