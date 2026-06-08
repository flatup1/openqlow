import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { saveRecord } from "../state/file_store.js";
import type { DraftRecord } from "../types.js";
import { executeLineCommand } from "./commands.js";

function pendingRecord(id: string): DraftRecord {
  return {
    id,
    idea: {
      id,
      date: "2026-06-08",
      theme: "LINEコマンド",
      angle: "承認待ち編集",
      audience: "local_narita",
      source: "obsidian_inbox",
      valueConnection: "投稿前に本文と画像を確認する。",
    },
    drafts: [{
      id: `${id}_threads`,
      ideaId: id,
      approvalId: id,
      platform: "threads",
      publicationLevel: "level_2_draft",
      body: "古い本文です。",
      hashtags: ["FLATUPGYM"],
      cta: "",
      safetyNotes: [],
      createdAt: "2026-06-08T00:00:00.000Z",
    }],
    status: "pending_approval",
    approvalMessage: "候補",
    createdAt: "2026-06-08T00:00:00.000Z",
    updatedAt: "2026-06-08T00:00:00.000Z",
  };
}

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
      if (args.includes("rev-list")) return "0\t0\n";
      return "";
    },
    vaultRoot: "/tmp/vault",
  });

  assert.equal(result.handled, true);
  assert.equal(result.ok, true);
  assert.equal(result.action, "git_push");
  assert.match(result.message, /変更はありません/);
  assert.deepEqual(calls, [
    ["-C", "/tmp/vault", "status", "--porcelain"],
    ["-C", "/tmp/vault", "rev-list", "--left-right", "--count", "@{u}...HEAD"],
  ]);
}

async function testPushCommandPushesCleanAheadCommit(): Promise<void> {
  const calls: string[][] = [];
  const result = await executeLineCommand("/push", {
    runGit: async (args) => {
      calls.push(args);
      if (args.includes("rev-list")) return "0\t1\n";
      if (args.includes("push")) return "pushed\n";
      return "";
    },
    vaultRoot: "/tmp/vault",
  });

  assert.equal(result.handled, true);
  assert.equal(result.ok, true);
  assert.equal(result.action, "git_push");
  assert.match(result.message, /未pushのコミット1件/);
  assert.deepEqual(calls, [
    ["-C", "/tmp/vault", "status", "--porcelain"],
    ["-C", "/tmp/vault", "rev-list", "--left-right", "--count", "@{u}...HEAD"],
    ["-C", "/tmp/vault", "push"],
  ]);
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

async function testHelpCommandShowsJuniorHighModeReply(): Promise<void> {
  const result = await executeLineCommand("ヘルプ");

  assert.equal(result.handled, true);
  assert.equal(result.ok, true);
  assert.equal(result.action, "help");
  assert.match(result.message, /今できる返信/);
  assert.match(result.message, /ok/);
  assert.match(result.message, /修正 文/);
  assert.match(result.message, /画像 1/);
  assert.match(result.message, /やめる/);
  assert.doesNotMatch(result.message, /FG-\d{8}-\d{3}/);
}

async function testRevisionCommandUpdatesPendingDraft(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "openqlow-line-revision-root-"));
  process.env.OPENQLOW_ROOT = root;
  await saveRecord(root, pendingRecord("FG-20260608-301"));

  const result = await executeLineCommand("修正 初心者でも安心して始められる練習です。", {
    now: new Date("2026-06-08T01:00:00.000Z"),
  });

  assert.equal(result.handled, true);
  assert.equal(result.ok, true);
  assert.equal(result.action, "revision");
  assert.match(result.message, /再確認/);

  const saved = JSON.parse(await readFile(path.join(root, "state", "FG-20260608-301.json"), "utf8"));
  assert.equal(saved.status, "pending_approval");
  assert.equal(saved.drafts[0].body, "初心者でも安心して始められる練習です。");
  assert.equal(saved.revisionHistory[0].oldDrafts[0].body, "古い本文です。");
}

async function testInsertCommandAttachesWhitelistedMedia(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "openqlow-line-insert-root-"));
  const mediaDir = await mkdtemp(path.join(tmpdir(), "openqlow-line-insert-media-"));
  process.env.OPENQLOW_ROOT = root;
  process.env.OPENQLOW_MEDIA_DIR = mediaDir;
  await saveRecord(root, pendingRecord("FG-20260608-302"));
  await mkdir(mediaDir, { recursive: true });
  await writeFile(path.join(mediaDir, "candidate.jpg"), "fake", "utf8");
  await writeFile(path.join(mediaDir, "ignore.txt"), "fake", "utf8");

  const list = await executeLineCommand("挿入");
  assert.equal(list.handled, true);
  assert.equal(list.action, "media_insert");
  assert.match(list.message, /1\. candidate\.jpg/);
  assert.doesNotMatch(list.message, /ignore\.txt/);

  const selected = await executeLineCommand("挿入 1");
  assert.equal(selected.handled, true);
  assert.equal(selected.ok, true);
  assert.equal(selected.action, "media_insert");
  assert.match(selected.message, /目視確認/);

  const saved = JSON.parse(await readFile(path.join(root, "state", "FG-20260608-302.json"), "utf8"));
  assert.deepEqual(saved.mediaFiles, [path.join(mediaDir, "candidate.jpg")]);
}

async function testImageChoiceCommandSelectsAndClearsMedia(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "openqlow-line-image-root-"));
  const mediaDir = await mkdtemp(path.join(tmpdir(), "openqlow-line-image-media-"));
  process.env.OPENQLOW_ROOT = root;
  process.env.OPENQLOW_MEDIA_DIR = mediaDir;
  await saveRecord(root, pendingRecord("FG-20260608-303"));
  await writeFile(path.join(mediaDir, "choice.png"), "fake", "utf8");

  const selected = await executeLineCommand("画像 1");
  assert.equal(selected.handled, true);
  assert.equal(selected.ok, true);
  assert.equal(selected.action, "image_choice");
  assert.match(selected.message, /目視確認/);

  const withMedia = JSON.parse(await readFile(path.join(root, "state", "FG-20260608-303.json"), "utf8"));
  assert.deepEqual(withMedia.mediaFiles, [path.join(mediaDir, "choice.png")]);

  const none = await executeLineCommand("画像なし");
  assert.equal(none.handled, true);
  assert.equal(none.ok, true);
  assert.equal(none.action, "image_choice");
  assert.match(none.message, /画像なし/);

  const cleared = JSON.parse(await readFile(path.join(root, "state", "FG-20260608-303.json"), "utf8"));
  assert.deepEqual(cleared.mediaFiles, []);
}

async function testMediaPostCommandCreatesApprovalCandidate(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "openqlow-line-media-root-"));
  process.env.OPENQLOW_ROOT = root;

  const result = await executeLineCommand([
    "/投稿",
    "本文: 弱い自分と向き合う練習。 #FLATUPGYM #成田",
    "ファイル: /tmp/post.mp4",
    "投稿先: threads,line",
  ].join("\n"), {
    now: new Date("2026-06-03T07:00:00.000Z"),
  });

  assert.equal(result.handled, true);
  assert.equal(result.ok, true);
  assert.equal(result.action, "media_post_candidate");
  assert.match(result.message, /投稿候補を作りました/);
  assert.match(result.message, /FG-20260603-701/);

  const saved = JSON.parse(await readFile(path.join(root, "state", "FG-20260603-701.json"), "utf8"));
  assert.equal(saved.status, "pending_approval");
  assert.deepEqual(saved.mediaFiles, ["/tmp/post.mp4"]);
}

await testAppendCommandWritesDailyLog();
await testAppendCommandRequiresBody();
await testPushCommandSkipsWhenNoChanges();
await testPushCommandPushesCleanAheadCommit();
await testPushCommandCommitsAndPushesChanges();
await testNonCommandIsNotHandled();
await testHelpCommandShowsJuniorHighModeReply();
await testRevisionCommandUpdatesPendingDraft();
await testInsertCommandAttachesWhitelistedMedia();
await testImageChoiceCommandSelectsAndClearsMedia();
await testMediaPostCommandCreatesApprovalCandidate();

console.log("line command tests passed");
