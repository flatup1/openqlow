# AGENTS.md Specification

目的: openQLOWへ実装する際、AGENTS.mdをルーター兼安全ガードとして拡張する仕様。

## 1. 最上位の役割

- JIN: 最終意思決定
- Codex: 設計、ADR、受入基準、設計レビュー
- Claude Code: 実装、テスト、migration、rollback

本プロジェクトでは既存COORDINATIONの一般的な担当表より、この役割分離を優先する。変更はJIN承認後にproject scopeとして追記する。

## 2. 最初に読む順番

Claude Codeは次の順に読む。

1. AGENTS.md
2. COORDINATION.md
3. docs/flatup-ai-os/CLAUDE_CODE_IMPLEMENTATION_SPEC.md
4. 対象PhaseのImplementation Book
5. 関連ADR
6. src/shared/canon.ts
7. 対象schemaとacceptance tests

全Design Packを毎回Promptへ詰め込まない。対象Phaseと関連ADRだけを読む。

## 3. Router Table

| 作業 | 読む設計 | 触れる領域 |
| --- | --- | --- |
| Input / Router | Architecture、Schema、Acceptance | src/brand_growth/router |
| Knowledge | Architecture、Constitution、Dictionary | src/brand_growth/knowledge |
| Prompt | Prompt Bible、Schema | src/brand_growth/prompts |
| Quality | Constitution、Prompt Bible | src/brand_growth/quality |
| Provider | Provider ADR、Schema | src/brand_growth/providers |
| Growth | Operations、Schema | src/brand_growth/growth |
| Learning | Learning ADR、Operations | src/brand_growth/learning |
| Weekly Coach | Operations、Approval ADR | src/brand_growth/coach |
| UI | Implementation、mobile acceptance | animation-studio、Phase 6のみ |

## 4. Protected Areas

明示的な別承認なしに触らない。

- src/aika
- AIKA Python code
- flatup repository
- Obsidian Vault
- src/shared/canon.ts
- src/safety/forbidden_actions.ts
- production LINE webhook
- deploy/systemd
- existing publish execution
- provider credentials

## 5. Required Work Protocol

1. Phaseを一つ選ぶ。
2. clean worktreeを確認する。
3. 対象ファイルと非対象ファイルを列挙する。
4. acceptance testを先に追加する。
5. pure functionから実装する。
6. external side effectはDemo / fakeを使う。
7. root npm testと新規testを通す。
8. diffでProtected Areaが含まれないことを確認する。
9. implementation reportを作る。
10. commit / push / mergeはJINの運用規則に従う。

## 6. Stop Conditions

- target repositoryがdirty
- Credential incidentが未解消
- canon値の変更が必要
- AIKAへの変更が必要
- CTA方針を全体で弱める必要がある
- paid APIを実行する必要がある
- acceptance criteriaが矛盾
- owner decisionが必要なbrand wording
- raw customer dataが必要

## 7. Definition of Safe Output

- No external send
- No paid generation
- No production write
- No secret output
- No PII in fixture
- No hardcoded canon fact
- No Provider field in Core contract
- No direct style names
- No automatic learning promotion

## 8. Handoff Format

- Phase
- Changed files
- Why
- Tests
- Compatibility
- Known limitations
- Rollback
- Owner approvals still needed
- Next phase
