---
type: source
title: "FLATUP GYM 正本データ（料金・スケジュール・禁止行為・コア原則）"
source_url: ""
author: "openqlow コード（src/generators/shared.ts, src/safety/forbidden_actions.ts, AGENTS.md）"
captured: 2026-06-24
kind: note
tags: [flatup, canon, pricing, schedule, rules, authoritative]
---

# FLATUP GYM 正本データ

> 出典: `src/generators/shared.ts`（FLATUP_INFO）, `src/safety/forbidden_actions.ts`,
> `AGENTS.md` ／取り込み日: 2026-06-24
> これは「正本＝AIが勝手に変えてはいけない事実」。料金改定時はコード側 `FLATUP_INFO` を直し、ここも更新する。

## 料金（FLATUP_INFO より）
- 初回体験: **500円**（`trialFirst`）
- 2回目以降ビジター: **3,000円**（`visitorSecond`）
- キッズ会費: **7,700円**（`priceKids`）
- 女性会費: **8,800円**（`priceWomen`）
- 男性会費: **9,900円**（`priceMen`）
- 入会金: **10,000円**（`joinFee`）

> 注意（履歴）: 以前は体験を「無料」と表記していたが、2026-06-13 に
> **「初回体験500円」に統一**された（`docs/HANDOFF_2026-06-13_line-pricing-cleanup.md`）。
> 「無料体験」は**使わない**。

## 持ち物・設備
- 持ち物: 動きやすい服・タオル・水（`bring`）
- 駐車場: 専用駐車場あり（`parking`）

## スケジュール / 体験予約の枠
- キッズ: 火曜・木曜 18:00、土曜 13:00（`scheduleKids`）
- レディース: 土曜 14:00（`scheduleLadies`）
- 男性の体験予約: 火曜・木曜・土曜（男性インストラクター在籍）、または平日19:00以降（`bookingMen`）
- 女性の体験予約: 月曜・水曜・土曜（`bookingWomen`）
- 体験不可: 日曜・祝日は原則体験不可（`noBooking`）

## OPENQLOW が物理的に禁止されている操作（forbidden_actions.ts）
違反するとプログラムが throw して止まる。理由付き:
- `send_to_customer_directly` … お客様への直接送信は AIKA と Jin の責任範囲
- `confirm_reservation` … 予約確定は Jin が行う
- `handle_complaint` … クレーム対応は AIKA が一次受付し Jin が判断
- `process_cancellation` … 退会処理は Jin が行う
- `modify_member_data` … 会員情報の変更は Jin が行う
- `send_apology` … 謝罪文は AIKA が一次案を作り Jin が承認・送信
- `change_pricing` … 料金変更は Jin の経営判断
- `issue_refund` … 返金処理は Jin の経営判断

## AI 共通の最重要ルール（AGENTS.md より要約）
1. 最終判断は必ず人間。送信・予約確定・料金・返金・退会・削除・本番反映・GitHub重要変更はオーナー承認後。
2. タスク開始時に記憶・Vault・既存ファイルを確認し根拠を示す。
3. AIKA＝守りの顧客対応 / OPENQLOW＝攻めの営業・経営支援。混同しない。
4. FLATUPらしさ＝「世界一やさしい格闘技ジム」。優しさ・安心感・清潔感・芯のある強さ。
5. APIキー・トークン・パスワード・個人情報をチャットや公開ファイルに出さない。
6. 日付・料金・予約・顧客情報は推測で断定しない。根拠が無ければ「推測」と明記。
7. LINEからの実操作は `/追記 {{本文}}` と明示的な `/push` のみ許可。
8. 危険操作の前に「対象・内容・リスク」を示し確認する。
9. 出力は日本語・結論ファースト・短く・中学生にも分かる表現。
10. 売上導線は「体験予約 → 入会 → 継続 → 口コミ → 紹介」を優先。
