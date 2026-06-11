import assert from "node:assert/strict";
import { publishThreadsImage, publishThreadsText } from "./threads_api.js";

const calls: Array<{ url: string; body: string }> = [];
const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
  calls.push({ url: String(url), body: String(init?.body ?? "") });
  if (calls.length === 1) {
    return new Response(JSON.stringify({ id: "creation-123" }), { status: 200 });
  }
  return new Response(JSON.stringify({ id: "threads-post-456" }), { status: 200 });
}) as typeof fetch;

const result = await publishThreadsText({
  userId: "27079444471741122",
  accessToken: "token",
  text: "FLATUP GYM test post",
  fetchImpl: fakeFetch,
});

assert.equal(result.creationId, "creation-123");
assert.equal(result.postId, "threads-post-456");
assert.equal(calls.length, 2);
assert.equal(calls[0].url, "https://graph.threads.net/v1.0/27079444471741122/threads");
assert.match(calls[0].body, /media_type=TEXT/);
assert.match(calls[0].body, /text=FLATUP\+GYM\+test\+post/);
assert.equal(calls[1].url, "https://graph.threads.net/v1.0/27079444471741122/threads_publish");
assert.match(calls[1].body, /creation_id=creation-123/);

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
assert.equal(imageCalls[0].url, "https://graph.threads.net/v1.0/27079444471741122/threads");
assert.match(imageCalls[0].body, /media_type=IMAGE/);
assert.match(imageCalls[0].body, /image_url=https%3A%2F%2Fexample.com%2Fpost.jpg/);
assert.match(imageCalls[0].body, /text=FLATUP\+GYM\+image\+post/);
assert.equal(imageCalls[1].url, "https://graph.threads.net/v1.0/27079444471741122/threads_publish");
assert.match(imageCalls[1].body, /creation_id=image-creation-123/);

console.log("threads api tests passed");
