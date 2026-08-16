# Cross-repository Conflict Matrix

Version: 1.0.0-design

| ID | Conflict | Risk | Decision | Gate |
| --- | --- | --- | --- | --- |
| R-01 | openQLOW clean candidate vs dirty Desktop clone | wrong baseline、deletion混入 | fresh clean worktree only | Phase 1 |
| R-02 | multiple review worktrees with mass deletions | accidental overwrite | never use as implementation source | Always |
| R-03 | flatup current Vault vs clean 0806 clone diverged | memory and code drift | read-only until separately reconciled | Vault write |
| R-04 | flatup-ai-os described as current in old docs | duplicate AIKA / engine | legacy reference only | Always |
| R-05 | AIKA production on separate VPS | customer incident | no import, API or deploy from Creative OS | Always |
| R-06 | facts duplicated in Web, AIKA, Campaign docs | wrong public info | canon selector and public snapshot | Web Phase |
| R-07 | brand line variants | brand drift | Design phrase fixed; runtime migration separately approved | Before runtime copy |
| R-08 | global no-CTA vs trial North Star | conversion or safety loss | contextual CTA wrapper, old policy preserved | Phase 8 |
| R-09 | Codex / Claude ownership differs | concurrent edit | project ADR-0007 | Phase 1 |
| R-10 | missing AIKA_RULES and external rule docs | broken instruction chain | project-local Constitution and approved migration | Preflight |
| R-11 | Vault references missing global Constitution | nonportable governance | project-local Design Pack | Preflight |
| R-12 | Veo, fal, BytePlus implementations differ | provider lock-in | Prompt IR and Adapter registry | Phase 6 |
| R-13 | direct style names in existing prompts | policy and IP risk | quarantine then attribute rewrite | Phase 3 |
| R-14 | existing loop called self-improvement | learning scope confusion | separate Brand Growth context | Phase 4 |
| R-15 | real metrics all pending | false learning | manual snapshots first, unknown remains null | Phase 4 |
| R-16 | Vault direct write paths exist | overwrite / dirty state | write disabled by default, approved summary only | Phase 5 |
| R-17 | existing systemd jobs | duplicate schedules | new jobs not installed until owner approval | Phase 5 |
| R-18 | Web prototype uncommitted | deployment and rollback risk | consumer only, no deployment in this project | Web Phase |
| R-19 | plaintext credentials in legacy briefing | account compromise | rotate, quarantine, scan | P0 preflight |
| R-20 | old score documents say 98 / 100 | false completion claim | scope as historical, use current DoD | Reporting |
| R-21 | old Animation OS fixed 4-scene runtime | duplicate generation engine | design reference only | Always |
| R-22 | media binaries across repos | size, consent, privacy | metadata in repo, media external | Phase 4 |
| R-23 | Python AIKA tests warn unclosed SQLite | latent resource issue | record debt, do not fix in Creative project | AIKA separate task |
| R-24 | legacy TS dependencies missing | unverified migration source | Adapter contract tests before reuse | Phase 7 |

## Conflict Resolution Rule

1. Stop only the affected route.
2. Do not silently choose lower-authority data.
3. Record source paths and hashes.
4. Ask JIN only when the choice changes brand, facts, cost, safety or external behavior.
5. Preserve both historical records.
6. Implement the decision through an ADR and acceptance test.
