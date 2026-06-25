# FLATUP 永久機関 要件指示書（Codex 着工用・正本）

> 版: v1.0 / 作成: 2026-06-25 / 母体リポジトリ: `flatup1/openqlow`
> 対象実装者: **Codex**（別AI）。この文書を**唯一の正本**として実装する。
> 設計者（ダ・ヴィンチ）の確定事項であり、**勝手に方針を変えない**。曖昧な点はオーナー Jin に確認する。
> 既存実装の**上に積む**こと。ゼロから作り直さない。

---

## 0. 不可侵ルール（全フェーズ共通・違反＝不合格）
0.1 顧客への直接送信・予約確定・料金変更・返金・退会・謝罪送信・会員情報変更は **AI禁止**。実装上は `src/safety/forbidden_actions.ts` の `assertNotForbidden()` を必ず経由し、違反は `throw` で停止する。
0.2 APIキー・トークン・パスワード・個人情報（電話/メール/LINE userId/氏名）は **git・ログ・チャット・公開ファイルに出さない**。秘密は `.env`（gitignore済み）のみ。
0.3 すべての顧客向け返信は **送信直前**に `scoreResponseQuality()` を通し、`decision` が `good` または `perfect` の時だけ送信可。`revise`/`reject` は送信せず、人間確認 or 自動再生成へ回す。
0.4 料金・スケジュール・クラス・住所などの事実は **`shared/canon.ts` の単一正本のみ**を参照する。コード内・返信内に数値や住所を**直書きしない**。
0.5 既存の `npm test`（70グループ）は**常に緑**を維持する。新規実装には必ずテストを付け、`package.json` の `test` チェーンに追加する。

---

## 1. 現時点の採点（システム到達度 2026-06-25）

| 観点 | 点 | 根拠 |
| --- | --- | --- |
| 4観点100点ゲート | 9.5/10 | `src/safety/response_quality.ts` 実装・テスト済。理想返信=100、実ログ失敗=reject |
| 正本の一本化・整合 | 9.5/10 | `FLATUP_INFO`（`src/generators/shared.ts`）＋ `knowledge/wiki/flatup-canonical-faq.md` 確定。残課題なし |
| 安全・役割境界 | 9.5/10 | `forbidden_actions` で物理ブロック・自動送信なし |
| 第二の脳（学習基盤） | 9/10 | `knowledge/`（sources/wiki/CLAUDE.md） |
| 攻め/守りの統合 | 3/10 | **未**: AIKA本体が別リポジトリ（未取り込み） |
| 24時間運用（実インフラ） | 6/10 | `deploy/systemd/*` 雛形あり・実デプロイ未完 |
| 自己改善ループの自動化 | 4/10 | 設計のみ（[[perpetual-engine]]）・定期実行未実装 |
| テスト・回帰防止 | 9/10 | `npm test` EXIT=0 / 70グループ |

**総合 約78/100。** 残り22点の内訳＝(a)AIKA統合 +9、(b)自己改善ループ自動化 +7、(c)24時間インフラ仕上げ +6。本指示書はこの3つを100点に到達させる。

---

## 2. 設計判断（確定事項）
2.1 **母体は `flatup1/openqlow`**（中身が最多。将来 `flatup-os` へ改称可だがv1では改称しない）。
2.2 **共通層 `shared/` を新設**し、正本(`canon.ts`)と優しさゲート(`response_quality.ts`)を**1つ**に集約。攻め(OPENQLOW)・守り(AIKA)の両方がここを参照する。原型は `port/aika/flatup_canon.ts`・`port/aika/response_quality.ts`。
2.3 **AIKAは `aika/` として取り込む**（取り込み元はオーナーが指定する `AIKAAPP` または `flatup-ai-os`。未確定なら両方を読んで本物を判定する）。
2.4 **既存 `src/` は当面そのまま**（破壊回避）。`src/safety/response_quality.ts` と `src/generators/shared.ts` の `FLATUP_INFO` は `shared/` への**薄い再エクスポート**に置換し、二重管理を消す（2.6）。
2.5 **自己改善ループ**は `scripts/loop/` に実装し、`deploy/systemd/` のタイマーで毎日実行。出力は**人間承認用のPR/下書き**（自動マージ禁止）。
2.6 **単一正本の強制**: `FLATUP_INFO` は `shared/canon.ts` の `FLATUP_CANON` から導出（再エクスポート）に変える。重複定義を残さない。

---

## 3. 目標アーキテクチャ（正確な構成）
```
flatup1/openqlow/
├── shared/
│   ├── canon.ts              # FLATUP_CANON（単一正本）＋ FORBIDDEN_ACTIONS ＋ BRAND
│   ├── canon.test.ts
│   ├── response_quality.ts   # scoreResponseQuality（4観点100点・依存ゼロ）
│   └── response_quality.test.ts
├── openqlow/ (= 既存 src/。v1では物理移動しない。shared/ を参照)
├── aika/                     # 守りAI本体（取り込み）。返信は送信前に shared ゲートを通す
├── knowledge/                # 第二の脳（学習エンジン）= 既存
├── scripts/loop/
│   ├── ingest.ts             # 生ログ → knowledge/sources/（PII除去）
│   ├── score.ts              # 返信群を採点 → scorecard.json + .md
│   └── report.ts             # 前回差分 → 改善提案（PR下書き）
├── deploy/                   # systemd/nginx/cloudflared = 既存 + 追加
└── docs/                     # 本書ほか
```

---

## 4. 詳細要件（フェーズ別・各タスクは受け入れ基準を満たすこと）

### Phase A — 共通層 `shared/` の抽出と一本化（破壊なし）
A-1. `port/aika/flatup_canon.ts` を `shared/canon.ts` に昇格（移動）。`export const FLATUP_CANON`, `FORBIDDEN_ACTIONS`, `BRAND` を維持。
A-2. `src/generators/shared.ts` の `FLATUP_INFO` を、`shared/canon.ts` の `FLATUP_CANON` から**導出した再エクスポート**に変更する。**既存の全フィールド名（`trialFirst`,`priceKids`,`scheduleKids`,`businessHours`,`classes`,`parentDiscount`,`referralBenefit`,`gloveSet`,`address`,`nearestStation`,`access` 等）を1つも欠かさない**。
A-3. `port/aika/response_quality.ts` を `shared/response_quality.ts` に昇格。`src/safety/response_quality.ts` は `shared/response_quality.ts` の再エクスポートにする（`check.ts` 依存版から依存ゼロ版へ統一）。**挙動は不変**: 理想返信=100、実ログ失敗パターン（機械的列挙／「只今担当者が対応中」／既知の再質問／住所の出し渋り／同一再送／煽り）は低得点/reject。
A-4. `shared/canon.test.ts`・`shared/response_quality.test.ts` を作成し `package.json` の `test` チェーンに追加。
A-5. **検証**: `npm test` 緑。既存 `test:canon`,`test:inquiry-reply`,`test:reply-gate`,`test:response-quality`,`test:aika-port` が全通過。
A-6. **直書き検出テスト**を新設（`shared/no-hardcoded-canon.test.ts`）: `src/` と `aika/` を走査し、`円`/`成田市土屋`/`18:00`/`成田駅` 等の正本値の**直書き**が `shared/canon.ts` 以外に無いことを assert（テストデータ・テスト文字列・コメントは除外規則を明記）。

### Phase B — AIKA 取り込み（`aika/`）
B-1. オーナー指定のAIKA本体（`AIKAAPP` or `flatup-ai-os`）を本セッション/環境に追加後、`aika/` に取り込む。両方ある場合は中身を読み、**LINE受付・返信を行う実体**を本物と判定（もう一方は `aika/legacy/` か削除をオーナー確認）。
B-2. AIKAのFAQ・返信生成を **`shared/canon.ts` 参照**に差し替え（住所/営業時間/料金/クラス/アクセスの直書き・推測を全廃）。
B-3. AIKAのLINE返信の**送信直前**に `scoreResponseQuality(reply, ctx)` を挿入（ctx: `knownFacts`=既収集スロット, `recentReplies`=直近送信）。`reject`→送信停止＋人間確認、`revise`→`suggestions` を生成プロンプトに足し1回再生成→再採点、`good`/`perfect`→送信可。
B-4. **スタック自動回復**: 「只今担当者が対応中」等で固まらない。取次ぎ/フォーム状態は一定時間で自動リセット。基本Q&A（時刻/曜日/料金/住所）は常時応答。
B-5. **入力正規化**: 全角/半角・`／`→`/`・半角カナ・前後空白を吸収。承認/日報/修正のルーティングを明確分離（`src/line_bot/normalize_command.ts` の方針を流用）。
B-6. **検証**: AIKAの返信を `scoreResponseQuality` に通すユニットテスト（実ログ由来のNG入力→`reject`、正本ベースの優しい回答→`good`/`perfect`）。

### Phase C — 自己改善ループ（`scripts/loop/`）
C-1. `ingest.ts`: 入力ディレクトリ（`OPENQLOW_LOG_INBOX`）の生ログを読み、`knowledge/sources/<YYYYMMDD>-<slug>.md` に frontmatter 付きで保存。**PII除去必須**（電話/メール/LINE userId/ペアリングコード/氏名はマスク）。既存 `src/safety/check.ts` のPIIパターンを再利用。
C-2. `score.ts`: 対象返信群（生成 or ログ）を `scoreResponseQuality` で採点し、`knowledge/sources/scorecards/<date>.json` と `.md` を出力。集計（観点別平均・reject率・最低点）を含む。
C-3. `report.ts`: 直近2回のscorecardを比較し、**回帰（点が下がった項目）と改善案**を Markdown で出力。改善案は「正本更新 / ゲート調整 / 文面修正」のどれかに分類し、**PR下書き**として `knowledge/sources/improvements/<date>.md` に保存（自動マージしない）。
C-4. 3スクリプトに `*.test.ts` を付け `test` チェーンへ。`ingest` はPII除去を、`score` は集計値を、`report` は回帰検出をテスト。
C-5. `deploy/systemd/openqlow-loop.service` + `.timer`（毎日1回）を追加。出力はPR or 下書き＝**人間承認**を必須にする。

### Phase D — 24時間インフラ
D-1. **固定トンネル**: `deploy/systemd/cloudflared-openqlow.service` を用い、`OPENQLOW_PUBLIC_WEBHOOK_URL` を固定ドメインに。ngrok動的URL依存を撤廃。
D-2. **死活監視＋自動再起動**: 既存 healthcheck（`systemd_self_heal`）を webhook/トンネル/LLM API に拡張。落ちたら `systemctl restart`。
D-3. **LLM障害フォールバック**: OpenRouter 401/タイムアウト時は、定型の安心文＋`shared/canon.ts` ベースのルール返信に自動切替（沈黙させない）。
D-4. **冪等性**: 承認・投稿・保存・ログ追記は投稿ID/ハッシュで重複排除。二重送信・二重保存を禁止。
D-5. **検証**: 監視スクリプトのユニットテスト（各終了状態を網羅）。フォールバック経路のテスト。

### Phase E — 認証・秘密管理（オーナー操作と連動）
E-1. `.env.example` に必要キーを**全列挙**（値は空）: `OPENROUTER_API_KEY`, `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `JIN_LINE_USER_ID`, `THREADS_ACCESS_TOKEN`, `IG_ACCESS_TOKEN`, `FB_PAGE_TOKEN`, `GOOGLE_BUSINESS_ACCESS_TOKEN`（必要に応じ追加）。
E-2. 実値はオーナーが各管理画面で発行し**サーバーの`.env`へ**。Codex/AIは**ブラウザ代行ログインしない**。
E-3. `.gitignore` に `.env`・`data/`・`logs/`・`reports/` が含まれることを確認。秘密混入を防ぐ簡易チェック（`scripts/check-no-secrets`）を追加し CI/`test` で実行。

---

## 5. 受け入れ基準（＝「100点」の定義・全項目 YES で完成）
- [ ] **R1** `npm test` が EXIT=0（既存70＋新規すべて緑、typecheck含む）。
- [ ] **R2** 正本は `shared/canon.ts` の1ファイルのみ。`src/`・`aika/` に料金/住所/時間の直書きが無い（A-6テストが緑）。
- [ ] **R3** AIKA・OPENQLOW の**全顧客向け返信**が送信前に `scoreResponseQuality` を通り、`reject`/`revise` は送信されない。
- [ ] **R4** 理想返信＝100点(perfect)、実ログ6失敗パターン＝低得点/reject（テストで固定）。
- [ ] **R5** PII・秘密が git に無い（秘密チェック＋PIIマスクのテストが緑）。
- [ ] **R6** 24時間: systemd常駐＋cloudflared固定URL＋自動再起動＋LLM障害フォールバックが動作（沈黙しない）。
- [ ] **R7** 自己改善ループが毎日実行され、scorecardと改善提案PR下書きを生成（自動マージなし）。
- [ ] **R8** 禁止行為が時間帯に関係なく `throw` で阻止される。
- [ ] **R9** 冪等: 同一の送信/保存/投稿が二重に起きない。
- [ ] **R10** `.env.example` に必要キー全列挙・実値はリポジトリに無い。

---

## 6. テスト・コマンド規約（正確に）
6.1 各モジュールに `*.test.ts`（`node:assert` か既存スタイルの `assert()`）。`package.json` の `scripts` に `test:<name>` を追加し、`test` チェーン（`&&` 連結）にも入れる。
6.2 実行は `npm test`（先頭で `tsc --noEmit`）。**赤を残さない**。
6.3 依存追加は最小限。`shared/` は**依存ゼロ**を維持（外部import禁止）。

## 7. 作業順（必ずこの順序）
A → B → C → D → E。各フェーズ完了ごとに `npm test` 緑を確認し、**フェーズ単位でPR**を出す（人間レビュー前提）。フェーズをまたぐ巨大PRは禁止。

## 8. コミット/PR規約
8.1 コミットは命令形・1行サマリ＋本文。秘密・実名を含めない。
8.2 PRは Draft で作成し、受け入れ基準(セクション5)の達成チェックリストを本文に貼る。
8.3 破壊的変更（`src/`→`openqlow/` 物理移動、リポジトリ改称）は**v1では行わない**。必要なら別途オーナー承認。

---

## 9. 参照（既存実装・正本）
- 正本値: `src/generators/shared.ts`（`FLATUP_INFO`）／`shared/canon.ts`（昇格後）／`knowledge/wiki/flatup-canonical-faq.md`
- ゲート: `src/safety/response_quality.ts`・`src/generators/reply_gate.ts`・`port/aika/response_quality.ts`
- 安全: `src/safety/forbidden_actions.ts`・`src/safety/check.ts`
- 設計: `knowledge/wiki/perpetual-engine.md`・`knowledge/wiki/100-point-roadmap.md`・`knowledge/wiki/24-7-operation-runbook.md`・`knowledge/wiki/kindest-ai-response-policy.md`
- デプロイ: `deploy/systemd/*`・`deploy/nginx/*`・`deploy/scripts/install-openqlow-vps.sh`

> この指示書のとおり R1〜R10 を全て満たした時点で、オーナーの理想とする「100点の永久機関」が完成とする。
