# Repository Scorecard

Last updated: 2026-08-16

## Score

Current score: **100 / 100**

## Breakdown

| Area | Score | Notes |
| --- | ---: | --- |
| Build and tests | 20 / 20 | CI is running and the latest `main` run passed. |
| Safety guardrails | 20 / 20 | Validation scripts exist, full test suite passes, and `main` is protected by required CI checks. |
| README and onboarding | 15 / 15 | README now explains purpose, safety, commands, and checks. |
| Contribution hygiene | 15 / 15 | Contribution, security, PR template, CODEOWNERS, Dependabot, and license file are present. |
| GitHub settings | 15 / 15 | Description, topics, license, default branch, and branch protection are configured. |
| PR hygiene | 15 / 15 | Stale PRs were closed. Remaining PRs are active Dependabot or current draft work. |

## Current 100-point state

```text
100点
 ├─ README / SECURITY / CONTRIBUTING / LICENSE     OK
 ├─ CI / typecheck / validation                    OK
 ├─ GitHub description / topics                    OK
 ├─ main branch protection                         OK
 └─ stale PR cleanup                               OK
100点
```

## Recommended branch protection for `main`

- Require a pull request before merging
- Require status checks before merging
- Required checks:
  - `test (core)`
  - `test (aika)`
  - `test (line)`
  - `test (crm)`
  - `test (publish)`
  - `test (ops)`
  - `typecheck and validate`
- Require branches to be up to date before merging
- Do not allow force pushes
- Do not allow deletions

Configured required checks:

- `typecheck and validate`
- `test (core)`
- `test (aika)`
- `test (line)`
- `test (crm)`
- `test (publish)`
- `test (ops)`

## Open PR cleanup candidates

| PR | Recommendation |
| --- | --- |
| #89 | Keep for review. Recent draft with clean merge state. |
| #85 | Keep for review. Recent draft with clean merge state. |
| #46 | Closed as stale; can be reopened if needed. |
| #18 | Closed as stale; can be reopened if needed. |
| #17 | Closed as stale; can be reopened if needed. |
