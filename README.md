# OPENQLOW

OPENQLOW is FLATUP GYM's attack AI for YouTube/SNS growth.

Phase 1 does not publish or schedule posts. It generates three daily ideas, expands them into platform drafts, runs safety checks, sends or previews LINE approval messages, and saves approved drafts.

The canonical handoff/spec is:

```text
/Users/jin/Desktop/OPENQLOW HelMES/openqlow/OPENQLOW_HANDOFF.md
```

## Commands

```bash
npm install
npm run daily
npm run dev -- generate
npm run dev -- approve <post-id> "OK <post-id>"
npm run dev -- revise <post-id> "revision note"
npm run dev -- reject <post-id> "reason"
npm run inquiry -- "<問い合わせ文>"
npm run trial-followup -- --gender female --status 検討中
npm run ad-copy -- --segment women_beginner
npm run site-audit -- --file ./index.html
npm run test
```

## 集客AI司令塔 / 問い合わせ返信AIKA（第1段階）

LINE / Instagram DM に届いた問い合わせ文を貼ると、AIKA 口調の返信案（丁寧・短め・予約誘導強め）と
追客文（24時間後・3日後）、見込み客管理用の属性分類（属性 / 温度感 / 目的 / 次アクション / 優先度）を生成します。

```bash
npm run inquiry -- "小学生の子供に習わせたいのですが初心者でも大丈夫ですか？"
npm run inquiry -- "ダイエットで通いたい女性です。料金を教えてください" --gender female
```

オプション: `--gender female|male` `--purpose <目的>` `--time <希望時間>` `--memo <メモ>`

設計方針:

- 生成のみ。**自動送信は一切しません**。必ず人間が確認してから送信します。
- 料金・スケジュールは `src/generators/inquiry_reply.ts` の `FLATUP_INFO`（正本値）のみを使用し、AIが勝手に変更しません。
- 医療的・法律的な断定や強引な営業文は避け、初心者・女性・キッズが安心できる表現に寄せています。
- 返信は基本「AIKA」で締めます。

見込み客の保存・ステータス管理は新規 DB を作らず、既存の朝インタビュー（`src/conversation/interview_flow.ts` の inquiry/trial ジャンル）＋ CRM ログ（`crm_log_generator`）＋ ToDo 抽出（`commands/daily_report_todo.ts`）運用を活かす方針です。

## 集客AI司令塔 / 体験後フォロー生成

体験に来た方の属性・様子・不安点・入会温度感を渡すと、AIKA 口調で
**当日お礼／翌日フォロー／入会案内／Google口コミ依頼** の4文を生成します。
既存の朝インタビュー（trial ジャンル）の回答 `gender / age_band / reaction / hesitation_reason / enrollment_status` をそのまま入力に使えます。

```bash
npm run trial-followup -- --gender female --age 30代 --reaction "ミット打ちが楽しそう" --concern 料金 --status 検討中
```

オプション: `--gender female|male` `--age <年齢層>` `--reaction <様子>` `--good <良かった点>` `--concern <不安点>` `--status はい|保留|検討中|いいえ`

- 入会温度感（status）に応じて表現を調整し、見送り気味の方には**押し込まない**入会案内にします。
- 料金は `FLATUP_INFO`（正本値）を再利用し、二重管理しません。
- 口コミ依頼は良い体験の直後に送る前提の文面です。

> 注: SNS 投稿生成は既存の `generators/daily_three`・`mma_topic` → `distribution/expand` → `publish/*` パイプラインが担当します（本ツール群では再実装しません）。

## 集客AI司令塔 / 広告文生成

ターゲット（女性初心者 / キッズ / 40代男性 / ダイエット / 護身 / 運動不足）ごとに、
**Google広告・Instagram広告・LINE配信**用の広告文を生成します。

```bash
npm run ad-copy -- --segment women_beginner
npm run ad-copy -- --segment kids --platform instagram
```

segment: `women_beginner | kids | men_40s | diet | self_defense | exercise_shortage`
platform（任意）: `google | instagram | line`（省略時は全媒体）

- 配信はしません（自動配信なし）。下書きを人間が確認してから使います。
- 誇大表現（必ず痩せる等）・ビフォーアフター煽り・体型否定は使わない方針です。
- 料金は `FLATUP_INFO` の初回体験500円を再利用します。
- 広告は媒体向け配信文のため「AIKA」署名は付けません。

## 集客AI司令塔 / サイト改善チェック

公式サイトのテキスト/HTML を渡すと、初心者女性・キッズ保護者の視点で
**体験予約導線 / 料金の分かりやすさ / 初心者・女性の安心感 / キッズ導線 / アクセス・駐車場 / 問い合わせ(LINE)導線**
の6観点をチェックし、改善メモとスコアを出します。

```bash
npm run site-audit -- --label トップページ --file ./index.html
cat index.html | npm run site-audit -- --label トップページ
```

- **ライブ取得はしません**。サイトを保存したファイル、またはページのテキストを入力します（決定的・テスト可能なため）。
- HTMLタグ・script・style は除去し、可視テキストで判定します。
- ルールベースの簡易チェックです。最終判断は人間が行います。

## 見込み客CRM（AI永久集客エンジンの土台）

見込み客の記録・追客漏れの見える化・体験後フォロー・日次レポート・自己修復ログを、
依存ゼロのTypeScriptで実装したCRMです（SQLiteの代わりにJSONファイルストア）。
**AIは営業参謀であり、送信・予約確定・料金変更はしません。最終判断は人間が行います。**

```bash
# 問い合わせ文を貼るだけで台帳に下書き登録（属性・温度感A/B/C・返信案を自動生成）
npm run crm -- intake --message "小学生の子供に習わせたい。初心者でも大丈夫ですか" --name 田中 --source LINE
# 手動でも登録できる（最終連絡日時を自動付与）
npm run crm -- add --name 山田 --gender female --category female --status waiting_reply --inquiry "初心者でも大丈夫ですか"
# 一覧・名前で検索・ステータス更新（状態は日本語OK）
npm run crm -- list
npm run crm -- find 田中
npm run crm -- status 1 入会      # 返信した / 体験予約 / 体験済み / 入会 / 見送り（英語コードも可）
# その人向けの返信下書きを個別に出す（日報からは外し、必要な時だけ）
npm run crm -- draft 1
# 追客漏れ／体験後フォロー／口コミ依頼の候補を見える化
npm run crm -- followups
# 日次集客レポートを生成して保存（推奨メッセージはAIKAジェネレータを再利用）
npm run crm -- daily-report
# 自己修復ログ（記録と修復案のみ・自動修復なし）
npm run crm -- log-error api_error "401 Unauthorized"
```

- データ保存先は `OPENQLOW_DATA_DIR`（既定 `./data`）。`data/`・`reports/`・`logs/` は
  個人情報を含むため `.gitignore` 済み（コミットしない）。
- 追客とみなす経過時間は `OPENQLOW_FOLLOWUP_HOURS`（既定24）で調整可能（多すぎなら48等）。
- 日報は「誰に何を」だけの短い形。長い返信文は載せず、`crm draft <番号>` で個別に出します。
- 追客抽出条件: 返信漏れ=`waiting_reply/replied` かつ最終連絡から24h経過かつ未入会／
  体験後フォロー=`trial_done`＋体験日あり＋未入会／口コミ=`joined`。
- LLMを使う場合のプロンプトは `src/crm/ai_prompts.ts`（APIキー不要・貼り付け用）。
- 状態の永続化は将来 `node:sqlite` へ差し替え可能な構造です。

## Safety Rules

- No direct SNS publishing.
- Typefully draft only.
- Phase 1 physically rejects `level_3_scheduled` and `level_4_publish` drafts at approval time.
- `OPENQLOW_ENABLE_PUBLIC_POSTING=true` is intentionally unsupported in Phase 1.
- Instagram and Threads are local draft files only. YouTube metadata is deferred beyond Phase 1.
- LINE approval uses exact `OK <post-id>` approval, with revision/reject handled separately.
- Approved items are saved as drafts and logged as `draft_saved_not_posted`.
- API keys must not be written to Git, Obsidian, README, or logs.

## Phase 1 Workflow

Generate approval records:

```bash
npm run daily
```

Approve a record locally:

```bash
npm run dev -- approve <post-id> "OK <post-id>"
```

Start the webhook skeleton:

```bash
tsx src/line_bot/webhook.ts
```

The webhook accepts LINE Messaging API JSON events at `/openqlow/webhook`.
For local tests, it also accepts plain POST bodies like:

```text
OK FG-YYYYMMDD-NNN
修正 FG-YYYYMMDD-NNN: もっと初心者向けに
× FG-YYYYMMDD-NNN
```

## One VPS Deployment

OPENQLOW can run on the same VPS as the existing FLATUP LINE Bot without mixing their routes:

```text
/line/webhook       -> existing FLATUP LINE Bot
/openqlow/webhook  -> OPENQLOW approval Bot
```

Deployment templates live in:

```text
deploy/
├── nginx/openqlow-same-vps.conf
├── openqlow.vps.env.example
├── scripts/install-openqlow-vps.sh
└── systemd/
```

Full steps:

```text
docs/vps_same_server_deploy.md
```

## Design Trace

This project implements Phase 1 of:

```text
/Users/jin/Desktop/OPENQLOW HelMES/flatup-ai-os/docs/openqlow_attack_ai_design.md
```

Implemented in Phase 1:

- Daily three ideas.
- MMA/value-driven topic generation.
- X / Instagram / Threads / LINE copy expansion.
- Safety checks.
- LINE-style approval message.
- Local approval command.
- X/Instagram/Threads draft files only.
- No direct publishing.
- Obsidian generation/approval logging.
- Obsidian draft mirroring.
- Canon map references.
- Approval, posting, and performance registers.

Deferred:

- LINE reply message API. Approval intake uses webhook events; notifications use push.
- Real Typefully API draft creation.
- YouTube metadata files.
- Trial video clipper.
- Instagram Graph API.
- TikTok and LINE VOOM.
