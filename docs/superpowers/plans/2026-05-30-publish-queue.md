# Publish Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LINEの `OK` 承認から、Googleビジネスプロフィール、Threads、LINE VOOM向けの投稿準備キューを作る。

**Architecture:** 既存の下書き保存フローは維持し、承認文を解析して媒体別の `publish_queue` JSONを保存する。実投稿APIやブラウザの投稿クリックは行わず、各媒体の次アクションと必要な環境変数名だけを記録する。

**Tech Stack:** TypeScript, Node.js fs/promises, 既存の `tsx` テスト。

---

### Task 1: 承認コマンド解析

**Files:**
- Create: `src/approval/command.ts`
- Create: `src/approval/command.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { parseApprovalCommand } from "./command.js";

assert.deepEqual(parseApprovalCommand("OK FG-20260530-001"), {
  response: "OK",
  id: "FG-20260530-001",
  raw: "OK FG-20260530-001",
  targets: ["drafts_only"],
});

assert.deepEqual(parseApprovalCommand("ok　FG-20260530-001　all"), {
  response: "OK",
  id: "FG-20260530-001",
  raw: "ok　FG-20260530-001　all",
  targets: ["google_business", "threads", "line_voom"],
});

assert.deepEqual(parseApprovalCommand("NO FG-20260530-001"), {
  response: "reject",
  id: "FG-20260530-001",
  raw: "NO FG-20260530-001",
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:approval-command`

- [ ] **Step 3: Implement parser**

Create a parser that normalizes full-width spaces, accepts OK/ok, NO/no, `やめる`, `修正`, and maps `all`, `google`, `threads`, `voom` to queue destinations.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:approval-command`

### Task 2: 投稿キュー保存

**Files:**
- Create: `src/publish/publisher_types.ts`
- Create: `src/publish/queue.ts`
- Create: `src/publish/queue.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

```ts
const file = await createPublishQueueEntry(tmp, record, ["threads", "google_business", "line_voom"]);
const json = JSON.parse(await readFile(file, "utf8"));
assert.equal(json.recordId, "FG-20260530-001");
assert.equal(json.status, "queued_for_owner");
assert.deepEqual(json.destinations, ["threads", "google_business", "line_voom"]);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:publish-queue`

- [ ] **Step 3: Implement queue writer**

Save one JSON file under `state/publish_queue/{{recordId}}.json` with record id, destinations, dry-run instructions, source draft ids, and required env key names.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:publish-queue`

### Task 3: 承認フロー接続

**Files:**
- Modify: `src/scheduler/daily.ts`
- Modify: `src/line_bot/webhook.ts`
- Modify: `src/approval/message.ts`
- Modify: `src/approval/message.test.ts`

- [ ] **Step 1: Write failing behavior tests**

Update approval message tests so the LINE prompt includes `OK {{id}} all`, `OK {{id}} threads`, `OK {{id}} google`, `OK {{id}} voom`, and `NO {{id}}`.

- [ ] **Step 2: Implement minimal connection**

Keep `OK {{id}}` as drafts-only. When approval targets include a publish destination, save the existing drafts and append the publish queue JSON path to the returned saved files.

- [ ] **Step 3: Verify**

Run: `npm run test:approval-command && npm run test:publish-queue && npm run test:approval && npm run typecheck`

### Task 4: 全体検証

- [ ] **Step 1: Run full suite**

Run: `npm test`

- [ ] **Step 2: Report score**

Report what changed, what did not happen, and the remaining risk around OAuth/browser login.
