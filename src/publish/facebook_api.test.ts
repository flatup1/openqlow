import assert from "node:assert/strict";
import { publishFacebookPost } from "./facebook_api.js";

// 画像URLありなら /photos に投げ、post_id を返す。
{
  let calledUrl = "";
  const fakeFetch = (async (url: string) => {
    calledUrl = String(url);
    return new Response(JSON.stringify({ id: "111", post_id: "222_333" }), { status: 200 });
  }) as unknown as typeof fetch;
  const r = await publishFacebookPost({ pageId: "222", accessToken: "tok", message: "本文", imageUrl: "https://x/y.jpg", fetchImpl: fakeFetch });
  assert.match(calledUrl, /\/222\/photos$/);
  assert.equal(r.postId, "222_333");
}

// 画像なしなら /feed に投げ、id を返す。
{
  let calledUrl = "";
  const fakeFetch = (async (url: string) => {
    calledUrl = String(url);
    return new Response(JSON.stringify({ id: "222_444" }), { status: 200 });
  }) as unknown as typeof fetch;
  const r = await publishFacebookPost({ pageId: "222", accessToken: "tok", message: "本文", fetchImpl: fakeFetch });
  assert.match(calledUrl, /\/222\/feed$/);
  assert.equal(r.postId, "222_444");
}

// エラー応答は throw（投稿できてないのに成功扱いしない）。
{
  const errFetch = (async () => new Response(JSON.stringify({ error: { message: "bad" } }), { status: 400 })) as unknown as typeof fetch;
  await assert.rejects(() => publishFacebookPost({ pageId: "222", accessToken: "tok", message: "x", fetchImpl: errFetch }));
}

console.log("facebook api tests passed");
