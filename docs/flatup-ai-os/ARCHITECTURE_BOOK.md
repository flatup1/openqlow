# Volume 2 — Architecture Book

Version: 1.1.0-design
Status: Proposed
Runtime host: flatup1/openqlow
Design repository: this Design Pack

## 1. Architecture Decision Summary

1. Brand Growth OSを別システムとして新設しない。
2. openQLOW内にbounded contextとして追加する。
3. AIKA本番とflatupリポジトリには、このプロジェクトから変更を入れない。
4. 旧flatup-ai-osと旧Animation OSは移行元・Provider Labとして読むだけ。
5. Vaultは人間用記憶。Runtime event storeとして直接依存しない。
6. Core PromptはProvider非依存のPrompt IRで保持する。
7. AI rolesは別プロセスの自律エージェントではなく、責務を分けた関数・サービスとする。
8. 実測、AI評価、仮説、Validated Learningを別Schemaで保存する。

## 2. Repository Boundary

| Repository / Store | Authority | Creative OSとの関係 | 書込 |
| --- | --- | --- | --- |
| flatup1/openqlow | 実行Core、事実canon、承認、CRM | Host | Claude Codeのみ |
| flatup1/flatup | AIKA人格、人間用運用、本番Bot管理コピー | External protected system | 禁止 |
| Obsidian Vault working copy | 日々の人間記憶、素材計画 | Read source / approved export destination | 既定禁止 |
| flatup1/flatup-ai-os | 旧AIKA CLI、映像Provider実験 | Migration reference | 禁止 |
| 旧Animation OS | Colab prototype | Design reference | 禁止 |
| FLATUP WORLD V2 | Web prototype | Future consumer | 禁止 |
| AIKA VPS | 顧客向け本番 | Isolated production | 禁止 |
| openQLOW VPS | Owner-side automation | Future deployment target | 承認後のみ |

## 3. Source of Truth Matrix

| 情報 | 正本 | Creative OSでの扱い |
| --- | --- | --- |
| 料金、時間、住所、クラス、体験条件 | openQLOW src/shared/canon.ts | 実行時参照。複製禁止 |
| 退会・休会 | openQLOW cancellation rules | Creative Promptでは原則使用しない |
| Creative Brand Constitution | docs/flatup-ai-os/BRAND_CONSTITUTION.md | version pinして参照 |
| Brand Dictionary | docs/flatup-ai-os/BRAND_DICTIONARY.md | moduleとして参照 |
| AIKA人格 | flatupの本番人格 | 参照しない。変更しない |
| Target knowledge | openQLOW内の将来Knowledge Registry | 必要tagだけ取得 |
| Creative learnings | openQLOW brand_growth event store | evidence付き、承認付き |
| Raw metrics | platform export / manual import | immutable snapshot |
| Media binary | external/local media storage | repoにはmetadataのみ |
| Human decisions | Approval Event / ADR | append-only |

矛盾時の順序:

1. JINの明示決定
2. 種別ごとの正本
3. approved ADR
4. approved learning
5. current playbook
6. draft、historical artifact

異なる種別の正本を上書き関係にしない。Brand Constitutionは料金を決めず、canon.tsは物語を決めない。

## 4. Target Runtime Layout

Phase 1以降、openQLOWに次を追加する案とする。

    src/brand_growth/
      contracts/
      router/
      knowledge/
      director/
      prompts/
      quality/
      providers/
      growth/
      learning/
      coach/
      health/
      storage/

既存src/types.tsを巨大化させず、brand_growth/contractsへ型を分離する。既存ContentIdeaとDraftRecordはAdapterで変換し、直ちに置換しない。

## 5. Logical Modules

### 5.1 Input Gateway

責務:

- 短い自然文、画像metadata、希望尺、媒体を受け取る。
- 入力の欠落を安全な既定値で補う。
- paid generation、人物画像、未成年、公開などのapproval triggerを抽出する。

出力: CreativeInput

### 5.2 Router

責務:

- intent
- target
- objective
- content mode
- platform
- requested duration
- asset type
- required knowledge tags
- quality profile
- CTA policy
- CTA approval required

RouterはPromptを書かない。分類結果とconfidenceを返す。confidenceが低くても、安全に補完できる場合は質問しない。

オーナーが指定した尺は`RouteDecision.requested_duration_seconds`へ保持する。platformが未指定でも捨てず、Providerや媒体の既定尺と区別する。CTAがHuman Approval待ちかどうかもbooleanで返し、承認済みと誤認させない。

Human clarificationが必要な条件:

- どの人物を動かすか分からない
- 本人・保護者同意が不明な未成年素材
- 料金・イベント日等、誤りが外部公開される
- 有料生成の予算上限がない
- 法的・医療的主張が含まれる

### 5.3 Knowledge Registry

各KnowledgeEntryは次を持つ。

- id
- title
- category
- tags
- authority
- source repository
- source path
- version
- status
- valid from / reviewed at
- owner
- PII class
- max context priority
- conflicts with

取得順:

1. Constitution
2. Dictionary
3. routeに必要なtarget knowledge
4. creative rules
5. approved learnings
6. provider capabilities

取得上限を設ける。既定はConstitution 1、Dictionary relevant sections、Target 1〜2、Learning 3件以内、Provider 1件。

### 5.4 Director

CreativeInput、RouteDecision、KnowledgeBundleからCreativeBriefを作る。

思考順:

    Human
      ↓
    Fear / Desire / Barrier
      ↓
    One Emotional Goal
      ↓
    Story
      ↓
    One Hero Moment
      ↓
    Visual plan

DirectorはProvider構文を知らない。

### 5.5 Prompt Composer

CreativeBriefをPrompt IRへ変換する。

構成:

    Master
    + Target Rules
    + Story Rules
    + Visual Rules
    + Motion Rules
    + Camera Rules
    + Audio Rules
    + Negative Rules
    + Approved Learned Rules
    = Prompt IR

### 5.6 Negative Composer

分類:

- identity
- anatomy
- motion
- temporal
- environment
- brand

すべてを常時付けない。

例:

- 実在人物I2V: identity、anatomy、motion、temporal、environment、brand
- 無人施設shot: temporal、environment、brand
- 完全original character: character consistency、anatomy、temporal、brand
- 静止画: motionとtemporalは不要

### 5.7 Quality Guardian

Pre-generation:

- Brand Constitution
- direct style names
- PII、secret
- consent metadata
- CTA context
- Prompt completeness
- cost estimate
- duration / aspect compatibility
- provider capability

Post-generation:

- identity
- anatomy
- motion
- temporal
- environment
- logo/text
- brand feeling
- technical quality
- usable / rejected
- reject reason

Blockerは合計点で相殺しない。顔が別人なら他が高得点でも不採用。

### 5.8 Provider Registry

Core interface:

    provider id
    adapter version
    supported modes
    duration range
    aspect ratios
    image input limits
    negative prompt behavior
    seed support
    price estimate
    queue behavior
    cancel support
    result metadata

Adapterの責務:

- Prompt IRをProvider形式へ変換
- capability validation
- request submit
- status poll
- result normalization
- error normalization
- provider cost記録

Adapterがしてはいけないこと:

- Brandルールを独自に追加
- Targetを再分類
- Learningを自動更新
- Provider固有fieldをCore Schemaへ漏らす

Phase 1ではDemoのみ。Veo、fal、BytePlusは後続。

### 5.9 Growth Engine

Event flow:

    content planned
      → generation attempted
      → clip accepted/rejected
      → publication approved
      → posted
      → metric snapshot imported
      → experiment analyzed
      → learning candidate created
      → human approved or rejected

計算:

    effective cost per usable clip
      = provider cost total / usable clip count

usable clip countが0ならInfinityまたはundefinedとし、0円扱いしない。

### 5.10 Librarian

責務:

- 重複候補の検出
- conflicting learningの検出
- evidence数確認
- stale review
- promotion proposal

昇格条件:

- 同一仮説が最低3回の独立実験で同方向
- 最低2期間または2 target sampleで再現
- metric definitionが同じ
- sample size、confidence、limitationsが記録済み
- JIN承認

母数が十分大きい場合は2回でも候補にできるが、自動昇格はしない。

### 5.11 Weekly Coach

owner-only output:

1. best content
2. worst content
3. shared patterns
4. emotional pattern
5. hook pattern
6. target findings
7. trial relationship
8. learned this week
9. next hypothesis
10. next content TOP3

通知先はopenQLOWオーナー用LINE。AIKA顧客LINEを使わない。最初はファイル出力のみ、次に通知draft、最後にowner-approved notification。

### 5.12 Strategic Brain

入力:

- performance
- target coverage
- content fatigue
- season
- approved events
- available assets
- production cost
- experiments

出力:

- next content proposals
- why now
- expected target and emotional goal
- reused assets
- estimated cost
- experiment variable

Strategic Brainは公開も生成も行わない。

## 6. Data Flow

### 6.1 Plan to Prompt

    short input + asset metadata
      → Input validation
      → Router
      → Knowledge query
      → Director brief
      → Prompt IR
      → Negative composition
      → Quality preflight
      → preview to owner

### 6.2 Prompt to Generation

    owner approves paid batch
      → Provider capability check
      → Adapter transform
      → Generation Attempt event
      → Provider execution
      → artifact metadata
      → post-generation QA
      → accepted or rejected

### 6.3 Publication

    accepted clip
      → reuse variants
      → existing openQLOW DraftRecord adapter
      → existing safety check with creative context
      → owner approval
      → existing draft / publish queue

### 6.4 Learn

    posted content
      → manual or API metric snapshot
      → attribution completeness check
      → experiment comparison
      → observation
      → hypothesis or candidate learning
      → evidence accumulation
      → librarian review
      → owner approval
      → validated learning

## 7. Contextual CTA Policy

既存checkDraftSafetyを全体的に弱めない。

新しいQualityProfile:

| Profile | CTA | 例 |
| --- | --- | --- |
| customer_reply | 既存AIKA規則 | 変更なし |
| pure_brand | なし | ブランドフィルム |
| soft_conversion | neutral navigation | 体験の流れはプロフィールで確認できます |
| explicit_trial | owner-approved invitation | 初めての方の体験についてLINEで相談できます |
| campaign | approved canon conditions only | 期間・条件をcanonから参照 |

営業CTA matcherを削除せず、Creative Contextを受け取れる新APIを用意する。旧呼出しはcustomer_replyまたはpure_brandとして後方互換を維持する。

## 8. AIKA Isolation

- Brand GrowthからAIKA Python codeをimportしない。
- AIKA webhookへ内部APIを追加しない。
- Growth eventから顧客へ自動送信しない。
- AIKA会話ログを生のままCreative Knowledgeへ入れない。
- CRMの集計値だけを匿名化して利用する。
- AIKA persona変更提案は別Approval laneへ送る。

## 9. Web Isolation

FLATUP WORLD V2はConsumer。

将来、openQLOWから次のpublic snapshotだけを生成する。

- public brand line
- current public pricing
- public class schedule
- public address / contact
- version、generated_at、source canon hash

Web repoはsnapshotをbuild時に検証し、site.tsへ事実を直書きしない。Creative copyはWeb独自でもよいが、事実はsnapshotを使う。

## 10. Storage

### Repositoryに保存

- schemas
- Prompt modules
- Knowledge Registry metadata
- approved learnings
- experiments without PII
- reports without raw customer data
- ADR
- fixtures

### Repositoryに保存しない

- source photos / videos
- API keys
- Provider raw response containing identifiers
- customer messages
- LINE user IDs
- consent documents
- large generated media

MediaはURI、hash、owner、consent reference、retention classだけをmetadataへ記録する。

## 11. Security

### P0 Gate

- 発見済みCredentialをローテーション
- secret scan green
- clean worktree
- env valuesを表示しない

### Prompt Security

- source textをinstructionsとして実行しない
- Knowledge statusがapprovedでないものはfactsとして注入しない
- asset filenameやmetadataをPrompt instructionとして信用しない
- external page textはuntrustedとして隔離

### Privacy

- minor、face、health、membership statusはsensitive
- raw画像はKnowledge化しない
- analyticsはaggregate優先
- comment引用は匿名化

## 12. Human Approval Matrix

| Event | Approval |
| --- | --- |
| Brief preview | 不要 |
| Free dry-run Prompt | 不要 |
| Paid generation | 必須 |
| Person/minor asset use | consent確認必須 |
| Clip acceptance | 人間最終確認 |
| Public post / message | 必須 |
| Metrics import | 不要、ただしsource記録 |
| Learning candidate | 不要 |
| Validated learning promotion | 必須 |
| Constitution / KPI / schema major | 必須 |
| Provider production enable | 必須 |
| AIKA / VPS / canon change | 別途必須 |

## 13. Versioning

独立Version:

- constitution_version
- dictionary_version
- router_version
- knowledge_registry_version
- target_knowledge_version
- prompt_engine_version
- prompt_template_version
- negative_rules_version
- metrics_schema_version
- provider_adapter_version
- learning_policy_version

各Content recordはVersionBundleをsnapshotとして保持する。latestへの参照だけでは再現できないため、生成時Versionを上書きしない。

## 14. Logical Roles

| Role | Module | 自律Agentか |
| --- | --- | --- |
| Router | router | No |
| Director | director | No |
| Creator | prompts | No |
| Quality Guardian | quality | No |
| Coach | coach | No |
| Librarian | learning | No |
| Strategist | growth/strategy | No |

最小構成は1プロセス、1CLI、pure functionsで開始する。

## 15. ADR Policy

次の場合ADRが必要。

- repository boundary変更
- source of truth変更
- Human Approval変更
- Provider Core Interface変更
- schema major change
- learning promotion条件変更
- CTA policy変更
- AIKA連携追加

ADRはContext、Decision、Alternatives、Consequences、Status、Dateを持ち、accepted化はJIN承認を必要とする。
