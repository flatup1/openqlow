# ADR-0009: Manual Metrics Before Connectors

Status: Accepted for Design Pack; implementation pending
Date: 2026-08-14

## Context

現在のperformance logsは全件pendingで、platform API接続はない。先に複数APIを作ると工数と権限が増える。

## Decision

v1はmanual entryとCSV importを先に実装し、MetricSnapshotと運用を安定させてからConnectorを追加する。

## Alternatives

- 最初から全SNS API
- Metricsを後回し

## Consequences

- 最短でGrowth Loopを検証できる。
- 一部入力工数が残る。
- source、operator、captured_atを必須にする。
