# Codex to ClaudeCode Handoff - 2026-06-07

## Summary

Codex implemented and pushed the browser posting foundation for openQLOW.
The system can now prepare browser posting jobs and run a guarded auto-click mode, but Google Business full auto posting is not yet reliable.

## Latest Commits

- `bf8d76d codex: feat(browser): add auto click posting mode`
- `5304f4f codex: fix(browser): fail closed when auto click misses`

These commits were pushed to `main`.

## What Codex Implemented

`scripts/mac-browser-poster.mjs` now supports auto-click mode.

Basic usage:

```bash
OPENQLOW_BROWSER_AUTO_CLICK=true \
node scripts/mac-browser-poster.mjs /path/to/job.json
```

The job JSON must explicitly allow final posting:

```json
"finalClickAllowed": true
```

External adapters can be connected with:

```bash
OPENQLOW_BROWSER_AUTO_CLICK=true \
OPENQLOW_BROWSER_AUTO_CLICK_CMD="/path/to/adapter" \
node scripts/mac-browser-poster.mjs /path/to/job.json
```

## Important Safety Fix

The first auto-click implementation could appear successful even when no post was actually submitted.
Codex fixed this so built-in auto mode now fails closed when it cannot find a posting button.

Expected failure:

```text
自動投稿ボタンを見つけられませんでした。半自動モードで確認してください。
```

This is intentional. Do not change it back to a success fallback.

## Verified Commands

Codex verified:

```bash
npm run test:mac-browser-poster
npm run typecheck
```

Both passed.

## Browser Job Retrieved From VPS

The VPS had this job:

```text
/opt/openqlow/state/browser_post_jobs/FG-20260607-001.json
```

Codex copied it locally:

```text
/Users/jin/Downloads/openqlow-jobs/FG-20260607-001.json
```

Job summary:

- `recordId`: `FG-20260607-001`
- destinations:
  - `google_business`
  - `line_voom`
- text length: 139
- media files: none
- `finalClickAllowed`: true

## Posting Test Status

Google Business full auto posting is not complete.

What happened:

1. The Google Business page opened in the logged-in Chrome FLATUP profile.
2. The job text was available and tested through the browser workflow.
3. Google Business UI did not reliably accept the automated click for `最新情報を追加` / final post submission.
4. Codex did not claim a successful Google Business post because no UI confirmation was verified.

Current conclusion:

Google Business needs a dedicated adapter, not a generic AppleScript clicker.

## Recommended Next Work For ClaudeCode

### Goal

Build dedicated browser posting adapters for Google Business and LINE VOOM.

The adapters should use the logged-in Chrome profile, but must not report success unless the post is actually confirmed by UI state or a reliable success signal.

### Priority Tasks

1. Create a Google Business adapter.
2. Create a LINE VOOM adapter.
3. Make both callable through `OPENQLOW_BROWSER_AUTO_CLICK_CMD`.
4. Return structured JSON.
5. Fail closed when UI elements cannot be found.
6. Fall back to semi-auto mode when final posting is uncertain.

Expected success output:

```json
{
  "externalId": "google_business-posted-FG-xxxx",
  "status": "posted"
}
```

Expected failure output:

```json
{
  "status": "failed",
  "reason": "投稿ボタンが見つからない"
}
```

## Recommended Safe UX

Start with this flow:

```text
1. Open destination page.
2. Fill post body automatically.
3. Stop before final post.
4. Ask JIN to visually confirm.
5. Only then click the final post button.
```

Only move to full auto after the adapter can verify the page state reliably.

## Files Touched By Codex

- `scripts/mac-browser-poster.mjs`
- `scripts/mac-browser-poster.test.mjs`

## Coordination Notes

- `openqlow/scripts/` is Codex territory in `COORDINATION.md`.
- If ClaudeCode edits these files, ask JIN first or coordinate explicitly.
- `docs/` is shared territory.
- Commit prefix rules:
  - Codex work: `codex: ...`
  - Claude work: `claude: ...`
  - Shared work if hook requires it: `co-ai: ...`
- Push only after JIN approval.

## Hard Safety Rules

- Do not output API keys, tokens, cookies, passwords, or browser session data.
- Do not mark browser posting as successful without verification.
- Do not bypass the human approval boundary for public posts.
- If unsure, stop at semi-auto mode and let JIN confirm.
