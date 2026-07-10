---
name: run-openqlow-dryrun
description: Use when asked to run, launch, smoke-test, or "動かして/見て" openqlow locally — especially the morning briefing (npm run morning). Gives the exact env-var recipe that keeps the launch a safe DRY-RUN — no real LINE push to Jin, no write to the real Obsidian Vault.
---

# Run openqlow (safe dry-run)

## Overview

This repo can push LINE messages to Jin and overwrite the real `DAILY-BRIEF.md` in `~/Documents/Obsidian Vault`. Launching `npm run morning` the naive way triggers a **real, irreversible side effect**. This skill forces a fully isolated dry-run.

**Invariant to protect:** no real LINE send, no real Vault write, unless Jin explicitly approves a live run.

## Morning briefing — fully isolated (run from this repo root)

```bash
SB=$(mktemp -d)            # throwaway sandbox
OPENQLOW_ROOT="$SB/root" \
OBSIDIAN_VAULT_ROOT="$SB/vault" \
OPENQLOW_LINE_DRY_RUN=true \
OPENQLOW_WRITE_DAILY_BRIEF=true \
JIN_LINE_USER_ID=test-morning-user \
LINE_CHANNEL_ACCESS_TOKEN=dummy-dry-run-token \
  npm run morning
cat "$SB/vault/DAILY-BRIEF.md"   # inspect the generated brief
```

Why each var:
- **`OPENQLOW_LINE_DRY_RUN=true`** — `src/line_bot/notifier.ts` prints `[LINE DRY-RUN]` and returns before the real `fetch`. No message reaches Jin.
- **`OBSIDIAN_VAULT_ROOT=$SB/vault`** — redirects the `DAILY-BRIEF.md` write off the real Vault.
- **`OPENQLOW_ROOT=$SB/root`** — redirects the conversation session store (`${OPENQLOW_ROOT}/state/conversations/*.json`).
- **`JIN_LINE_USER_ID=test-morning-user`** — without a user id the run early-exits `mode=no_user`.
- **`LINE_CHANNEL_ACCESS_TOKEN=dummy-dry-run-token`** — makes push reach the `dry_run` branch (`mode=dry_run`) instead of `skipped`; harmless because `OPENQLOW_LINE_DRY_RUN=true` still blocks the send.
- **`OPENQLOW_WRITE_DAILY_BRIEF=true`** — exercises the Vault-write feature (default off).

Expect: `[LINE DRY-RUN]` in stdout, `mode=dry_run ok=true`, a rendered `DAILY-BRIEF.md` in the sandbox, and the **real** Vault file's mtime unchanged.

## Other CLIs

Most senders honor `OPENQLOW_LINE_DRY_RUN=true` / `OPENQLOW_DRY_RUN`. When driving any command that can send or publish, set the dry-run env and redirect `OPENQLOW_ROOT` / `OBSIDIAN_VAULT_ROOT` to a sandbox first. See `package.json` scripts and confirm the guard in the relevant `src/**` sender before a live run.

## Common mistakes

- Running `npm run morning` without `OPENQLOW_LINE_DRY_RUN=true` → real LINE push to Jin.
- Running without overriding `OBSIDIAN_VAULT_ROOT` → overwrites the real `DAILY-BRIEF.md`.

## Sibling app / full cross-app recipe

The flatup-ai-os draft engine has its own recipe in the sibling repo's `run-flatup-ai-os-dryrun` skill, and the combined cross-app recipe lives at `../.claude/skills/run-flatup-apps-dryrun` (top-level `OPENQLOW HelMES`).

## Going live (owner-gated)

A real run = drop the guard vars and set real credentials. That is a production side effect (send / prod write) and requires **Jin's explicit approval per the constitution's approval gate**. Never do it unprompted.
