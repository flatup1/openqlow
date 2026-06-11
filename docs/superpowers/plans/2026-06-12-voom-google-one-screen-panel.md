# VOOM Google One Screen Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the existing browser panel so LINE VOOM and Google Business posting can be prepared from one screen.

**Architecture:** Keep `createBrowserPanel` as the HTML generator. Add a media section that resolves public URLs with `resolvePublicMediaUrl`, then render copy buttons for public URLs and local file paths.

**Tech Stack:** TypeScript, existing publish queue, existing browser panel tests.

---

### Task 1: Add Panel Tests

- [ ] Add `mediaFiles` to `browser_panel.test.ts`.
- [ ] Set public media env in `createBrowserPanel`.
- [ ] Assert the panel includes image guidance, public URL, local path, Google note, and LINE VOOM note.

### Task 2: Implement Panel Upgrade

- [ ] Import `resolvePublicMediaUrl`.
- [ ] Add optional env parameter to `createBrowserPanel`.
- [ ] Render a media section above destination cards.
- [ ] Add destination-specific steps inside each card.

### Task 3: Verify

- [ ] Run `npm run test:publish-panel`.
- [ ] Run `npm run test`.
- [ ] Commit with `codex:` prefix.

