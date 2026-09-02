import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadCleanupConfig, type CleanupConfig } from "./config.js";
import {
  buildCleanupPlan,
  collectPurgeCandidates,
  isManagedPath,
  listEntries,
  purgeAgeDays,
  quarantineDateFromPath,
} from "./plan.js";

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
//
// 一時ファイルの ctime は作った瞬間になるため、時計を進めた側から見る。
// 40日後の目で見れば「40日置かれている」ことになり、日付フォルダと突き合わせられる。
{
  const home = await freshHome();
  const config = configFor(home);
  const laterMs = Date.now() + 40 * DAY;
  const folderFor = (daysBefore: number) =>
    new Date(laterMs - daysBefore * DAY).toISOString().slice(0, 10);

  const oldFolder = folderFor(60); // 60日前に入れたことにする
  const recentFolder = folderFor(20); // 20日前に入れたことにする
  await makeFile(path.join(config.quarantineRoot, oldFolder, "古い.tmp"), "x", 0);
  await makeFile(path.join(config.quarantineRoot, recentFolder, "最近.tmp"), "x", 0);

  const off = await buildCleanupPlan({ config, dateJst: "2026-09-01", nowMs: laterMs });
  assert.deepEqual(off.purges, [], "既定では完全削除の候補すら作らない");

  const on = await buildCleanupPlan({
    config: { ...config, purgeEnabled: true },
    dateJst: "2026-09-01",
    nowMs: laterMs,
  });
  assert.deepEqual(
    on.purges.map(purge => path.basename(purge.path)),
    ["古い.tmp"],
    "保管日数を過ぎたものだけ。20日しか経っていないものは残る",
  );
  assert.equal(on.purges[0].source, "quarantine");
  assert.ok(on.purges[0].ageDays >= 30);
}

// Macのゴミ箱は、明示して許可したときだけ対象になる。
{
  const home = await freshHome();
  const trashRoot = path.join(home, ".Trash");
  // ゴミ箱には日付フォルダが無いので、捨てた時刻（ctime）だけで判断する。
  await makeFile(path.join(trashRoot, "古い動画.mp4"), "x", 0);
  const laterMs = Date.now() + 45 * DAY;
  const soonMs = Date.now() + 1 * DAY;

  assert.deepEqual(
    (await collectPurgeCandidates(trashRoot, "trash", 30, laterMs)).map(item => path.basename(item.path)),
    ["古い動画.mp4"],
    "捨ててから45日たてば対象になる",
  );
  assert.deepEqual(
    await collectPurgeCandidates(trashRoot, "trash", 30, soonMs),
    [],
    "捨てた翌日は対象にしない",
  );

  const config = configFor(home, { trashRoots: [trashRoot] });
  const off = await buildCleanupPlan({ config, dateJst: "2026-09-01", nowMs: laterMs });
  assert.deepEqual(off.purges, [], "許可がなければゴミ箱には触らない");

  const on = await buildCleanupPlan({
    config: { ...config, emptyTrashEnabled: true },
    dateJst: "2026-09-01",
    nowMs: laterMs,
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

// 日付フォルダの読み取り。ゴミ箱待ちの外や別形式は undefined。
{
  const root = "/Users/test/Desktop/99_ゴミ箱待ち";
  assert.equal(quarantineDateFromPath(root, `${root}/2026-07-01/古い.tmp`), "2026-07-01");
  assert.equal(quarantineDateFromPath(root, `${root}/2026-07-01/中/深い.tmp`), "2026-07-01");
  assert.equal(quarantineDateFromPath(root, `${root}/その他/x.tmp`), undefined);
  assert.equal(quarantineDateFromPath(root, "/Users/test/Desktop/大事な資料.pdf"), undefined);
}

// ここが一番大事な修正点。
// 「90日前に作った書類」を今日ゴミ箱待ちへ入れても、その日は0日目として数える。
// 更新日時をそのまま使っていた頃は、入れた瞬間に削除対象になっていた。
{
  const root = "/Users/test/Desktop/99_ゴミ箱待ち";
  const today = "2026-09-01";
  const ctimeToday = NOW - 60 * 1000; // さっき移動した

  assert.equal(
    purgeAgeDays(root, `${root}/${today}/古い書類.pdf`, { ctimeMs: ctimeToday }, NOW),
    0,
    "今日入れたばかりのものは0日",
  );

  // 30日前に入れたもの（日付フォルダも ctime も30日前）は30日。
  const thirty = NOW - 30 * DAY;
  assert.equal(
    purgeAgeDays(root, `${root}/2026-08-02/前に入れた.tmp`, { ctimeMs: thirty }, NOW),
    30,
  );

  // 日付フォルダが古くても、ファイル自体が新しければ短いほうを採る。
  // バックアップから戻したゴミ箱待ちを、戻した直後に消してしまわないため。
  assert.equal(
    purgeAgeDays(root, `${root}/2026-01-01/戻したばかり.tmp`, { ctimeMs: ctimeToday }, NOW),
    0,
    "迷ったら消さない側に倒す",
  );

  // 日付フォルダが読めないときは ctime だけで判断する。
  assert.equal(
    purgeAgeDays(root, `${root}/その他/x.tmp`, { ctimeMs: NOW - 45 * DAY }, NOW),
    45,
  );
}

// 実ファイルで確認する。移動したてのファイルは、中身が何年前のものでも消さない。
{
  const home = await freshHome();
  const config = configFor(home, { purgeEnabled: true });
  const desktop = path.join(home, "Desktop");

  // 90日前に作った書類をデスクトップに置き、ゴミ箱待ちへ「今日」移す。
  const source = path.join(desktop, "大事だった資料.pdf");
  await makeFile(source, "pdf", 90);
  const moved = path.join(config.quarantineRoot, "2026-09-01", "大事だった資料.pdf");
  await fs.mkdir(path.dirname(moved), { recursive: true });
  await fs.rename(source, moved);

  const plan = await buildCleanupPlan({ config, dateJst: "2026-09-01", nowMs: Date.now() });
  assert.deepEqual(plan.purges, [], "今日ゴミ箱待ちへ入れたファイルは、その日には消えない");
}

console.log("cleanup plan tests passed");
