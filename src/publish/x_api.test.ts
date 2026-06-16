import assert from "node:assert/strict";
import { buildOAuth1Header, publishXPost, rfc3986 } from "./x_api.js";

const creds = {
  apiKey: "ck",
  apiSecret: "cs",
  accessToken: "at",
  accessSecret: "as",
};

// rfc3986: 予約文字を確実にエンコードする
assert.equal(rfc3986("a b!*'()"), "a%20b%21%2A%27%28%29");

// 署名ヘッダ: 固定 nonce/timestamp で決定的な署名になる（回帰検出用）
const header = buildOAuth1Header(
  "POST",
  "https://api.twitter.com/2/tweets",
  creds,
  {},
  { nonce: "fixed-nonce", timestamp: "1700000000" },
);
assert.match(header, /^OAuth /);
assert.match(header, /oauth_consumer_key="ck"/);
assert.match(header, /oauth_signature="[^"]+"/);
assert.match(header, /oauth_nonce="fixed-nonce"/);
// 秘密鍵そのものはヘッダに出さない
assert.doesNotMatch(header, /cs|as/);

// テキスト投稿（メディアなし）
{
  const calls: Array<{ url: string; body: string }> = [];
  const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? "") });
    return new Response(JSON.stringify({ data: { id: "tweet-1" } }), { status: 200 });
  }) as typeof fetch;

  const res = await publishXPost({ creds, text: "hello", fetchImpl: fakeFetch });
  assert.equal(res.tweetId, "tweet-1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.twitter.com/2/tweets");
  assert.match(calls[0].body, /"text":"hello"/);
  assert.doesNotMatch(calls[0].body, /media/);
}

// 写真付き投稿: 先に media/upload → tweet に media_ids
{
  const calls: string[] = [];
  const fakeFetch = (async (url: string | URL) => {
    calls.push(String(url));
    if (String(url).includes("media/upload")) {
      return new Response(JSON.stringify({ media_id_string: "media-9" }), { status: 200 });
    }
    return new Response(JSON.stringify({ data: { id: "tweet-2" } }), { status: 200 });
  }) as typeof fetch;

  const res = await publishXPost({ creds, text: "with photo", mediaBytes: new Uint8Array([1, 2, 3]), fetchImpl: fakeFetch });
  assert.equal(res.tweetId, "tweet-2");
  assert.ok(calls.some((u) => u.includes("upload.twitter.com/1.1/media/upload.json")));
}

// 失敗時は throw（成功扱いしない）
{
  const fakeFetch = (async () => new Response("err", { status: 401 })) as typeof fetch;
  await assert.rejects(() => publishXPost({ creds, text: "x", fetchImpl: fakeFetch }));
}

console.log("x api tests passed");
