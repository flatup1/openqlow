import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { acquireDailyLock } from "../shared/run_lock.js";

const tmp = await mkdtemp(path.join(os.tmpdir(), "openqlow-daily-run-lock-"));
process.env.OPENQLOW_ROOT = tmp;
process.env.OBSIDIAN_VAULT_ROOT = path.join(tmp, "vault");

const { runDaily } = await import("./daily.js");

const now = new Date("2026-06-26T00:00:00Z");

// 既に同日のロックが取得済みなら、生成・LINE push を一切せず即 [] を返す
const preAcquired = await acquireDailyLock("daily", "2026-06-26", path.join(tmp, "state"));
assert.equal(preAcquired, true, "事前ロック取得は成功する");

const records = await runDaily({ now });
assert.deepEqual(records, [], "ロック済みの同日2回目は空配列で早期return");

await rm(tmp, { recursive: true, force: true });

console.log("daily run lock tests passed");
