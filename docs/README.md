# docs/ の歩き方

> 文書が285本あります。**探す前にここを見れば、どこを読めばいいか3秒で決まります。**
> 作成: 2026-08-21（課題 C-4「文書の散らばり」への対応）

---

## まず1本だけ読むなら

**[`SYSTEM_BLUEPRINT.md`](SYSTEM_BLUEPRINT.md)** — プロジェクト全体の設計図。
何がどこにあるか、何が動いていて何が止まっているか、残作業と採点が1枚に入っています。

---

## 目的別の入口

| 知りたいこと | 読むファイル |
|---|---|
| 全体像・構成図・残作業 | [`SYSTEM_BLUEPRINT.md`](SYSTEM_BLUEPRINT.md) |
| AIが守るルール（憲法） | [`../AGENTS.md`](../AGENTS.md) / [`../CLAUDE.md`](../CLAUDE.md) |
| ClaudeとCodexの担当分担 | [`../COORDINATION.md`](../COORDINATION.md) |
| 料金・時間・住所などの事実 | [`../src/shared/canon.ts`](../src/shared/canon.ts)（**唯一の正本**） |
| 何をAIがやってよくて、何が人間の承認待ちか | [`ai-os/canon/approval_matrix.md`](ai-os/canon/approval_matrix.md) |
| Jinの構想の全文（最上位の仕様） | [`../OPENQLOW_HANDOFF.md`](../OPENQLOW_HANDOFF.md)（v3・正本） |
| 作りすぎないための判断基準 | [`SIMPLICITY.md`](SIMPLICITY.md) |
| いまの到達度と残りの穴 | [`STATUS_AND_GAPS.md`](STATUS_AND_GAPS.md) / [`REPOSITORY_SCORECARD.md`](REPOSITORY_SCORECARD.md) |
| 毎日の運用手順 | [`openqlow-7-day-operation.md`](openqlow-7-day-operation.md) |
| 退会対応（スタッフ向け） | [`WITHDRAWAL_STAFF_GUIDE.md`](WITHDRAWAL_STAFF_GUIDE.md) |

---

## 設計書の5系統（どれが何か）

同じ「設計書」でも系統が5つあります。**混ぜて読むと矛盾します。**

| 系統 | 場所 | 何のための書類か | 担当 |
|---|---|---|---|
| ① AI OS 共通基盤 | [`ai-os/`](ai-os/README.md) | Skill・正本の同期ビュー・承認境界。**AIが毎回参照する運用ルール** | Codex |
| ② Brand Growth Design Pack | [`flatup-ai-os/`](flatup-ai-os/README.md) | 映像・感情設計・Prompt合成の設計とADR 14本 | Codex（設計）→ Claude Code（実装） |
| ③ AIKA 安全資料 | [`canon/`](canon/00_FLATUP_AI_OS_CANON.md) | 接客の安全事例集・返信テンプレ・週次SOP・マスコット設定 | 共有 |
| ④ 実装スペック | [`superpowers/`](superpowers/) | 個別機能の設計と実装計画（日付つき） | 共有 |
| ⑤ 第二の脳 | [`../knowledge/`](../knowledge/README.md) | 用語・概念・外部知識のwiki | 共有 |

**矛盾したときの優先順位**

```text
1. src/shared/canon.ts            事実（料金・時間・住所）
2. AGENTS.md / CLAUDE.md          AIの憲法
3. COORDINATION.md                担当分担
4. docs/HANDOFF_*.md（最新3本）    直近の申し送り
5. 各系統の設計書
```

---

## 引き継ぎ書（HANDOFF）— 新しい順

**最新3本だけ読めば足ります。** 古いものは「なぜそうなったか」を調べるときの記録です。

| 日付 | ファイル | 主題 |
|---|---|---|
| 2026-08-19 | [`HANDOFF_20260819_claude→AI_flatup-webos-line-journey.md`](HANDOFF_20260819_claude→AI_flatup-webos-line-journey.md) | **WebOS ＋ WebOS→LINE引き継ぎ（現在ここで止まっている）** |
| 2026-08-17 | [`HANDOFF_20260817_JIN→AI_aika-bot-canon-sync.md`](HANDOFF_20260817_JIN→AI_aika-bot-canon-sync.md) | AIKA botの正本同期 |
| 2026-08-16 | [`HANDOFF_20260816_claude→codex_brand-growth-aika-line-integration.md`](HANDOFF_20260816_claude→codex_brand-growth-aika-line-integration.md) | Brand Growth と LINE の統合 |
| 2026-08-16 | [`HANDOFF_20260816_codex→claude.md`](HANDOFF_20260816_codex→claude.md) | Codex→Claude |
| 2026-08-09 | [`HANDOFF_2026-08-09_claude→codex_withdrawal-zero-v1.md`](HANDOFF_2026-08-09_claude→codex_withdrawal-zero-v1.md) | 退会トラブルゼロ化OS v1 |
| 2026-08-06 | [`HANDOFF_2026-08-06_claude→codex.md`](HANDOFF_2026-08-06_claude→codex.md) | — |
| 2026-07-10 | [`HANDOFF_2026-07-10_claude→codex_obsidian-iphone-sync.md`](HANDOFF_2026-07-10_claude→codex_obsidian-iphone-sync.md) / [`HANDOFF_2026-07-10_obsidian-iphone-sync.md`](HANDOFF_2026-07-10_obsidian-iphone-sync.md) | Obsidian iPhone同期 |
| 2026-07-09 | [`HANDOFF_2026-07-09_claude→codex.md`](HANDOFF_2026-07-09_claude→codex.md) | — |
| 2026-07-08 | [`HANDOFF_2026-07-08_claude→codex.md`](HANDOFF_2026-07-08_claude→codex.md) | — |
| 2026-06-13 | [`HANDOFF_2026-06-13_line-pricing-cleanup.md`](HANDOFF_2026-06-13_line-pricing-cleanup.md) | LINE料金表記の整理 |
| 2026-06-11 | [`HANDOFF_2026-06-11_claude→codex.md`](HANDOFF_2026-06-11_claude→codex.md) | CRMのLINE配線 |
| 2026-06-08 | [`HANDOFF_20260608_claude→codex.md`](HANDOFF_20260608_claude→codex.md) | — |
| 2026-06-07 | [`HANDOFF_20260607_claude→codex.md`](HANDOFF_20260607_claude→codex.md) / [`HANDOFF_20260607_codex→claude.md`](HANDOFF_20260607_codex→claude.md) / [`HANDOFF_20260607_codex→claude_v2.md`](HANDOFF_20260607_codex→claude_v2.md) | 初期の相互引き継ぎ |
| 日付なし | [`HANDOFF_brief_FLATUP集客エンジン.md`](HANDOFF_brief_FLATUP集客エンジン.md) | 集客エンジンの概要 |

新しい引き継ぎ書を作るときは [`templates/HANDOFF.md`](templates/HANDOFF.md) を使い、**この表の先頭に1行足してください**。

---

## 注意している重複

| 重複 | どちらが正本か |
|---|---|
| `/OPENQLOW_HANDOFF.md` と `/docs/OPENQLOW_HANDOFF.md` | **直下のv3が正本**。docs側は要約版（冒頭に明記済み） |
| `src/shared/canon.ts` と `docs/ai-os/canon/*.md` | **TypeScriptが正本**。docs側は人が読む同期ビュー（CIで機械照合） |
| `src/shared/canon.ts` と `port/aika/flatup_canon.ts` | **src側が正本**。port側は配布用の複製（同期テストあり） |
| `src/safety/response_quality.ts` と `src/shared/response_quality.ts` | **shared側が実装**。safety側は互換シム（再エクスポートのみ） |

---

## 映像・ブランド系（コードとは別系統）

`brand-film-ep01/` `brand-film-ep09〜13/` `brand-film-series/` `gymstorys/` `girl-power-op/`
`FLATUP_GYM_ANIME_ART_BIBLE.md` — 制作用の企画書と設定資料です。CIの検証対象外です。
入口は [`../brand-film-series/00_SERIES_MASTER_CONTEXT.md`](../brand-film-series/00_SERIES_MASTER_CONTEXT.md)。
