import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { pushLineMessage } from "../line_bot/notifier.js";
import { loadCleanupConfig, type CleanupConfig } from "./config.js";
import { filterSafeTargets, isCleanupCliEntry, runCleanup } from "./run.js";

const NOW = new Date("2026-09-01T07:00:00+09:00");
const DAY = 24 * 60 * 60 * 1000;

interface Sent {
  text: string;
}

function stubPush(mode: "sent" | "dry_run" | "skipped" = "sent"): { push: typeof pushLineMessage; sent: Sent[] } {
  const sent: Sent[] = [];
  const push: typeof pushLineMessage = async text => {
    sent.push({ text });
    return { ok: true, mode };
  };
  return { push, sent };
}

async function freshHome(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "openqlow-cleanup-run-"));
}

async function makeFile(file: string, content: string, ageDays = 0): Promise<string> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, "utf8");
  const when = new Date(NOW.getTime() - ageDays * DAY);
  await fs.utimes(file, when, when);
  return file;
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.lstat(file);
    return true;
  } catch {
    return false;
  }
}

function configFor(home: string, overrides: Partial<CleanupConfig> = {}): CleanupConfig {
  return {
    ...loadCleanupConfig({ OPENQLOW_CLEANUP_TARGETS: path.join(home, "Desktop") }, home),
    ...overrides,
  };
}

// 停止スイッチ。何もせず、通知もしない。
{
  const home = await freshHome();
  const { push, sent } = stubPush();
  const result = await runCleanup({
    config: configFor(home, { disabled: true }),
    now: NOW,
    pushFn: push,
    stateDir: path.join(home, "state"),
    logDir: path.join(home, "logs"),
  });
  assert.equal(result.mode, "disabled");
  assert.equal(sent.length, 0);
}

// 対象が全部危ない場所なら、何もしないで止まる。
{
  const home = await freshHome();
  const { push, sent } = stubPush();
  const result = await runCleanup({
    config: configFor(home, { targets: ["/", path.join(home, ".ssh")] }),
    now: NOW,
    pushFn: push,
    stateDir: path.join(home, "state"),
    logDir: path.join(home, "logs"),
    home,
  });
  assert.equal(result.mode, "no_target");
  assert.equal(result.ok, false);
  assert.equal(sent.length, 0);
}

// 危ない場所が混ざっていても、安全な場所だけ片づける。
{
  assert.deepEqual(
    filterSafeTargets(["/Users/test/Desktop", "/", "/Users/test/.ssh"], "/Users/test").safe,
    ["/Users/test/Desktop"],
  );
  assert.equal(filterSafeTargets(["/", "/System"], "/Users/test").rejected.length, 2);
}

// 既定はお試し実行。通知は届くが、ファイルは1件も動かない。
{
  const home = await freshHome();
  const desktop = path.join(home, "Desktop");
  const photo = await makeFile(path.join(desktop, "写真.png"), "png", 10);
  const junk = await makeFile(path.join(desktop, ".DS_Store"), "junk", 10);
  await makeFile(path.join(desktop, "作業中.md"), "md", 0);

  const { push, sent } = stubPush();
  const result = await runCleanup({
    config: configFor(home),
    now: NOW,
    pushFn: push,
    stateDir: path.join(home, "state"),
    logDir: path.join(home, "logs"),
    home,
  });

  assert.equal(result.mode, "dry_run");
  assert.equal(result.ok, true);
  assert.equal(await exists(photo), true, "お試し実行ではファイルは動かない");
  assert.equal(await exists(junk), true);
  assert.equal(result.summary?.organizedCount, 1);
  assert.equal(result.summary?.trashedCount, 1);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /お試し実行です/);

  // ログが残る。あとから追える。
  const log = await fs.readFile(path.join(home, "logs", "2026-09-01.md"), "utf8");
  assert.match(log, /お試し実行/);
  assert.match(log, /写真\.png/);
}

// 本番実行。整頓・ゴミ箱待ち・外付け保存・完全削除が1回で終わる。
{
  const home = await freshHome();
  const desktop = path.join(home, "Desktop");
  const backupRoot = path.join(home, "Volumes", "FLATUP_BACKUP");
  await fs.mkdir(backupRoot, { recursive: true });

  await makeFile(path.join(desktop, "写真.png"), "png", 10);
  await makeFile(path.join(desktop, "資料.pdf"), "pdf", 5);
  await makeFile(path.join(desktop, ".DS_Store"), "junk", 10);
  await makeFile(path.join(desktop, "作業中.md"), "md", 0);

  const config = configFor(home, { apply: true, purgeEnabled: true, backupRoot });
  const expired = await makeFile(path.join(config.quarantineRoot, "2026-06-01", "古い.tmp"), "x", 90);
  const keptInQuarantine = await makeFile(path.join(config.quarantineRoot, "2026-08-30", "最近.tmp"), "x", 2);

  const { push, sent } = stubPush();
  const result = await runCleanup({
    config,
    now: NOW,
    pushFn: push,
    stateDir: path.join(home, "state"),
    logDir: path.join(home, "logs"),
    home,
  });

  assert.equal(result.mode, "applied");
  assert.equal(result.ok, true, result.reason);

  // デスクトップは、作業中のファイルだけが残る。
  const remaining = (await fs.readdir(desktop)).sort();
  assert.deepEqual(remaining, ["00_整理済み", "99_ゴミ箱待ち", "作業中.md"].sort());

  assert.equal(await exists(path.join(config.organizedRoot, "2026", "08", "画像", "写真.png")), true);
  assert.equal(await exists(path.join(config.organizedRoot, "2026", "08", "書類", "資料.pdf")), true);
  assert.equal(await exists(path.join(config.quarantineRoot, "2026-09-01", ".DS_Store")), true);

  // 保管日数を過ぎたものだけ消える。最近入れたものは残る。
  assert.equal(await exists(expired), false);
  assert.equal(await exists(keptInQuarantine), true);

  // 外付けにはコピーが増える。手元からは消えない。
  assert.equal(await exists(path.join(backupRoot, "FLATUP_CLEAN", "2026", "08", "画像", "写真.png")), true);
  assert.equal(await exists(path.join(config.organizedRoot, "2026", "08", "画像", "写真.png")), true);

  assert.equal(sent.length, 1);
  assert.doesNotMatch(sent[0].text, /お試し実行/);
  assert.match(sent[0].text, /整頓 2件 \/ ゴミ箱待ちへ 1件/);
  assert.match(sent[0].text, /完全削除 1件/);
}

// 同じ日に2回走っても、LINEは1通だけ。timer の二重発火で朝から2通は届かない。
{
  const home = await freshHome();
  await makeFile(path.join(home, "Desktop", "写真.png"), "png", 10);
  const shared = {
    config: configFor(home),
    now: NOW,
    stateDir: path.join(home, "state"),
    logDir: path.join(home, "logs"),
    home,
  };

  const { push, sent } = stubPush("sent");
  const first = await runCleanup({ ...shared, pushFn: push });
  const second = await runCleanup({ ...shared, pushFn: push });

  assert.equal(first.notified, "sent");
  assert.equal(second.notified, "duplicate_today");
  assert.equal(sent.length, 1);
  assert.ok(second.message, "送らなくても本文は返る（ログと確認用）");
}

// 届かなかった日はロックを外す。あとでやり直せる。
{
  const home = await freshHome();
  await makeFile(path.join(home, "Desktop", "写真.png"), "png", 10);
  const shared = {
    config: configFor(home),
    now: NOW,
    stateDir: path.join(home, "state"),
    logDir: path.join(home, "logs"),
    home,
  };

  const skipped = stubPush("skipped");
  const first = await runCleanup({ ...shared, pushFn: skipped.push });
  assert.equal(first.notified, "skipped");

  const retry = stubPush("sent");
  const second = await runCleanup({ ...shared, pushFn: retry.push });
  assert.equal(second.notified, "sent", "送れなかった日はやり直せる");
}

// CLI エントリ判定。他のファイルから読み込んだだけでは走らない。
{
  assert.equal(isCleanupCliEntry("file:///app/src/cleanup/run.ts", "/app/src/cleanup/run.ts"), true);
  assert.equal(isCleanupCliEntry("file:///app/dist/cleanup/run.js", "/app/dist/cleanup/run.js"), true);
  assert.equal(isCleanupCliEntry("file:///app/src/cleanup/run.ts", undefined), false);
  assert.equal(isCleanupCliEntry("file:///app/src/cleanup/run.ts", "/app/src/index.ts"), false);
}

console.log("cleanup run tests passed");
