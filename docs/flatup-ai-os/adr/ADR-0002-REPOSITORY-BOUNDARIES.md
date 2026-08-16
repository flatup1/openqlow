# ADR-0002: Repository Boundaries

Status: Accepted for Design Pack; implementation pending
Date: 2026-08-14

## Context

AIKA本番、Vault、旧AI OS、複数worktreeが混在する。役割混同が最大の事故要因である。

## Decision

- openQLOW: runtime host
- flatup: protected AIKA and human memory
- flatup-ai-os: legacy and migration reference
- Animation OS: prototype reference
- Web prototype: future consumer
- VPS: production boundary

Brand GrowthからAIKA、Vault、Webへ直接runtime importしない。

## Alternatives

- 全repositoryをmonorepo化
- AIKAへCreative機能を追加
- Vaultをruntime databaseにする

## Consequences

- 競合と本番事故を減らす。
- Cross-repo連携はAdapterとsnapshotが必要。
- 古い資料の便利な直参照を禁止する。
