import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { executeLineCommand } from "./commands.js";

async function testAppendCommandWritesDailyLog(): Promise<void> {
  const vault = await mkdtemp(path.join(tmpdir(), "openqlow-line-command-vault-"));
  process.env.OBSIDIAN_VAULT_ROOT = vault;

  const result = await executeLineCommand("/追記 今日は体験が1件。明日フォローする。", {
    now: new Date("2026-05-22T03:04:05.000Z"),
  });

  assert.equal(result.handled, true);
  assert.equal(result.ok, true);
  assert.equal(result.action, "append_obsidian");
  assert.match(result.message, /Obsidianに追記しました/);

  const log = await readFile(path.join(vault, "01_DAILY_OPERATIONS", "daily_logs", "2026-05-22.md"), "utf8");
  assert.match(log, /## LINE追記 2026-05-22T03:04:05\.000Z/);
  assert.match(log, /- source: LINE/);
  assert.match(log, /今日は体験が1件。明日フォローする。/);
}

async function testAppendCommandRequiresBody(): Promise<void> {
  const result = await executeLineCommand("/追記   ", {
    now: new Date("2026-05-22T03:04:05.000Z"),
  });

  assert.equal(result.handled, true);
  assert.equal(result.ok, false);
  assert.equal(result.action, "append_obsidian");
  assert.match(result.message, /追記する本文/);
}

async function testPushCommandSkipsWhenNoChanges(): Promise<void> {
  const calls: string[][] = [];
  const result = await executeLineCommand("/push", {
    runGit: async (args) => {
      calls.push(args);
      return "";
    },
    vaultRoot: "/tmp/vault",
  });

  assert.equal(result.handled, true);
  assert.equal(result.ok, true);
  assert.equal(result.action, "git_push");
  assert.match(result.message, /変更はありません/);
  assert.deepEqual(calls, [["-C", "/tmp/vault", "status", "--porcelain"]]);
}

async function testPushCommandCommitsAndPushesChanges(): Promise<void> {
  const calls: string[][] = [];
  const result = await executeLineCommand("/push", {
    runGit: async (args) => {
      calls.push(args);
      if (args.includes("status")) return " M DAILY-BRIEF.md\n";
      if (args.includes("commit")) return "[main abc123] chore: update vault from LINE\n";
      if (args.includes("push")) return "pushed\n";
      return "";
    },
    vaultRoot: "/tmp/vault",
  });

  assert.equal(result.handled, true);
  assert.equal(result.ok, true);
  assert.equal(result.action, "git_push");
  assert.match(result.message, /GitHubへpushしました/);
  assert.deepEqual(calls, [
    ["-C", "/tmp/vault", "status", "--porcelain"],
    ["-C", "/tmp/vault", "add", "-A"],
    ["-C", "/tmp/vault", "commit", "-m", "chore: update vault from LINE"],
    ["-C", "/tmp/vault", "push"],
  ]);
}

async function testNonCommandIsNotHandled(): Promise<void> {
  const result = await executeLineCommand("OK FG-20260522-001");

  assert.equal(result.handled, false);
}

await testAppendCommandWritesDailyLog();
await testAppendCommandRequiresBody();
await testPushCommandSkipsWhenNoChanges();
await testPushCommandCommitsAndPushesChanges();
await testNonCommandIsNotHandled();

console.log("line command tests passed");
