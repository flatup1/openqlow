# Mac最新版とv3の差分

土台: `claude/tournament-os-v3` の `fb42cd1`。統合先: `codex/mac-latest-20261009`。v3の既存の試合準備、確認UI、当日一覧画面は維持する。Mac版の旧画面で上書きしない。

## v3に無い機能とファイル
| 機能 | ファイル |
|---|---|
| Cloudflare Accessのメール本人確認に対応した認証 | `uizin-eventos/core/accessIdentity.ts`, `worker/index.ts`, `functions/api/[[path]].ts` |
| クラウドの大会保存・本人別／大会別の保存先、古い版の上書き拒否 | `core/cloudTournament.ts`, `worker/event-do.ts`, `app/lib/cloudClient.ts`, `app/lib/privateStore.ts` |
| 未完成日付も保存する下書き、公開大会からの分離、2領域の交互保存と整合した読込 | `core/setupDraft.ts`, `app/lib/setupDraftClient.ts`, `app/lib/useSetupDraft.ts`, `worker/index.ts`, `worker/event-do.ts` |
| 一画面の設定、前回設定の再利用、途中保存・再開・引継ぎ画面 | `app/setup/page.tsx` |
| 未保存／保存失敗時の終了警告、保存済み時間設定の誤警告防止 | `app/lib/useSetupDraft.ts` |
| 途中入力・未適用時間設定を含む暗号化引継ぎファイルと画面復元 | `app/setup/page.tsx`, `app/lib/privateStore.ts` |
| クラウド専用の名簿・カード・暗号化バックアップ管理 | `app/cloud-manage/page.tsx` |
| クラウド時計、別画面再開、ラウンドごとの手動開始 | `core/privateTimer.ts`, `app/cloud-manage/live/page.tsx`, `app/lib/cloudClient.ts`, `worker/event-do.ts` |
| オンラインの選手受付、写真・競技情報のみ、重複受付防止 | `core/cloudEntry.ts`, `app/components/EntryForm.tsx`, `app/cloud-entry/page.tsx`, `app/lib/onlineEntryClient.ts`, `worker/event-do.ts` |
| 観客向けの氏名・所属・体重だけの画面 | `app/cloud-view/page.tsx`, `worker/event-do.ts` |
| Googleは試合番号・ラウンド数・ラウンド秒・休憩秒の4列だけ取得 | `core/safeGoogleRules.ts`, `worker/index.ts`, `docs/templates/entry-sheet-apps-script.gs` |
| 固定パスのPages→Worker連携、クラウド画面のCSP、ローカル配備候補生成 | `functions/api/[[path]].ts`, `public/_headers`, `worker/wrangler.test.toml`, `wrangler.test.jsonc`, `scripts/prepare-test-pages.mjs` |
| 認証・保存・受付・時計・引継ぎの回帰検証 | `tests/accessIdentity.test.ts`, `tests/cloudTournament.test.ts`, `tests/cloudWorkflow.test.ts`, `tests/setupDraft.test.ts`, `tests/support/cloudHarness.ts`, `scripts/test-cloud-browser.mjs` |

表の省略パスはすべて `uizin-eventos/` 配下。

## v3と設計が違う所
- v3の `/private/`・`/private/setup/`・`/private/live/` と、今回の `/setup/`・`/cloud-manage/`・`/cloud-manage/live/` は別入口。v3の一覧表示・確認UI・端末内の保存履歴を保つため、共有画面を旧Mac版へ置き換えていない。デザインの完全統一は未実施。
- v3は主にブラウザー内IndexedDBと提出／バックアップファイルを使う。クラウド入口は `storage=cloud` でCloudflare Durable Objectsへ保存する。端末内の既存データを自動移送しない。
- 確定大会は `private:<認証本人>:<大会>`、下書きは `draft:<認証本人>:<大会>` の別領域。下書き保存やファイル復元だけでは受付・観客公開を変更しない。確定保存には大会の版チェックを使う。
- Cloudflare Accessの署名・issuer・audience・期限・許可メールを検証する。設定の一部だけがある場合も旧操作キーへ逃がさず拒否する。メールコードの送信そのものはCloudflare Access側の機能であり、実環境への設定・メール認証試験は未完了。ローカル試験だけは架空の操作キーを使う。
- クラウド側に連絡先の項目を追加しない。Googleへ氏名・写真・連絡先を読みに行かない。引継ぎには氏名・写真・競技情報が含まれ得るためAES-GCMで暗号化し、合言葉は別に伝える。自動送信しない。
- 観客APIは許可された3項目のみ返す。閉じた受付・観客ページは旧URLからも使えない。
- v3に既存の下書き・引継ぎUIがあるが、今回の追加は本人別クラウド下書きと暗号化した未完成入力の移送。名称が同じでも保存先・対象データが異なる。

## 統合と検証
- 既存v3画面、`app/private/logic.ts`、`app/private/parts.tsx`、`app/private/live/ListView.tsx`、`core/boutSuggest.ts` は変更しない。
- 共通の `app/lib/privateStore.ts` はc1e9006を比較基点に3方向統合し、v3の既存追加を保持する。
- 単体テスト384本、型チェック、ビルドを確認。新しいクラウド画面の52アサーションが3ブラウザーコンテキストで合格し、外部リクエスト・画面エラーは0。Lintは独立検証ツールを利用。本体の旧画面の検証と新しいクラウド画面の検証を区別する。
- 実Cloudflareでのメール認証、物理2台のPC、会長本人の15分試験は未確認。100点・本番配備済みとは扱わない。
- 追加コード／文書には本物の名簿、実写真、個人のメール、認証トークン、API鍵を含めない。テストのメール・名前・写真は架空のfixture。ローカルのログ・スクリーンショット・バックアップ・配備生成物はコミット対象外。

## 作業引継ぎ
変更先はこの新ブランチだけ。旧codex枝へのpush、force push、mainへの直接push、公開、認証権限変更は行わない。Cloudflare設定値はリポジトリに実値を入れず、別途許可された環境で設定する。
