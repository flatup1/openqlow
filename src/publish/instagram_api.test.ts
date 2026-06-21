import assert from "node:assert/strict";
import { publishInstagramImage } from "./instagram_api.js";

// 正常系: create → status(FINISHED) → publish の順で動く。
{
  const calls: Array<{ url: string; body: string }> = [];
  const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, body: String(init?.body ?? "") });
    if (u.includes("/media_publish")) return new Response(JSON.stringify({ id: "ig-post-1" }), { status: 200 });
    if (u.endsWith("/media")) return new Response(JSON.stringify({ id: "ig-creation-1" }), { status: 200 });
    // status check
    return new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 });
  }) as typeof fetch;

  const res = await publishInstagramImage({
    igUserId: "1789",
    accessToken: "token",
    imageUrl: "https://example.com/openqlow/media/a.jpg",
    caption: "FLATUP caption #FLATUPGYM",
    fetchImpl: fakeFetch,
    pollDelayMs: 0,
  });

  assert.equal(res.creationId, "ig-creation-1");
  assert.equal(res.postId, "ig-post-1");
  assert.equal(calls[0].url, "https://graph.facebook.com/v19.0/1789/media");
  assert.match(calls[0].body, /image_url=https%3A%2F%2Fexample.com%2Fopenqlow%2Fmedia%2Fa.jpg/);
  assert.match(calls[0].body, /caption=FLATUP\+caption/);
  assert.match(calls[1].url, /\/ig-creation-1\?fields=status_code/); // 準備待ちのポーリング
  assert.equal(calls[2].url, "https://graph.facebook.com/v19.0/1789/media_publish");
  assert.match(calls[2].body, /creation_id=ig-creation-1/);
}

// IN_PROGRESS が続いてから FINISHED になっても、待って公開できる。
{
  let checks = 0;
  const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/media_publish")) return new Response(JSON.stringify({ id: "ig-post-2" }), { status: 200 });
    if (u.endsWith("/media") && init?.method === "POST") return new Response(JSON.stringify({ id: "C2" }), { status: 200 });
    checks += 1;
    return new Response(JSON.stringify({ status_code: checks < 3 ? "IN_PROGRESS" : "FINISHED" }), { status: 200 });
  }) as typeof fetch;
  const res = await publishInstagramImage({
    igUserId: "1", accessToken: "t", imageUrl: "https://x/y.jpg", caption: "c",
    fetchImpl: fakeFetch, pollAttempts: 6, pollDelayMs: 0,
  });
  assert.equal(res.postId, "ig-post-2");
  assert.equal(checks, 3);
}

// 失敗時は throw（成功扱いしない）
{
  const failFetch = (async () => new Response(JSON.stringify({ error: "bad" }), { status: 400 })) as typeof fetch;
  await assert.rejects(() =>
    publishInstagramImage({ igUserId: "1", accessToken: "t", imageUrl: "https://x/y.jpg", caption: "c", fetchImpl: failFetch, pollDelayMs: 0 }),
  );
}

console.log("instagram api tests passed");
