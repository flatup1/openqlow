# Volume 3 — Implementation Book

Version: 1.4.0-design
Audience: Claude Code
Constraint: Design first, implementation after explicit handoff

## 1. Implementation Strategy

Big bangで作らない。既存openQLOWにpure functionsとappend-only metadataを加え、外部接続は最後にする。

実装の原則:

- 新規bounded context
- minimal edits
- backward compatible
- external side effects off by default
- acceptance tests first
- one Phase per change set
- root test suite always green

## 2. Preflight Phase

開始条件:

- 最新remoteを確認したclean openQLOW worktree
- P0 Credential rotation完了
- Design PackをopenQLOWのdocs/flatup-ai-osへ取り込む方針をJIN承認
- Codex設計、Claude Code実装のproject ruleをAGENTS / COORDINATIONへ追記
- baseline npm test green

Preflightではruntime codeを書かない。

## 3. Phase 1 — Contracts and Router

Goal: 短い入力を決定論的にCreativeBrief直前まで変換する。

Add:

    src/brand_growth/contracts/
    src/brand_growth/router/
    src/brand_growth/fixtures/
    src/brand_growth/index.ts

Suggested files:

- contracts/creative_input.ts
- contracts/route_decision.ts
- contracts/version_bundle.ts
- router/classify_intent.ts
- router/classify_target.ts
- router/classify_objective.ts
- router/normalize_input.ts
- router/lexicon.ts
- router/select_profile.ts
- router/defaults.ts
- router/route.ts
- fixtures/acceptance_inputs.ts

Do not modify:

- src/types.ts except a narrow export if unavoidable
- existing generators
- safety policy
- LINE webhook

Tests:

- AT-001〜009、AT-025、AT-026、AT-046、AT-047、AT-048
- deterministic output
- target always present
- clarification only when required
- no file/network access
- structured duration hint > raw text duration > null
- platform未指定でも明示尺を`requested_duration_seconds`へ保持
- top-level durationとPlatformPlan durationは不一致にならない
- invalid durationは例外や追加質問ではなくnullとassumption
- CTAがHuman Approval待ちなら`cta_approval_required=true`
- 42件以上のtable-driven paraphrase / edge fixture
- negation、word-boundary false-positive、hint precedence、reproducibilityのnegative control

Rollback: delete new directory and package script/export only.

## 4. Phase 2 — Knowledge Registry

Goal: 必要なKnowledgeだけを取得する。

Add:

    src/brand_growth/knowledge/
      registry.ts
      query.ts
      precedence.ts
      conflict.ts
      token_budget.ts

Design artifacts:

- registry manifest
- approved local source mappings
- quarantined sources

Rules:

- source fileをコピーしない
- path、hash、versionを登録
- missing、stale、conflictedを明示
- Vault unavailableでもConstitutionとlocal target knowledgeでdry-runできる

Tests:

- required tag only
- maximum result count
- conflicted entries withheld
- quarantined credential document never selected
- external missing source fails safe
- manifest missing Constitution blocks without fabricated hash
- metadata contract rejects source body fields
- six negative controls prove conflict、quarantine、global load、token protection layers are not vacuous

## 5. Phase 3 — Director and Prompt IR

Goal: 人間→感情→物語→映像の構造を作る。

Add:

    src/brand_growth/director/
    src/brand_growth/prompts/

Files:

- director/build_brief.ts
- director/emotional_arc.ts
- director/hero_moment.ts
- director/two_layer.ts
- prompts/prompt_ir.ts
- prompts/compose.ts
- prompts/negative_compose.ts
- prompts/style_name_guard.ts
- prompts/render_preview.ts

Tests:

- emotional goal exactly one
- Hero Moment exactly one
- Kids two-layer required
- Provider syntax absent
- style names blocked
- selective negative categories
- prompt version trace

No LLM required for acceptance. まずrule-based fixtureで完成させる。LLM利用は後から同じcontractに差し替え可能。

Implementation status (isolated Claude Code branch, 2026-08-16):

- commit `fcdb1b6`でrule-based Director、CreativeBrief、Prompt IR、selective Negative、style guard、render preview / output packageを実装済み。
- blocked KnowledgeはBrief / Promptを作らず安全停止する。
- AT-010〜016、AT-037、AT-046、AT-050相当、8種のnegative control、typecheck、root tests、両validatorがPASS。
- protected 19 areasは差分0。Provider、API、Vault、LLM、AIKA、LINE、本番への接続は0。
- commit `fcdb1b6`はpush済み。Design Packは同branchへdocs-only commitで統合するが、本番には未統合。

## 6. Phase 4 — Quality Guardian and Growth Metadata

Goal: 生成前検査とContent lifecycleを保存する。

Add:

    src/brand_growth/quality/
    src/brand_growth/storage/
    src/brand_growth/growth/

Storage:

- local JSONLまたは既存file store pattern
- append-only
- repository外runtime data directory
- testsはtemporary directory

Implement:

- preflight QA
- post-QA contract
- cost calculation
- manual metric import
- experiment comparison
- predicted score separation

Do not implement:

- auto platform scraping
- external analytics API
- automatic publication

## 7. Phase 5 — Learning and Weekly Coach

Goal: 結果を再利用可能なKnowledge candidateへ変える。

Add:

    src/brand_growth/learning/
    src/brand_growth/coach/
    src/brand_growth/health/

Implement:

- observations
- hypotheses
- failed hypotheses
- candidate promotion
- evidence count
- duplicate/conflict detection
- weekly report file output
- owner notification draft

Do not:

- auto-approve learning
- write to AIKA persona
- write raw customer data to Vault
- send LINE in unit/integration test

## 8. Phase 6 — Demo Provider

Goal: CoreとProviderを接続するが、課金しない。

Add:

    src/brand_growth/providers/
      provider.ts
      registry.ts
      capabilities.ts
      errors.ts
      demo_adapter.ts

Existing animation-studioのDemo providerをAdapter契約へ合わせる。Coreからanimation-studioを直接importしない。共有contractをopenQLOW側に置き、UI側が利用する。

Tests:

- capability mismatch
- duration normalization
- normalized errors
- immutable VersionBundle
- no credential needed

## 9. Phase 7 — Existing Provider Migration

候補:

1. Veo adapter from animation-studio
2. fal adapter from flatup-ai-os
3. BytePlus adapter from flatup-ai-os

各Providerは個別Phaseとする。

Requirements:

- official current API確認
- sandbox credential
- dry-run
- budget limit
- cancellation / timeout
- cost capture
- contract tests
- owner production enable

旧コードをコピーして終わりにしない。Prompt、Provider、download、batch、cost、errorを分離する。

## 10. Phase 8 — Existing Publication Adapter

Goal: accepted contentを既存DraftRecord / publish queueへ渡す。

Add an anti-corruption adapter:

    BrandGrowth ContentRecord
      → Existing ContentIdea / PlatformDraft / DraftRecord

CTA policyはcreative contextで検査する。既存callersの挙動を変更しない。

Tests:

- old checkDraftSafety behavior unchanged
- customer reply CTA remains blocked
- soft conversion allowed only with approved profile
- postedとdraft_savedを混同しない

## 11. Phase 9 — Mobile UI

animation-studioを置換せず拡張する。

Minimum UI:

- image upload
- one-line request
- target / objective inferred preview
- assumptions
- cost estimate
- Prompt preview
- approve paid batch
- generation status
- accept / reject reason
- reuse variants

Advanced camera settingsは折りたたむ。ユーザーに毎回入力させない。

## 12. Phase 10 — Metrics Connectors

手入力とCSV importが安定してから、platform APIを追加する。

ConnectorはMetricSnapshotだけを返す。Growth Engineへplatform raw schemaを漏らさない。

## 13. Compatibility

- Existing ContentIdea、DraftRecordを削除しない。
- Existing loopを変更しない。
- Existing safety entrypointのsignatureを壊さない。
- Existing animation-studio APIをPhase 9まで維持する。
- Environment variablesは既定OFF。
- New scheduled jobsはinstall scriptへ自動追加しない。

## 14. Test Strategy

Layers:

1. Contract tests
2. Pure unit tests
3. Golden fixture tests
4. File storage tests in temp directory
5. Adapter contract tests
6. Existing root regression
7. Manual mobile QA
8. Paid provider smoke test with owner approval

Required commands are decided by implementation, but root npm testとDesign Pack acceptance mappingは必須。

Phase 3の最低command set:

- `npm run test:brand-growth`
- `npm run typecheck`
- `npm test`
- `./scripts/validate-ai-os.sh`
- `./scripts/validate-ai-os.test.sh`
- protected area diff check
- secret / PII / canon literal / Provider endpoint scan

## 15. Migration

- Existing prompt files remain historical.
- 新PromptはPrompt IRから生成。
- 既存成功PromptはKnowledge Registryへapproved_referenceとして登録。
- direct style namesを含むPromptはquarantinedまたはmigration_required。
- 既存metrics pendingは0へ変換せず、unknownとしてimport。
- 旧flatup-ai-os outputを自動importしない。

## 16. Rollback

各Phase:

- feature flag off
- scheduled job disabled
- append-only data retained
- no schema destructive migration
- old callers unchanged

Production rollbackはコードだけでなく、Provider pending jobs、budget、published state、notification statusを確認する。

## 17. Definition per Phase

Phaseは次を全て満たして完了。

- acceptance cases mapped
- new tests green
- existing tests green
- no Protected Area diff
- docs updated
- no external side effect in test
- rollback documented
- known limitations stated
- JIN approval items separated
