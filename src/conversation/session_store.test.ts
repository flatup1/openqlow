import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SessionStore } from "./session_store.js";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "openqlow-session-test-"));
}

const userId = "test-user-001";

// テスト 1: 新規セッション開始 → load で取得できる
{
  const baseDir = await makeTempDir();
  const store = new SessionStore({ baseDir });
  const session = await store.start(userId, "/昨日の記録");
  assert.equal(session.userId, userId);
  assert.equal(session.command, "/昨日の記録");
  assert.equal(session.step, "awaiting_yes_no");

  const loaded = await store.load(userId);
  assert.ok(loaded);
  assert.equal(loaded?.userId, userId);
}

// テスト 2: TTL を超えたら自動破棄
{
  const baseDir = await makeTempDir();
  let nowMs = Date.UTC(2026, 4, 21, 0, 0, 0);
  const store = new SessionStore({
    baseDir,
    ttlMs: 1000, // 1 秒
    now: () => new Date(nowMs),
  });
  await store.start(userId, "/昨日の記録");
  assert.ok(await store.load(userId));

  // 2 秒進める
  nowMs += 2000;
  const loaded = await store.load(userId);
  assert.equal(loaded, undefined, "TTL 超過セッションは undefined を返す");
}

// テスト 3: 新規 start で既存セッションを破棄
{
  const baseDir = await makeTempDir();
  const store = new SessionStore({ baseDir });
  const first = await store.start(userId, "/昨日の記録");
  first.genres.push({ type: "trial", data: { name: "山田 T." }, answers: [] });
  await store.save(first);

  // 新規 start
  const second = await store.start(userId, "/昨日の記録");
  assert.equal(second.genres.length, 0, "新規 start で genres がリセットされる");
}

// テスト 4: 別ユーザーのセッションは独立
{
  const baseDir = await makeTempDir();
  const store = new SessionStore({ baseDir });
  await store.start("test-user-A", "/昨日の記録");
  await store.start("test-user-B", "/昨日の記録");

  assert.ok(await store.load("test-user-A"));
  assert.ok(await store.load("test-user-B"));

  await store.destroy("test-user-A");
  assert.equal(await store.load("test-user-A"), undefined);
  assert.ok(await store.load("test-user-B"), "B は独立して残る");
}

// テスト 5: ENOENT 安全
{
  const baseDir = await makeTempDir();
  const store = new SessionStore({ baseDir });
  assert.equal(await store.load("not-exists"), undefined);
  await store.destroy("not-exists"); // 例外にならない
}

// テスト 6: 保存と読み込みの往復で genre 情報が保持される
{
  const baseDir = await makeTempDir();
  const store = new SessionStore({ baseDir });
  const session = await store.start(userId, "/昨日の記録");
  session.genres.push({
    type: "trial",
    data: { name: "山田 T.", gender: "女性" },
    answers: [
      { key: "name", question: "名前は？", answer: "山田 太郎" },
      { key: "gender", question: "性別は？", answer: "女性" },
    ],
  });
  session.step = "awaiting_more_genre";
  await store.save(session);

  const loaded = await store.load(userId);
  assert.ok(loaded);
  assert.equal(loaded?.genres.length, 1);
  assert.equal(loaded?.genres[0].data.name, "山田 T.");
  assert.equal(loaded?.step, "awaiting_more_genre");
}

console.log("session store tests passed");
