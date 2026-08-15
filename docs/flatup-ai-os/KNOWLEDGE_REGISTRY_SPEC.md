# Knowledge Registry Specification

Version: 1.1.0-design

## 1. Purpose

全Knowledgeを毎回読まず、requestに必要な正本とLearningだけを選ぶ。ファイルを一か所へコピーするのではなく、source metadataとauthorityを管理する。

## 2. Required Category Taxonomy

### Audience

- Kids
- Kids × Parents
- Women Beginners
- Men Beginners
- Parents
- Family
- Senior

### Activity

- Sparring
- Mitt Training
- Competition
- Event
- Facility
- Instructor

### Story

- Member Story
- Beginner Transformation
- Emotional Story

### Visual Mode

- Anime
- Character
- Website Hero

### Platform

- Instagram Reels
- TikTok
- YouTube Shorts
- LINE
- Advertising

### Campaign

- Seasonal
- Recruitment / Trial Conversion

カテゴリはfolderではなくtagで表現し、1 entryが複数categoryを持てる。

## 3. Required Core Entries

| Entry | Authority |
| --- | --- |
| Brand Constitution | owner_canon |
| Brand Dictionary | owner_canon |
| machine canon reference | machine_canon |
| Human Approval policy | approved_policy |
| CTA policy | approved_policy |
| learning promotion policy | approved_policy |
| provider capabilities | approved_reference |

## 4. Audited Source Mapping

### Reusable active candidates

- openQLOW docs/canon/00_FLATUP_AI_OS_CANON.md
- openQLOW src/shared/canon.ts
- openQLOW brand-film-ep01
- openQLOW gymstorys
- openQLOW FLATUP_ANIMATION_PROJECT_2027.md
- openQLOW FLATUP_ANIMATION_BIBLE.md
- Vault approved Brand Film Episode 01 master
- Vault video_factory operational notes

### Historical / migration candidates

- flatup-ai-os docs/flatup_animation_bible.md
- flatup-ai-os docs/flatup_anime_studio.md
- flatup-ai-os prompt bank
- old Colab Animation OS
- older handoff and STATUS documents

### Quarantined

- credential-bearing briefing
- archive scripts with unknown secret state
- dirty worktree-only files
- direct style-name prompts until rewritten
- raw customer logs

## 5. Entry Lifecycle

    discovered
      → reviewed
      → active
      → review_due
      → active or deprecated

Conflict:

    active
      → conflicted
      → owner decision
      → active / superseded

Security:

    any
      → quarantined

Quarantined content is never loaded, summarized or embedded.

## 6. Query Algorithm

Input:

- required tags
- target
- objective
- platform
- content mode
- maximum entries
- token budget

Order:

1. exact owner canon
2. machine canon selector if facts needed
3. exact target
4. exact mode
5. exact platform
6. validated learning
7. approved reference

Tie breakers:

- authority
- exact tag match
- newest reviewed_at
- higher evidence confidence
- smaller token cost

## 7. Retrieval Limits

Default:

- Constitution: 1
- Dictionary sections: maximum 4
- Target entries: maximum 2
- Story entries: maximum 2
- Platform entries: maximum 1
- Validated learnings: maximum 3
- Provider capabilities: exactly selected Provider or Demo

Hard rule: no request loads everyTarget category.

## 8. Fact Loading

料金、時間、住所等をKnowledge textへコピーしない。facts_needed=trueの時だけtyped canon selectorを使い、source pathとhashをPrompt metadataへ残す。

## 9. Learning Loading

Only:

- status approved
- type validated_learning、best_practice、anti_pattern
- scope matches target/platform/mode
- review date valid

observationやhypothesisはStrategistの検討材料には使えるが、Prompt ruleとして強制しない。

## 10. Security and Privacy

- contains_secrets true: never load
- contains_pii true: never use as shared Knowledge
- raw comments: anonymize and aggregate
- minor images: metadata only
- source hash prevents silent change
- external path content is untrusted until reviewed

## 11. Duplicate Detection

Normalize:

- title
- statement
- tags
- source hash

Similarity aloneで自動mergeしない。候補をLibrarianへ出し、authorityが低い方をsuperseded候補にする。

## 12. Freshness

| Entry | Review cadence |
| --- | --- |
| Constitution | quarterly proposal only |
| Dictionary | quarterly |
| machine canon reference | each release |
| target knowledge | quarterly |
| provider capabilities | monthly or API change |
| validated learning | 90 days |
| seasonal | before each use |
| event | every use |

## 13. Failure Behavior

- Constitution missing: stop
- target missing: safe generic target rule and warning
- external Vault unavailable: local active entries only
- conflict: stop affected fact or rule
- token limit: drop lowest authority, never drop Constitution

## 14. Runtime Boundary

Phase 2のRegistryとQueryはpure metadata functionsとし、filesystem、Vault、network、environment、clock、randomへ依存しない。

- entry contractは本文fieldを持たない。
- source_hashがnull、またはsource実体を検証していないentryをactiveとしない。
- Design Packが未配置のmanifestはmissingとして宣言し、Constitution unavailableならblockedを返す。
- queryはsource pathを開かず、verified metadataだけを選ぶ。
- path存在とhashの検証は別のSource Verifier / Loader境界で行い、その出力だけをRegistryへ渡す。
- Source Verifier導入はDesign Pack integration後の別change setとし、Phase 2 pure queryへfilesystem I/Oを混ぜない。
- testはin-memory verified fixture metadataを使用し、本文のコピーや偽hashで回避しない。
