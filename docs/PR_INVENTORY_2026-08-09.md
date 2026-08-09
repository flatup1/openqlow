# 滞留Pull Requestの棚卸し（2026-08-09時点）

open のまま残っている Pull Request 9本を、1本ずつ中身を読んで「マージ / 作り直し / 閉じる」に仕分けた。

この文書は**判断材料**であり、close・merge の操作はしていない。実際に閉じる・マージするのは人間の操作。

## 調べ方（数字の出どころ）

- 比較の基準は `origin/main`（`6615ef9`）。ローカルの `main` は古い場合があるので必ず `git fetch origin main` してから見る。
- 「遅れ」= 分岐点から `origin/main` までのコミット数。大きいほど、そのPRが書かれた当時の前提が古い。
- 「試しマージ」= `git merge-tree --write-tree origin/main <branch>` の結果。作業ツリーを汚さずに衝突だけを調べられる。

```bash
git fetch origin main
base=$(git merge-base origin/main <branch>)
git rev-list --count $base..<branch>     # 追加コミット
git rev-list --count $base..origin/main  # 遅れ
git merge-tree --write-tree --name-only origin/main <branch>  # 衝突
```

## 一覧

| PR | 内容 | 追加 | 遅れ | 変更 | 試しマージ | 判定 |
|---|---|---|---|---|---|---|
| #75 | uizinクリッパーMVP（大会動画の切り出し） | 2 | 0 | 32 | 衝突なし | **マージ候補** |
| #74 | 未成年入会 保護者同意書のA4印刷テンプレ | 1 | 0 | 1 | 衝突なし | **マージ候補** |
| #73 | 「昔→今」型のSNS投稿テンプレ | 1 | 0 | 1 | 衝突なし | **マージ候補**（要検品） |
| #17 | 配信スパイク群（craft_score / publish_kit） | 13 | 207 | 15 | package.json のみ | **作り直し（rebase）** |
| #46 | ブランドキット（ds-bundle） | 5 | 104 | 263 | canon.ts 他3件 | **作り直し（一部だけ）** |
| #34 | SDL hardening（CI / ESLint / nginx / run-lock） | 24 | 123 | 71 | ci.yml 他 | **閉じる＋4点を再起票** |
| #25 | SNS一括投稿（Threads/IG/FB） | 20 | 170 | 44 | webhook.ts 他 | **閉じる＋方針から再設計** |
| #18 | LINE webhook hardening | 1 | 174 | 6 | webhook.ts 他 | **閉じる**（目的達成済み） |
| #2 | 経費台帳 + file_store | — | — | — | **共通祖先なし** | **閉じる＋1点を再起票** |

---

## そのままマージできるもの

### PR #75 — uizinクリッパーMVP

- `tools/uizin-clipper/` 以下にPython製の独立ツールを新規追加。main に同名のものは無く、既存コードを書き換えない。
- テストが6本同梱されている（`tests/test_*.py`）。
- 試しマージで衝突なし。

**次の一手**: 中身をレビューしてマージ。
**残課題**: CI（`.github/workflows/ci.yml`）は npm のテストしか動かさないので、このPythonツールのテストは自動では走らない。走らせるなら CI にPythonのジョブを足す判断が要る。

### PR #74 — 保護者同意書のA4印刷テンプレ

- 変更は `docs/templates/未成年者入会_保護者同意書.html` の1ファイルだけ。
- PR #72 で入った AIKA 側の同意フロー（`src/crm/guardian_consent.ts`）を、**紙の書式で補う**もの。重複ではない。
- 試しマージで衝突なし。

**次の一手**: 文面をオーナーが確認してからマージ。
**理由**: 未成年・保護者・同意の書式は、料金や規約と同じく人間の確定が要る領域。AIだけで通してはいけない。

### PR #73 — 「昔→今」型のSNS投稿テンプレ

- 変更は `docs/SNS_POST_TEMPLATE_2026-08.md` の1ファイルだけ。試しマージで衝突なし。

**次の一手**: `flatup-content-qc` で検品してからマージ。
**確認点**: 実在の会員の変化を書く型なので、本人の同意、実績の捏造がないか、健康効果の言い切りがないかを見る。

---

## 作り直すもの

### PR #17 — 配信スパイク群（rebase すれば活きる）

- 13コミットすべてが `src/distribution/` への**純粋な追加**（main には `expand.ts` しか無い）。テストも6本ある。
- 遅れは207コミットと大きいが、試しマージの衝突は `package.json` **1件だけ**。
- しかも今回 `package.json` の `test` を長い `&&` 連結からグループ実行に変えたので、この衝突は「main側を採用して、新しい `test:*` の行を足す」だけで片づく。

**次の一手**: `origin/main` に rebase して `npm test` を通す。
**確認点**: `publish_kit`（外部公開の下ごしらえ）が、main が採った**ブラウザ投稿の導線**と役割がぶつからないか。ぶつかるなら publish_kit だけ落として、`craft_score`（文章の採点）から取り込む。

### PR #46 — ブランドキット（ds-bundle だけ取り出す）

- 263ファイルのうち243はフォント。本体は `ds-bundle/`（トークン・コンポーネント・ガイドライン）。main に `ds-bundle` は無いので、ここは価値がある。
- **ただし危険な混入がある**。5コミットのうち `Update business hours: staff 平日18:00-21:00 / 土10:00-15:00` が `src/shared/canon.ts` と `knowledge/wiki/flatup-canonical-faq.md` を書き換えており、試しマージで両方とも衝突する。
- main の営業時間は 2026-07-06 オーナー確定・2026-07-18 公式サイト照合を経た値。**古いPRの側が正しいとは限らない。**

**次の一手**: `ds-bundle/` と `docs` 相当だけを新しいブランチに取り出して出し直す。`src/shared/canon.ts` と FAQ wiki の変更は**持ち込まない**。
**理由**: 正本（料金・営業時間）の書き換えはオーナー承認事項。デザイン資産の取り込みと同じPRに混ぜてはいけない。

---

## 閉じるもの

### PR #34 — SDL hardening（4点だけ拾って閉じる）

- 24コミット・123遅れ。試しマージで `.github/workflows/ci.yml` が add/add 衝突する。**CIはPR #71で既に別途導入済み**なので、このPRのCIはもう要らない。
- 投稿まわりの大半も、main が別ルート（ブラウザ投稿）で実装済み。

main にまだ無く、拾う価値があるのは次の4点：

| 拾うもの | mainの現状 | 備考 |
|---|---|---|
| ESLint導入 | 設定ファイルなし | 小さく単独で入れられる。未着手 |
| nginx のセキュリティヘッダ／レート制限 | `deploy/nginx/` に2ファイルあるが未適用 | 本番設定なので反映は承認後。未着手 |
| ~~日次のrun-lock（LINE二重送信の防止）~~ | **2026-08-09 実装済み** | `src/scheduler/run_lock.ts`。daily_check / morning_briefing / reminder に適用 |
| ~~forbidden_actions をLINE push直前で実行~~ | **2026-08-09 実装済み** | `src/line_bot/notifier.ts` で送り先を検査。承認者以外へは throw で止める |

**次の一手**: 残る2点（ESLint、nginx）を1件ずつ小さなPRとして起票し直し、#34 は閉じる。

### PR #25 — SNS一括投稿（方針から再設計）

- 20コミット・170遅れ。`src/line_bot/webhook.ts` と `reply.ts` が衝突する（webhook.ts は今回さらに手を入れたので、衝突はより広がる）。
- 中身は Threads / Instagram / Facebook の **API自動投稿**路線。一方 main は `browser_post_*` と `browser_assist` による**ブラウザ操作**路線を採っている。方針が分かれている。
- `src/llm`（本文のAI生成）は main に無く、この路線ごと未着地。

**次の一手**: 閉じる。API自動投稿をやるなら、どちらの路線で行くかをオーナーが決めてから新規に設計する。
**理由**: 外部サービスへの書き込み・API実行・課金操作は承認マトリクス上すべて人間承認が要る。2ヶ月前の実装を追認するのではなく、方針の確定が先。

### PR #18 — LINE webhook hardening（目的は達成済み）

- 目的だった2点は main が既に実装済み。
  - 署名検証 → `src/line_bot/webhook_auth.ts` の `verifyLineSignature`
  - ログの個人情報マスク → `src/line_bot/webhook_security.ts` の `safeLineLog`
- 唯一 main に残っていた実質的な差分「承認者以外が1件混ざるとバッチ全体を捨てる」は、**2026-08-09 に別途修正済み**（`src/line_bot/webhook_events.ts` と回帰テスト）。
- 未取り込みは `GET /openqlow/health` のヘルスエンドポイントのみ。

**次の一手**: 閉じる。ヘルスチェックが要るなら数行で別途足す。

### PR #2 — 経費台帳（マージ不能・1点だけ再起票）

- `git merge-base origin/main <branch>` が **no merge base** を返す。歴史が完全に別で、通常の手順ではマージできない。
- 中身の大半は main に着地済み。
  - 経費台帳 → `src/keihi/`（expense / parse / store / report / subsidy / import_csv、テスト6本）
  - `file_store` → `src/state/file_store.ts`
- **main に無いのは弥生会計エクスポートだけ**（`src/commands/expense_export.ts` とテスト、`docs/expense_accounting_export.md`）。

**次の一手**: 弥生会計エクスポートだけを新規に起票し直し、#2 は閉じる。
**理由**: 履歴が繋がらないPRを無理に `--allow-unrelated-histories` で入れると、後から差分を追えなくなる。

---

## 各PRに残すコメント案（下書き・未送信）

> **注意**: 以下は下書き。GitHubへの投稿はオーナー承認後。

**#75 / #74 / #73 へ**

```text
2026-08-09時点で origin/main との衝突はありません。そのままマージできます。
・#75: Pythonツールのテストは現在のCI（npmのみ）では走りません。CIに載せるかご判断ください。
・#74: 未成年・保護者の書式のため、文面のオーナー確認をお願いします。
・#73: 実在の会員の変化を扱う型なので、本人同意と実績の裏づけの確認をお願いします。
```

**#17 へ**

```text
origin/main から207コミット遅れていますが、変更は src/distribution への追加のみで、
衝突は package.json の1件だけです。rebase して npm test を通せばマージできます。
publish_kit が main のブラウザ投稿の導線と役割が重ならないかだけ、先に確認させてください。
```

**#46 へ**

```text
ds-bundle（ブランド資産）は main に無く、取り込む価値があります。
ただしこのPRには src/shared/canon.ts と FAQ wiki の営業時間変更が含まれており、
main の確定値（2026-07-06 オーナー確定 / 2026-07-18 公式サイト照合）と衝突します。
ds-bundle と関連ドキュメントだけを新しいブランチで出し直し、正本の変更は別扱いにさせてください。
```

**#34 へ**

```text
CIはPR #71で別途導入済みのため、このPRのCI部分は不要になりました。
投稿まわりも main が別ルート（ブラウザ投稿）で実装済みです。
main にまだ無い次の4点だけを小さなPRに分けて出し直し、このPRは閉じる提案です。
1. ESLint導入
2. nginx のセキュリティヘッダ／レート制限
3. 日次 run-lock（LINE二重送信の防止）
4. forbidden_actions をLINE push直前で実行（現在ルールはあるが呼び出し箇所がありません）
```

**#25 へ**

```text
main は browser_post 系（ブラウザ操作）で投稿導線を実装済みで、このPRのAPI自動投稿とは方針が分かれています。
外部への書き込み・API実行・課金は承認が必要な領域のため、
どちらの路線で行くかを決めてから新規に設計し直す提案です。このPRは閉じさせてください。
```

**#18 へ**

```text
このPRの目的は main 側で達成済みです。
・署名検証 → webhook_auth.ts の verifyLineSignature
・ログの個人情報マスク → webhook_security.ts の safeLineLog
・非承認者が混ざるとバッチ全体を捨てる問題 → 2026-08-09 に webhook_events.ts で修正＋回帰テスト追加
残るのはヘルスエンドポイントのみのため、必要なら別途追加とし、このPRは閉じる提案です。
```

**#2 へ**

```text
このブランチは origin/main と共通祖先がなく（no merge base）、通常の手順ではマージできません。
経費台帳は src/keihi/、file_store は src/state/file_store.ts として main に着地済みです。
main に無いのは弥生会計エクスポート（expense_export）だけなので、
これだけを新規に起票し直し、このPRは閉じる提案です。
```

## この棚卸しから出た「次にやること」

1. ~~#34 から run-lock と forbidden_actions の実行を取り出す~~ → **2026-08-09 実装済み**
2. #75 / #74 / #73 のレビューとマージ（衝突なし。すぐ進められる）
3. #34 から ESLint と nginx 設定を取り出して起票
4. #17 の rebase 検証
5. #46 の ds-bundle だけの切り出し
6. #2 から弥生会計エクスポートの起票
7. #34 / #25 / #18 / #2 を閉じる（オーナー操作）
