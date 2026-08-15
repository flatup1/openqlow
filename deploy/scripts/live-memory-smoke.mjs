import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { SessionStore } from "../../dist/conversation/session_store.js";
import { executeLineCommand } from "../../dist/line_bot/commands.js";
import { buildManagementBrief } from "../../dist/scheduler/management_brief.js";

const liveVault = process.argv[2];
if (!liveVault) throw new Error("Usage: node live-memory-smoke.mjs <obsidian-vault-root>");

const liveBrief = await buildManagementBrief(liveVault, "2026-08-13", new Date("2026-08-13T00:00:00Z"));
for (const heading of ["【前回】", "【現在】", "【今日】", "【正式決定】", "【保留・実装中】", "【今やらなくていいこと】"]) {
  assert(liveBrief.includes(heading), `missing management brief section: ${heading}`);
}

const vault = await mkdtemp(path.join(tmpdir(), "openqlow-live-smoke-"));
try {
  const common = {
    vaultRoot: vault,
    userId: "U_TEST_OWNER",
    primaryOwnerUserId: "U_TEST_OWNER",
    now: new Date("2026-08-13T00:00:00Z"),
    memorySessionStore: new SessionStore({ baseDir: path.join(vault, "sessions") }),
  };

  const memo = await executeLineCommand("検討: 本番スモークテスト 電話090-1234-5678", common);
  assert.equal(memo.action, "auto_memory");
  assert.equal(memo.ok, true);
  const log = await readFile(path.join(vault, "01_DAILY_OPERATIONS", "daily_logs", "2026-08-13.md"), "utf8");
  assert(!log.includes("090-1234-5678"));
  assert(log.includes("████"));

  const reservation = await executeLineCommand("予約 テスト T. 8/20", common);
  assert.equal(reservation.action, "trial_kpi");
  assert.equal(reservation.meta.summary.bookings, 1);

  const blocked = await executeLineCommand("入会 テスト T.", common);
  assert.equal(blocked.ok, false);
  await executeLineCommand("参加 テスト T.", common);
  const enrolled = await executeLineCommand("入会 テスト T.", common);
  assert.equal(enrolled.meta.summary.enrollmentRate, 1);
  const summary = await executeLineCommand("体験集計", common);
  assert.equal(summary.meta.summary.enrolled, 1);

  const outsider = await executeLineCommand("外部発言", { ...common, userId: "U_OTHER" });
  assert.equal(outsider.handled, false);
} finally {
  await rm(vault, { recursive: true, force: true });
}

console.log("OPENQLOW_COMPILED_LIVE_SMOKE_OK");
