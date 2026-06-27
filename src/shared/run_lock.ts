import fs from "node:fs/promises";
import path from "node:path";
import { openqlowPath } from "../utils/paths.js";

// systemd timer の重複発火や手動再実行と衝突した時、LINEへの重複pushを防ぐための
// 「同じ日に1回だけ」排他ロック。reminder.ts の stamp ファイルパターンを汎用化したもの。
export async function acquireDailyLock(name: string, dateJst: string, stateDir?: string): Promise<boolean> {
  const dir = path.join(stateDir ?? openqlowPath("state"), "locks");
  await fs.mkdir(dir, { recursive: true });
  const lockPath = path.join(dir, `${name}-${dateJst}.lock`);
  try {
    await fs.writeFile(lockPath, new Date().toISOString(), { flag: "wx" });
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw err;
  }
}
