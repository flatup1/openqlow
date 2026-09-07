# ADR-0001: openQLOW as Host

Status: Accepted for Design Pack; implementation pending
Date: 2026-08-14

## Context

openQLOW、flatup、flatup-ai-os、Animation OS、Web prototypeが存在する。別の巨大OSを作ると正本、承認、LINE、Growthが重複する。

## Decision

Brand Growth OSをflatup1/openqlow内のbounded contextとして実装する。

## Alternatives

- 新規独立repository
- flatup-ai-osを拡張
- Vaultへ直接実装

## Consequences

- canon、approval、CRM、LINE owner channelを再利用できる。
- openQLOWの複雑性は増えるためmodule boundaryが必須。
- clean worktree以外で実装できない。
