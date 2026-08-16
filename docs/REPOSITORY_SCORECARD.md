# Repository Scorecard

Last updated: 2026-08-16

## Score

Current score: **91 / 100**

## Breakdown

| Area | Score | Notes |
| --- | ---: | --- |
| Build and tests | 20 / 20 | CI is running and the latest `main` run passed. |
| Safety guardrails | 18 / 20 | Validation scripts exist and full test suite passes. Branch protection still needs GitHub-side setup. |
| README and onboarding | 15 / 15 | README now explains purpose, safety, commands, and checks. |
| Contribution hygiene | 15 / 15 | Contribution, security, PR template, CODEOWNERS, Dependabot, and license file are present. |
| GitHub settings | 11 / 15 | License file exists. Description, topics, and branch protection still need GitHub UI/API setup. |
| PR hygiene | 12 / 15 | Open PRs are visible; stale PRs still need final owner decision. |

## Fastest path to 100

```text
91点
 ├─ GitHub description/topics setting             +2
 ├─ main branch protection                         +6
 └─ stale PR close/merge decision                  +1
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

## Open PR cleanup candidates

| PR | Recommendation |
| --- | --- |
| #89 | Keep for review. Recent draft with clean merge state. |
| #85 | Keep for review. Recent draft with clean merge state. |
| #46 | Decide: close if brand-kit sync is no longer needed. |
| #18 | Decide: close if webhook hardening was superseded by current LINE work. |
| #17 | Decide: close if distribution spike is not part of the next production path. |
