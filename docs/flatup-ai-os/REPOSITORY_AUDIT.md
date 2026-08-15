# Repository Audit

Status: Complete for locally available repositories
Audit date: 2026-08-14
Rule: Read only. No audited repository was modified.

## 1. 監査範囲

ローカルで確認できたFLATUP関連のGitリポジトリ、worktree、知識保管庫、映像・Web試作を横断した。

### A. openQLOW系

| 場所 | 状態 | 判定 |
| --- | --- | --- |
| /Users/jin/Documents/Codex/2026-08-12/codex-claude-code-ai-flat-up/worktrees/openqlow | clean、HEAD 57b79e9、Desktop本体より1コミット新しい | 監査基準。将来の実装先候補 |
| /Users/jin/Desktop/OPENQLOW HelMES/openqlow | HEAD 224e2f7、21変更、knowledgeの削除を含む | 現在は実装禁止 |
| 2026-07-18 openqlow-repo | clean、HEAD 445e7c2、上記の祖先 | 履歴参照のみ |
| openqlow-review、各分離worktree | 大量削除・未追跡が混在 | 使用禁止 |

openQLOWには次が存在する。

- src/shared/canon.ts: 料金・住所・時間・クラス等の機械正本
- src/safety、src/shared/response_quality.ts: 禁止操作、優しさ、返信品質
- src/approval、src/state、src/adapters: 承認、状態、Vaultログ
- src/line_bot: openQLOWオーナー向けLINE入口
- src/crm: 問い合わせ、体験、入会前後の営業支援
- src/loop: 問い合わせ返信の代表ケース採点と改善提案
- src/monitor: サービス・インフラHealth Check
- animation-studio: Image-to-Video UIとVeo/Demo Provider
- docs/ai-os、docs/canon: 既存AI OSと正本・運用資料
- brand-film、gymstorys、Animation Bible: 感情・物語・映像の高品質な既存資産

### B. flatup

| 場所 | 状態 | 判定 |
| --- | --- | --- |
| /Users/jin/Desktop/0806/flatup | clean、HEAD c3598b6、98 tests pass | AIKAとVaultの安全な参照スナップショット |
| /Users/jin/Documents/Obsidian Vault | HEAD 20444a2、originと分岐、30変更 | 人間用記憶。自動書換禁止 |

flatupにはAIKA本番人格、LINE Botの管理コピー、体験受付、入会同意、CRM配信、PII、VPS運用資料がある。AIKA本番は別VPSで動き、openQLOWとは別の顧客向け境界を持つ。

テスト結果:

- Python test suite: 98件成功
- ResourceWarningとしてSQLite接続未closeが多数発生。成功を妨げないが品質負債
- 実VPS状態や実LINE接続は今回未確認

### C. flatup-ai-os

| 場所 | 状態 | 判定 |
| --- | --- | --- |
| /Users/jin/Desktop/0806/flatup-ai-os | clean、HEAD 8690a37 | 旧実行エンジン・映像Provider実験の参照元 |
| /Users/jin/Desktop/OPENQLOW HelMES/flatup-ai-os | Git object不整合 | 使用禁止 |

clean版にはAIKA下書きCLI、fal.ai / BytePlus Seedance接続、Image-to-Video、character reference、リール生成、使用量ログがある。一方、Provider固有処理とPromptが密結合し、特定スタジオ名を含む表現も残る。

テスト結果:

- node_modules未導入のためtscが見つからず未検証
- これはコード不合格ではなく、環境未構築
- 新規実装先にはせず、Adapter移植時の参照コードとする

### D. 旧Animation OS

場所: /Users/jin/Documents/Codex/2026-07-18/https-drive-google-com-file-d

Colab 10段階、original character、Image-to-Video、1カット1動作、課金API既定OFF等の有用な設計がある。一方、固定4シーン、巨大Negative Prompt、固定Provider・モデル構成であり、現行Coreにはしない。

### E. FLATUP WORLD V2

場所: /Users/jin/Documents/Codex/2026-08-12/files-mentioned-by-the-user-codex

- 本番未公開のWeb試作
- Gitはunbornで全ファイル未追跡
- 料金、時間、住所、LINE URL等をapp/content/site.tsへ直書き
- READMEが参照するoutputs設計資料は同コピーに存在しない
- Cloudflare hosting設定はDB/R2未接続

したがってWebはCreative OSの正本ではなく、将来public-safe canon snapshotを受け取るConsumerとする。

### F. HelMES直下の非Git文書

/Users/jin/Desktop/OPENQLOW HelMES/docsにOPENQLOW_RULES.md、CAMPAIGN_RULES.md、LINE_COMMAND_POLICY.md、SAFETY_ESCALATION.mdが存在した。openQLOWのAGENTS.mdが参照するAIKA_RULES.mdは見つからなかった。

これらは有用だが非Gitのため、現状のまま正本にしない。オーナー確認後、既存canonまたはDesign Packから参照できる正式な場所へ移す。

## 2. 重大な発見

### P0: 平文Credential

/Users/jin/Desktop/GYM</exbrain/FLATUP_AI_OS_briefing.mdに、本番相当と判断できる複数の認証情報が平文で記載されている。

設計上の処置:

1. この文書をKnowledge入力から永久除外する。
2. LINE、OpenRouter、VPS等の該当資格情報をローテーションする。
3. ローテーション完了までProduction Integration Phaseを開始しない。
4. 秘密値はログ、設計書、Issue、Promptへ転記しない。
5. Git履歴とアーカイブをファイル名だけでなくsecret scannerで検査する。

今回、削除・ローテーション・外部操作は行っていない。

### P0: 実装元の不一致

Desktop openQLOW本体と複数worktreeには削除・未追跡差分がある。Claude Codeはこれらで実装してはならない。最新remoteを確認したclean worktreeを新設し、57b79e9相当以上を基準にする。

### P1: 正本参照の欠落

- VaultのAGENTS.mdは存在しないユーザー全体設定 ~/.claude/CLAUDE.md を憲法正本として参照する。
- openQLOW AGENTS.mdのAIKA_RULES.mdは見つからない。
- OPENQLOW_RULES.mdとCAMPAIGN_RULES.mdはリポジトリ外にある。

新しいCreative OSは外部の存在しないファイルへ依存せず、Project-local Constitutionを持つ。

## 3. 再利用するもの

| 既存資産 | 再利用方法 |
| --- | --- |
| openQLOW canon.ts | 全事実の唯一の入力 |
| forbidden_actions / approval | Human Approvalと外部書込停止 |
| line_bot owner channel | Weekly Coach通知。顧客AIKAには使わない |
| CRM funnel | LINE追加後の体験・入会結果と連結 |
| vault_register | Event形式へ拡張する際の互換Adapter |
| animation-studio UI | Phase 6でmobile creative UIへ拡張 |
| VideoProvider | 新Provider Registryの最小原型 |
| flatup-ai-os Seedance実装 | Provider固有Adapterの移植参考 |
| Brand Film / gymstorys | Story、二層構造、Hero Moment、A/B試験 |
| Existing systemd timers | Weekly CoachとHealth Checkの実行基盤 |
| PII / secret guard tests | Creative metadataとKnowledgeにも拡張 |

## 4. 変更してはいけないもの

- AIKA本番人格、顧客返信、予約・入会フロー
- flatupリポジトリとObsidian Vaultの既存差分
- openQLOWのcanon値
- 既存禁止操作と顧客向け安全ゲート
- 旧リポジトリの履歴と生成物
- 公開・送信・課金・VPS操作

## 5. 監査の結論

新OSを作る余地ではなく、既存openQLOWに不足するCreative Brief、Prompt IR、Provider Adapter、Content Metrics、Learning Governanceを追加する余地がある。AIKA、Vault、旧AI OS、Web、Animation OSを統合先にしないことが競合回避の中心である。
