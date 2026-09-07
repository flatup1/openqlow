# Definition of Done

Version: 1.4.0-design

## A. Design Pack DoD

- [x] Repository Audit
- [x] Gap Analysis
- [x] Vision Book
- [x] Architecture Book
- [x] Implementation Book
- [x] Operations Book
- [x] Prompt Bible
- [x] Claude Code Implementation Spec
- [x] Brand Constitution
- [x] Brand Dictionary
- [x] AGENTS.md specification
- [x] Target Router specification
- [x] Knowledge architecture
- [x] Prompt Composer specification
- [x] Negative Prompt Composer specification
- [x] Growth Engine specification
- [x] KPI Tree
- [x] Experiment Schema
- [x] Learning Write-back
- [x] Weekly Review
- [x] Health Check
- [x] ADR
- [x] Versioning
- [x] Human Approval
- [x] Acceptance Tests
- [x] Existing AI OS conflict analysis

Design filesが存在するだけでは完了としない。以下のquality gateも必要。

- [x] link and path review passes
- [x] no credential values in Design Pack
- [x] no runtime fact duplication
- [x] no direct studio/artist names in generated Prompt examples
- [x] all acceptance cases map to module and Phase
- [x] no contradiction between books
- [x] owner decisions are marked

## B. Phase 1 Implementation DoD

- [x] isolated clean Claude Code worktree
- [x] P0 credential rotation / old credential invalidation completed by JIN declaration
- [x] project role rule approved
- [x] Contracts implemented
- [x] deterministic Router implemented
- [x] explicit owner duration is preserved as typed data
- [x] CTA approval state is explicit
- [x] no Provider call
- [x] no external write
- [x] AT-001〜009、AT-025、AT-026、AT-046、AT-047、AT-048 pass
- [x] 42件のparaphrase / edge fixtureと4種のnegative control pass
- [x] `npm run test:brand-growth` and `npm run typecheck` pass
- [x] root `npm test` and both AI OS validators pass
- [x] protected AIKA / LINE / canon / safety / CRM areas have zero diff
- [x] rollback is deletion of the isolated bounded context and narrow package entries
- [x] Claude Code needed no additional design clarification for the approved Phase 1 scope
- [x] final diff approved and candidate preserved by commit / push

Phase 1はContractsとRouterだけである。Knowledge RegistryはPhase 2、DirectorとPrompt IRはPhase 3であり、Phase 1の未完了項目として扱わない。commit / pushはJINのHuman Approvalが必要で、未承認でも実装品質テストの合否とは分けて表示する。

## B2. Phase 2 Implementation DoD

- [x] metadata-only Knowledge contract implemented
- [x] selective deterministic query and precedence implemented
- [x] conflict、quarantine、PII、secret fail closed
- [x] token budget keeps Constitution
- [x] missing Constitution blocks
- [x] missing external source warns and continues with verified local metadata only
- [x] default manifest does not fabricate active status or source hash
- [x] AT-035、AT-036、AT-042、AT-049 pass
- [x] six negative controls pass
- [x] Phase 1 and root regression tests pass
- [x] protected 19 areas have zero diff
- [x] Phase 2 candidate committed as `dd82d90`
- [x] Phase 1 and Phase 2 commits pushed for durable preservation

Source path/hash verificationとDesign Pack integrationは次change setであり、pure Phase 2 Queryへfilesystem I/Oを混ぜない。

## B3. Phase 3 Implementation DoD

- [x] rule-based Director and CreativeBrief implemented
- [x] emotional goal exactly one
- [x] Hero Moment exactly one
- [x] Kids child surface and parent deep layer required
- [x] Provider-neutral Prompt IR implemented
- [x] direct style names removed with count-only diagnostics
- [x] selective categorized Negative implemented
- [x] blocked Knowledge prevents Brief、PromptIR、preview、and final prompt
- [x] Brief、PromptIR、VersionBundle、output immutable
- [x] AT-010〜016、AT-037、AT-046、AT-050相当 pass
- [x] eight negative controls pass
- [x] `npm run test:brand-growth`、typecheck、root tests、both validators pass
- [x] protected 19 areas have zero diff
- [x] no Provider、API、Vault、LLM、AIKA、LINE、publish、or production effect
- [x] Phase 3 candidate committed as `fcdb1b6`
- [x] Phase 3 commit pushed for durable preservation
- [x] Design Pack added to the implementation branch
- [ ] verified Knowledge sources connected through a separate Source Verifier

Phase 3の実装品質は100/100でpush済み。Source Verifierと本番統合は、品質testとは分けてintegration gateとして表示する。

## C. v1.0 Runtime DoD

- [ ] one-line input works on mobile
- [ ] target and objective inferred
- [ ] selective Knowledge retrieval
- [ ] emotional goal and Hero Moment
- [ ] Provider-neutral Prompt IR
- [ ] categorized Negative
- [ ] I2V preservation
- [ ] human approval for paid generation
- [ ] generation attempt and cost records
- [ ] effective cost per usable
- [ ] accept/reject reasons
- [ ] platform reuse variants
- [ ] existing publish approval
- [ ] manual metric snapshots
- [ ] experiment lifecycle
- [ ] evidence-backed learning
- [ ] weekly coach
- [ ] strategic TOP3
- [ ] governance health check
- [ ] no AIKA behavior regression
- [ ] no canon drift
- [ ] no secret / PII

## D. Final Review Questions

1. Claude Codeが初見でPhaseを実装できるか。
2. AIKAとopenQLOWの顧客境界を壊さないか。
3. JINの作業は一行入力と承認中心か。
4. 感情が映像技術より先か。
5. 体験予約・入会へつながるか。
6. 子どもと親の二層があるか。
7. I2V失敗率を下げるか。
8. effective costを測れるか。
9. Learningが次回へ残るか。
10. Health Checkが劣化を止めるか。
11. Human Approvalが残るか。
12. Provider交換が可能か。

一つでもNOなら完成ではない。
