import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { acquireDailyLock } from "./run_lock.js";

const tmp = await mkdtemp(path.join(os.tmpdir(), "openqlow-run-lock-"));

// 1. 初回は取得できる
{
  const acquired = await acquireDailyLock("daily", "2026-06-26", tmp);
  assert.equal(acquired, true);
}

// 2. 同じ name + date の2回目は取得できない（重複実行防止）
{
  const acquired = await acquireDailyLock("daily", "2026-06-26", tmp);
  assert.equal(acquired, false);
}

// 3. 別の日付なら取得できる
{
  const acquired = await acquireDailyLock("daily", "2026-06-27", tmp);
  assert.equal(acquired, true);
}

// 4. 別の name なら同じ日付でも取得できる（ジョブごとに独立）
{
  const acquired = await acquireDailyLock("morning_briefing", "2026-06-26", tmp);
  assert.equal(acquired, true);
}

await rm(tmp, { recursive: true, force: true });

console.log("run lock tests passed");
