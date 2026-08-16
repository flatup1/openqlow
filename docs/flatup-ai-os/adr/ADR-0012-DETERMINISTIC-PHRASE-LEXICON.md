# ADR-0012: Deterministic Phrase Lexicon Before LLM Assistance

Status: Accepted
Date: 2026-08-15

## Context

Phase 1 Routerの単純なkeyword判定は、言い換え、全角半角、日本語長音符、否定表現、`online`内の`line`のような部分一致で誤判定しやすい。一方、Phase 1で外部LLMやKnowledge検索を導入すると、cost、latency、再現性、privacy、既存境界が悪化する。

## Decision

Phase 1は外部LLMを使わず、宣言的phrase lexiconと決定論的scoringを採用する。

- categoryごとにvalue、phrases、weight、word-boundaryを宣言する
- Unicode NFKC、lowercase、空白・句読点の正規化を一度だけ行う
- 日本語長音符「ー」は保持する
- valueごとの合計scoreで選び、同点は宣言順で固定する
- 明示hintはscoreより優先する
- 否定されたphraseはpositive evidenceから除外する
- 未知表現はsafe default + assumptionとする
- 語彙追加はCore判定を書き換えずlexicon変更で行う
- Router contract versionを1.2.0へ上げる

## Alternatives

- substring keywordを各classifierへ直接記述する
- Phase 1から外部LLM分類へ送る
- confidenceが低いたびにオーナーへ質問する

## Consequences

- 同じ入力から同じ結果を低cost・低latencyで得られる。
- 表記揺れ、主要な否定、部分一致の誤判定をtestできる。
- 語彙は有限であり、未知表現はassumptionを観測してlexiconへ追加する必要がある。
- より複雑な意味理解が必要になった場合も、Phase 2以降でoptional assistanceとして追加し、deterministic coreをfallbackに残せる。
