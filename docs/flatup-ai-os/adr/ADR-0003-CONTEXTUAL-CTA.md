# ADR-0003: Contextual CTA

Status: Accepted for Design Pack; safety migration pending
Date: 2026-08-14

## Context

現行openQLOWは営業CTAを一律禁止する。新しいNorth Starは体験予約・入会である。全体blockを削除するとAIKAとブランド安全を壊す。

## Decision

CTAをcontext profileで分ける。

- customer_reply: existing policy unchanged
- pure_brand: no CTA
- soft_conversion: neutral navigation
- explicit_trial: calm invitation after approval
- campaign: approved canon only

## Alternatives

- CTAを全許可
- CTAを全禁止
- 作品ごとに手動例外

## Consequences

- 感情→体験導線を作れる。
- safety APIに後方互換wrapperが必要。
- profile誤分類は危険なのでtestsが必須。
