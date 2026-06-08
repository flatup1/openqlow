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
npm run dev -- expense 1200 消耗品 ジムの備品
npm run dev -- expense:report 2026-06
npm run dev -- expense:csv 2026-06
npm run dev -- expense:categories
npm run test
```

## Expense Ledger (会計記録)

Records expenses into the Obsidian Vault as a machine-readable `.jsonl` plus a
human-readable monthly Markdown ledger, then ships them to GitHub through the
existing `/push` command. No external accounting service is involved.

Storage: `6_システム/openqlow_expenses/`

- `expenses.jsonl` — canonical ledger, one expense per line (date, amount, category, memo, taxRate)
- `expenses-YYYY-MM.md` — per-month Markdown table for browsing in Obsidian
- `expenses-YYYY-MM.csv` — generic CSV (Excel/spreadsheets, UTF-8 BOM)
- `expenses-YYYY-MM-yayoi.csv` — 弥生会計 仕訳インポート形式 (journal entries, no header)

LINE / CLI:

```text
/経費 1200 消耗品 ジムの備品          # record (today, JST)
/経費 800 新聞図書費 8%               # record at the reduced 8% tax rate
/経費 2026-06-01 3000 交通費 セミナー   # record on a past date
/経費月報                              # this month's totals by category + tax
/経費月報 先月 / 2026-05 / 5月          # last / specific month
/経費CSV                              # export this month (generic CSV)
/経費CSV 弥生                          # export for 弥生会計 (journal-entry format)
/経費CSV 弥生 先月 / 2026-05           # format token + month, order-free
/経費カテゴリ                          # list the standard accounting buckets
```

Accounting-software export is a pluggable adapter layer (canonical ledger →
per-format CSV), so freee etc. can be added later without changing the ledger.
The 弥生 adapter emits one journal entry per expense (借方=category /
貸方=事業主借 for a sole proprietor). Design notes, the 弥生 column mapping, and
the first-import checklist (encoding / 税区分 / 科目名) are in
[`docs/expense_accounting_export.md`](docs/expense_accounting_export.md).

Amounts accept `1,200`, `¥1200`, and `1200円` and are treated as tax-included.
A tax token (`8%`, `10%`, `非課税`) can appear anywhere after the amount; the
default is 10%. Category aliases (`消耗品`→`消耗品費`, `交通費`→`旅費交通費`, …)
are normalized to standard accounting buckets (勘定科目); unknown words are kept
as-is. The monthly report sums per category and shows the estimated consumption
tax. After recording or exporting, send `/push` to commit the Vault to GitHub.

CLI equivalents:

```bash
npm run dev -- expense 1200 消耗品 ジムの備品
npm run dev -- expense:report 2026-06
npm run dev -- expense:csv 2026-06
npm run dev -- expense:categories
```

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
