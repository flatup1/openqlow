# HANDOFF: Claude Code → Codex

作成日時: 2026-08-16
作成者: Claude Code（実装担当）
受け手: Codex（設計・最終レビュー担当）
対象: FLATUP GYM AI OS Design Pack v1.0 / **Phase 4 Quality Guardian and Growth Metadata**

---

## 0. 最重要

受け手AIは、まず `COORDINATION.md` を読み、自分の担当領域だけを触ってください。

このハンドオフは **レビュー依頼** です。実装は commit 済みですが、push・PR・merge・deploy はしていません。
**§5 に、Codex の承認が必要な設計判断が1件あります。** そこだけは先に見てください。

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
commit: `971f53e94dc12d19b9cae2ba784a5f88499f04df`
branch: `claude/flatup-gym-ai-os-phase4-20260816`（ローカルのみ。未 push）

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
- [ ] push / PR / merge / deploy（理由：指示により禁止。JIN 承認後）
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
| `storage/config.ts` | `node:path`、`process.env`（保存先の差し替えのみ） |
| brand_growth 全体 | 外部 import は `src/shared/secret_guard.ts` と `src/shared/pii_guard.ts` の2本のみ |

「`storage/` 以下なら何でもよい」にはしていません。storage へ新しいファイルを足しても、
許可リストに書かない限り従来どおり落ちます（試験済み）。

### 変えていない禁止事項（全ファイル）

`src/aika` `port/aika` `line_bot` `src/publish` `src/safety` `src/shared/canon` の import 禁止、
`node:http` `node:https` `node:net` `node:child_process` `fetch(` `XMLHttpRequest` 禁止、
`Date.now(` `new Date(` `Math.random(` 禁止、外部 npm パッケージ禁止。

### なぜ guard を複製せず import したか

秘密情報・個人情報の検知パターンは、リポジトリで正本を1つに保ちたいためです。
brand_growth 内へ正規表現を複製すると、正本にパターンが追加されたとき brand_growth だけ古くなります。
どちらも副作用のない純関数で、canon / AIKA / 顧客データには触れません。

**この判断が設計意図と合っているか、Codex の確認をお願いします。**
合わない場合は、guard を brand_growth 内へ複製する案（正本二重化のリスクあり）へ切り替えます。

---

## 6. JIN確認待ち事項

| # | 内容 | 影響 |
| --- | --- | --- |
| 1 | §5 の境界検査の例外を認めるか | 認めない場合は実装方針の変更が要る |
| 2 | `claude/flatup-gym-ai-os-phase4-20260816` の push と PR 作成 | 未実施。承認後のみ |
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

1. **§5 の設計判断をレビューする**（最優先。ここが決まらないと他が動かせない）
2. AT-017〜022 の実装が受入条件の意図と合っているかを確認する
3. 反証テストの網羅が十分か（見落としている異常系がないか）を指摘する
4. Phase 5 の着手可否を判断する（§6 #4 のデータ状況を踏まえて）

---

## 8. 検証結果（全て緑）

| 項目 | 結果 |
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

baseline の `npm test` は 103件成功で、今回 `test:brand-growth-phase4` が1件増えて104件です。
既存テストの失敗・スキップ化・削除はありません。

---

## 9. 関連ドキュメント

- `COORDINATION.md` 現在のロック状況
- `docs/HANDOFF_20260816_codex→claude.md` 今回の依頼元
- `docs/flatup-ai-os/IMPLEMENTATION_BOOK.md` §6 Phase 4
- `docs/flatup-ai-os/CLAUDE_CODE_IMPLEMENTATION_SPEC.md` §11 Phase 4 Exact Scope
- `docs/flatup-ai-os/schemas/SCHEMA_CATALOG.md` §6 §10 §11 §12 §14 §15 §20
- `docs/flatup-ai-os/tests/ACCEPTANCE_TESTS.md` AT-017〜AT-022、AT-025
