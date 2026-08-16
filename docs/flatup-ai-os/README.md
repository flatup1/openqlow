# FLATUP GYM AI OS Design Pack v1.0

Status: Integrated design baseline, owner approved
Date: 2026-08-16
Implementation: Claude Code Phase 1〜3 and this Design Pack are pushed to the implementation branch; Source Verifier and production integration remain pending

## 最初に読む順番

1. REPOSITORY_AUDIT.md
2. GAP_ANALYSIS.md
3. VISION_BOOK.md
4. ARCHITECTURE_BOOK.md
5. IMPLEMENTATION_BOOK.md
6. OPERATIONS_BOOK.md
7. PROMPT_BIBLE.md
8. CLAUDE_CODE_IMPLEMENTATION_SPEC.md
9. tests/ACCEPTANCE_TESTS.md
10. DEFINITION_OF_DONE.md
11. INTEGRATION_SCORECARD.md

## 成果物

| 成果物 | 目的 |
| --- | --- |
| VISION_BOOK.md | 北極星、ブランド、感情設計、ガバナンス |
| ARCHITECTURE_BOOK.md | リポジトリ境界、モジュール、データフロー、承認 |
| IMPLEMENTATION_BOOK.md | Claude Code向けPhase、ファイル、Interface、Migration |
| OPERATIONS_BOOK.md | 日次・投稿・週次・月次・障害対応 |
| PROMPT_BIBLE.md | Provider非依存Prompt、Target、Camera、Negative、例 |
| CLAUDE_CODE_IMPLEMENTATION_SPEC.md | 変更対象・禁止対象・順序・テスト・完了条件 |
| BRAND_CONSTITUTION.md | Creative領域の最上位ブランド規範 |
| BRAND_DICTIONARY.md | 優しい、かっこいい、安心等の運用定義 |
| AGENTS_SPEC.md | ルーター兼実装ガードとしてのAGENTS.md仕様 |
| TARGET_ROUTER_SPEC.md | 短文入力の分類、既定値、confidence、質問条件 |
| KNOWLEDGE_REGISTRY_SPEC.md | 全カテゴリ、正本、取得上限、昇格・隔離 |
| CONFLICT_MATRIX.md | 他リポジトリとの競合と非破壊境界 |
| HEALTH_CHECK_SPEC.md | OS品質・知識・境界・安全の定期検査 |
| DEFINITION_OF_DONE.md | v1.0完成判定 |
| schemas/SCHEMA_CATALOG.md | 論理Schemaと不変条件 |
| tests/ACCEPTANCE_TESTS.md | 実装前に固定する受入試験 |
| adr/ | 重要設計判断 |
| SELF_REVIEW.md | 最終自己レビューと残る外部ゲート |
| INTEGRATION_SCORECARD.md | 競合防止の確認、現在地の採点、中学生向け説明 |

## この設計書の効力

- このDesign Packは新しいCreative / Brand Growth領域の設計正本です。
- 料金、住所、時間、クラス等の実事実は引き続きopenQLOWのsrc/shared/canon.tsが正本です。
- AIKA人格はflatupリポジトリと本番VPSの既存正本を変更しません。
- 既存コードと本番挙動は、Claude Codeが実装し、テストとJIN承認を通るまで変更されません。
- 本書にあるブランド文言を既存canonへ反映する作業は別のHuman Approval対象です。

## 2026-08-16 Phase 1〜3 Design Sync

- JINがCredential rotationと旧資格情報の無効化完了を宣言した。値は閲覧・記録していない。
- Claude Code cloudの隔離branchでPhase 1 Router candidateを実装し、全指定testはexit 0だった。
- Codex reviewで、platform未指定時にも明示尺を保持するRouteDecision v1.1.0を承認した。
- 新しい正本判断はADR-0011、SCHEMA_CATALOG v1.1.0、TARGET_ROUTER_SPEC v1.1.0、AT-047へ反映した。
- Claude CodeがRouter v1.2.0へ改善し、宣言的phrase lexicon、決定論的score、否定表現、NFKC表記揺れ、42件のparaphrase fixtureを追加した。
- Codex reviewでPhase 1 DoD 100/100を確認し、ADR-0012、TARGET_ROUTER_SPEC v1.2.0、AT-048へ反映した。
- JINの承認後、Phase 1 `b941924`とPhase 2 `dd82d90`はbranch `claude/flatup-gym-ai-os-phase1-15lytr`へpush済み。
- Claude CodeがPhase 2 Knowledge Registry候補を実装し、AT-035、AT-036、AT-042、6種のnegative control、全回帰testを通過した。
- Phase 2のcloud manifestはDesign Pack不在を偽装せず全entryをmissingとし、Constitution unavailableで安全停止する。Codex判断はADR-0013とAT-049へ反映した。
- Claude CodeがPhase 3 Director / Prompt IRを実装し、感情目標1つ、Hero Moment 1つ、Kids二層構造、Provider非依存、style名除去、選択的Negative、version traceを固定した。
- Phase 3は指定test、typecheck、root tests、両validator、保護19領域差分0を確認し、commit `fcdb1b6`へ保存してpush済み。PRは未作成。
- blocked KnowledgeからCreativeBriefやPromptを作らないfail-closed判断をADR-0014とAT-050へ反映した。
- このworktreeと既存本番Runtimeの挙動は変わっていない。

## 一文で表すArchitecture

openQLOWの中に小さなBrand Growthモジュールを追加し、必要なKnowledgeだけを選び、感情設計からProvider非依存Promptを作り、既存の承認・投稿導線へ渡し、実測成果を仮説と学習へ戻す。
