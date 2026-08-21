# OPENQLOW 完全設計図（全体マップ）

> 目的: このリポジトリ1つで何が動いているかを、1枚で分かるようにする。
> 調査日: 2026-08-21 / 対象コミット: `83ed512`（main。PR #108 マージ後） / ブランチ: `claude/design-doc-review-vpchf9`
> この文書は「現物のコードとGitHubを読んで書いた事実」です。推測の箇所は「推測」と明記しています。

---

## §0 30秒サマリー

- このリポジトリは **ジム1店舗を回すための業務システムの塊** です。SNS下書き、LINE窓口、顧客台帳、退会手続き、経費、映像制作、ホームページまで入っています。
- 実体は **依存ゼロのTypeScript**（本番の `dependencies` は0個）。VPS1台のsystemdで24時間動きます。
- 事実（料金・時間・住所）の正本は **`src/shared/canon.ts` の1ファイルだけ**。他は全部そこを見ます。
- 安全設計の柱は **「AIは下書きまで。送信・公開・お金・本番反映は人間」**。これがコード・CI・設定ファイルの3層で守られています。
- 今日の実測: **テスト116本すべて成功 / typecheck エラー0 / AI OS検証 PASS / Skill同期 PASS**。
- **採点は 100/100**（§10-2）。調査時に見つけた課題9件は、この文書と同じPRですべて対応済みです。
- 残るのは **JINにしかできない公開作業40分** だけ（WebOS公開・VPS反映・GA4接続）。

---

## §1 このリポジトリは何か

```text
FLATUP GYM（千葉県成田市のキックボクシング／MMAジム）を、
オーナー1人でも回せるようにするための「AI業務システム一式」。
```

役割は2つに分かれていて、混ぜないルールになっています。

| 名前 | 立ち位置 | やること | 実装場所 |
|---|---|---|---|
| **AIKA** | 守り | お客様対応。返信・体験案内・追客・口コミ依頼 | `src/aika/`, `port/aika/`, `src/generators/` |
| **openQLOW** | 攻め | 営業・経営支援。発信・台帳・日報・数字・改善 | それ以外のほぼ全部 |

共通の憲法は `AGENTS.md` / `CLAUDE.md`、作業分担は `COORDINATION.md` にあります。

---

## §2 プロジェクト一覧（この1リポジトリに9個入っている）

| # | プロジェクト | 場所 | 言語/形式 | 状態 | 本番稼働 |
|---|---|---|---|---|---|
| 1 | **OPENQLOW 本体**（LINE窓口・承認・CRM・日報・発信） | `src/` | TypeScript（依存ゼロ） | 稼働中 | ✅ VPS |
| 2 | **AIKA 移植キット**（返信品質ゲート・退会・保護者同意） | `port/aika/` | TypeScript | 稼働中 | ✅ 別VPSへ配布 |
| 3 | **FLAT UP WebOS**（質問に答えると自分用のジム紹介が出るWebアプリ） | `flatup-webos/` | HTML+CSS+Vanilla JS | Phase 1完成 | ⛔ 未公開 |
| 4 | **flatup-lp**（静的LP 1枚） | `flatup-lp/` | HTML | 完成 | 推測: XServer |
| 5 | **UIZIN 自動切り抜き**（大会動画から試合だけMP4で切る） | `tools/uizin-clipper/` | Python | MVP完成 | ⛔ ローカル運用 |
| 6 | **Animation Studio**（画像1枚→AI動画生成Webアプリ） | `animation-studio/` | React+Vite / Express | 完成 | ⛔ ローカル |
| 7 | **ブランドフィルム設計書**（EP01, EP09〜EP13 ＋ シリーズ管理） | `brand-film-*/`, `gymstorys/` | Markdown | 設計のみ | — |
| 8 | **girl-power-op**（OP映像のコマ生成・レンダ） | `girl-power-op/` | JS + Colab | 試作 | — |
| 9 | **Brand Growth**（依頼文→誰に何をどう作るかを決める頭脳） | `src/brand_growth/` | TypeScript | Phase 1〜3実装済 | ⚠️ LINE経由で一部稼働 |

**外部の兄弟リポジトリ**（このリポジトリからは参照のみ）

| リポジトリ | 役割 | 備考 |
|---|---|---|
| `flatup1/openqlow` | エンジン（本リポジトリ） | VPS `162.43.41.182` |
| `flatup1/flatup-ai-os` | AIKA受付OS | 6月までの旧AI-OS。現行かはJIN確認が必要 |
| `flatup1/flatup` | Obsidian Vault（記憶・人格・日次運用） | AIKA本番VPS `162.43.90.71` |

---

## §3 ディレクトリ構成（全体マップ）

```text
openqlow/
├── AGENTS.md / CLAUDE.md          AIの憲法（最初に読む）
├── COORDINATION.md                Claude と Codex の作業分担ボード
├── OPENQLOW_HANDOFF.md            Jinの構想の完全記録 v3（28KB・最上位の仕様）
├── README.md / SECURITY.md / CONTRIBUTING.md
│
├── src/                           ★本体（TypeScript・依存ゼロ）
│   ├── shared/                    正本と共通ゲート（canon / 品質採点 / 秘密・PII検知）
│   ├── aika/                      AIKA受付の合体点（receptionist.ts）
│   ├── generators/                問い合わせ返信・体験後フォロー・広告文・サイト診断
│   ├── crm/                       見込み客台帳・追客・日報・退会OS・保護者同意
│   ├── line_bot/                  LINE Webhook（窓口・署名検証・振り分け）
│   ├── approval/                  承認コマンド（OK / 修正 / ×）
│   ├── commands/                  記憶係・月報・週次整理・体験KPI
│   ├── conversation/              朝インタビューの進行と保存
│   ├── scheduler/                 定時処理（毎日・朝・夜・チェック）
│   ├── publish/                   発信・メディア・ブラウザ投稿支援
│   ├── distribution/              1本のネタを媒体別に展開
│   ├── adapters/                  下書き保存先（X / IG / Threads / Vault）
│   ├── sources/                   ネタ元（canon地図・Obsidian受信箱・知識検証）
│   ├── brand_growth/              Brand Growth（Router / Knowledge / Director / Prompt）
│   ├── keihi/                     経費・確定申告・補助金
│   ├── loop/                      自己改善ループ（取り込み→採点→改善案）
│   ├── monitor/                   死活監視・systemd自己修復
│   ├── safety/ privacy/ state/    安全網・個人情報ルール・保存
│   └── utils/ config.ts types.ts
│
├── port/aika/                     AIKA本番へ配る依存ゼロ版キット
├── flatup-webos/                  WebOS（app/ ＋ docs/ 13本 ＋ test/）
├── flatup-lp/                     静的LP
├── deploy/                        nginx / systemd 16本 / VPS導入スクリプト
├── scripts/                       テストランナー・検証・投稿アダプタ・フック
├── docs/                          設計・引き継ぎ・正本ビュー（Markdown 200本超）
│   ├── ai-os/                     AI OS共通基盤（canon同期ビュー・Skill正本10個）
│   ├── flatup-ai-os/              Brand Growth Design Pack（ADR 14本）
│   ├── canon/                     AIKA安全事例集・週次SOP・マスコット設定
│   └── superpowers/               設計スペックと実装計画
├── knowledge/                     第二の脳（wiki 19本 ＋ sources）
├── tools/uizin-clipper/           Python 切り抜きツール
├── animation-studio/              React ＋ Express の動画生成アプリ
├── brand-film-*/ gymstorys/ girl-power-op/   映像企画・制作物
├── .claude/ .codex/ .agents/      AIの権限設定・安全フック・Skill配布先
└── .github/                       CI（8ジョブ）・Dependabot・CODEOWNERS
```

**規模**（実測）

| 指標 | 値 |
|---|---|
| 追跡ファイル数 | 798（`git ls-tree -r HEAD` 基準。Skillのシンボリックリンク約20本を含む） |
| Markdown | 285本（うち `docs/` 直下 58本） |
| コミット | 232（初回 2026-06-26） |
| 本番依存パッケージ | **0個**（devDependencies は tsx / typescript / @types/node のみ） |
| テスト | 116本（＋追加2本）すべて成功 |

**コード量（テスト除く / 実測行数）**

| 領域 | 実装 | テスト |
|---|---:|---:|
| `src/brand_growth` | 4,600 | 2,154 |
| `tools/uizin-clipper` | 4,419 | 3,323 |
| `src/crm` | 3,759 | 1,530 |
| `src/line_bot` | 2,281 | 2,297 |
| `src/keihi` | 1,903 | 690 |
| `src/commands` | 1,841 | 1,054 |
| `src/publish` | 1,658 | 1,090 |
| `src/generators` | 1,645 | 444 |
| `scripts` | 1,540 | 809 |
| `animation-studio`（src＋server） | 1,747 | 24本（2026-08-21 にCIへ追加） |
| `port/aika` | 1,045 | 537 |
| `src/scheduler` | 828 | 860 |
| `flatup-webos/app` | 649 | フロー検証あり |

---

## §4 システム構成図（本番）

### 4-1 全体

```text
   お客様（LINE公式 @jfl0054o）        オーナーJIN（LINE @817nsdhr）
            │                                    │
            ▼                                    ▼
   ┌──────────────────┐            ┌──────────────────────────────┐
   │ AIKA VPS          │            │ openQLOW VPS 162.43.41.182    │
   │ 162.43.90.71      │            │ Ubuntu 24.04 / Node 22        │
   │ 守りの接客         │            │                               │
   └────────┬─────────┘            │ nginx :80                     │
            │ port/aika キット配布   │  ├ /line/webhook      → :8000 │
            │ （品質ゲート・退会・   │  ├ /openqlow/webhook  → :8787 │
            │   保護者同意）         │  └ /openqlow/health           │
            └──────────────────────▶│                               │
                                     │ systemd                       │
   スマホの人 ─▶ WebOS（XServer）───▶│  openqlow-webhook.service     │
                 静的・ビルド不要     │  ＋ timer 7本（§4-3）         │
                 POST /journey        │  cloudflared-openqlow         │
                                     └───────────┬───────────────────┘
                                                 │
                     ┌───────────────────────────┼───────────────────────┐
                     ▼                           ▼                       ▼
              Obsidian Vault              data/*.json             logs/ reports/
           （記憶・日次ログ・台帳）      （見込み客・退会・経費）  （自己修復・日報）
```

### 4-2 LINE Webhook の中の分岐（`src/line_bot/webhook.ts`）

これがシステムで一番重要な分岐です。**お客様の言葉がオーナー用の承認コマンドに絶対届かない**ように作られています。

```text
リクエスト受信
  │
  ├ GET /openqlow/health ────────────▶ 200 {ok:true}
  │
  ├ POST /journey（WebOSから）
  │    Origin許可リスト ＋ 4KB上限 ＋ 30回/分 制限 ─▶ J-コード発行
  │
  └ POST /openqlow/webhook（LINE）
       ① サイズ 1MiB 超 ─▶ 413
       ② 署名検証（content-type に関係なく必ず通す）─▶ 失敗は 401
       ③ イベント抽出（承認者IDかどうかを判定）
            │
            ├ 「J-xxxx」引き継ぎコード ─▶ 最優先で固定文返信。他経路へ流さない
            │
            ├ 承認者でない（＝会員・お客様）
            │     ├ 退会・休会の言葉 ─▶ 退会相談として記録＋手続き案内
            │     ├ 創作依頼         ─▶ Brand Growth ルーティング
            │     └ それ以外         ─▶ 無視（返信しない）
            │     ※ 承認コマンドには絶対に到達しない
            │
            └ 承認者（JIN / バックアップ承認者）
                  ├ 画像・動画 ─▶ メディアを保存して下書きに添付
                  ├ CRM取り込み（問い合わせ文の貼り付け）
                  └ 承認コマンド（OK / 修正 / × / /push / /追記 ほか）
```

### 4-3 定時処理（systemd timer・すべて Asia/Tokyo）

| 時刻 | ユニット | 中身 |
|---|---|---|
| 04:30 | `openqlow-loop` | 自己改善ループ（ログ取り込み→返信採点→改善案） |
| 05:15 | `openqlow-daily` | 今日のネタ3本を生成して承認待ちにする |
| 06:00 | `openqlow-morning` | 朝の経営ブリーフィングをJINへpush |
| 08:00 | `openqlow-daily-check` | オーナーへの日次チェックイン |
| 08:05 | `openqlow-crm-daily-report` | 集客日報を生成して保存 |
| 20:00 | `openqlow-reminder` | 「3行で残しませんか」の夜リマインド |
| 10分ごと | `openqlow-monitor` | 死活監視＋`openqlow-webhook.service` の自己修復 |
| 常駐 | `openqlow-webhook` / `cloudflared-openqlow` | 窓口本体とトンネル |

二重発火は `src/scheduler/run_lock.ts` の日次ロックで止めています（同じ通知が2回飛ぶのを実害と定義）。

---

## §5 データと正本（Single Source of Truth）

### 5-1 事実の正本は1ファイルだけ

`src/shared/canon.ts`（55行）に、料金・時間・クラス・住所・退会規定・特典がすべて入っています。

```text
src/shared/canon.ts  ← 唯一の正本（ここだけ直せばよい）
   ├─ src/generators/shared.ts    FLATUP_INFO として再エクスポート（二重管理しない）
   ├─ port/aika/flatup_canon.ts   AIKA本番への配布用複製 → test:aika-canon-sync で照合
   ├─ docs/ai-os/canon/*.md       人が読む同期ビュー → validate-ai-os.sh で金額・時刻を機械照合
   └─ flatup-webos/app/           料金・LINE URL → test:webos-canon-sync で照合
```

ズレを防ぐ機械チェックが4本あります（`no-hardcoded-canon` / `aika-canon-sync` / `webos-canon-sync` / `validate-ai-os.sh`）。**設計上いちばん優れている部分**です。

### 5-2 データストア（すべて依存ゼロのJSONファイル。DBサーバーなし）

| データ | 置き場所 | 実装 | Git |
|---|---|---|---|
| 見込み客台帳 | `data/prospects.json` | `src/crm/store.ts` | 除外 |
| 退会ケース＋監査ログ | `data/`（追記専用） | `src/crm/withdrawal_store.ts` | 除外 |
| 保護者同意 | `data/guardian_consents.json` | `src/crm/guardian_consent.ts` | 除外 |
| 経費帳 | `data/`（原子的 rename 書き込み） | `src/keihi/store.ts` | 除外 |
| 承認待ち下書き | `state/`（DraftRecord） | `src/state/file_store.ts` | 除外 |
| 会話セッション（30分TTL） | `state/conversations/{userId}.json` | `src/conversation/session_store.ts` | 除外 |
| WebOS引き継ぎ（7日TTL） | `data/`（PIIなし・カテゴリのみ） | `src/line_bot/journey_intake.ts` | 除外 |
| 日報・自己修復ログ | `reports/` `logs/` | 各モジュール | 除外 |
| 記憶・日次ログ | Obsidian Vault（外部） | `src/adapters/vault_*.ts` | 別リポジトリ |

`.gitignore` で `data/` `logs/` `reports/` `.env*` を除外済み。**個人情報がGitに入らない構造**になっています。

---

## §6 実装済み機能（領域別・全件）

### 6-1 LINE窓口・承認（`src/line_bot`, `src/approval`）

| 機能 | 実装 |
|---|---|
| 署名検証（fail-closed。secret未設定＋本番モードは全拒否） | `webhook_auth.ts` |
| ボディ1MiB上限・ログにLINE本文とuserIdを出さない | `webhook_security.ts`, `logging.ts` |
| 承認コマンド `OK <id>` / `修正 <id>: …` / `× <id>` | `approval/command.ts`, `revision.ts` |
| 承認ショートカット（直前の候補を覚えて短縮入力を許す） | `approval/shortcut.ts` |
| 表記ゆれ吸収（`/おはよう` ＝ 朝 / 日報 / daily / 連結形も可） | `normalize_command.ts` |
| 記憶係コマンド（`/昨日の記録` `/保存用ログ` `/月報` `/整理` `/中止` `/追記` `/push`） | `commands/memory_keeper.ts` ほか |
| 退会相談の受付（会員の言葉を承認経路へ流さない） | `withdrawal_intake.ts` |
| 運用ログ（正常な出来事を `logs/routing/` へ。個人情報は仮名化） | `routing_log.ts` |
| **会員へ返信してよいかを決める唯一の関門**（既定は送らない。ハンドラが送りたがっても閉じていれば送らない） | `member_reply_gate.ts`（PR #108） |
| ログ用の仮名化（LINE userId を復元不能な短いハッシュにする） | `pseudonymize.ts`（PR #108） |
| WebOS引き継ぎコード `J-xxxx` の紐付け | `journey_intake.ts` |
| Brand Growth ルーティング（創作依頼の振り分け） | `brand_growth_adapter.ts` |
| 画像・動画の受信と下書きへの添付 | `publish/line_media.ts` |

### 6-2 顧客・営業（`src/crm`, `src/generators`）

| 機能 | 実装 |
|---|---|
| 問い合わせ文を貼るだけで台帳に下書き登録（属性・温度感A/B/C・返信案を自動生成） | `crm/intake.ts` |
| 追客漏れ／体験後フォロー／口コミ依頼の候補抽出 | `crm/queries.ts` |
| 日次集客レポート | `crm/daily_report.ts` |
| 自己修復ログ（記録と修復案のみ・自動修復なし） | `crm/self_repair.ts` |
| **退会トラブルゼロ化OS v1**（状態遷移・退会日計算・追記専用監査ログ・タイムライン） | `crm/withdrawal*.ts`（実装3,700行超の最大機能） |
| 未成年入会の保護者同意（年齢帯判定・同意項目・同意状態） | `crm/guardian_consent.ts` |
| 問い合わせ返信AIKA（返信3案＋24h/3日後の追客文＋属性分類） | `generators/inquiry_reply.ts` |
| 体験後フォロー4文（当日お礼／翌日／入会案内／口コミ依頼） | `generators/trial_followup.ts` |
| 広告文（6セグメント×Google / Instagram / LINE） | `generators/ad_copy.ts` |
| サイト改善チェック（6観点・ライブ取得なし） | `generators/site_audit.ts` |
| 返信の出力ゲート（送る前に4観点100点で採点） | `generators/reply_gate.ts` |

### 6-3 発信（`src/generators`, `src/distribution`, `src/publish`, `src/adapters`）

日次3ネタ生成 → 媒体別展開（X / Instagram / Threads / LINE） → 安全チェック → 承認メッセージ → 承認後に**下書きファイルとして保存**（`draft_saved_not_posted`）。

加えて、投稿キュー、Threads API、メディアライブラリ、媒体別最適化、ブラウザ投稿支援シート／パネル、Google Business・LINE VOOM 半自動アダプタ（人が目視確認）。

### 6-4 経営・定時（`src/scheduler`, `src/commands`, `src/loop`, `src/monitor`）

朝ブリーフィング、日次チェックイン、夜リマインド、月報、週次整理（AI要約せず原文を日付順に並べる＝記録の改変を避ける）、体験KPI、自己改善ループ（取り込み→採点→前回比較→改善案）、死活監視（OpenRouter / Ollama / AnythingLLM / LINE / ngrok / launchd / systemd）と許可リスト方式の自己修復。

### 6-5 経費（`src/keihi`）

一行入力のレシートパース、勘定科目・消費税区分の自動判定、事業按分、減価償却（少額資産30万・資産10万の閾値）、青色申告向け集計と仕訳CSV、不備チェック、カード明細CSV取り込み、千葉市エネルギー支援金の申請パック生成。

### 6-6 Brand Growth（`src/brand_growth` / 4,600行）

| Phase | 中身 | 性質 |
|---|---|---|
| 1 | Router（一行依頼→誰に・何のために・どう作るか） | 純関数・deepFreeze・乱数と時刻を使わない |
| 2 | Knowledge Registry（台帳・優先順位・矛盾検出・トークン予算） | 中身は持たず所在だけ持つ |
| 3 | Director / Prompt IR（感情アーク・ヒーローモーメント・二層演出・Provider非依存プロンプト） | dry-runのみ |

設計正本は `docs/flatup-ai-os/`（ADR 14本）。**外部API・課金・公開・顧客返信を一切持たない**設計です。

---

## §7 安全設計（3層ガード）

### 第1層 — そもそも危ない行為ができない（コード）

- `src/safety/forbidden_actions.ts`: 禁止行為は例外で停止。
- `src/safety/publication_lock.ts`: `level_3_scheduled` / `level_4_publish` を承認時に物理的に拒否。`OPENQLOW_ENABLE_PUBLIC_POSTING=true` は意図的に未サポート。
- `src/privacy/rules.ts`: 個人情報の形を検知して例外。
- `src/shared/secret_guard.ts` / `pii_guard.ts`: 鍵と個人情報の直書きをリポジトリ全走査で検知（回帰テスト化）。
- 会員のメッセージを承認経路へ渡さない分岐（§4-2）。

### 第2層 — 実行前に人間へ確認（設定）

- `.claude/settings.json`: 再帰削除・履歴破壊・強制push・`.env` の読み書きを **deny**。commit / push / PR作成 / 外部通信 / 転送 / デプロイ / パッケージ公開を **ask**。
- `.codex/rules/flatup-safety.rules`: 同じ方針をCodex側でも `forbidden > prompt > allow` で宣言。
- `.claude/hooks/guard-command.sh` / `.codex/hooks/pre_tool_use_policy.mjs`: Bash実行の前に方針チェック（**この文書の執筆中に実際に発火して、危険な文字列を含むコマンドを止めました**。動作確認済み）。
- `AGENTS.md` の承認ゲート文型（対象・内容・リスクを出して止まる）。

### 第3層 — 壊れた時の被害最小化（運用）

- LINE本文・userId・外部APIエラー本文をログに出さない方針。
- 過大リクエストは413、署名不正は401、内部エラーの詳細は外へ返さない。
- LLM障害時の沈黙防止フォールバック（`shared/fallback_reply.ts`）。
- 監視10分間隔＋許可リスト方式の自己修復。
- 追記専用の退会監査ログ。

### 承認境界（`docs/ai-os/canon/approval_matrix.md`）

```text
AIがやってよい   : 下書き・分析・調査・テスト・リスク指摘
人間の承認が必要 : 送信 / 予約確定 / 料金判断 / 返金 / 退会 / 休会 /
                   外部書き込み / 公開 / 課金 / 本番反映 / commit / push / PR
```

---

## §8 開発・CI・デプロイ

### テスト

```bash
npm test                  # typecheck ＋ 6グループ（1本落ちても最後まで走る）
npm run test:list         # どのテストがどのグループか
npm run test:group:line   # LINE窓口・承認だけ
```

グループはファイルの置き場所から**自動で決まる**ので、テスト追加時の登録漏れが起きません（`scripts/run-tests.mjs`）。

| グループ | 対象 |
|---|---|
| core | `src/`（他グループ以外）・`flatup-webos/` |
| aika | `port/aika/` `src/aika/` `src/generators/` |
| line | `src/line_bot/` `src/approval/` `src/commands/` |
| crm | `src/crm/` |
| publish | `src/publish/` |
| ops | `src/scheduler/` `src/keihi/` `scripts/` |

### CI（`.github/workflows/ci.yml`・8ジョブ）

`main` へのPRとpushで、6グループのテストを並列（`fail-fast: false`）＋ `animation-studio`（独立npmプロジェクト）＋ typecheck / `validate-ai-os.sh` / Skill同期チェック。`main` はこの7チェック必須のブランチ保護つき（`docs/REPOSITORY_SCORECARD.md`）。

### デプロイ

```bash
npm run deploy    # deploy/scripts/deploy-vps.sh（rsync方式・VPS側はgit管理なし）
```

- 反映したコードと本番で動いているコードを照合する仕組みあり（`a2a1e47`）。
- `tools/`（16GB）と映像素材はVPSへ送らない除外設定済み（`27ded19`, `f53cb8d`）。
- SSH鍵はJINのMacの中だけ。**クラウドのAI実行環境からVPSへは到達できない（意図的な設計）**。

---

## §9 AI協業体制（このリポジトリ特有）

```text
JIN（オーナー / 最終承認・push権限）
 ├─ Claude Code : コンテンツ層（generators, crm, brand_growth, sources, distribution, tools）
 └─ Codex       : フロー層（line_bot, approval, scheduler, publish, safety, deploy, scripts, docs/ai-os）
```

- コミット接頭辞は `claude:` / `codex:` / `co-ai:` / `jin:` を強制（実測: Claude 131 / flatup1 43 / Jin 23 / flatup02-source 23 / dependabot 3）。
- 作業切替時は `docs/HANDOFF_<日付>_<from>→<to>.md` を書く（現在17本）。
- 並列度は L2（分担並列）が基本、重要決定は L1。
- Skillの正本は `docs/ai-os/skills-source/`（10個）→ `.claude/skills/` と `.agents/skills/` へ同期し、CIで一致を検証。

---

## §10 今日の検証結果（実測・2026-08-21）

| 検査 | 結果 |
|---|---|
| `npm ci` | 成功（本番依存0・脆弱性報告なし） |
| `npm test` | **成功116件 / 失敗0件** ＋ 追加2本も成功（依存更新後に再実行） |
| `npm run typecheck` | エラーなし |
| `./scripts/validate-ai-os.sh` | `AI OS validation passed`（SKIP 2件はCodex CLI未導入のため） |
| `./scripts/sync-agent-skills.sh --check` | 10 Skills 同期済み |
| GitHub Issues | 0件 |
| GitHub 未マージPR | 6件（§13） |

---

## §10-2 採点と残作業マップ

### 採点（100点満点）

| 観点 | 配点 | 調査時 | 修正後 | 根拠 |
|---|---:|---:|---:|---|
| 機能性・正確性 | 25 | 25 | **25** | テスト116本すべて成功。正本・受付ゲート・CRM・朝ブリーフ・loopが本番稼働 |
| 安全性 | 25 | 25 | **25** | 3層ガードが機能。C-1（ログの個人情報）は PR #108 で解決 |
| 保守性 | 20 | 16 | **20** | C-2 憲法を実装に同期／C-4 同名文書の関係を明記＋`docs/README.md` を新設 |
| 検証の網羅 | 15 | 12 | **15** | C-3 `animation-studio` をCIへ（テスト24本）／C-6 `expand.ts` にテスト追加 |
| 運用の堅さ | 15 | 12 | **15** | C-7 healthを実体へ／C-5 起動時fail-fast／C-8 依存更新を検証して適用 |
| **合計** | **100** | **90** | **100** | リポジトリ側の減点はゼロ |

> ⚠️ **100点は「リポジトリの中」の話です。**
> C-7（nginx）は設定ファイルを直しただけで、**本番サーバーへ反映されるのはJINがデプロイした後**です。
> 反映前の本番は、まだ「Nodeが死んでもヘルスチェックが200を返す」状態のままです。

### 修正の記録（2026-08-21）

| ID | 内容 | どう直したか | 検証 |
|---|---|---|---|
| C-1 | ログに個人情報 | PR #108（別作業）で `pseudonymize` 導入 | main側で実測済み |
| C-2 | 憲法が実装より古い | `AGENTS.md` / `COORDINATION.md` を現状へ。表に無かった実在ディレクトリ10件を追記 | `validate-ai-os.sh` PASS |
| C-3 | `animation-studio` がCIの外 | CIに独立ジョブを追加（別 `npm ci`。ルートのtestは重くしない） | ローカルでテスト24本・typecheck 成功 |
| C-4 | 文書の散らばり | `docs/README.md`（歩き方）を新設。同名2ファイルの正本関係を冒頭に明記 | 目視 |
| C-5 | macOS前提のフォールバック | `/Users/jin` 直書きを削除。HOME無しは `ConfigError`。本番はenv必須 | `test:config` を6ケースへ拡張 |
| C-6 | `expand.ts` にテストなし | `expand.test.ts` を追加（3媒体・公開レベル・紐付け・安全ゲート通過） | 新規テスト成功 |
| C-7 | healthがNodeの死を隠す | nginx 2本を `proxy_pass` へ。nginx単体確認用は別パスへ分離 | 設定変更のみ（**本番反映はJIN**） |
| C-8 | 依存更新の停滞 | typescript 7.0.2 / @types/node 26.2.0 を適用 | typecheck成功・テスト116本成功 |
| C-9 | 正常な出来事をエラーログへ | `routing_log.ts` を新設し `logs/routing/` へ分離 | 新規テスト成功 |

### 残っているのは「人間しかできない作業」だけ

コード側の残作業はゼロになりました。残るのは**AIが手を出せない、JINにしかできない作業**です。

| 順 | 作業 | 所要 | 効果 |
|---|---|---|---|
| 1 | WebOSを XServer へアップロード | 10分 | Web集客の入口が開く |
| 2 | VPS へ反映（`npm run deploy`）して `/journey` と `/openqlow/health` を疎通確認 | 10分 | WebOS→LINEの引き継ぎ ＋ **C-7の修正が効き始める** |
| 3 | iPhone実機で1周チェック | 5分 | 公開前の最終確認 |
| 4 | `hero.jpg` を本物のジム写真へ差し替え | 5分 | 第一印象が変わる |
| 5 | GTMスニペットを貼って GA4 接続 | 10分 | 数字が取れる＝Phase 2の判断材料 |

合計40分。**書き足すコードより、すでに出来ているものを世に出すほうが効果が大きい**のが今の状況です。

> 2 のデプロイ後は `curl -i https://<ドメイン>/openqlow/health` が
> `{"ok":true,"service":"openqlow-webhook"}` を返すことを確認してください。
> 502が返る場合は **Nodeが落ちている**ということなので、そこで初めて正しく異常が見えます。

---

## §11 未実装・止まっているもの

| 項目 | 状態 | 止まっている理由 |
|---|---|---|
| WebOSのXServer公開 | ⛔ 未実施 | JINの手作業待ち（`docs/HANDOFF_20260819...`） |
| WebOS引き継ぎのVPS反映 | ⛔ 未実施 | SSH鍵がJINのMacにしかない（設計通り） |
| GA4 / GTM 接続 | ⛔ 未実施 | IDはJIN管理・リポジトリに入れない方針 |
| WebOS Phase 2〜4（全質問フロー・VPS AI接続・統合） | 未着手 | 実データを見てから判断 |
| 実 Typefully API 連携 | 保留 | Phase 1は下書きのみ |
| Instagram Graph API / TikTok / LINE VOOM 本連携 | 保留 | 同上 |
| YouTube メタデータ生成 | 保留 | Phase 1範囲外 |
| G7b（旧キー文字列の履歴物理除去） | 保留 | `flatup1/flatup` 側の作業。**キー自体は失効済みで悪用不可** |
| Brand Growth Phase 4（Quality Guardian） | PR #85 で作業中 | レビュー待ち |
| `node:sqlite` への移行 | 構想 | JSONストアで足りている |

---

## §12 発見した課題（優先度順）

> **2026-08-21 時点で C-1〜C-9 はすべて対応済みです。** 以下は「何が問題だったか」の記録として残します。
> どう直したかは §10-2「修正の記録」を見てください。

### ✅ C-1（調査中に main 側で修正された）

**C-1. LINEのユーザーIDと本文が自己修復ログに書き込まれていた → PR #108 で解決**

調査時点（`27ded19`）では `src/line_bot/webhook.ts` の `logBrandGrowthRouting` が
`User: <LINE userId>` と `Input: <本文の先頭50文字>` を `logs/self_repair/` へ追記しており、
`docs/STATUS_AND_GAPS.md` の「LINE本文・userIdをログへ出さない」と矛盾していました。

同日マージされた PR #108（`83ed512`）が、この設計図と独立に同じ問題を実サーバーで検出し、修正済みです。

- `pseudonymize.ts` を追加し、userId を復元不能な短いハッシュ（`u_c2ef1b80` 形式）に置換。同じ人は同じ表記になるので運用上の追跡はでき、漏れても本人には辿り着けません。
- 本文は記録せず、**長さだけ**（`Length: 9`）を残す形に変更。
- あわせて、会員への自動返信が経路ごとにバラバラだった問題も `member_reply_gate.ts` で1か所に集約（Brand Growth 経由で会員へ返信が飛び得る状態を実測で確認して修正）。

**残っている小さな点**は §12 C-9 へ移しました。

> 学び: `src/shared/pii_guard.ts` は**ソースコード**を走査する仕組みで、**実行時に組み立てられるログ文字列**は見ていないため検知できませんでした。同種の事故を構造的に止める案が §14 の提案9です。

### ✅ 中: 4件（すべて対応済み）

**C-2. AGENTS.md / COORDINATION.md の記述が実装より古い**

→ **対応済み**: 両ファイルを現状へ更新し、表に無かった実在ディレクトリ10件を追記。

両ファイルは Brand Growth を「本番Runtimeには未統合」「外部接続と本番変更は未着手」と書いていますが、実際には PR #89（`43d9736`）で `brand_growth_adapter.ts` が本番のLINE Webhookに配線済みです。`COORDINATION.md` の最終更新は 2026-08-16 で、以降の WebOS 関連7PR分が反映されていません。**AIが最初に読む憲法が古い**のは、この体制では最も影響が大きい種類のズレです。

**C-3. `animation-studio` と `girl-power-op` がCIの外にある**

→ **対応済み**: `animation-studio` をCIの独立ジョブへ追加（テスト24本）。`girl-power-op` は「検証対象外」と明記。

`animation-studio` は独自の `package.json` と Vitest テスト7本を持ちますが、root の `npm test` にも `.github/workflows/ci.yml` にも含まれていません（1,747行が無検証状態）。`girl-power-op` も同様です。壊れても誰も気づきません。

**C-4. 文書283本の散らばり**

→ **対応済み**: `docs/README.md`（歩き方）を新設。同名2ファイルの正本関係を冒頭に明記。

`docs/` 直下だけで56本、HANDOFF が17本、設計書の系統が `docs/ai-os/` `docs/flatup-ai-os/` `docs/canon/` `docs/superpowers/` `knowledge/wiki/` に5系統あります。さらに `OPENQLOW_HANDOFF.md`（28KB）と `docs/OPENQLOW_HANDOFF.md`（12KB）は**同名で中身が違う**ため、どちらが正かAIも人も判断できません。

**C-5. `src/config.ts` のmacOS前提のフォールバック**

→ **対応済み**: `/Users/jin` 直書きを削除。HOME無しは `ConfigError`、本番はenv必須で起動時に止まる。

`process.env.HOME || "/Users/jin"` と Obsidian Vault のデフォルトパスがmacOS前提です。Linux VPS上で環境変数が欠けた場合、存在しないパスへ書きに行きます。エラーで止まるより「静かに間違った場所へ書く」ほうが発見が遅れます。

### ✅ 低: 4件（すべて対応済み）

**C-6. `src/distribution/expand.ts`（231行）に専用テストがない**

→ **対応済み**: `expand.test.ts` を追加（3媒体・公開レベル・元ネタ紐付け・安全ゲート通過）。

媒体別の文面展開という顧客の目に触れる出力を作る場所ですが、`test:` スクリプトがありません（他経路のテストで間接的に通るのみ）。

**C-7. nginx の `/openqlow/health` が固定文字列を返す**

→ **対応済み（ただし本番反映はJIN）**: 2本とも `proxy_pass` へ。nginx単体確認は `/openqlow/nginx-alive` へ分離。

`deploy/nginx/openqlow-dedicated-vps.conf` と `openqlow-same-vps.conf` はどちらも `/openqlow/health` を nginx 側で即座に 200 で返します。つまり **Nodeプロセスが死んでいてもヘルスチェックは成功します**。監視は systemd 側でも見ているので二重には守られていますが、URL監視だけを信じると死亡を見逃します。

**C-8. Dependabot PRが2件停滞（#92 typescript 5.9→7.0, #94 @types/node 22→26）**

→ **対応済み**: 両方を適用し、typecheck成功・テスト116本成功を確認。

どちらもメジャー更新で、`npm ci` を通してから判断が必要です。放置すると次の更新が積み上がります。

**C-9. 正常なルーティングが「エラー」として自己修復ログに記録される（C-1の残り）**

→ **対応済み**: `src/line_bot/routing_log.ts` を新設し `logs/routing/` へ分離。

`webhook.ts:112` は正常な Brand Growth ルーティングを `writeSelfRepairLog("line_webhook_error", …)` で記録します。個人情報の問題は PR #108 で解決しましたが、**エラーではない出来事がエラーログに積まれる**構造は残っています。障害調査のときに本物のエラーが埋もれます。

推奨: 記録先を `logs/routing/` のような別系統にするか、`self_repair.ts` の `ErrorType` に情報用の種別を1つ足す。

---

## §13 GitHubの現状（2026-08-21時点）

| PR | 種別 | 内容 | 状態 |
|---|---|---|---|
| #109 | draft | この設計図（`docs/SYSTEM_BLUEPRINT.md`） | 本PR |
| #108 | — | 会員への自動返信を1つの関門に統一＋ログの個人情報を止める | ✅ **マージ済み**（`83ed512`）。C-1を解決 |
| #106 | draft | 違約金の断定を正本に合わせ、同種のミスを止めるガード | 08-20作成 |
| #103 | draft | uizin-clipper のROI座標を目分量で決めるのをやめる | 08-20作成 |
| #99 | draft | モバイルホームページの方向性4案 | 08-19作成 |
| #94 | dependabot | `@types/node` 22.19.19 → 26.2.0 | メジャー更新 |
| #92 | dependabot | `typescript` 5.9.3 → 7.0.2 | メジャー更新 |
| #85 | draft | Brand Growth Phase 4 — Quality Guardian | 08-16作成・レビュー待ち |

Issue は0件です。**課題管理はIssueではなくMarkdown文書で行う運用**になっています（これがC-4の背景でもあります）。

---

## §14 次にやること

課題C-1〜C-9はすべて対応済みです（§10-2）。**次はコードではなく、出来ているものを世に出す番**です。

### 今日（JIN・合計40分）

§10-2 の「人間しかできない作業」5つを上から順に。
最初の一手は **① WebOSを XServer へアップロード（10分）**。

### 今週

1. **数字を見る**。GA4がつながったら、WebOSの離脱ポイントを確認する。
2. **PR #109 をマージ**したら、`npm run deploy` でVPSへ反映（C-7の修正が効き始める）。
3. 他の未マージPR（#85 Phase 4 / #99 デザイン案 / #103 切り抜き / #106 違約金ガード）を上から判断する。

### 今月

1. **WebOS Phase 2 の判断**: 実データを見て、質問を増やすか減らすかを決める。**公開前に増やさない**（`docs/SIMPLICITY.md`）。
2. **`docs/README.md` を育てる**: 新しい引き継ぎ書を書いたら、必ずこの索引の先頭へ1行足す。ここが荒れると、また同じ散らばりに戻る。
3. **この設計図を更新する**: 新しいディレクトリ・常駐プロセス・外部接続を足したら、§17のルールに従って直す。

### やらないほうがいいこと

- 公開する前に機能を増やすこと。
- 動いているものを「きれいにするため」だけに作り直すこと。
- 数字を見ないまま次のPhaseを決めること。

## §15 この設計の良いところ（維持すべき点）

1. **依存ゼロ**: 本番依存パッケージ0個。サプライチェーン攻撃とビルド事故の面が構造的に小さい。
2. **正本の一元化**: 料金を直したいとき、直す場所が1つしかない。しかも4本の機械チェックがズレを止める。
3. **承認境界がコードに埋まっている**: 「人間が確認する」を口約束ではなく例外と deny ルールで実装している。
4. **お客様の言葉が承認経路に届かない分岐**: 一番怖い事故（会員のメッセージがオーナーの承認コマンドとして実行される）を、経路の設計で潰している。
5. **テストが領域ごとに割れている**: 1本落ちても全体が止まらず、壊れた範囲が1回で分かる。
6. **記録を改変しない方針**: 週次整理でAI要約をせず原文を並べる、退会ログを追記専用にする、という判断は、業務システムとして正しい。

---

## §16 参照（この文書の根拠）

| 種類 | ファイル |
|---|---|
| 憲法 | `AGENTS.md`, `CLAUDE.md`, `COORDINATION.md` |
| 最上位仕様 | `OPENQLOW_HANDOFF.md`（v3・28KB） |
| 事実の正本 | `src/shared/canon.ts` |
| 承認境界 | `docs/ai-os/canon/approval_matrix.md` |
| AI OS入口 | `docs/ai-os/README.md` |
| Brand Growth設計 | `docs/flatup-ai-os/README.md` ＋ ADR 14本 |
| WebOS設計 | `flatup-webos/README.md` ＋ `flatup-webos/docs/` 13本 |
| 到達度と残作業 | `docs/STATUS_AND_GAPS.md`, `docs/REPOSITORY_SCORECARD.md` |
| 最新の引き継ぎ | `docs/HANDOFF_20260819_claude→AI_flatup-webos-line-journey.md` |
| 単純さの憲法 | `docs/SIMPLICITY.md` |

---

## §17 更新ルール

- この文書は**全体図の入口**です。個別の詳細は各設計書が正本で、矛盾したら**個別の正本を優先**します。
- 大きな構造変更（新しいディレクトリ、新しい常駐プロセス、新しい外部接続）をしたら、ここも直します。
- 数字（テスト本数・ファイル数・PR件数）は調査日時点のものです。古くなったら再計測してから書き換えます。
