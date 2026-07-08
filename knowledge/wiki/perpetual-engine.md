---
type: wiki
title: "永久機関（自己改善ラチェット）— 1つのGitHubに全部を統合する設計図"
tags: [architecture, vision, self-improvement, monorepo, roadmap]
created: 2026-06-25
updated: 2026-06-25
sources:
  - "[[../sources/20260625-line-ops-log-summary]]"
  - "[[../sources/20260625-aika-line-log-summary]]"
---

# 永久機関（自己改善ラチェット）

## 狙い（オーナーの言葉）
ログを取り込み → 学習 → **自己改善し続ける**第二の脳を **1つのGitHub** で管理する。
守りの **AIKA**・攻めの **OPENQLOW**・**flatup-ai-os** を統合し、品質が**下がらず上がり続ける**仕組みにする。

> 正直な定義: AIが勝手に24時間“独学”するのではなく、**人間確認つきで一周ごとに必ず良くなる“ラチェット（戻り止め）”**を作る。
> テストと採点ゲートが「下がらない壁」になり、知識(正本)が増えるほど賢くなる。

---

## しくみ（5ステップのループ）
```
        ┌──────────────────────────────────────────────┐
        │  ① 集める   LINEログ/日報/問い合わせ → sources/ │
        │  ② 整理     Claudeが正本・ウィキ化／矛盾検出     │
        │  ③ 採点     response_quality(4観点100点)＋運用採点 │
        │  ④ 直す     低い所を コード/正本/ポリシー に反映  │
        │            → テストで固定（二度と下がらない）    │
        │  ⑤ 戻る     次のログでまた①へ                   │
        └──────────────────────────────────────────────┘
```
- ③④で使う道具は**もう存在**する: [[kindest-ai-response-policy]] / `src/safety/response_quality.ts` / [[flatup-canonical-faq]] / [[ops-scorecard-2026-06]]。
- 各周回の成果は **git にコミット**されるので、履歴が「学習の記録」になる。

## なぜ“永久”に良くなるのか
1. **正本(canon)が一元化**＝同じ質問に違う答えが出ない（[[flatup-canonical-faq]]）。
2. **ゲートが門番**＝優しくない/矛盾/重複の返信は送る前に弾く（100点未満は修正提案）。
3. **テストが戻り止め**＝直した内容が将来壊れたら `npm test` が赤くなる。
4. **ログが燃料**＝使うほど sources が増え、賢くなる（[[second-brain]]）。

---

## 統合の形（モノレポ：1リポジトリに全部）
母体は中身が一番多い **`flatup1/openqlow`** を採用（将来 `flatup-os` 等へ改称も可）。
```
（目標構成）
flatup-os/
├── openqlow/    # 攻めAI（現 src/ を移動）
├── aika/        # 守りAI（flatup-ai-os を取り込み）
├── shared/      # 共通正本 FLATUP_CANON + 優しさゲート response_quality
├── knowledge/   # 第二の脳（sources / wiki / CLAUDE.md）★学習エンジン
└── docs/
```
- `shared/` を両AIが参照 → 正本もゲートも**1つ**。今 `port/aika/` にある自己完結版がその原型。

## ロードマップ（段階導入：壊さず進める）
- **Phase 0（完了）**: 第二の脳・正本確定・4観点ゲート・AIKA移植キット。
- **Phase 1（あなた）**: `flatup-ai-os` をGitHubへ push ＋ 本セッションに追加（私はここに手が届かない）。
- **Phase 2（私）**: openqlow に `aika/` として取り込み、`shared/`（FLATUP_CANON＋ゲート）を抽出、両AIを接続。テスト緑で固定。
- **Phase 3（私）**: ループ自動化（毎日のログ取り込み→採点→改善提案を定期実行）。
- **Phase 4（運用）**: 各周回をPRで人間確認 → マージ＝1段ずつ恒久的に改善。

## いま詰まっている唯一の所
**`flatup-ai-os`（AIKA本体）がGitHubに無い**＝私が触れない。これをGitHubに上げれば、残りは私が統合できる。
（参考: `flatup02-source/AIKAAPP` がAIKA本体の可能性あり→中身確認が必要）

## 関連
- [[second-brain]] — 学習エンジンの土台
- [[kindest-ai-response-policy]] / [[flatup-canonical-faq]] / [[24-7-operation-runbook]] — ③④の道具
- [[ops-scorecard-2026-06]] — 採点の基準
- [[aika-vs-openqlow]] — 守り/攻めの役割

## 出典
- [[../sources/20260625-line-ops-log-summary]] / [[../sources/20260625-aika-line-log-summary]]
