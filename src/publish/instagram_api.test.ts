import assert from "node:assert/strict";
import { publishInstagramImage } from "./instagram_api.js";

const calls: Array<{ url: string; body: string }> = [];
const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
  calls.push({ url: String(url), body: String(init?.body ?? "") });
  if (String(url).includes("/media_publish")) {
    return new Response(JSON.stringify({ id: "ig-post-1" }), { status: 200 });
  }
  return new Response(JSON.stringify({ id: "ig-creation-1" }), { status: 200 });
}) as typeof fetch;

const res = await publishInstagramImage({
  igUserId: "1789",
  accessToken: "token",
  imageUrl: "https://example.com/openqlow/media/a.jpg",
  caption: "FLATUP caption #FLATUPGYM",
  fetchImpl: fakeFetch,
});

assert.equal(res.creationId, "ig-creation-1");
assert.equal(res.postId, "ig-post-1");
assert.equal(calls.length, 2);
assert.equal(calls[0].url, "https://graph.facebook.com/v19.0/1789/media");
assert.match(calls[0].body, /image_url=https%3A%2F%2Fexample.com%2Fopenqlow%2Fmedia%2Fa.jpg/);
assert.match(calls[0].body, /caption=FLATUP\+caption/);
assert.equal(calls[1].url, "https://graph.facebook.com/v19.0/1789/media_publish");
assert.match(calls[1].body, /creation_id=ig-creation-1/);

// 失敗時は throw（成功扱いしない）
const failFetch = (async () => new Response(JSON.stringify({ error: "bad" }), { status: 400 })) as typeof fetch;
await assert.rejects(() =>
  publishInstagramImage({ igUserId: "1", accessToken: "t", imageUrl: "https://x/y.jpg", caption: "c", fetchImpl: failFetch }),
);

console.log("instagram api tests passed");
