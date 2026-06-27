# FLATUP AI OS SDL Final Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 既存統合を保ったまま、LINEログの個人情報露出と既知npm脆弱性を除去し、本番状態を再検証する。

**Architecture:** LINE安全処理を依存ゼロの純粋関数へ分離し、webhook、通知、返信から利用する。依存更新はlockfileの最小変更だけに留め、両リポジトリの全テストと本番healthで回帰を確認する。

**Tech Stack:** TypeScript, Node.js, tsx, node:test/assert, systemd, nginx, cloudflared

## Global Constraints

- 既存の上に積み、作り直さない。
- 自動送信と重要判断は追加せず、人間確認を維持する。
- 秘密情報と個人情報をGit・ログへ出さない。
- `npm test`を緑に保つ。

---

### Task 1: LINEログとwebhook境界を安全化

**Files:**
- Create: `src/line_bot/webhook_security.ts`
- Create: `src/line_bot/webhook_security.test.ts`
- Modify: `src/line_bot/webhook.ts`
- Modify: `src/line_bot/notifier.ts`
- Modify: `src/line_bot/reply.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `safeLineLog(action)`, `publicWebhookError()`, `exceedsWebhookBodyLimit(receivedBytes, nextChunkBytes)`
- Consumes: Node.js HTTP chunk byte lengths

- [ ] **Step 1: Write failing security tests**

安全ログに本文・userIdが含まれないこと、公開エラーが固定値であること、1 MiB超過を検出すること、実ファイルに危険なログ連結がないことを検証する。

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx tsx src/line_bot/webhook_security.test.ts`

Expected: FAIL because `webhook_security.ts` does not exist or unsafe source patterns remain.

- [ ] **Step 3: Implement the minimal safety helpers and wire them**

固定ログ、固定公開エラー、1 MiB上限を実装し、本文・userId・LINE APIレスポンス本文をログやエラー戻り値に含めない。

- [ ] **Step 4: Run focused and full tests**

Run: `npm run test:line-webhook-security && npm test`

Expected: PASS with zero test failures.

- [ ] **Step 5: Commit**

```bash
git add src/line_bot package.json docs/superpowers
git commit -m "co-ai: LINEログの個人情報漏えいを防止"
```

### Task 2: 既知依存脆弱性を解消

**Files:**
- Modify: `package-lock.json` in openqlow
- Modify: `package-lock.json` in flatup-ai-os

**Interfaces:**
- Produces: `esbuild >= 0.28.1` through the existing `tsx` dependency tree

- [ ] **Step 1: Verify RED**

Run in each repository: `npm audit --audit-level=low`

Expected: exit 1 with one low severity esbuild advisory.

- [ ] **Step 2: Apply the non-breaking lockfile fix**

Run in each repository: `npm audit fix`

- [ ] **Step 3: Verify GREEN**

Run in each repository: `npm audit --audit-level=low && npm test`

Expected: zero vulnerabilities and all tests pass.

- [ ] **Step 4: Commit each repository**

```bash
git add package-lock.json
git commit -m "chore: esbuildの既知脆弱性を解消"
```

### Task 3: 秘密情報と本番運用を再検証

**Files:**
- Modify only if evidence requires it.

**Interfaces:**
- Consumes: all Git revisions, VPS systemd state, nginx health, public URL
- Produces: redacted pass/fail evidence

- [ ] **Step 1: Scan every flatup-ai-os revision**

各commitの追跡ファイルを `secret_guard` と同じパターンで走査し、値を表示せず、検出種別とファイル名だけを報告する。

- [ ] **Step 2: Push approved commits**

Push the reviewed branches, then fast-forward or merge to `main` only because the owner already issued `run` for this production-hardening cycle.

- [ ] **Step 3: Deploy clean committed archives**

実値のenv、state、logs、Vaultデータを保持し、コミット済みコードだけをVPSへ同期する。

- [ ] **Step 4: Verify production**

Run VPS tests, restart affected services, and verify `openqlow-webhook.service`, `openqlow-loop.timer`, local nginx health, and public health without reading customer logs.

- [ ] **Step 5: Re-score**

SDL 5区分を再採点し、外部資格情報が必要な残課題は100点に含めず明示する。
