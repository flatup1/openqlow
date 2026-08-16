# ADR-0010: Logical Roles, Not Autonomous Agents

Status: Accepted for Design Pack; implementation pending
Date: 2026-08-14

## Context

Director、Creator、Guardian、Coach、Librarian、Strategist、Routerが必要だが、独立Agent群は複雑性と費用を増やす。

## Decision

各RoleをTypeScript module / service / pure functionとして実装する。最小構成は1プロセスとする。

## Alternatives

- 7 autonomous agents
- 1巨大Prompt

## Consequences

- 低コスト、testable、追跡可能。
- 将来必要なRoleだけ非同期jobへ分離できる。
- Agent間会話ではなくtyped contractが境界になる。
