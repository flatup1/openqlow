# ADR-0013: Separate Pure Knowledge Query from Source Verification

Status: Accepted
Date: 2026-08-15

## Context

Phase 2 cloud worktreeにはCodex管理のDesign Packが存在しない。存在確認やhash計算をQueryへ追加するとfilesystem依存になり、再現性とtest isolationを失う。一方、未確認pathをactiveとして扱うと偽のKnowledgeを選ぶ危険がある。

## Decision

Knowledge RegistryとQueryはmetadata-only pure functionsにする。source pathの存在確認とhash計算は別のSource Verifier / Loader境界へ分離する。

- source本文fieldをKnowledgeEntry contractへ置かない
- source_hash nullまたは未検証entryをactiveにしない
- Design Pack未配置manifestはmissingとして正直に宣言する
- Constitution unavailableならqueryをblockedにする
- quarantined sourceはpath metadataだけを持ち、loaderを作らない
- pure Query testsはin-memory verified metadata fixtureを使う
- Source VerifierはDesign Pack integration後、別change setとHuman Approvalで追加する

## Alternatives

- Query実行時に直接filesystemを読む
- 未確認pathへ仮hashを与えてactiveにする
- Design Pack本文をTypeScriptへ複製する

## Consequences

- Phase 2は低cost、決定論的、秘密情報を読まない状態を保てる。
- Design Pack未配置時は実運用queryが止まるが、誤ったKnowledgeで進むより安全である。
- 実体配置後にSource Verifierを実装し、verified metadataをRegistryへ渡す追加作業が必要になる。
