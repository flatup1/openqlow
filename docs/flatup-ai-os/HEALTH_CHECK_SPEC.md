# Health Check Specification

Version: 1.0.0-design

## 1. Health Layers

既存openQLOWのinfra healthを変更せず、次を追加する。

- creative_config
- knowledge
- prompt
- growth_data
- learning
- governance
- repository_boundary
- provider
- security

## 2. Severity

| Severity | Behavior |
| --- | --- |
| P0 | production/generation stop、owner alert |
| P1 | affected route stop |
| P2 | report warning、next maintenance |
| P3 | informational |

## 3. Checks

### Security

- secret pattern in tracked files: P0
- known quarantined credential source selected: P0
- PII in learning or fixture: P0
- unredacted LINE ID in metrics: P0

### Repository Boundary

- runtime imports flatup or AIKA Python path: P0
- Brand Growth writes Vault by default: P1
- Provider implementation outside adapter: P1
- Web prototype treated as canon: P1
- implementation running in dirty worktree: P1

### Knowledge

- missing Constitution: P0
- missing machine canon reference: P1
- stale review_due: P2
- duplicate active entries: P2
- conflicting active entries: P1
- historical/quarantined selected: P0
- broken source path: P1
- all Knowledge loaded for a single request: P2

### Prompt

- direct studio/artist name: P1
- missing target: P1
- multiple emotional goals: P2
- missing Hero Moment: P2
- I2V without identity rules: P1
- Kids without two-layer: P1
- Provider syntax in Prompt IR: P1
- huge Negative applied indiscriminately: P2

### Growth Data

- posted without publication evidence: P1
- pending metrics older than threshold: P2
- unknown coerced to zero: P1
- effective cost missing despite attempts: P1
- usable count zero but cost per usable zero: P1
- mixed metric windows compared: P2

### Learning

- validated without approval: P0
- validated without evidence: P0
- fewer than required replications: P1
- contradictory evidence unresolved: P1
- expired review date: P2
- failed hypothesis still active as best practice: P1

### Governance

- Constitution changed without approval: P0
- canon changed in Creative Phase: P0
- AIKA persona changed: P0
- major schema without ADR: P1
- CTA policy globally weakened: P0
- external send enabled by default: P0

### Provider

- unverified adapter enabled in production: P0
- cost estimate unavailable: P1
- timeout absent: P1
- auth/balance error retried: P1
- adapter version absent from attempt: P1

### Tests

- root regression fail: P0 for release
- acceptance fail: P0 for phase
- Design link checker fail: P1
- schema fixture invalid: P1

## 4. Cadence

| Check | Cadence |
| --- | --- |
| security、boundary、governance | every CI / start |
| prompt、schema | every change |
| provider | before batch |
| metrics completeness | weekly |
| knowledge stale / duplicate | monthly |
| validated evidence | monthly |
| restore test | monthly |
| full architecture audit | quarterly |

## 5. Output

HealthReport:

- timestamp
- design version
- runtime commit
- checks
- failures
- severity counts
- recommended action
- approval required

Owner summary is short:

    状態: GREEN / AMBER / RED
    最重要問題:
    影響:
    今すぐ必要なこと:

## 6. Degradation Policy

- Knowledge unavailable: local Constitution + no facts requiring canon; otherwise stop.
- Metrics unavailable: creation continues, learning promotion stops.
- Provider unavailable: Prompt preview continues, generation stops.
- Vault unavailable: runtime continues, export queues locally.
- AIKA unavailable: Creative OS continues; customer messaging remains isolated.
- openQLOW canon unavailable: facts-bearing public content stops.

## 7. Current Audit Baseline

Known current failures:

- P0: plaintext credential document exists outside approved repos
- P1: active Desktop openQLOW is dirty
- P1: current Vault is dirty and diverged
- P1: Vault global Constitution reference is missing
- P1: AIKA_RULES reference missing
- P1: no real content metrics
- P2: flatup Python tests emit SQLite ResourceWarning
- P2: animation/legacy TypeScript repos lack installed dependencies
- P2: direct studio names remain in historical prompts

これらは実装前に全部を直す必要はない。P0と実装worktree P1はPhase 1前に解消。その他は隔離し、該当Phase前に解消する。
