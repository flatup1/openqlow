# ADR-0011: Preserve Explicit Owner Constraints in Typed Decisions

Status: Accepted
Date: 2026-08-15

## Context

「この写真を15秒に」のような最小入力でplatformが未指定の場合、尺をassumption文字列だけに残すと後続Phaseが安全に再利用できない。CTAもpolicy文字列だけではHuman Approval待ちか判定しにくい。

## Decision

RouteDecisionへrequested_duration_seconds: integer | nullとcta_approval_required: booleanを追加する。

- structured duration hint > raw textの明示値 > null
- 明示された有効な尺はplatformがnullでも保持する
- PlatformPlanがある場合は明示尺と一致させる
- 未指定のPlatform既定尺は明示値へ昇格させない
- 解釈不能値はnull + assumptionとし、例外や追加質問を発生させない
- Human Approval待ちCTAはcta_approval_required=trueとする
- Router contract versionは1.1.0とする

## Alternatives

- assumption文字列だけに残す
- platformを推測してPlatformPlanへ押し込む
- 尺が曖昧なたびにオーナーへ質問する

## Consequences

- 一行入力の明示条件を失わず、Phase 3のPrompt IRへ型付きで渡せる。
- platform推測とowner requestを区別できる。
- CTAの承認待ちを機械判定できる。
- RouteDecision利用側は1.1.0 fieldを扱う必要があるが、Phase 1時点では既存consumerがないため加算的に導入できる。
