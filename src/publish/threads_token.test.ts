import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  exchangeForLongLivedToken,
  getActiveThreadsToken,
  loadThreadsToken,
  needsRefresh,
  refreshLongLivedToken,
  saveThreadsToken,
} from "./threads_token.js";

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

async function testExchange(): Promise<void> {
  const { accessToken, expiresInSec } = await exchangeForLongLivedToken({
    shortLivedToken: "short",
    clientSecret: "secret",
    fetchImpl: fakeFetch({ access_token: "LONG", token_type: "bearer", expires_in: 5184000 }),
  });
  assert.equal(accessToken, "LONG");
  assert.equal(expiresInSec, 5184000);
}

async function testExchangeFails(): Promise<void> {
  await assert.rejects(() =>
    exchangeForLongLivedToken({
      shortLivedToken: "bad",
      clientSecret: "secret",
      fetchImpl: fakeFetch({ error: { message: "x" } }, 400),
    }),
  );
}

async function testRefresh(): Promise<void> {
  const { accessToken } = await refreshLongLivedToken({
    token: "LONG",
    fetchImpl: fakeFetch({ access_token: "LONG2", expires_in: 5184000 }),
  });
  assert.equal(accessToken, "LONG2");
}

async function testStoreAndActive(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "openqlow-thtoken-"));
  try {
    const now = new Date("2026-06-14T00:00:00.000Z");
    await saveThreadsToken(root, "LONG", 5184000, now);
    const stored = await loadThreadsToken(root);
    assert.equal(stored?.accessToken, "LONG");

    // 未失効なら保存済みを返す
    const active = await getActiveThreadsToken(root, { THREADS_ACCESS_TOKEN: "ENVTOKEN" }, now);
    assert.equal(active, "LONG");

    // 失効後は env にフォールバック
    const later = new Date(now.getTime() + 70 * 24 * 60 * 60 * 1000);
    const fallback = await getActiveThreadsToken(root, { THREADS_ACCESS_TOKEN: "ENVTOKEN" }, later);
    assert.equal(fallback, "ENVTOKEN");

    // 保存が無ければ env
    const empty = await mkdtemp(path.join(tmpdir(), "openqlow-thtoken2-"));
    assert.equal(await getActiveThreadsToken(empty, { THREADS_ACCESS_TOKEN: "ENVTOKEN" }, now), "ENVTOKEN");
    await rm(empty, { recursive: true, force: true });

    // needsRefresh
    assert.equal(needsRefresh(stored!, now), false);
    const near = new Date(Date.parse(stored!.expiresAt) - 2 * 24 * 60 * 60 * 1000);
    assert.equal(needsRefresh(stored!, near), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

await testExchange();
await testExchangeFails();
await testRefresh();
await testStoreAndActive();

console.log("threads token tests passed");
