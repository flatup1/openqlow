# ADR-0004: Knowledge Registry and SSOT

Status: Accepted for Design Pack; implementation pending
Date: 2026-08-14

## Context

Vault、canon、AI OS、Animation Bible、作品Promptに同じ内容が重複する。全部読むと重く、矛盾をPromptへ混入させる。

## Decision

Knowledgeをコピー統合せずRegistryで管理する。情報種別ごとに正本を一つ定義し、tag、authority、version、hash、statusで必要項目だけ取得する。

## Alternatives

- 全文を一つの巨大Promptにする
- 全資料をopenQLOWへコピー
- Vector searchだけに任せる

## Consequences

- 軽量で追跡可能。
- source pathの可用性検査が必要。
- External sourceがなくてもsafe fallbackが必要。
