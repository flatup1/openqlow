import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DraftRecord } from "../types.js";
import { publishExtraPlatforms } from "./extra_publish.js";

function record(mediaFiles?: string[]): DraftRecord {
  const now = "2026-06-16T00:00:00.000Z";
  return {
    id: "FG-20260616-001",
    idea: { id: "FG-20260616-001", date: "2026-06-16", theme: "t", angle: "a", audience: "beginners", source: "rotation", valueConnection: "v" },
    drafts: [{ id: "d", ideaId: "FG-20260616-001", approvalId: "FG-20260616-001", platform: "threads", publicationLevel: "level_2_draft", body: "本文です", hashtags: ["FLATUPGYM"], cta: "", safetyNotes: [], createdAt: now }],
    status: "saved",
    approvalMessage: "m",
    createdAt: now,
    updatedAt: now,
    ...(mediaFiles ? { mediaFiles } : {}),
  };
}

const X_ENV = { X_API_KEY: "k", X_API_SECRET: "s", X_ACCESS_TOKEN: "at", X_ACCESS_SECRET: "as" };

// キー未設定 → 何もしない
{
  const r = await publishExtraPlatforms({ record: record(), env: {} });
  assert.equal(r.published.length, 0);
  assert.equal(r.skipped.length, 0);
}

// X: テキスト投稿成功
{
  const fetchImpl = (async (url: string | URL) => {
    if (String(url).includes("/2/tweets")) return new Response(JSON.stringify({ data: { id: "tw1" } }), { status: 200 });
    return new Response(JSON.stringify({ media_id_string: "m" }), { status: 200 });
  }) as typeof fetch;
  const r = await publishExtraPlatforms({ record: record(), env: { ...X_ENV }, fetchImpl });
  assert.deepEqual(r.published, [{ platform: "x", externalId: "tw1" }]);
}

// X: 失敗は skipped（成功扱いしない）
{
  const fetchImpl = (async () => new Response("err", { status: 401 })) as typeof fetch;
  const r = await publishExtraPlatforms({ record: record(), env: { ...X_ENV }, fetchImpl });
  assert.equal(r.published.length, 0);
  assert.equal(r.skipped[0].platform, "x");
}

// Instagram: 写真なし → skipped（写真必須）
{
  const r = await publishExtraPlatforms({ record: record(), env: { IG_USER_ID: "ig", IG_ACCESS_TOKEN: "t" } });
  assert.equal(r.skipped[0].platform, "instagram");
  assert.match(r.skipped[0].reason, /写真/);
}

// Instagram: 写真あり＋公開URL → 投稿成功
{
  const root = await mkdtemp(path.join(tmpdir(), "openqlow-extra-"));
  try {
    const img = path.join(root, "a.jpg");
    await writeFile(img, "x");
    const fetchImpl = (async (url: string | URL) => {
      if (String(url).includes("/media_publish")) return new Response(JSON.stringify({ id: "ig-post" }), { status: 200 });
      return new Response(JSON.stringify({ id: "ig-creation" }), { status: 200 });
    }) as typeof fetch;
    const r = await publishExtraPlatforms({
      record: record([img]),
      env: { IG_USER_ID: "ig", IG_ACCESS_TOKEN: "t", OPENQLOW_PUBLIC_MEDIA_DIR: root, OPENQLOW_PUBLIC_MEDIA_BASE_URL: "https://x.example/openqlow/media/" },
      fetchImpl,
    });
    assert.deepEqual(r.published, [{ platform: "instagram", externalId: "ig-post" }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

console.log("extra publish tests passed");
