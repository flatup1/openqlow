# Gap Analysis

基準: FLATUP GYM AI OS Design Pack v1.0要求
判定: Exists / Partial / Missing / Conflicting / Deprecated candidate

## Exists

- 人間の最終決定権
- AIKAとopenQLOWの役割分離
- 事実のSingle Source of Truth
- 投稿・送信・料金・本番反映の承認ゲート
- PIIと禁止操作
- ブランドの優しさ、安心、初心者中心
- Story / Psychology / Worldviewの既存資料
- 子どもと親の二層構造
- Hero Momentと1カット1動作
- Image-to-Videoの基本的なidentity preservation
- 一変数A/Bテスト
- 体験予約 → 入会 → 継続 → 口コミ → 紹介のKPI
- オーナー向けLINE通知と定期ジョブ

## Partial

| 要求 | 現状 | 必要な補完 |
| --- | --- | --- |
| 短文自動振分 | コマンドルーターと固定audienceのみ | Intent、Target、Objective、Platform、Asset判定 |
| 必要Knowledgeだけ取得 | 固定上位3件または旧data 6件一括 | tag、priority、version、max token付きRegistry |
| Prompt Library | 作品単位・Provider単位の孤立Prompt | Provider非依存Prompt IRとmodule composition |
| Negative Prompt | 巨大固定文字列 | Identity等6分類の条件付き合成 |
| Provider Adapter | Veo interface、Seedance分岐 | Registry、Capabilities、Cost、Error taxonomy |
| Image-to-Video QA | Promptで維持を指示 | preflight、post-QA、reject reason、usable判定 |
| Growth Engine | pending metrics placeholder | 実測snapshot、attribution、conversion、cost |
| Weekly Coach | 売上週次資料と朝ブリーフ | content専用TOP3、仮説、owner-only通知 |
| Health Check | 接続・systemd中心 | Knowledge、Prompt、Learning、境界、Version |
| Mobile | animation-studio Web UI | short input、写真、one-tap brief、履歴・費用 |

## Missing

- Creative Input Contract
- Target / Intent Router
- Creative BriefとEmotional Goal
- Brand ConstitutionとBrand Dictionaryのproject-local正本
- Prompt IR
- Negative Composer
- Content、Generation、Publication、Metricの統合Schema
- effective cost per usable clip
- Happiness / Emotional Scoreと実測値の明確な分離
- Experiment lifecycle
- observation → hypothesis → validated learningの昇格
- failed_hypotheses、anti_patterns、target_insights
- Learning evidenceと再現回数
- Prompt、Constitution、Target Knowledge、Providerの独立Version
- Creative Governance Health Check
- ADR運用
- 今回のAcceptance Tests

## Conflicting

### C1 CTA

現行openQLOWは営業CTAを一律blockする。新要件は体験予約を最終KPIとする。

解決: 顧客返信の禁止は維持し、Creative Contentだけにcontextual CTA policyを導入する。Pure BrandはCTAなし、Trial Objectiveは承認済みsoft navigationのみ、煽り・限定・恐怖・押し売りは常に禁止。

### C2 CodexとClaude Code

既存COORDINATIONは領域別にCodex実装を許す。新要件はCodex設計、Claude Code実装。

解決: 本プロジェクトでは新しいADRが優先。CodexはDesign Packと設計レビューのみ。実コード変更はClaude Code。

### C3 ブランドline

既存には世界一優しい、世界一やさしい、太陽のジムがある。新要件は世界一初心者に優しい格闘技ジム。

解決: Design PackのCreative Constitutionでは新要件を採用する。既存canon、Web、AIKAへの反映は別Human Approvalとmigration testが必要。

### C4 事実の重複

Web、旧AI OS、Campaign文書、AIKAコードに料金・時間等が重複する。

解決: 新モジュールには事実を書かない。Prompt出力時にcanon referenceを注入し、Webにはpublic-safe snapshotを生成する。

### C5 作風名

複数Promptに特定スタジオ名がある。

解決: 新Prompt Engineはvisual attributeへ分解し、style-name scannerをblockerにする。既存作品は移行対象だが自動書換しない。

### C6 Learningの意味

既存loopは問い合わせ返信のsynthetic scoreを自己改善と呼ぶ。新要件は実コンテンツ成果からの学習。

解決: 既存loopを改名・変更せず、brand_growth/growthを別bounded contextにする。

## Deprecated candidates

削除はしない。現行判断から外す候補。

- 98点、100点とする旧STATUS文書
- flatup-ai-osをAIKA本番と書く旧資料
- 大量削除状態のworktree
- 旧Animation OSの固定Provider runtime
- 作品単位の巨大Negative Promptを全体正本として使うこと
- 特定スタジオ名入りPrompt
- FLATUP WORLD V2内の事実直書き
- Git管理外のHelMES文書を直接runtime参照すること
- Credentialを含む旧ブリーフィング

## 実装優先順位

1. P0 Credential rotationとclean worktree
2. Constitution、Repository Boundary、AGENTS/COORDINATION
3. Schemaとpure Router
4. Knowledge Registry
5. Creative BriefとPrompt IR
6. Quality Guard
7. Manual metrics、Experiment、Learning
8. Weekly Coach
9. Demo Provider
10. Paid Provider、mobile UI、外部metrics
