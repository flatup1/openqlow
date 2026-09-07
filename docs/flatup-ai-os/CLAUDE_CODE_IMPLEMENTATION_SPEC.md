# Volume 6 — Claude Code Implementation Specification

Version: 1.4.0-design
Implementation owner: Claude Code
Design owner: Codex
Final authority: JIN

## 1. Mission

flatup1/openqlowへ、既存機能を壊さずにBrand Growth bounded contextを段階追加する。Phase 1では外部API、AIKA、Vault、公開、課金へ接続しない。

## 2. Repository Selection

Do not use:

- dirty Desktop openqlow
- openqlow-review系
- old flatup-ai-os
- current dirty Vault
- FLATUP WORLD V2 prototype

Use:

- flatup1/openqlowの最新remoteを確認したfresh clean worktree
- audited minimum baseline is commit 57b79e9相当以上

開始時に記録:

- branch
- HEAD
- origin
- git status
- node version
- npm test result

## 3. Required Design Inputs

Read:

- docs/flatup-ai-os/ARCHITECTURE_BOOK.md
- docs/flatup-ai-os/IMPLEMENTATION_BOOK.md
- docs/flatup-ai-os/schemas/SCHEMA_CATALOG.md
- docs/flatup-ai-os/tests/ACCEPTANCE_TESTS.md
- relevant ADR

Do not infer new architecture from old handoff files when this Design Pack has a decision.

Current implementation state (2026-08-16): Phase 1 `b941924`、Phase 2 `dd82d90`、Phase 3 `fcdb1b6` and this Design Pack are pushed to `claude/flatup-gym-ai-os-phase1-15lytr`. Source Verifier and production integration remain pending.

## 4. Phase 1 Exact Scope

### Add

    src/brand_growth/contracts/creative_input.ts
    src/brand_growth/contracts/route_decision.ts
    src/brand_growth/contracts/version_bundle.ts
    src/brand_growth/router/normalize_input.ts
    src/brand_growth/router/classify_intent.ts
    src/brand_growth/router/classify_target.ts
    src/brand_growth/router/classify_objective.ts
    src/brand_growth/router/select_profile.ts
    src/brand_growth/router/route.ts
    src/brand_growth/router/router.test.ts
    src/brand_growth/fixtures/acceptance_inputs.ts
    src/brand_growth/index.ts

### Narrow modifications allowed

- package.json: add test:brand-growth and optional dry-run script
- AGENTS.md: project-local role and protected area, after JIN approval
- COORDINATION.md: new directory ownership, after JIN approval
- tsconfig only if new directory is not already included

### Do not modify

- src/shared/canon.ts
- src/shared/cancellation_rules.md
- src/safety/check.ts
- src/safety/forbidden_actions.ts
- src/aika
- src/line_bot
- src/publish
- src/scheduler
- src/loop
- animation-studio
- deploy
- scripts used by production
- flatup or flatup-ai-os repositories

## 5. Phase 1 Behavior

Input:

- raw text
- zero or more AssetRef
- optional target/objective/platform/duration hints

Output:

- RouteDecision
- requested_duration_seconds: integer or null
- cta_approval_required
- assumptions
- clarification required flag

Pseudocode:

    normalize input
    detect explicit target terms
    infer target from content terms and asset metadata
    detect objective terms
    extract explicit duration without inventing a default
    infer content mode
    select emotional default by target and objective
    select required Knowledge tags
    select CTA and Quality profiles
    calculate per-field confidence
    if safety-critical information missing:
        clarification_required = true
    else:
        fill safe defaults
    return immutable RouteDecision

Duration contract:

- structured duration hint > explicit raw text > null
- explicit 1〜120 seconds must survive even when platform is null
- when a PlatformPlan exists, its duration must match the explicit top-level duration
- invalid or unsupported duration returns null plus an assumption; it must not throw
- implicit Platform default duration must not be written as an explicit owner request

## 6. Phase 1 Default Matrix

| Signal | Target | Emotional default |
| --- | --- | --- |
| 女性、レディース | women_beginners | safety |
| キッズ、子ども | kids | fun |
| 親子、保護者 | kids_parents | trust |
| 試合、大会、スパー | sparring_fans or competition | aspiration |
| シニア | senior | confidence |
| 初心者 only | general_beginner | safety |

Objective:

- 体験: trial
- LINE: line_add
- Instagram: trust unless awareness or conversion intent is explicit
- 大会告知: event
- Web hero: trust
- no signal: trust

CTA:

- trial objective: soft_conversion with cta_approval_required=true
- pure story: pure_brand
- customer reply: never selected by this router

## 7. Clarification Rules

Ask only when:

- minor consent is missing
- cost-bearing action lacks budget / approval at execution boundary
- target people in multiple assets are ambiguous
- event fact source is unknown
- requested claim is medical/legal

Do not ask:

- camera
- lens
- music
- negative prompt
- platform aspect ratio when platform is known
- default duration when target/provider constraints can decide

## 8. Phase 1 Tests

Must implement Acceptance Cases:

- AT-001 through AT-009
- AT-025
- AT-026
- AT-046
- AT-047
- AT-048

Intentionally deferred: AT-024 is a Phase 5 validated-learning test.

Assertions:

- target is never missing
- no external read/write/network
- no environment credential required
- same input produces same decision
- explicit user hints beat inferred defaults
- assumptions are visible
- minor consent fails closed
- AIKA routes are untouched
- explicit duration is preserved when platform is null
- explicit duration and PlatformPlan duration never conflict
- invalid duration fails safe without asking an extra question
- 42件以上のparaphrase / negation / false-positive fixtureが決定論的に通る
- 日本語長音符を壊さず、`online`をLINE platformと誤判定しない

Commands:

    npm run typecheck
    npm run test:brand-growth
    npm test

## 9. Phase 2 Exact Scope

Add:

    src/brand_growth/knowledge/registry.ts
    src/brand_growth/knowledge/query.ts
    src/brand_growth/knowledge/precedence.ts
    src/brand_growth/knowledge/conflicts.ts
    src/brand_growth/knowledge/registry.test.ts
    docs/flatup-ai-os/knowledge-registry.yaml or equivalent

Registry initially references local repository files only. Vault sources may be represented as optional external entries but must not be required for tests or dry-run.

Required active entries:

- Brand Constitution
- Brand Dictionary
- existing machine canon reference
- Kids target reference
- Women beginner target reference
- Sparring target reference
- provider capability Demo

Required quarantined entry:

- plaintext credential briefing path, with no content loading

Phase 2 Acceptance: AT-035、AT-036、AT-042、AT-049。source実体が未配置ならactiveを偽装せずmissingとし、production default queryはConstitution unavailableで安全停止する。filesystem/hash verificationはpure queryと別change setで実装する。

## 10. Phase 3 Exact Scope

Add Director and Prompt IR files as listed in Implementation Book.

Implement rule-based baseline before LLM.

Pseudocode:

    decision + knowledge
      → human context
      → one emotional goal
      → story beats
      → one Hero Moment
      → shot plan
      → Prompt IR
      → selected negatives
      → preflight result

Cases AT-010 through AT-016、AT-037、AT-046、AT-050 must pass.

Additional Phase 3 requirements:

- blocked Knowledge returns no CreativeBrief、PromptIR、render preview、or final prompt
- emotional goal exactly one and Hero Moment exactly one
- Kids requires child surface and parent deep layer
- style guard retains removal count only in diagnostics
- Negative categories are selected by asset / mode instead of globally concatenated
- Brief、PromptIR、VersionBundle and output are immutable
- Provider / vendor endpoint、LLM、Vault、AIKA、LINE、publish、network calls remain absent
- at least one negative control for each critical guard proves the tests are not vacuous

## 11. Phase 4 Exact Scope

Implement append-only event storage and manual metrics.

Storage requirements:

- configurable root
- default local runtime directory outside tracked source
- tests only in temp
- atomic append
- PII and secret guard
- schema_version

No SQLite migration in first pass unless existing openQLOW store pattern clearly requires it. Choose the least complex compatible store.

## 12. Phase 5 Exact Scope

Implement learning lifecycle and weekly file report.

Promotion:

    observation
      → hypothesis
      → candidate
      → pending approval
      → validated learning

No automatic approved state.

## 13. Phase 6 and Later

Do not begin without a new owner approval.

- Demo Provider
- paid Provider
- publish adapter
- mobile UI
- metrics API
- scheduler / LINE notification

## 14. CTA Compatibility Requirement

Never delete or relax the old salesy CTA check globally.

Preferred approach:

- add a new creative-specific checker or context-aware wrapper
- preserve old checkDraftSafety signature and behavior
- old tests must pass unchanged
- customer reply remains blocked
- creative soft CTA requires profile and approval

## 15. Canon Compatibility Requirement

- No price, address, schedule or class literals in brand_growth.
- If facts are needed, use a typed selector over src/shared/canon.ts.
- tests must scan new directory for hardcoded canon facts.
- Web export is a later Adapter, not Phase 1.

## 16. Provider Compatibility Requirement

- PromptIR knows no endpoint, model command or request JSON.
- Adapter maps capabilities and syntax.
- Provider-specific metadata goes under provider_details in an attempt record.
- Core only sees normalized status, cost, asset, error.

## 17. Security Requirement

Before implementation:

- confirm reported credentials were rotated
- run repository secret scan
- never print env values
- fixtures use fake IDs
- no real media metadata
- no raw customer content

If secret scan finds a value, stop and report names and paths only.

## 18. Migration and Rollback

Migration:

- no destructive data migration
- old metrics pending remains unknown
- old Prompt remains historical
- new directory feature-disabled by default

Rollback:

- remove package script/export
- disable feature flag
- remove new directory if no runtime data
- retain append-only records if created
- do not revert unrelated user changes

## 19. Implementation Report

Each Phase ends with:

- baseline commit
- changed files
- tests
- acceptance mapping
- external effects
- compatibility proof
- protected area diff check
- known limitations
- rollback
- next approval

## 20. Phase 1 Completion Gate

All must be true:

- clean worktree
- contracts compile
- router deterministic
- tests pass
- no external I/O
- no old code behavior changed
- no canon literal
- no secret / PII
- no AIKA modification
- no Provider modification
- JIN can understand one-line input result

## 21. Do Not Proceed If

- remote baseline cannot be verified
- current worktree is dirty
- owner role decision is not reflected
- credential incident is unresolved
- existing npm test is red before changes
- implementation requires touching AIKA
- design has an unanswered P0 contradiction

## 22. Claude Code Handoff Prompt

    FLATUP GYM AI OS Design Pack v1.0のPhase 1だけを実装してください。
    最初にAGENTS.md、COORDINATION.md、
    docs/flatup-ai-os/CLAUDE_CODE_IMPLEMENTATION_SPEC.md、
    schemas/SCHEMA_CATALOG.md、tests/ACCEPTANCE_TESTS.mdを読んでください。
    clean worktreeとbaseline testを確認し、contractsとpure Routerだけを追加してください。
    AIKA、canon、安全ゲート、LINE、publish、Vault、Provider、deployには触れないでください。
    Acceptance Testsを先に追加し、root npm testを維持してください。
    外部送信、課金、ネットワーク、実データ使用は禁止です。
    完了時は変更ファイル、テスト、互換性、rollback、残承認を報告してください。
