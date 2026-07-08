---
type: wiki
title: "禁止行為（OPENQLOW が侵してはいけない領域）"
tags: [openqlow, safety, forbidden]
created: 2026-06-25
updated: 2026-06-25
sources:
  - "[[../sources/20260624-flatup-canon-facts]]"
---

# 禁止行為（OPENQLOW が侵してはいけない領域）

## 要点
コード(`src/safety/forbidden_actions.ts`)が**物理的に禁止**している操作。違反すると throw して停止する。
「AIKAの仕事（接客）」「Jinの仕事（最終判断）」を実装レベルで守る。

## 禁止される8つの操作
| 操作 | なぜ禁止か |
| --- | --- |
| お客様への直接送信 | AIKA と Jin の責任範囲 |
| 予約確定 | Jin が行う |
| クレーム対応 | AIKA が一次受付し Jin が判断 |
| 退会処理 | Jin が行う |
| 会員情報の変更 | Jin が行う |
| 謝罪文の送信 | AIKA が一次案、Jin が承認・送信 |
| 料金変更 | Jin の経営判断 |
| 返金処理 | Jin の経営判断 |

## 関連
- [[aika-vs-openqlow]] — 役割分担
- [[openqlow-safety-rules]] — やさしい言葉での安全ルール
- [[ops-scorecard-2026-06]] — 運用での順守状況（概ね順守）

## 出典
- [[../sources/20260624-flatup-canon-facts]]
