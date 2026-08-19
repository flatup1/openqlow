# ROADMAP — Phase 0〜4

**一度に全部作ることは禁止。** 常に「設計 → 最小実装 → テスト → 採点 → 改善 → 次のPhase」。

## Phase 0 — ドキュメント化 ✅

コードを書く前に、設計思想をリポジトリへ保存する。

完了条件:

- [x] North Starが文書化済み（VISION.md）
- [x] UX原則が文書化済み（PRINCIPLES.md）
- [x] RPG思想が文書化済み（USER_JOURNEY.md / DESIGN_SYSTEM.md）
- [x] パーソナライズ設計済み（PERSONALIZATION.md）
- [x] AI統合思想が文書化済み（AI_CONCIERGE.md）
- [x] XServer/VPS役割分担が記録済み（ARCHITECTURE.md）
- [x] Phase 1〜4ロードマップ作成済み（本ファイル）
- [x] AGENTS.md完成
- [x] 既存資産を壊していない（追加のみ）
- [x] secretsを含んでいない

## Phase 1 — MVP ✅

最初の完成品は、この一本が**スマートフォンで気持ちよく最後まで動く**こと:

```text
Welcome → Q1「今日は誰のために来ましたか？」→ 選択 → 回答をStateへ保存
→ Q2へ遷移 → 最低限の分岐 → 簡易パーソナライズ結果 → 体験予約CTA
```

AI本接続・LINE本接続・高度な3D・映画的演出・大規模管理画面は、この段階では実装しない。

作るもの（これだけ）:

1. トップ画面
2. 優しい導入
3. Q1
4. 回答をStateへ保存
5. 次の質問へ遷移
6. 最低限の分岐
7. 最終簡易結果
8. 体験予約CTA
9. AI API接続用interfaceだけ準備
10. 基本イベント計測

**Phase 1で意図的に作らないもの:**
高度な3D世界 / 大量の動画 / 複雑なAIエージェント / 会員管理 / CRM全面統合 /
大規模管理画面 / 高度なゲーミフィケーション / ポイントシステム / アバター育成 /
巨大DB / 不要なマイクロサービス

## Phase 2 — 拡張

Phase 1が完成・テスト済みになった後。追加候補:

- 全質問フロー（家族ルート・相談ルートの本実装）
- パーソナライズ強化（コンテンツ切替・口コミ切替・クラス推薦）
- VPS AI接続（実環境調査 → Concierge interface実装）
- LINE接続（コンテキスト引き継ぎ）
- 予約情報引継ぎ
- analytics強化（GA4等接続）
- 正本 `canon.ts` からのクラス・料金データ接続
- SEO用公開情報ページ

## Phase 3 — Cinematic WebOS

Phase 2の後に初めて検討:

3Dキャラクター / 3Dジム / スクロールシネマ / 実写×アニメ / AI動画 /
カメラワーク / 背景演出 / オリジナルBGM / インタラクティブ演出

**ただしCVR（体験予約到達率）を落とす場合は削除する。**

## Phase 4 — FLAT UP AI OS（構想）

```text
FLAT UP AI OS
│
├── WebOS
├── LINE
├── AIKA / AI Concierge
├── Booking
├── Customer Context
├── Analytics
├── Content System
└── Member Experience
```

WebOSは将来のFLAT UP AI OSの一部になる。拡張可能でありつつ過剰設計しない。

## 実行順のイメージ

```text
① GitHubに思想を保存 → ② Q1だけ動くWebOS → ③ 4〜5問まで拡張
→ ④ 人別ページ生成 → ⑤ VPSのAI接続 → ⑥ LINE連携
→ ⑦ データ改善 → ⑧ 最後に映画・3D化
```

一番お金のかかる3D・動画・大規模AI実装を最後に回し、
早い段階で実際に集客へ使える状態を作る（最短・最速・最低コストで最大効果）。

## 各Phase終了時の義務

- **TEST**: build / lint / typecheck / automated tests / mobile layout /
  major browser / console errors / broken links
- **採点（100点満点）**: UX / 優しさ / 分かりやすさ / スマホ操作性 / 表示速度 /
  保守性 / 予約導線 / ブランド整合 / セキュリティ / 完成度（各10点）。
  90点未満なら問題点を列挙し改善。採点のために不要な機能を追加しない。
- **報告**: DONE / CHANGED / TESTED / SCORE / KNOWN ISSUES / NEXT の6項目のみ。
  中学生でも理解できる日本語で。
