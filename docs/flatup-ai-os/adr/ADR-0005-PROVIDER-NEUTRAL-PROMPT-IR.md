# ADR-0005: Provider-neutral Prompt IR

Status: Accepted for Design Pack; implementation pending
Date: 2026-08-14

## Context

Veo、fal、BytePlus、旧Animation OSは異なるrequest形式を持つ。Provider固有PromptをCoreへ置くと交換できない。

## Decision

Target、Story、Motion、Camera、Negative等をPrompt IRとして保持し、Provider Adapterがrequestへ変換する。

## Alternatives

- ProviderごとにPrompt library
- 一つの英語文字列だけ保存
- 現行Veoへ固定

## Consequences

- Provider交換と比較が容易。
- Adapter contractとcapability validationが必要。
- Provider特有の最適化はAdapter versionで追跡する。
