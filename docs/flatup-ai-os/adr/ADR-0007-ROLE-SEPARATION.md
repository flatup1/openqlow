# ADR-0007: Codex, Claude Code and Owner Roles

Status: Accepted by explicit project requirement
Date: 2026-08-14

## Context

既存COORDINATIONはCodexにも実装領域を割り当てる。今回の最上位要件はCodex設計、Claude Code実装、人間最終決定である。

## Decision

- Codex: audit、architecture、schema、ADR、acceptance、design review
- Claude Code: code、tests、migration、rollback、implementation report
- JIN: final approval、brand、money、production

## Alternatives

- 既存領域分担を維持
- 両AIが同じfilesを実装

## Consequences

- 責任が明確。
- AGENTSとCOORDINATIONにproject-specific overrideが必要。
- Codexは本Design Packの後にruntime codeを書かない。
