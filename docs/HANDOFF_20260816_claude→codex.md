# HANDOFF: Claude Code → Codex

作成日時: 2026-08-16
作成者: Claude Code（実装担当）
受け手: Codex（設計・最終レビュー担当）
対象: FLATUP GYM AI OS Design Pack v1.0 / **Phase 4 Quality Guardian and Growth Metadata**

---

## 0. 最重要

受け手AIは、まず `COORDINATION.md` を読み、自分の担当領域だけを触ってください。

このハンドオフは **レビュー依頼** です。
**§5 に、Codex の承認が必要な設計判断が1件あります。** そこだけは先に見てください。

> **最終更新（2026-08-29 / Codex）**
> JINの明示承認により、境界仕上げcommit `14aae4b`をbranchへpushし、最新`main`との競合を解消して
> 本merge commitで統合しました。deployと実データ投入は行っていません。
> 以下に残る「未push・merge待ち」は当時の履歴であり、この最終更新が優先します。

> **更新（2026-08-29 / Claude Code）**
> 作成時点（2026-08-16）の「ローカルのみ・未 push・`971f53e`・レビュー待ち」という記述は、現在の状態と一致しません。
> - branch は `claude/flatup-gym-ai-os-phase4-20260816`。
> - **remote baseline は `b5c3965`**（`main` を取り込んだ merge commit。Codex のレビュー反映 `706da60` を含む）。
>   `origin/claude/flatup-gym-ai-os-phase4-20260816` はこの commit を指しており、**ここまでは push 済み**です。
> - **2026-08-29 の境界仕上げは、この baseline の上のローカル 1 commit のみで、未 push です**
>   （ローカルは remote より 1 commit ahead）。仕上げ commit の SHA はこの文書に埋め込みません。
>   正本は `git log -1` です。
> - push・PR・merge・deploy はいずれも未実施です（JIN 承認待ち）。
> - その仕上げの内容: `storage/config.ts` は環境変数と暗黙の作業ディレクトリ依存を持たない
>   caller-injected な純関数になり、境界検査の `process.env` 例外は撤廃されています。判断は
>   `docs/flatup-ai-os/adr/ADR-0015-NARROW-LOCAL-EVENT-STORE-BOUNDARY.md` に記録しました。
> - **§5 の設計判断は 2026-08-29 に Codex が Approved しました**（ADR-0015 / 詳細は §5 の注記）。
>   Codex 側のレビュー事項はクローズ済みです。残る承認は JIN による push / PR / merge / deploy と実データ投入の判断のみです。
> - したがって以下の §1 §3 §5 §6 §8 は **2026-08-16 時点の記録** として読んでください。差分は本注記が優先します。

---

## 1. 今回やったこと

- [x] `src/brand_growth/quality/` 決定論的な事前 Quality Guardian と post-QA 契約
- [x] `src/brand_growth/storage/` 追記専用の原子的 JSONL イベントストア
- [x] `src/brand_growth/growth/` 費用集計・手入力実測値・実験比較
- [x] 受入条件 AT-017 / AT-018 / AT-019 / AT-020 / AT-021 / AT-022 の実装とテスト
- [x] AT-025（未成年同意）の Phase 4 側（生成前ブロック）
- [x] 反証テスト・変異テストの追加（詳細は §4）
- [x] `src/brand_growth/index.ts` へ公開 export を追加
- [x] `package.json` へ `test:brand-growth-phase4` を追加
- [x] `.gitignore` へ既定保存先 `/runtime/` を追加

baseline: `09da63131bf2b5327f5ba2a890aedd516b537a70`
commit: `971f53e94dc12d19b9cae2ba784a5f88499f04df`（2026-08-16 時点）
branch: `claude/flatup-gym-ai-os-phase4-20260816`

> 2026-08-29 現在: remote baseline は `b5c3965`（Codex 反映 `706da60` → `main` merge）で、そこまでは push 済み。
> その上に 2026-08-29 の境界仕上げがローカル 1 commit だけ載っており、これは未 push です。
> `971f53e` は後続の作業で history に残っていません。

### 設計上の判断（SCHEMA_CATALOG との対応）

| 項目 | 実装した約束 | 根拠 |
| --- | --- | --- |
| blocking 検査 | 1つでも fail なら `passed=false` | §11 |
| 未確認の検査 | pass にせず `unknown` のまま残し、`passed=false`（fail closed） | §1「unknown と 0 を区別」 |
| usable の数え方 | `human` / `hybrid` の判定のみ。`automated` は数えない | §20 |
| usable=0 かつ cost>0 | `effective_cost_per_usable=null` / `reason=no_usable_output` / health warning | §20、AT-018 |
| 費用が未記録 | 0円として合算しない。`provider_cost_complete=false` と警告 | §1 |
| 通貨混在 | 合算も除算もせず `reason=mixed_currency` | §1 |
| 未取得の指標 | `null`。0 に丸めない | §14、AT-019 |
| 手入力 | `entered_by` / `entered_at` / `evidence_reference` を必須 | §14 |
| 予測と実測 | 別型・別ラベル（`ai_prediction` / `observed_metric`）。`averaging_allowed: false` | §6、AT-020 |
| 実験 | 違い1つ = `one_variable`、複数 = `exploratory` | §15、AT-021/022 |
| `causal_claim_allowed` | 常に `false`（型リテラル） | §15 |
| Validated Learning | `validated_learning_allowed: false` を型リテラルで固定 | Phase 5 とオーナー承認が要るため |
| capture window 不一致 | 比較せず `comparable=false` / `direction=unknown` | §14 |
| 時刻 | 全て引数。モジュール内で時計を読まない（決定論性） | Phase 1〜3 と同じ |

---

## 2. 未完了で残したこと

- [ ] `COORDINATION.md` の担当表の構造変更（理由：共有領域の構造変更は JIN 最終承認。今回は状態行の更新のみ）
- [x] 2026-08-29 の境界仕上げcommit `14aae4b`のpush（JIN承認済み）
- [x] 最新`main`へのmerge（JIN承認済み。本merge commit）
- [ ] deploy（未承認・未実施）
- [ ] Phase 5（learning 昇格 / Weekly Coach）（理由：指示により禁止）
- [ ] Phase 6（Demo Provider）(理由：指示により禁止)
- [ ] **実データの投入（0件）**（理由：手入力はオーナー作業。詳細は §6）

---

## 3. 触ったファイル

```
M  .gitignore                                    (+3)   /runtime/ を追加
M  package.json                                  (+3-1) test:brand-growth-phase4 を追加
M  src/brand_growth/index.ts                     (+88)  export 追加のみ
M  src/brand_growth/router/router.test.ts        (+66-15) ★ §5 参照
A  src/brand_growth/contracts/record_rules.ts    (+122)
A  src/brand_growth/contracts/quality.ts         (+96)
A  src/brand_growth/contracts/growth.ts          (+291)
A  src/brand_growth/quality/preflight.ts         (+303)
A  src/brand_growth/quality/post_qa.ts           (+179)
A  src/brand_growth/quality/quality.test.ts      (+611)
A  src/brand_growth/storage/config.ts            (+98)
A  src/brand_growth/storage/event_store.ts       (+217)
A  src/brand_growth/storage/storage.test.ts      (+375)
A  src/brand_growth/growth/cost.ts               (+196)
A  src/brand_growth/growth/metrics.ts            (+291)
A  src/brand_growth/growth/experiment.ts         (+264)
A  src/brand_growth/growth/growth.test.ts        (+855)

17 files changed, 4043 insertions(+), 15 deletions(-)
```

既存ファイルの削除・全面上書きはありません。`index.ts` は末尾追記のみです。

---

## 4. 受け手AIへの注意

### 触っていない領域（差分0を確認済み）

`src/shared` `src/safety` `src/aika` `port` `src/line_bot` `src/publish` `src/scheduler`
`src/loop` `src/approval` `src/commands` `src/crm` `src/adapters` `src/conversation`
`src/state` `src/privacy` `src/monitor` `src/generators` `src/sources` `src/distribution`
`src/keihi` `animation-studio` `deploy` `scripts` `launchd` `knowledge` `tools`
`flatup-lp` `docs` `.github` — **29領域すべて0ファイル**

### 外部影響

ネットワーク、LLM、外部API、課金、DB migration、自動投稿、SNS自動取得、本番接続は **ゼロ**。
ファイル書き込みはテストの一時ディレクトリのみ（`runtime/` は生成されず、`/tmp` 残骸0）。
既定は機能OFF。呼ばれなければ1バイトも書きません。

### 実装中に見つけて直した実バグ（2件）

反証テストが検出しました。テストを緩めるのではなく実装を直しています。

1. `assertSafeId` が `evt_090-1234-5678` を見逃していた。
   `_` と数字の間に単語境界 `\b` が立たないため。区切り記号を空白へ均してから再走査するよう修正。
2. `deepFreeze` が循環参照でスタックオーバーフローしていた。
   `WeakSet` で訪問済みを管理するよう修正。保存時は別途 `unserializable_record` で弾く。

### テストが空振りでないことの証明

- blocking 検査7項目を1つずつ `fail` にして、毎回 `passed=false` になることを確認
- Negative 分類（identity / anatomy / temporal / environment / brand）を1つずつ抜いて、対応する検査だけが落ちることを確認
- 満点の score が blocking の fail を覆せないことを確認
- 境界検査へ13種の違反を一時注入し、13/13 で検知（残骸0）
- AT-021 の one-variable に尺の変更を1つ足すと `exploratory` へ反転することを確認
- AT-020 の出力 JSON に平均値（51.5 / 41.1）が存在しないことを確認

### 既知の限界

- 原子的追記は POSIX `O_APPEND` の単一 write に依存。同一マシン60並列で0破損を確認済みだが、ネットワークFSでは非保証。
- fail closed のため、Prompt 未生成の段階では preflight は必ず止まる（仕様）。
- 保存は JSONL のみ。SQLite / DB migration は使っていない（SPEC §11「least complex compatible store」）。

---

## 5. ★ Codex の承認が必要な設計判断（1件）

**`src/brand_growth/router/router.test.ts` の境界検査に例外を追加しました。**

> **更新（2026-08-29）**: 例外は **ファイル I/O のみ** に絞り込みました。
> 環境変数の例外（`storage/config.ts` の `process.env`）は撤廃し、`src/brand_growth` 全体で
> `process.env` と `process.cwd(` を禁止しています。fs / path の許可はファイル単位の完全一致だけで、
> storage に新しいファイルを足しても権限を継承しないことを恒久的な反証テストで固定しました。
> 判断の正本は `docs/flatup-ai-os/adr/ADR-0015-NARROW-LOCAL-EVENT-STORE-BOUNDARY.md` です。

### なぜ必要か

Phase 1〜3 は純関数のみで成立していたため、この境界検査は
「brand_growth 内の全ファイルは node 組み込みを使わない・外部 import しない・`process.env` を読まない」
を全ファイル一律で禁止していました。

Phase 4 の要件（IMPLEMENTATION_BOOK §6 / SPEC §11）は
「configurable root」「default local runtime directory」「atomic append」「PII and secret guard」
であり、**ファイル I/O と環境変数の読み取りが設計上不可避**です。

### 何を許したか（ファイル単位の許可リスト）

| ファイル | 許した内容 |
| --- | --- |
| `storage/event_store.ts` | `node:fs/promises`、`node:path` |
| `storage/config.ts` | `node:path` のみ ※ 2026-08-29 更新: 環境変数の読み取りは撤廃し、保存先は呼び出し側から明示注入する |
| brand_growth 全体 | 外部 import は `src/shared/secret_guard.ts` と `src/shared/pii_guard.ts` の2本のみ |

「`storage/` 以下なら何でもよい」にはしていません。storage へ新しいファイルを足しても、
許可リストに書かない限り従来どおり落ちます（試験済み）。

### 変えていない禁止事項（全ファイル）

`src/aika` `port/aika` `line_bot` `src/publish` `src/safety` `src/shared/canon` の import 禁止、
`node:http` `node:https` `node:net` `node:child_process` `fetch(` `XMLHttpRequest` 禁止、
`Date.now(` `new Date(` `Math.random(` 禁止、外部 npm パッケージ禁止。
（2026-08-29 追加: `process.env` `process.cwd(` も全ファイル禁止。）

### なぜ guard を複製せず import したか

秘密情報・個人情報の検知パターンは、リポジトリで正本を1つに保ちたいためです。
brand_growth 内へ正規表現を複製すると、正本にパターンが追加されたとき brand_growth だけ古くなります。
どちらも副作用のない純関数で、canon / AIKA / 顧客データには触れません。

### ✅ Codex レビュー結果（2026-08-29 / **Approved**）

Codex の最終設計レビューで **承認**されました。正本は
`docs/flatup-ai-os/adr/ADR-0015-NARROW-LOCAL-EVENT-STORE-BOUNDARY.md`（`Codex Review: 2026-08-29 = Approved`）です。

- **absolute root のみ・cwd 無しの経路**: 現 Phase 4 では受容。根拠は、機能が OFF であること（未呼出しなら1バイトも書かない）、
  呼び出し元が未接続であること、明示 root が管理側の信頼済み入力であることの3点。
  **運用条件**: 将来の本番 integration caller は、追跡領域保護（forbidden path 検証）を必ず効かせるため
  **absolute cwd / repositoryRoot を必須で渡す**こと。
- **部分文字列による境界検査**: 保守的な fail-closed として承認。見逃しより安全側であるため意図どおり。

これにより、guard を brand_growth 内へ複製する代替案（正本二重化のリスクあり）は採用しません。

---

## 6. JIN確認待ち事項

| # | 内容 | 影響 |
| --- | --- | --- |
| 1 | ~~§5 の境界検査の例外を認めるか~~ → **resolved（2026-08-29 Codex Approved）** | 対応不要。ADR-0015 に記録済み。本番 caller は absolute cwd 必須の運用条件付き |
| 2 | `claude/flatup-gym-ai-os-phase4-20260816` のpush / merge | **resolved（2026-08-29 JIN承認・完了）**。deployは別承認 |
| 2b | 2026-08-29 の境界仕上げcommit `14aae4b`のpush | **resolved（push済み）** |
| 3 | `COORDINATION.md` の担当表の構造変更 | 今回は状態行の更新のみに留めた |
| 4 | **実データ投入の開始**（下記） | Phase 5 の前提。ここが未着手だと Phase 5 は空回りする |

### #4 の補足（コスト最小・効果最大の次の一手）

Phase 4 で作ったのは「測る道具」であり、現時点で記録は **0件** です。
Phase 5 の `validated_learning` は「独立した3回以上の再現」が要件のため、
**今からデータを貯め始めないと、Phase 5 を実装しても昇格できるものが存在しません。**

コード追加ゼロで始められる最短手順:

1. 既存のやり方で動画を1本作る（生成AIでも撮影でもよい）
2. かかった費用を記録する（0円ならそれも記録。未記録と0円は区別される）
3. 人の目で usable / rejected を判定する（`automated` は費用計算に数えない）
4. 投稿する
5. 24時間後、分かる指標だけ入力する（分からない項目は空のままでよい。0 にはならない）

これで「使える1本あたりいくらか」と「予測と実測のズレ」が初めて出ます。

---

## 7. 次にやってほしいこと

1. ~~**§5 の設計判断をレビューする**~~ → **completed（2026-08-29 Codex Approved）**。ADR-0015 に記録済み
2. AT-017〜022 の実装が受入条件の意図と合っているかを確認する
3. 反証テストの網羅が十分か（見落としている異常系がないか）を指摘する
4. Phase 5 の着手可否を判断する（§6 #4 のデータ状況を踏まえて）

---

## 8. 検証結果（全て緑）

### 8-1. 2026-08-16 時点の記録（作成当時の値。現在値は §8-2）

下の表は **Phase 4 実装 commit（当時 `971f53e`）時点の記録** です。
その後 Codex レビュー反映 `706da60`、`main` merge `b5c3965`、2026-08-29 の境界仕上げが入っているため、
件数・ファイル数は現在値と一致しません。**現在値は §8-2 を参照してください。**

| 項目 | 結果（2026-08-16 時点） |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run test:brand-growth` | 10スイート pass |
| `npm run test:brand-growth-phase4` | 3スイート pass |
| `npm test` | 成功 104件 / 失敗 0件 |
| `./scripts/validate-ai-os.sh` | passed |
| `./scripts/validate-ai-os.test.sh` | passed |
| `test:secret-guard` | 457ファイル / 0 leaks |
| `test:pii-guard` | 157ファイル / 0 PII |
| `test:no-hardcoded-canon` | 162ファイル / 0 violations |
| `git diff --check` | exit 0 |
| 保護領域監査 | 29領域すべて差分0 |

baseline の `npm test` は 103件成功で、当時 `test:brand-growth-phase4` が1件増えて104件でした。
既存テストの失敗・スキップ化・削除はありません。

### 8-2. 最新の検証結果（2026-08-29 / 境界仕上げ commit 時点・全て緑）

| 項目 | 結果 |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run test:brand-growth` | exit 0（10スイート pass） |
| `npm run test:brand-growth-phase4` | exit 0（4スイート pass） |
| `npm test` | **成功 116件 / 失敗 0件** |
| `./scripts/validate-ai-os.sh` | exit 0 |
| `./scripts/validate-ai-os.test.sh` | exit 0（下記の注記あり） |
| `test:secret-guard` | 486ファイル / 0 leaks |
| `test:pii-guard` | 163ファイル / 0 PII |
| `test:no-hardcoded-canon` | 168ファイル / 0 violations |
| `git diff --check` | exit 0 |
| 保護領域監査 | 31領域すべて差分0 |

104件 → 116件の増加は、2026-08-16 以降に `main` を merge して既存テストが増えたためです。
Phase 4 側でテストを削除・スキップ化したものはありません。

**`validate-ai-os.test.sh` の注記**: 既定のまま実行すると exit 1 になります。
原因はグローバルの `init.templateDir`（`~/.git-templates/git-secrets`）で、self-test が一時ディレクトリで
`git init` した際に git-secrets の pre-commit フックが入り、リポジトリ自身の `src/shared/secret_guard.ts` の
**検出パターン定義**（実在の秘密情報ではありません）を誤検知します。
空の一時 `GIT_TEMPLATE_DIR` を指定して再実行すると exit 0 です。
この事象は 2026-08-29 の変更前の commit でも同じく再現するため、環境要因であり実装起因ではありません。

---

## 9. 関連ドキュメント

- `COORDINATION.md` 現在のロック状況
- `docs/HANDOFF_20260816_codex→claude.md` 今回の依頼元
- `docs/flatup-ai-os/IMPLEMENTATION_BOOK.md` §6 Phase 4
- `docs/flatup-ai-os/CLAUDE_CODE_IMPLEMENTATION_SPEC.md` §11 Phase 4 Exact Scope
- `docs/flatup-ai-os/schemas/SCHEMA_CATALOG.md` §6 §10 §11 §12 §14 §15 §20
- `docs/flatup-ai-os/tests/ACCEPTANCE_TESTS.md` AT-017〜AT-022、AT-025
