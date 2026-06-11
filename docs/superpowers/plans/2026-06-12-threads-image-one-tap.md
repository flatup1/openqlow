# Threads Image One Tap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe Threads image-post API path so `OK` can publish text plus one public image URL, while local images stay in the browser-assist fallback.

**Architecture:** Extend the existing `threads_api.ts` wrapper with a second media-container helper for `media_type=IMAGE`. Keep `final_publish.ts` as the decision point: public image URL goes to the Threads API, local media stays queued for browser assist. No new posting path bypasses JIN approval.

**Tech Stack:** TypeScript, Node `fetch`, existing `PublishQueueEntry.mediaFiles`, existing `npm run test:threads-api` and `npm run test:final-publish`.

---

### Task 1: Add Threads Image API Helper

**Files:**
- Modify: `src/publish/threads_api.ts`
- Test: `src/publish/threads_api.test.ts`

- [ ] **Step 1: Write the failing image API test**

Add a second fake fetch run in `src/publish/threads_api.test.ts`:

```ts
const imageCalls: Array<{ url: string; body: string }> = [];
const fakeImageFetch = (async (url: string | URL, init?: RequestInit) => {
  imageCalls.push({ url: String(url), body: String(init?.body ?? "") });
  if (imageCalls.length === 1) {
    return new Response(JSON.stringify({ id: "image-creation-123" }), { status: 200 });
  }
  return new Response(JSON.stringify({ id: "threads-image-post-456" }), { status: 200 });
}) as typeof fetch;

const imageResult = await publishThreadsImage({
  userId: "27079444471741122",
  accessToken: "token",
  text: "FLATUP GYM image post",
  imageUrl: "https://example.com/post.jpg",
  fetchImpl: fakeImageFetch,
});

assert.equal(imageResult.creationId, "image-creation-123");
assert.equal(imageResult.postId, "threads-image-post-456");
assert.equal(imageCalls.length, 2);
assert.match(imageCalls[0].body, /media_type=IMAGE/);
assert.match(imageCalls[0].body, /image_url=https%3A%2F%2Fexample.com%2Fpost.jpg/);
assert.match(imageCalls[0].body, /text=FLATUP\+GYM\+image\+post/);
assert.match(imageCalls[1].body, /creation_id=image-creation-123/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:threads-api`

Expected: FAIL because `publishThreadsImage` is not exported.

- [ ] **Step 3: Implement minimal helper**

Add to `src/publish/threads_api.ts`:

```ts
export interface PublishThreadsImageInput extends PublishThreadsTextInput {
  imageUrl: string;
}

async function publishThreadsContainer(input: {
  userId: string;
  accessToken: string;
  body: URLSearchParams;
  fetchImpl?: typeof fetch;
}): Promise<PublishThreadsTextResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const create = await fetchImpl(`https://graph.threads.net/v1.0/${input.userId}/threads`, {
    method: "POST",
    body: input.body,
  });
  const createJson = await readJson(create);
  const creationId = requireString(createJson.id, "creation id");

  const publishBody = new URLSearchParams({
    creation_id: creationId,
    access_token: input.accessToken,
  });
  const publish = await fetchImpl(`https://graph.threads.net/v1.0/${input.userId}/threads_publish`, {
    method: "POST",
    body: publishBody,
  });
  const publishJson = await readJson(publish);
  const postId = requireString(publishJson.id, "post id");

  return { creationId, postId };
}
```

Then rewrite `publishThreadsText` to call `publishThreadsContainer`, and add:

```ts
export async function publishThreadsImage(input: PublishThreadsImageInput): Promise<PublishThreadsTextResult> {
  const createBody = new URLSearchParams({
    media_type: "IMAGE",
    image_url: input.imageUrl,
    text: input.text,
    access_token: input.accessToken,
  });
  return publishThreadsContainer({
    userId: input.userId,
    accessToken: input.accessToken,
    body: createBody,
    fetchImpl: input.fetchImpl,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:threads-api`

Expected: PASS.

### Task 2: Route Public Image URL Through Threads API

**Files:**
- Modify: `src/publish/final_publish.ts`
- Test: `src/publish/final_publish.test.ts`

- [ ] **Step 1: Write failing final publish tests**

Add a second record in `src/publish/final_publish.test.ts` with:

```ts
const imageRecord: DraftRecord = {
  ...record,
  id: "FG-20260603-004",
  drafts: [{
    ...record.drafts[0],
    id: "FG-20260603-004_threads",
    ideaId: "FG-20260603-004",
    approvalId: "FG-20260603-004",
  }],
};
await saveRecord(root, imageRecord);
await createPublishQueueEntry(root, imageRecord, ["threads"], new Date("2026-06-03T00:00:00.000Z"), {
  mediaFiles: ["https://example.com/post.jpg"],
});
```

Run `runFinalPublish` and assert:

```ts
assert.deepEqual(imageResult.published, [{ destination: "threads", externalId: "image-post-1" }]);
assert.deepEqual(imageResult.browserQueued, []);
assert.match(imageCalls[0].body, /media_type=IMAGE/);
assert.match(imageCalls[0].body, /image_url=https%3A%2F%2Fexample.com%2Fpost.jpg/);
```

Also add a local image record:

```ts
await createPublishQueueEntry(root, localImageRecord, ["threads"], new Date("2026-06-03T00:00:00.000Z"), {
  mediaFiles: ["/tmp/post.jpg"],
});
```

Assert:

```ts
assert.deepEqual(localImageResult.published, []);
assert.deepEqual(localImageResult.browserQueued.map(item => item.destination), ["threads"]);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:final-publish`

Expected: FAIL because public image URLs still go to browser assist.

- [ ] **Step 3: Implement routing**

In `src/publish/final_publish.ts`, import `publishThreadsImage`.

Add helpers:

```ts
function isRemoteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isThreadsImageUrl(value: string): boolean {
  return isRemoteUrl(value) && /\.(?:jpg|jpeg|png|webp)(?:[?#].*)?$/i.test(value);
}
```

Inside the `destination === "threads"` block:

```ts
const mediaFile = queue.mediaFiles?.[0];
if (mediaFile && !isThreadsImageUrl(mediaFile)) {
  browserDestinations.push(destination);
  continue;
}
```

After draft/env checks, call `publishThreadsImage` when `mediaFile` exists, otherwise call `publishThreadsText`.

- [ ] **Step 4: Run targeted tests**

Run:

```bash
npm run test:threads-api
npm run test:final-publish
```

Expected: both PASS.

### Task 3: Final Verification

**Files:**
- No additional code files.

- [ ] **Step 1: Run broader publish tests**

Run:

```bash
npm run test:threads-api
npm run test:final-publish
npm run test:publish-queue
npm run test:browser-post-job
```

Expected: all PASS.

- [ ] **Step 2: Run full test suite**

Run: `npm run test`

Expected: PASS.

- [ ] **Step 3: Commit**

Run:

```bash
git add COORDINATION.md docs/superpowers/specs/2026-06-12-threads-image-one-tap-design.md docs/superpowers/plans/2026-06-12-threads-image-one-tap.md src/publish/threads_api.ts src/publish/threads_api.test.ts src/publish/final_publish.ts src/publish/final_publish.test.ts
git commit -m "codex: add threads image api publish path"
```

