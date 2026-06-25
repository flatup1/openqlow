---
type: wiki
title: "🧠 知識ベース 目次 (Index / Map of Content)"
tags: [index, moc]
created: 2026-06-24
updated: 2026-06-24
---

# 🧠 知識ベース 目次 (Map of Content)

この第二の脳の入口。主要なウィキページへの地図です。新しい主要トピックができたらここに追加します。

## このプロジェクト (OPENQLOW) を中学生にもわかるように
- [[openqlow-overview]] — ⭐ まずここ：OPENQLOWってなに？（ぜんたい地図）
- [[openqlow-what-it-does]] — できること一覧（6グループ）
- [[openqlow-parts-map]] — 部品の地図（src フォルダ＝なに係？）
- [[openqlow-safety-rules]] — まもるルール（安全のやくそく）
- [[openqlow-glossary]] — 言葉じてん（むずかしい用語をやさしく）

## 全体構想
- [[perpetual-engine]] — ⭐ 永久機関：ログで自己改善し続ける第二の脳を1つのGitHubに統合する設計図
- [[100-point-roadmap]] — 100点AIに必要なこと全部（認証・APIキー・サーバー・私の可否）
- `docs/PERPETUAL_ENGINE_REQUIREMENTS.md` — ⭐ Codex着工用の正確な要件指示書（採点＋設計判断＋受け入れ基準R1〜R10）

## 世界一優しい回答システム（4観点・100点）
- [[kindest-ai-response-policy]] — ⭐ 出す前の4観点チェック（寄り添い/不自然さ/重複/優しさ）
- [[flatup-canonical-faq]] — 答えをブレさせない単一正本（料金/予定/クラス/住所）
- [[24-7-operation-runbook]] — 24時間止めないための設定
- 実装＝ `src/safety/response_quality.ts`（+テスト。理想返信=100点 / NG例=reject）

## 正本・運用（AIの回答精度の土台）
- [[ops-scorecard-2026-06]] — ⭐ 運用採点 2026-06（OPENQLOW 65点 / AIKA 64点）
- [[aika-vs-openqlow]] — 守り(AIKA)と攻め(OPENQLOW)の役割分担
- [[forbidden-actions]] — 禁止行為（人間が決めること）
- 正本データ → [[../sources/20260624-flatup-canon-facts|料金・スケジュール・コア原則]]
- ドキュメント全カタログ → [[../sources/20260624-docs-catalog|docs/ の地図]]

## 仕組み・方法論
- [[second-brain]] — AIで“第二の脳”を作る考え方
- [[wiki-three-structures]] — ソース / ウィキ / CLAUDE.md の3構造
- [[claude-code-as-librarian]] — 取り込み→整理→想起の運用
- [[obsidian-vault]] — Obsidian Vault としての置き場所

## 人物
- [[andrej-karpathy]] — アイデアの発信元

---

## 使い方の早見
1. `sources/` に入れる or チャットに貼る
2. 「これを分析して整理して」
3. 「〇〇について保存した情報を教えて」

> 詳しい運用ルールは [[../CLAUDE|CLAUDE.md]] を参照。
