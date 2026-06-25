---
type: source
title: "openqlow リポジトリ現状スナップショット (2026-06-24)"
source_url: ""
author: "openqlow リポジトリ（README.md / package.json / src 構成より）"
captured: 2026-06-24
kind: note
tags: [openqlow, snapshot, repo]
---

# openqlow リポジトリ現状スナップショット (2026-06-24)

> 出典: このリポジトリ自身（`README.md`, `package.json`, `src/` フォルダ構成）／取り込み日: 2026-06-24

## 概要（README より）
- OPENQLOW は FLATUP GYM の YouTube/SNS 集客のための「攻めの AI」。
- Phase 1 は**投稿も予約もしない**。3つの毎日アイデアを作り、媒体ごとの下書きに広げ、
  安全チェックをかけ、LINE 承認メッセージを送る/見せる、承認された下書きを保存するだけ。
- 設計方針: 生成のみ。自動送信なし。料金・スケジュールは正本値のみ使用。最終判断は人間。

## 主なコマンド（package.json scripts より）
- `npm run daily` … その日の承認レコードを作る
- `npm run dev -- generate / approve / revise / reject` … 生成・承認・修正・却下
- `npm run inquiry -- "<問い合わせ文>"` … 問い合わせへの返信案（AIKA口調）
- `npm run trial-followup` … 体験後フォロー4文（お礼/翌日/入会案内/口コミ依頼）
- `npm run ad-copy -- --segment <対象>` … 広告文（Google/Instagram/LINE）
- `npm run site-audit -- --file <html>` … サイトの改善チェック（6観点）
- `npm run crm -- ...` … 見込み客CRM（台帳・追客・日報・自己修復ログ）
- `npm run morning` / `reminder` / `daily:check` / `monitor` / `serve` … 定時処理・監視・webhook

## src フォルダ構成（ファイル数）
- adapters(7), approval(8), commands(10), conversation(6), crm(16), distribution(1),
  generators(15), line_bot(16), monitor(4), privacy(2), publish(36), safety(6),
  scheduler(8), sources(4), state(2), utils(6)
- 直下: `config.ts`, `index.ts`, `types.ts`

## デプロイ（deploy/）
- systemd タイマー/サービス（daily, daily-check, morning, reminder, monitor,
  crm-daily-report, webhook, cloudflared）
- nginx 設定（同一VPS用 / 専用VPS用）、VPS インストールスクリプト、launchd（mac organize-posts）

## 安全ルール（README "Safety Rules" より）
- 直接のSNS投稿なし／Typefully下書きのみ／Phase1は予約・公開ドラフトを物理的に拒否
- `OPENQLOW_ENABLE_PUBLIC_POSTING=true` は Phase1 で意図的に未対応
- Instagram/Threads はローカル下書きのみ／LINE承認は厳密な `OK <post-id>`
- APIキーは Git/Obsidian/README/ログに書かない
