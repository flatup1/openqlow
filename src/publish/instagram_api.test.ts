import assert from "node:assert/strict";
import { publishInstagramImage } from "./instagram_api.js";

// 正常系: メディアコンテナ作成 → 公開 の2段階を踏み、最終 mediaId を返す。
const calls: Array<{ url: string; body: string }> = [];
const okFetch = (async (url: string | URL, init?: RequestInit) => {
  calls.push({ url: String(url), body: String(init?.body ?? "") });
  if (calls.length === 1) return new Response(JSON.stringify({ id: "creation-123" }), { status: 200 });
  return new Response(JSON.stringify({ id: "media-456" }), { status: 200 });
}) as typeof fetch;

const result = await publishInstagramImage({
  igUserId: "1784100000",
  accessToken: "token",
  caption: "成田のFLATUP GYM #FLATUPGYM",
  imageUrl: "https://media.example.com/post.jpg",
  fetchImpl: okFetch,
});

assert.equal(result.creationId, "creation-123");
assert.equal(result.mediaId, "media-456");
assert.equal(calls.length, 2);
assert.match(calls[0].url, /\/1784100000\/media$/);
assert.match(calls[0].body, /image_url=https%3A%2F%2Fmedia.example.com%2Fpost.jpg/);
assert.match(calls[0].body, /caption=/);
assert.match(calls[1].url, /\/1784100000\/media_publish$/);
assert.match(calls[1].body, /creation_id=creation-123/);

// エラー時: 生JSONではなく人間に読める一文だけを投げる。
const errFetch = (async () =>
  new Response(
    JSON.stringify({ error: { message: "Invalid", error_user_msg: "画像URLが取得できません。", code: 9004, fbtrace_id: "SECRET" } }),
    { status: 400 },
  )) as typeof fetch;

let thrown: Error | undefined;
try {
  await publishInstagramImage({ igUserId: "1", accessToken: "t", caption: "x", imageUrl: "https://e/x.jpg", fetchImpl: errFetch });
} catch (e) {
  thrown = e as Error;
}
assert.ok(thrown, "エラー時は例外を投げる");
assert.match(thrown!.message, /画像URLが取得できません/);
assert.doesNotMatch(thrown!.message, /fbtrace_id|SECRET|code/);

console.log("instagram api tests passed");
