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
- 見込み客の保存・ステータス管理（永続化）は state 層の役割で、本モジュールは含みません（第2段階）。

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
