# Acceptance Tests

Version: 1.4.0-design
Rule: tests are written before implementation

## Test Conventions

- GIVEN: input and state
- WHEN: operation
- THEN: required result
- MUST NOT: forbidden result
- Phase: first implementation phase that must pass

## AT-001 Beginner Woman Reel

GIVEN: 女性向け。このジム写真。Instagram Reel。体験につなげたい。
WHEN: route and brief
THEN:

- target women_beginners
- objective trial
- emotional goal safety
- Women knowledge, beginner rule, Constitution
- Image-to-Video mode
- identity preservation
- one Hero Moment
- soft conversion CTA pending approval
- cta_approval_required true

MUST NOT: body-shaming、威圧、料金直書き
Phase: 1 and 3

## AT-002 Kids Anime

GIVEN: 子ども向け。これをアニメで動かしたい。
THEN:

- target kids
- anime mode
- child surface fun
- parent deep layer safety and growth
- original character preservation
- one memorable scene

MUST NOT: parent messageを子ども向け台詞へ詰め込む
Phase: 1 and 3

## AT-003 Competition Cool

GIVEN: 試合をめちゃくちゃカッコよく。
THEN:

- competition route
- emotional goal aspiration
- dynamic readable action
- realistic body mechanics
- impact timing and controlled camera
- brand negatives against fear and brutality

MUST NOT: blood、horror、humiliation、impossible movement
Phase: 1 and 3

## AT-004 Parent and Child

GIVEN: 親子向け。この写真を15秒に。
THEN:

- target kids_parents
- requested_duration_seconds 15
- platforms null when no platform was requested
- two-layer brief
- child fun
- parent trust
- Hero Moment is shared action

Phase: 1 and 3

## AT-005 Senior

GIVEN: シニア向け。運動を始める安心感。
THEN:

- target senior
- emotional goal confidence or safety
- controlled movement
- no medical claim
- no infantilization

Phase: 1 and 3

## AT-006 Website Hero

GIVEN: このジム写真をWebサイトのヒーロー動画に。
THEN:

- objective trust
- platform website
- wide and mobile-safe composition notes
- no generated text or QR in scene
- future facts from public canon snapshot

MUST NOT: Web prototypeをfact sourceにする
Phase: 1 and 3

## AT-007 Instagram Default

GIVEN: この画像をInstagram用に。
THEN:

- platform instagram
- aspect ratio default 9:16
- objective trust if no conversion signal
- target inferred from asset and text
- assumptions visible

MUST NOT: camera質問を返す
Phase: 1

## AT-008 Minimal Ambiguous Request

GIVEN: これ動かして。
AND: one photo with adult beginner metadata
THEN:

- target inferred
- objective trust
- safe motion default
- assumptions visible
- no clarification if subject is unambiguous

Phase: 1

## AT-009 Event Facts Missing

GIVEN: 来週の大会告知を作って。
AND: no verified event source
THEN:

- intent announce
- objective event
- clarification_required true
- request verified date and event details

MUST NOT: invent date or place
Phase: 1

## AT-010 Real Person Identity

GIVEN: consent-confirmed person reference image
WHEN: Prompt IR
THEN:

- identity, anatomy, motion, temporal, environment, brand negatives
- age, face, body, hair, clothes, people count, gym retained
- one action

Phase: 3

## AT-011 Selective Negative

GIVEN: empty facility shot
THEN:

- temporal, environment, brand negatives
- no person identity rules
- no anatomy rule unless people appear

Phase: 3

## AT-012 Original Character

GIVEN: approved original character sheet
THEN:

- character consistency, anatomy, temporal, environment, brand
- original silhouette and palette
- no artist or studio name

Phase: 3

## AT-013 Pure Brand CTA

GIVEN: objective pure brand film
THEN: CTA policy none
MUST NOT: LINE、体験予約、来てください
Phase: 3 and 8

## AT-014 Trial CTA

GIVEN: objective trial and owner-approved content profile
THEN:

- soft navigation or explicit trial invitation
- factual, calm, no urgency
- editing note after emotional ending

MUST NOT: globally relax customer reply safety
Phase: 3 and 8

## AT-015 Direct Style Name

GIVEN: input asks for a named studio or living artist style
THEN:

- style_name_guard flags
- request translated to visual attributes
- no named style in Prompt IR

Phase: 3

## AT-016 Provider-neutral Core

GIVEN: Prompt IR before Adapter
THEN: no endpoint, model command, vendor request field
MUST NOT: contain Provider-only aspect syntax
Phase: 3 and 6

## AT-017 Cost per Usable

GIVEN: 10 attempts, total cost 1000 JPY, 2 usable
THEN: effective cost per usable is 500 JPY
Phase: 4

## AT-018 Zero Usable

GIVEN: 5 attempts, cost greater than zero, 0 usable
THEN:

- effective cost value null
- reason no_usable_output
- health warning

MUST NOT: report 0 JPY
Phase: 4

## AT-019 Missing Metrics

GIVEN: views known, saves unknown
THEN: saves null
MUST NOT: coerce to zero
Phase: 4

## AT-020 Predicted vs Measured

GIVEN: predicted Emotional Score 82 and measured completion 21 percent
THEN: stored in separate structures with separate labels
MUST NOT: average them
Phase: 4

## AT-021 One-variable Experiment

GIVEN: A and B differ only in Hook
THEN:

- changed_variable_one hook
- same target, CTA, duration and asset recorded
- valid for learning candidate

Phase: 4

## AT-022 Multi-variable Experiment

GIVEN: A and B differ in Hook, duration and CTA
THEN:

- marked exploratory
- causal claim disabled
- cannot promote to validated learning

Phase: 4

## AT-023 One Success

GIVEN: one content item performs well
THEN: create observation only
MUST NOT: validated_learning
Phase: 5

## AT-024 Validated Learning

GIVEN:

- three independent experiments
- same direction
- comparable metric windows
- limitations recorded
- owner approval

THEN: validated_learning approved
Phase: 5

## AT-025 Minor Consent

GIVEN: asset contains a minor and consent unknown
THEN:

- preflight blocker
- clarification required
- no Provider request

Phase: 1, 4 and 6

## AT-026 AIKA Isolation

GIVEN: Weekly Coach job
THEN:

- output file or owner notification draft
- no AIKA customer channel
- no customer reply

MUST NOT: import AIKA Python code
Phase: 5

## AT-027 Paid Generation Approval

GIVEN: real Provider batch without ApprovalEvent
THEN: blocked
MUST NOT: submit request
Phase: 6

## AT-028 Approval Scope Changed

GIVEN: approved batch count 2, later changed to 5
THEN: scope hash mismatch and reapproval required
Phase: 6

## AT-029 Provider Auth Failure

GIVEN: normalized auth error
THEN:

- batch stops
- attempt recorded
- no retry
- secret value not logged

Phase: 7

## AT-030 Provider Timeout

GIVEN: retryable timeout within budget
THEN:

- original attempt failed
- retry is new attempt
- retry count and total cost visible

Phase: 7

## AT-031 Web Canon

GIVEN: Web export requires price and schedule
THEN:

- values selected from canon.ts through public snapshot Adapter
- source hash and generated time

MUST NOT: copy values into creative module or test fixture
Phase: 10

## AT-032 Reuse

GIVEN: one accepted 30-second master
THEN:

- 15-second Reel
- TikTok
- Shorts
- Website
- LINE preview
- thumbnail
- each variant linked to one master ContentRecord

Phase: 4 and 9

## AT-033 Weekly Coach

GIVEN: complete weekly metric snapshots
THEN:

- best
- worst
- emotional pattern
- Hook pattern
- target pattern
- trial relation
- learning
- next hypothesis
- TOP3

Phase: 5

## AT-034 Weekly Coach Missing Data

GIVEN: no trial booking metrics
THEN:

- data completeness warning first
- no claim about trial conversion winner
- request next manual input

Phase: 5

## AT-035 Knowledge Conflict

GIVEN: two active entries disagree on brand line
THEN:

- neither selected as silent truth
- conflict record
- owner decision required

Phase: 2

## AT-036 Quarantined Credential Source

GIVEN: query tags match a quarantined legacy briefing
THEN: entry never loaded
MUST NOT: return source content
Phase: 2

## AT-037 Version Trace

GIVEN: generated content
THEN: VersionBundle contains all required component versions
AND: later version changes do not alter old record
Phase: 3 and 4

## AT-038 Learning Conflict

GIVEN: approved learning later receives contrary evidence
THEN:

- status review_due
- old record retained
- new content does not use it as unconditional rule

Phase: 5

## AT-039 Brand Blocker

GIVEN: high technical score but threatening, dark, beginner-hostile output
THEN: rejected by brand blocker
MUST NOT: weighted total override blocker
Phase: 4

## AT-040 Identity Blocker

GIVEN: beautiful output but face changed
THEN: rejected identity
MUST NOT: usable true
Phase: 4

## AT-041 Existing Safety Compatibility

GIVEN: existing openQLOW customer-facing draft with salesy CTA
THEN: old safety test still blocks it
Phase: 8

## AT-042 No Global Knowledge Load

GIVEN: women beginner I2V request
THEN:

- Constitution
- relevant dictionary sections
- women target
- I2V creative rules
- at most configured learning count

MUST NOT: load all target categories
Phase: 2

## AT-043 Secret Scanner

GIVEN: fake secret-like value in fixture
THEN: CI fails with file path and secret type only
MUST NOT: print full value
Phase: preflight

## AT-044 Health Governance

GIVEN: validated learning without approval
THEN: P0 or release blocker
Phase: 5

## AT-045 Health Provider Leak

GIVEN: Provider model field appears in Core PromptIR
THEN: boundary health failure
Phase: 6

## AT-046 Owner Minimal Work

GIVEN: standard one-line request with consent-confirmed asset
THEN: no questions about camera, lighting, music, Negative or ratio
Phase: 1 and 3

## AT-047 Explicit Duration Preservation

GIVEN: a short owner request contains an explicit duration
THEN:

- 「この写真を15秒に」returns requested_duration_seconds 15 even when platforms is null
- 「30s Instagram Reel」returns requested_duration_seconds 30 and PlatformPlan.duration_seconds 30
- an unspecified duration returns requested_duration_seconds null
- 0、上限外、小数、複合表記等のunsupported value returns null without an exception and records an assumption
- a Platform default duration never masquerades as an explicit owner request

MUST NOT: lose the owner-specified duration、invent a top-level default、ask an extra camera/ratio/duration question
Phase: 1

## AT-048 Natural Paraphrase and Negation Routing

GIVEN: owner input uses natural Japanese or English variation, full-width characters, spaces, punctuation, or an explicit negation
THEN:

- phrase rules come from a declarative category lexicon
- weighted matches select one deterministic value; declaration order breaks a tie
- explicit hint still beats phrase score, asset metadata, and defaults
- 「子ども向けではなく初心者女性向け」selects women_beginners and does not select kids
- `online` does not falsely select LINE platform
- 「女性向けのリール」keeps the Japanese long vowel and selects instagram_reel
- Unicode NFKC variations such as `３０秒` and `ＩＮＳＴＡＧＲＡＭ` normalize safely
- an unknown phrase falls back safely and records an assumption
- the same input returns byte-equivalent logical output

MUST NOT: call an external LLM、use network、silently override an explicit hint、or treat a negated phrase as positive evidence
Phase: 1

## AT-049 Unavailable Knowledge Manifest Fails Safe

GIVEN: the runtime manifest references Design Pack paths that are not present or not hash-verified in the current worktree
THEN:

- entries have status missing and source_hash null
- none is represented as active or selected
- missing or unavailable Brand Constitution blocks the query with constitution_unavailable
- the result contains metadata and reasons only, never source body or secret content
- an in-memory verified metadata fixture may test selection without pretending the production manifest is available

MUST NOT: fabricate a hash、copy source content into the Registry、silently continue without Constitution、or add filesystem I/O to the pure Query
Phase: 2

## AT-050 Blocked Knowledge Prevents Brief and Prompt

GIVEN: `KnowledgeQueryResult.blocked` is true、or the Brand Constitution is missing / unavailable
THEN:

- composition result is blocked with a machine-readable reason
- CreativeBrief is null or absent
- PromptIR is null or absent
- render preview and final prompt are null or absent
- no Provider、LLM、Vault、AIKA、LINE、publish、or network call occurs
- the same logical input returns the same blocked result

MUST NOT: invent fallback brand rules、create a partial Prompt、hide the missing Constitution、or continue to paid generation
Phase: 3

## Acceptance Mapping Gate

Each implementation PR must list:

- case IDs implemented
- test file names
- test result
- cases intentionally deferred
- reason for deferral
