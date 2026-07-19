# 02 資料統合マップ（DOCUMENT MERGE MAP）

作成: 2026-07-19 ／ **提案のみ。削除・移動・変更は一切実行していない。**
対象は `flatup1/openqlow` リポジトリ内で確認できた資料。ローカルVault・HelMES直下は対象外（オーナー確認後に別途分類）。

## 分類の意味

- **正本**: 唯一の真。矛盾したらこちらを採用。更新はここ1か所。
- **補助資料**: 正本を運用に落とすための現行文書。正本と矛盾したら正本が勝つ。
- **統合後にアーカイブ候補**: 役目を終えた文書。`docs/archive/` への移動を提案（実行はオーナー承認後）。
- **内容確認が必要**: 正誤・所在・現行性をオーナーに確認してから分類する。

## 1. 正本

| ファイル | 守備範囲 |
| --- | --- |
| `src/shared/canon.ts` | 料金・スケジュール・住所・アクセス等の事実データ |
| `src/shared/cancellation_rules.md` | 退会・休会・違約金 |
| `src/safety/forbidden_actions.ts` | openQLOW禁止8操作（コードで物理禁止） |
| `AGENTS.md` | AI共通ルール・承認ゲート（※参照先欠落は矛盾表#3） |
| `COORDINATION.md` | AI協業の担当割り |
| `docs/canon/00_FLATUP_AI_OS_CANON.md`（本セット） | 役割・権限・優先順位 |

## 2. 補助資料

| ファイル | 位置づけ |
| --- | --- |
| `knowledge/wiki/kindest-ai-response-policy.md` | 返信の質の規範（4観点チェック） |
| `knowledge/wiki/aika-vs-openqlow.md`・`forbidden-actions.md`・`openqlow-safety-rules.md` | 正本のやさしい解説 |
| `docs/REFERRAL_PLAYBOOK.md` | 紹介導線の実装詳細（日付のみ要更新＝矛盾表#8） |
| `docs/STATUS_AND_GAPS.md` | 実装状況の採点と残作業（未接続機能の判定に使う） |
| `docs/canon/10〜12`（AIKA事故防止）・`docs/canon/20〜23`（週次売上） | 本セットの運用文書 |
| `knowledge/sources/*` | 原本置き場（不可侵。古くても書き換えず、wikiで補正する） |

## 3. 統合後にアーカイブ候補（提案のみ）

| ファイル | 理由 |
| --- | --- |
| `docs/HANDOFF_*.md`（2026-06〜07の各ハンドオフ） | 引き継ぎ完了済み。履歴価値のみ |
| `docs/CODEX_REMAINING_WORK.md`・`CODEX_残作業指示書_2026-06-11.md`・`CODEX_貼り付け用依頼文.md` | STATUS_AND_GAPS（98点時点）に集約済みの旧指示書 |
| `docs/OPENQLOW_NEW_SYSTEM_DESIGN_2026-06-07.md` | 設計は実装に反映済み。現行仕様はコードとSTATUS_AND_GAPSが正 |
| flatup-ai-osを現行として書いた記述全般 | AIKA本番は `flatup1/flatup`（矛盾表#6） |

## 4. 内容確認が必要

| ファイル | 確認事項 |
| --- | --- |
| `knowledge/wiki/flatup-canonical-faq.md` | レディース14:00→14:30、営業時間の24hセルフ追記、更新手順の修正（矛盾表#1,2,4）。修正後は補助資料へ |
| `docs/AIKA_RULES.md`・`OPENQLOW_RULES.md`・`CAMPAIGN_RULES.md` | リポジトリに存在しない。所在の確認（矛盾表#3） |
| Vaultの `FLATUPGYM_AI_HOME.md`・`AIKA_OS_CONSTITUTION_v1.md`・`1_AIKA人格_本番.md` | このセッションから参照不能。canon.tsとの整合をオーナー環境で確認 |
| `docs/PERPETUAL_ENGINE_REQUIREMENTS.md`・`UNIFY_3_REPOS.md` | 現行性を確認のうえ、補助資料かアーカイブへ |

## 推奨する統合順

1. 矛盾表#1,2,4のwiki修正（機械的・リスクなし）
2. #3の所在確認 → AGENTS.md参照修正
3. #7会費ペイ・#11同意書式の確定 → cancellation_rules.md と casebook へ反映
4. アーカイブ候補の `docs/archive/` 移動（オーナー承認後）

## 今は統合しない方がよい資料

- `knowledge/sources/*`（原本不可侵の原則。統合ではなくwiki側で補正）
- Vault側文書（参照できない状態で統合すると、確認できない事実が正本へ混入する）
- `docs/REFERRAL_PLAYBOOK.md`（正本化するには日付・キャンペーン規約の確定が先）
