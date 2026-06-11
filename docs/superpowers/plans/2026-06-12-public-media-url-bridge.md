# Public Media URL Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve approved local media files to public URLs only when they live under a configured public media directory.

**Architecture:** Add a small `public_media.ts` resolver and call it from `final_publish.ts` before deciding whether Threads can use the image API. If the resolver cannot produce a safe URL, keep the existing browser-assist fallback.

**Tech Stack:** TypeScript, Node `fs/promises`, Node `path`, existing `final_publish` flow.

---

### Task 1: Add Public Media Resolver

**Files:**
- Create: `src/publish/public_media.ts`
- Create: `src/publish/public_media.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing resolver tests**

Create `src/publish/public_media.test.ts` covering:

```ts
assert.equal(await resolvePublicMediaUrl(file, {
  OPENQLOW_PUBLIC_MEDIA_DIR: publicDir,
  OPENQLOW_PUBLIC_MEDIA_BASE_URL: "https://media.example.com/openqlow/",
}), "https://media.example.com/openqlow/nested/post.jpg");

assert.equal(await resolvePublicMediaUrl(outsideFile, {
  OPENQLOW_PUBLIC_MEDIA_DIR: publicDir,
  OPENQLOW_PUBLIC_MEDIA_BASE_URL: "https://media.example.com/openqlow/",
}), undefined);

assert.equal(await resolvePublicMediaUrl(file, {}), undefined);
assert.equal(await resolvePublicMediaUrl(missingFile, env), undefined);
assert.equal(await resolvePublicMediaUrl("https://example.com/post.jpg", {}), "https://example.com/post.jpg");
```

- [ ] **Step 2: Run test and verify failure**

Run: `npm run test:public-media`

Expected: fail until script and module exist.

- [ ] **Step 3: Implement resolver**

Create `src/publish/public_media.ts` with:

- `resolvePublicMediaUrl(mediaFile, env)`
- returns remote URLs unchanged
- requires both env vars for local files
- verifies file exists
- rejects paths outside public dir
- URL-encodes path segments

- [ ] **Step 4: Add package script and run test**

Add `test:public-media` to `package.json` and include it in `test`.

Run: `npm run test:public-media`

Expected: pass.

### Task 2: Use Resolver In Final Publish

**Files:**
- Modify: `src/publish/final_publish.ts`
- Modify: `src/publish/final_publish.test.ts`

- [ ] **Step 1: Write failing final publish test**

Add a record whose `mediaFiles` contains a local file under a configured public media dir.

Assert final publish calls Threads API with:

```text
image_url=https%3A%2F%2Fmedia.example.com%2Fopenqlow%2Fpost.jpg
```

- [ ] **Step 2: Run failing test**

Run: `npm run test:final-publish`

Expected: fail because local files still go to browser assist.

- [ ] **Step 3: Resolve URL before Threads image decision**

In `final_publish.ts`:

```ts
const mediaUrl = mediaFile ? await resolvePublicMediaUrl(mediaFile, env) : undefined;
if (mediaFile && !isThreadsImageUrl(mediaUrl ?? "")) {
  browserDestinations.push(destination);
  continue;
}
```

Use `mediaUrl` as `imageUrl`.

- [ ] **Step 4: Run targeted tests**

Run:

```bash
npm run test:public-media
npm run test:final-publish
npm run test:threads-api
```

Expected: all pass.

### Task 3: Final Verification And Commit

- [ ] **Step 1: Run full test suite**

Run: `npm run test`

Expected: pass.

- [ ] **Step 2: Commit**

Run:

```bash
git add package.json docs/superpowers/specs/2026-06-12-public-media-url-bridge-design.md docs/superpowers/plans/2026-06-12-public-media-url-bridge.md src/publish/public_media.ts src/publish/public_media.test.ts src/publish/final_publish.ts src/publish/final_publish.test.ts
git commit -m "codex: add public media url bridge"
```

