import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { applyCleanupPlan, applyMove, applyPurge, backupOrganized, uniqueDestination } from "./apply.js";
import type { CleanupPlan, MoveAction } from "./plan.js";

const NOW = Date.parse("2026-09-01T07:00:00+09:00");
const DAY = 24 * 60 * 60 * 1000;

async function freshDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "openqlow-cleanup-apply-"));
}

async function makeFile(file: string, content: string, ageDays = 0): Promise<string> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, "utf8");
  const when = new Date(NOW - ageDays * DAY);
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

function move(from: string, to: string, kind: MoveAction["kind"] = "organize"): MoveAction {
  return { kind, from, to, category: "document", reason: "テスト", size: 1 };
}

// お試し実行では1件も動かない。ここが崩れると全部が怖くなる。
{
  const root = await freshDir();
  const source = await makeFile(path.join(root, "Desktop", "資料.pdf"), "pdf");
  const destination = path.join(root, "整理済み", "資料.pdf");

  const result = await applyMove(move(source, destination), true);
  assert.equal(result.ok, true);
  assert.equal(await exists(source), true, "元のファイルはそのまま");
  assert.equal(await exists(destination), false, "移動先は作られない");
}

// 本番実行では移動する。
{
  const root = await freshDir();
  const source = await makeFile(path.join(root, "Desktop", "資料.pdf"), "pdf");
  const destination = path.join(root, "整理済み", "2026", "09", "書類", "資料.pdf");

  const result = await applyMove(move(source, destination), false);
  assert.equal(result.ok, true);
  assert.equal(result.to, destination);
  assert.equal(await exists(source), false);
  assert.equal(await fs.readFile(destination, "utf8"), "pdf");
}

// 同名があっても上書きしない。名前を変えて両方残す。
{
  const root = await freshDir();
  const destination = path.join(root, "整理済み", "資料.pdf");
  await makeFile(destination, "先にあった中身");
  const source = await makeFile(path.join(root, "Desktop", "資料.pdf"), "あとから来た中身");

  assert.equal(await uniqueDestination(destination), path.join(root, "整理済み", "資料_1.pdf"));

  const result = await applyMove(move(source, destination), false);
  assert.equal(result.ok, true);
  assert.equal(result.to, path.join(root, "整理済み", "資料_1.pdf"));
  assert.equal(await fs.readFile(destination, "utf8"), "先にあった中身", "元からあったファイルは無事");
  assert.equal(await fs.readFile(result.to!, "utf8"), "あとから来た中身");
}

// 危ない移動は実行前に止まる。失敗しても throw せず結果に残す。
{
  const root = await freshDir();
  const source = await makeFile(path.join(root, "Desktop", "資料.pdf"), "pdf");
  const result = await applyMove(move(source, source), false);
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /移動元と移動先が同じ/);
  assert.equal(await exists(source), true);
}

// 完全削除はゴミ箱待ちの中だけ。外は拒否され、ファイルは残る。
{
  const root = await freshDir();
  const quarantine = path.join(root, "99_ゴミ箱待ち");
  const inside = await makeFile(path.join(quarantine, "2026-07-01", "古い.tmp"), "x", 60);
  const outside = await makeFile(path.join(root, "Desktop", "大事な資料.pdf"), "x", 60);

  const dry = await applyPurge({ path: inside, ageDays: 60, size: 1, source: "quarantine" }, [quarantine], true);
  assert.equal(dry.ok, true);
  assert.equal(await exists(inside), true, "お試し実行では消えない");

  const real = await applyPurge({ path: inside, ageDays: 60, size: 1, source: "quarantine" }, [quarantine], false);
  assert.equal(real.ok, true);
  assert.equal(await exists(inside), false);

  const blocked = await applyPurge({ path: outside, ageDays: 60, size: 1, source: "quarantine" }, [quarantine], false);
  assert.equal(blocked.ok, false);
  assert.equal(await exists(outside), true, "ゴミ箱待ちの外は消えない");
}

// 外付けドライブ: 未設定・未接続はスキップし、理由を残す。
{
  const root = await freshDir();
  const organizedRoot = path.join(root, "整理済み");
  await makeFile(path.join(organizedRoot, "2026", "09", "画像", "a.png"), "a");

  const unset = await backupOrganized({
    organizedRoot,
    backupRoot: "",
    backupFolderName: "FLATUP_CLEAN",
    dryRun: false,
  });
  assert.equal(unset.available, false);
  assert.match(unset.reason ?? "", /未設定/);

  const unmounted = await backupOrganized({
    organizedRoot,
    backupRoot: path.join(root, "Volumes", "つながっていない"),
    backupFolderName: "FLATUP_CLEAN",
    dryRun: false,
  });
  assert.equal(unmounted.available, false);
  assert.match(unmounted.reason ?? "", /未接続/);
}

// 外付けドライブ: 中身を写す。移動ではなくコピーなので手元にも残る。
{
  const root = await freshDir();
  const organizedRoot = path.join(root, "整理済み");
  const backupRoot = path.join(root, "Volumes", "FLATUP_BACKUP");
  await fs.mkdir(backupRoot, { recursive: true });
  await makeFile(path.join(organizedRoot, "2026", "09", "画像", "a.png"), "画像の中身", 3);

  const first = await backupOrganized({ organizedRoot, backupRoot, backupFolderName: "FLATUP_CLEAN", dryRun: false });
  assert.equal(first.available, true);
  assert.equal(first.copied, 1);
  const copied = path.join(backupRoot, "FLATUP_CLEAN", "2026", "09", "画像", "a.png");
  assert.equal(await fs.readFile(copied, "utf8"), "画像の中身");
  assert.equal(await exists(path.join(organizedRoot, "2026", "09", "画像", "a.png")), true, "手元にも残る");

  // 2回目は同じ内容なので何もしない。毎朝の実行を軽くする。
  const second = await backupOrganized({ organizedRoot, backupRoot, backupFolderName: "FLATUP_CLEAN", dryRun: false });
  assert.equal(second.copied, 0);
  assert.equal(second.skipped, 1);
}

// 計画をまとめて実行する。移動 → 外付け保存 → 完全削除の順。
{
  const root = await freshDir();
  const organizedRoot = path.join(root, "整理済み");
  const quarantine = path.join(root, "99_ゴミ箱待ち");
  const backupRoot = path.join(root, "Volumes", "FLATUP_BACKUP");
  await fs.mkdir(backupRoot, { recursive: true });

  const document = await makeFile(path.join(root, "Desktop", "資料.pdf"), "pdf", 5);
  const junk = await makeFile(path.join(root, "Desktop", ".DS_Store"), "junk", 5);
  const old = await makeFile(path.join(quarantine, "2026-07-01", "古い.tmp"), "x", 60);

  const plan: CleanupPlan = {
    dateJst: "2026-09-01",
    moves: [
      move(document, path.join(organizedRoot, "2026", "09", "書類", "資料.pdf")),
      move(junk, path.join(quarantine, "2026-09-01", ".DS_Store"), "trash"),
    ],
    purges: [{ path: old, ageDays: 60, size: 1, source: "quarantine" }],
    keptCount: 1,
    errors: [],
  };

  const result = await applyCleanupPlan(plan, {
    dryRun: false,
    purgeRoots: [quarantine],
    backup: { organizedRoot, backupRoot, backupFolderName: "FLATUP_CLEAN" },
  });

  assert.equal(result.organized.filter(item => item.ok).length, 1);
  assert.equal(result.trashed.filter(item => item.ok).length, 1);
  assert.equal(result.purged.filter(item => item.ok).length, 1);
  assert.equal(result.backup.copied, 1, "整頓した直後のファイルが外付けへ行く");
  assert.equal(await exists(old), false);
  assert.equal(await exists(path.join(quarantine, "2026-09-01", ".DS_Store")), true);
  assert.equal(
    await exists(path.join(backupRoot, "FLATUP_CLEAN", "2026", "09", "書類", "資料.pdf")),
    true,
  );
}

console.log("cleanup apply tests passed");
