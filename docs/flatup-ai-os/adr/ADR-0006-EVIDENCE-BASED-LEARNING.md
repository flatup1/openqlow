# ADR-0006: Evidence-based Learning Promotion

Status: Accepted for Design Pack; implementation pending
Date: 2026-08-14

## Context

1回の成功を永久ルールにすると偶然を学習する。既存loopのsynthetic reply scoreと実SNS成果も別物である。

## Decision

observation、hypothesis、candidate、validated learningを分離する。Validatedには独立再現、同一metric definition、limitations、JIN承認を必要とする。

## Alternatives

- AIが自動昇格
- 週次winnerを即best practice
- 学習を保存しない

## Consequences

- 学習速度は慎重になる。
- evidence trackingが必要。
- 誤学習とbrand driftを減らす。
