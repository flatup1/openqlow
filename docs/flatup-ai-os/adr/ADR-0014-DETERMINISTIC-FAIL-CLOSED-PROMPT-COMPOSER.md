# ADR-0014: Deterministic, Fail-closed Prompt Composer Baseline

Status: Accepted
Date: 2026-08-16

## Context

Phase 3は、短い依頼と選択済みKnowledgeから、感情設計、物語、CreativeBrief、Provider非依存Prompt IRを作る。ここでKnowledge不足を推測で埋めたり、ProviderやLLMへ早期接続したりすると、ブランド逸脱、再現不能、課金、既存AI OSとの競合が起きる。

## Decision

最初のDirector / Prompt Composerは、外部I/Oを持たない決定論的rule-based baselineにする。

- 入力は`RouteDecision`と`KnowledgeQueryResult`を明示的に受け取る。
- Knowledgeがblocked、またはBrand Constitutionが利用不能なら、CreativeBrief、PromptIR、render preview、final promptを作らずblocked resultを返す。
- 感情目標は1つ、Hero Momentは1つに固定する。
- Kids系はchild surfaceとparent deep layerの両方がなければreadyにしない。
- CoreはProvider名、endpoint、request syntaxを持たない。
- 作家、作品、制作会社、Studio等の直接style名は除去し、診断には除去数だけを残す。
- Negativeはidentity、anatomy、motion、temporal、environment、brandから必要カテゴリだけを合成する。
- Brief、PromptIR、VersionBundle、結果は生成後immutableにする。
- LLM、Provider、Vault、AIKA、LINE、公開、課金には接続しない。

## Alternatives

- Knowledge不足をdefault文で補い、Prompt生成を続行する。
- 最初からLLMに感情と物語を自由生成させる。
- Provider別Prompt文字列をCoreで直接作る。
- 全Negativeカテゴリを毎回一つの巨大な文字列として入れる。

## Consequences

- 同じ入力は同じ論理出力になり、テストと原因追跡が容易になる。
- Design Pack未統合の環境では安全停止するため、見かけ上の生成数よりブランド保護を優先する。
- 表現の幅はrule tableの範囲に限られる。LLMは後続Phaseで同じcontractの内側へ追加できる。
- style名検出はpattern-based baselineであり、辞書とtestの継続改善が必要になる。
- Provider最適化はCoreを変更せず、後続Adapterで行う。
