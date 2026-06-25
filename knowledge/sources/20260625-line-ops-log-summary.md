---
type: source
title: "OPENQLOW LINE 運用ログ 要約（2026-01〜06）※個人情報は匿名化"
source_url: ""
author: "FLATUP GYM 公式LINE（OPENQLOW Bot ⇄ オーナー）トーク履歴"
captured: 2026-06-25
kind: note
tags: [openqlow, operations, line, log, evaluation, privacy-redacted]
---

# OPENQLOW LINE 運用ログ 要約（2026-01〜06）

> 出典: 「会員200人目標」LINEアカウントのトーク履歴（OPENQLOW Bot とオーナーのやり取り、約5か月分）。
> **プライバシー方針により会員の実名・lineUserId・ペアリングコード等は本ノートに転記しない**（AGENTS.md 規則5に従う）。
> ここには「システム挙動の事実」だけを残す。

## 期間と稼働
- 2026-01-28 友だち追加 → 5-18 頃まで応答不能（"access not configured" / "No API provider registered for openrouter"）。
- 5-18〜19 復旧。以降ほぼ毎日 **05:15 に投稿候補3件**、**07:00 / 08:00 に朝の日報プロンプト**が自動配信。
- 6-16 頃から Threads 自動投稿が成立。6-22 以降は facebook / instagram も自動投稿（一部APIエラーあり）。

## 機能の成立度（事実ベース）
- **投稿生成**: 毎日3件、優しさスコア 24〜25/25、安全チェックOKで安定生成。
- **承認フロー**: `OK FG-YYYYMMDD-NNN` で approved → 下書き保存／Threads投稿。`all/threads/google/voom` の媒体指定も後日追加。
- **日報/記憶係**: `/昨日の記録` `/おはよう` `/日報` `/メモ` 等で聞き取り→Obsidian保存。1問ずつ式とまとめ式の両方。
- **投稿準備パネル**: `state/publish_assist/<ID>.html` を生成し、Google/LINE VOOM は手動投稿。

## 観測された不具合・摩擦（重要）
1. **コマンド認識の脆さ（最頻発）**: 素の「ok」や日報のまとめ回答が頻繁に "No approval command found" / "まとめ回答として読み取れませんでした" で弾かれる。オーナーが正しい書式を何度も探る場面が多数。
2. **日報コマンドの不安定**: `/日報まとめ` `日報 まとめ` `日報まとめ` で挙動が割れる。入口が複数（/昨日の記録・/おはよう・/日報・Daily Check）あり重複・混乱。
3. **修正(revision)の不安定**: 「もっと優しく」等が効く時と、日報ハンドラに誤ルーティングされる時、OpenRouter 401/エラーで失敗する時がある。
4. **インフラ系**: healthcheck で ngrok/launchd/line_webhook の fetch failed が頻発。git push 失敗（not a git repository / dubious ownership / sparse-checkout）。state ファイルへの EACCES。OpenRouter 401 "User not found"。
5. **安全フィルタの誤検知**: 投稿ID "0260616-904" を phone_japanese と誤判定し保存をブロック。
6. **正本未整合の販促表現**: 生成文に「親子割 月-¥500」「紹介バンテージ」等、正本(FLATUP_INFO)に無いオファーが登場（5-23頃まで "正本参照: 未設定"）。実在オファーか要確認。
7. **知識Q&Aができない**: 6-07 にオーナーが「canon_2026.md を読み込んだか確認」(北極星コピー/親子割の兄弟ペア)を質問 → Bot は答えず "No approval command found"。**保存知識に基づく回答機能が無い**ことが露呈。

## コンテンツ傾向
- テンプレ3〜4種（「弱い自分と戦う人へ」「親が安心できるキッズ」「女性が安心して始める」、後に「太陽のジム」「UIZIN初陣」「親子割」「紹介」）を数週間ローテ。**多様性が低く反復が多い**。
- ブランド（世界一優しい/太陽のジム/怒鳴らない/初心者・女性・キッズ）は一貫して保持。
