import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { acquireRunLock, runLockPath } from "./run_lock.js";

const DATE = "2026-08-09";
const NOW = "2026-08-09T00:00:00.000Z";

async function freshStateDir(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openqlow-run-lock-"));
  return path.join(root, "state");
}

// 1回目は取れる。ファイルの場所と中身も決まったとおり。
{
  const stateDir = await freshStateDir();
  const lock = await acquireRunLock(stateDir, "daily_check_sent", DATE, NOW);
  assert.equal(lock.acquired, true);
  assert.equal(lock.path, runLockPath(stateDir, "daily_check_sent", DATE));
  assert.equal(await fs.readFile(lock.path, "utf8"), NOW);
}

// 2回目は取れない。これが二重送信を止める本体。
{
  const stateDir = await freshStateDir();
  const first = await acquireRunLock(stateDir, "daily_check_sent", DATE, NOW);
  const second = await acquireRunLock(stateDir, "daily_check_sent", DATE, NOW);
  assert.equal(first.acquired, true);
  assert.equal(second.acquired, false);
}

// 同時に走っても、通るのは1つだけ。
// 「存在を見てから書く」方式だと両方通ってしまう場面。
{
  const stateDir = await freshStateDir();
  const locks = await Promise.all(
    Array.from({ length: 8 }, () => acquireRunLock(stateDir, "morning_briefing_sent", DATE, NOW)),
  );
  assert.equal(locks.filter(lock => lock.acquired).length, 1, "同時実行でも1つだけが取れる");
}

// release すれば、その日のうちにやり直せる（送信に失敗したときの経路）。
{
  const stateDir = await freshStateDir();
  const first = await acquireRunLock(stateDir, "daily_check_sent", DATE, NOW);
  await first.release();
  await assert.rejects(fs.stat(first.path), "release でファイルが消える");

  const retry = await acquireRunLock(stateDir, "daily_check_sent", DATE, NOW);
  assert.equal(retry.acquired, true, "release 後は取り直せる");
}

// 取れなかった側の release は、他の実行のロックを消さない。
{
  const stateDir = await freshStateDir();
  const holder = await acquireRunLock(stateDir, "daily_check_sent", DATE, NOW);
  const loser = await acquireRunLock(stateDir, "daily_check_sent", DATE, NOW);
  await loser.release();
  assert.equal((await fs.stat(holder.path)).isFile(), true, "他人のロックは消えない");
}

// 日付が変われば別のロック。翌日はまた送れる。
{
  const stateDir = await freshStateDir();
  await acquireRunLock(stateDir, "daily_check_sent", DATE, NOW);
  const nextDay = await acquireRunLock(stateDir, "daily_check_sent", "2026-08-10", NOW);
  assert.equal(nextDay.acquired, true);
}

// 用途（key）が違えば互いに邪魔しない。
{
  const stateDir = await freshStateDir();
  await acquireRunLock(stateDir, "daily_check_sent", DATE, NOW);
  const other = await acquireRunLock(stateDir, "morning_briefing_sent", DATE, NOW);
  assert.equal(other.acquired, true);
}

// release を2回呼んでも落ちない。
{
  const stateDir = await freshStateDir();
  const lock = await acquireRunLock(stateDir, "daily_check_sent", DATE, NOW);
  await lock.release();
  await lock.release();
}

console.log("run lock tests passed");
