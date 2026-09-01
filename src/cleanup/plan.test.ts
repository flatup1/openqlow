import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadCleanupConfig, type CleanupConfig } from "./config.js";
import { buildCleanupPlan, collectPurgeCandidates, isManagedPath, listEntries } from "./plan.js";

const NOW = Date.parse("2026-09-01T07:00:00+09:00");
const DAY = 24 * 60 * 60 * 1000;

async function makeFile(file: string, content: string, ageDays: number): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, "utf8");
  const when = new Date(NOW - ageDays * DAY);
  await fs.utimes(file, when, when);
}

async function freshHome(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "openqlow-cleanup-plan-"));
}

function configFor(home: string, overrides: Partial<CleanupConfig> = {}): CleanupConfig {
  return {
    ...loadCleanupConfig({ OPENQLOW_CLEANUP_TARGETS: path.join(home, "Desktop") }, home),
    ...overrides,
  };
}

// 1階層だけ読む。フォルダの中までは追いかけない。
{
  const home = await freshHome();
  await makeFile(path.join(home, "Desktop", "a.pdf"), "a", 5);
  await makeFile(path.join(home, "Desktop", "素材", "深い.png"), "b", 5);

  const entries = await listEntries(path.join(home, "Desktop"));
  assert.deepEqual(entries.map(entry => entry.name), ["a.pdf", "素材"]);
  assert.equal(entries.find(entry => entry.name === "素材")?.isDirectory, true);
}

// 自分が作った管理フォルダは対象にしない（整頓済みをもう一度整頓しない）。
{
  const home = await freshHome();
  const config = configFor(home);
  assert.equal(isManagedPath(path.join(config.organizedRoot, "2026", "09"), config), true);
  assert.equal(isManagedPath(path.join(config.quarantineRoot, "2026-09-01"), config), true);
  assert.equal(isManagedPath(path.join(home, "Desktop", "写真.png"), config), false);
}

// 基本の計画。整頓・ゴミ箱待ち・触らないの3つに分かれる。
{
  const home = await freshHome();
  const desktop = path.join(home, "Desktop");
  await makeFile(path.join(desktop, "大事な資料.pdf"), "pdf", 5);
  await makeFile(path.join(desktop, "写真.png"), "png", 10);
  await makeFile(path.join(desktop, "作業中.md"), "md", 0);
  await makeFile(path.join(desktop, ".DS_Store"), "junk", 0);
  await makeFile(path.join(desktop, "00_整理済み", "2026", "07", "画像", "前の.png"), "old", 40);

  const config = configFor(home);
  const plan = await buildCleanupPlan({ config, dateJst: "2026-09-01", nowMs: NOW });

  const organize = plan.moves.filter(move => move.kind === "organize");
  const trash = plan.moves.filter(move => move.kind === "trash");

  assert.deepEqual(
    organize.map(move => path.basename(move.from)).sort(),
    ["大事な資料.pdf", "写真.png"].sort(),
  );
  assert.deepEqual(trash.map(move => path.basename(move.from)), [".DS_Store"]);
  assert.equal(plan.keptCount, 2, "作業中のファイルと管理フォルダは触らない");

  const photo = organize.find(move => move.from.endsWith("写真.png"));
  assert.equal(photo?.to, path.join(config.organizedRoot, "2026", "08", "画像", "写真.png"));
  const junk = trash[0];
  assert.equal(junk.to, path.join(config.quarantineRoot, "2026-09-01", ".DS_Store"));

  // 計画を作っただけでは、まだ1件も動いていない。
  assert.equal((await fs.readdir(desktop)).includes("写真.png"), true);
}

// 完全削除の候補は、許可があるときだけ集める。
{
  const home = await freshHome();
  const config = configFor(home);
  await makeFile(path.join(config.quarantineRoot, "2026-07-01", "古い.tmp"), "x", 60);
  await makeFile(path.join(config.quarantineRoot, "2026-08-30", "最近.tmp"), "x", 2);

  const off = await buildCleanupPlan({ config, dateJst: "2026-09-01", nowMs: NOW });
  assert.deepEqual(off.purges, [], "既定では完全削除の候補すら作らない");

  const on = await buildCleanupPlan({
    config: { ...config, purgeEnabled: true },
    dateJst: "2026-09-01",
    nowMs: NOW,
  });
  assert.deepEqual(on.purges.map(purge => path.basename(purge.path)), ["古い.tmp"]);
  assert.equal(on.purges[0].source, "quarantine");
  assert.equal(on.purges[0].ageDays, 60);
}

// Macのゴミ箱は、明示して許可したときだけ対象になる。
{
  const home = await freshHome();
  const trashRoot = path.join(home, ".Trash");
  await makeFile(path.join(trashRoot, "古い動画.mp4"), "x", 45);
  await makeFile(path.join(trashRoot, "昨日捨てた.pdf"), "x", 1);

  const candidates = await collectPurgeCandidates(trashRoot, "trash", 30, NOW);
  assert.deepEqual(candidates.map(item => path.basename(item.path)), ["古い動画.mp4"]);

  const config = configFor(home, { trashRoots: [trashRoot] });
  const off = await buildCleanupPlan({ config, dateJst: "2026-09-01", nowMs: NOW });
  assert.deepEqual(off.purges, []);

  const on = await buildCleanupPlan({
    config: { ...config, emptyTrashEnabled: true },
    dateJst: "2026-09-01",
    nowMs: NOW,
  });
  assert.deepEqual(on.purges.map(item => item.source), ["trash"]);
}

// 対象フォルダが無いときは、止まらずに記録だけ残す。
{
  const home = await freshHome();
  const config = configFor(home, { targets: [path.join(home, "存在しない")] });
  const plan = await buildCleanupPlan({ config, dateJst: "2026-09-01", nowMs: NOW });
  assert.equal(plan.moves.length, 0);
  assert.equal(plan.errors.length, 1);
}

console.log("cleanup plan tests passed");
