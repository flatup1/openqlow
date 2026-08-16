# HANDOFF: Codex → Claude Code

作成日時: 2026-08-16
作成者: Codex
受け手: Claude Code

---

## 0. 最重要

最初に`AGENTS.md`と`COORDINATION.md`を読み、Claude Code担当の`src/brand_growth/`だけを実装してください。Codex担当の`docs/flatup-ai-os/`、AIKA、LINE、canon、安全、承認、公開、deployは読み取り専用です。

---

## 1. 今回やったこと

- [x] Phase 3 `fcdb1b6`の実装報告をDesign Packへ反映
- [x] Phase 3 `fcdb1b6`を実装branchへpushしremote HEADを照合
- [x] Design Packを実装branchへ渡すdocs-only commitを準備
- [x] ADR-0014とAT-050を追加し、blocked KnowledgeからBrief / Promptを作らない判断を固定
- [x] Phase 1〜3、push状態、DoD、競合境界を`AGENTS.md`と`COORDINATION.md`へ同期
- [x] Design Packを35 Markdown / 5,633行 / 14 ADR / 50 Acceptance Testsへ更新
- [x] 既存root tests、AI OS validators、link、secret、named-style、runtime diffを検証

## 2. 未完了で残したこと

- [ ] verified Knowledge sourceのSource Verifier統合（理由：Claude Code実装が必要）
- [ ] separate Source Verifier（理由：pure Queryへfilesystem I/Oを混ぜない）
- [ ] Phase 4 Quality Guardian / Growth Metadata（理由：前2項の完了後に開始）

## 3. 触ったファイル

```text
M  AGENTS.md
M  COORDINATION.md
M  docs/ai-os/README.md
A  docs/flatup-ai-os/
A  docs/HANDOFF_20260816_codex→claude.md
```

Runtime、package、scripts、deploy、本番環境は変更していない。

## 4. 受け手AIへの注意

- Phase 1 `b941924`とPhase 2 `dd82d90`はremote branch `claude/flatup-gym-ai-os-phase1-15lytr`へpush済み。
- Phase 3 `fcdb1b6`は同branchへpush済み。
- Phase 3 DoDは100/100。`npm run test:brand-growth`、typecheck、root tests、両validatorはexit 0、保護19領域は差分0。
- cloud側Design Packが未配置のため、default Knowledge manifestは全entry missingで正しく安全停止する。
- fixtureの`source_hash: "fixture-only-not-a-real-hash"`はtest専用。productionへ使用しない。
- Provider、API、Vault、LLM、AIKA、LINE、課金、公開、本番接続を有効化しない。
- commit / push / PRは対象ごとにJINの明示承認を確認する。

## 5. JIN確認待ち事項

| # | 内容 |
|---|---|
| 1 | Source Verifier実装を開始してよいか |
| 2 | Source Verifier完了後にPhase 4を開始してよいか |

## 6. 次にやってほしいこと

1. Codex Design Packを読んだうえで、Source Verifierを独立change setとして実装・テストする。
2. KnowledgeがverifiedになるまでPromptを生成しないfail-closedを維持する。
3. 改めてJIN承認後、Phase 4を`CLAUDE_CODE_IMPLEMENTATION_SPEC.md`の範囲だけ実装する。

## 7. 関連ドキュメント

- `COORDINATION.md`
- `docs/flatup-ai-os/README.md`
- `docs/flatup-ai-os/CLAUDE_CODE_IMPLEMENTATION_SPEC.md`
- `docs/flatup-ai-os/CONFLICT_MATRIX.md`
- `docs/flatup-ai-os/adr/ADR-0013-SEPARATE-KNOWLEDGE-QUERY-FROM-SOURCE-VERIFICATION.md`
- `docs/flatup-ai-os/adr/ADR-0014-DETERMINISTIC-FAIL-CLOSED-PROMPT-COMPOSER.md`
- `docs/flatup-ai-os/tests/ACCEPTANCE_TESTS.md`
- `docs/flatup-ai-os/DEFINITION_OF_DONE.md`
