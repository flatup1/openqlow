# HANDOFF: Codex -> Claude v2 - 2026-06-07

## Summary

Codex accepted the Claude -> Codex handoff and implemented safe site-specific browser post adapters for Google Business and LINE VOOM.

This implementation intentionally stays semi-auto.
It opens the right site, puts the post body on the clipboard, asks JIN to visually confirm/post, and only returns success when JIN confirms "投稿した".

## Files Added Or Changed In This Codex Pass

- `scripts/adapters/lib/site_adapter.mjs`
- `scripts/adapters/google_business.mjs`
- `scripts/adapters/line_voom.mjs`
- `scripts/adapters/browser_post_adapters.test.mjs`
- `scripts/mac-browser-poster.mjs`
- `scripts/mac-browser-poster.test.mjs`
- `package.json`
- `docs/browser-post-adapters.md`
- `docs/HANDOFF_20260607_codex→claude_v2.md`

## What Was Implemented

### Google Business adapter

```bash
OPENQLOW_BROWSER_AUTO_CLICK=true \
OPENQLOW_BROWSER_AUTO_CLICK_CMD="node scripts/adapters/google_business.mjs" \
node scripts/mac-browser-poster.mjs /path/to/google-job.json
```

### LINE VOOM adapter

```bash
OPENQLOW_BROWSER_AUTO_CLICK=true \
OPENQLOW_BROWSER_AUTO_CLICK_CMD="node scripts/adapters/line_voom.mjs" \
node scripts/mac-browser-poster.mjs /path/to/voom-job.json
```

### Shared behavior

1. Validate `destination`.
2. Require `finalClickAllowed=true`.
3. Copy post text to clipboard.
4. Open destination in Google Chrome.
5. Show JIN visual confirmation dialog.
6. Return success only when JIN chooses `投稿した`.
7. Fail when JIN chooses `まだ`.
8. Refuse `OPENQLOW_FORCE_FULL_AUTO=true`.

## Safety Boundary

Codex preserved the safety rule:

> Do not mark posting as successful when posting was not confirmed.

The adapter does not inspect cookies, tokens, passwords, or session state.
It does not take screenshots.
It does not claim UI-verified full-auto posting.

## Why Semi-Auto Instead Of Full Auto

Google Business UI did not reliably accept generic automated clicks.
Full automatic posting needs deeper UI verification before it is safe.

For now, the safest useful flow is:

```text
Open page -> copy body -> JIN posts visually -> JIN confirms -> success
```

This is less flashy, but it avoids false success.

## Tests

Codex added:

```bash
npm run test:browser-post-adapters
```

Codex also updated:

```bash
npm run test:mac-browser-poster
```

The full `npm test` script now includes `test:browser-post-adapters`.

## Remaining Work

Full-auto posting is still not enabled.

Future work:

1. Add real UI verification for Google Business.
2. Add real UI verification for LINE VOOM.
3. Only then allow `OPENQLOW_FORCE_FULL_AUTO=true`.
4. Consider Playwright/CDP only if JIN approves the extra dependency and browser profile setup.

## Claude Review Request

Please review wording/safety docs only unless JIN asks you to code.
The implementation lives in `scripts/`, which is Codex territory.

Areas where Claude can help without conflict:

- Improve user-facing instructions.
- Review FLATUP tone.
- Suggest safer confirmation wording.
- Check that docs do not imply full-auto posting is complete.
