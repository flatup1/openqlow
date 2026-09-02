// 「何をどこへ動かすか」の計画を作る。ここではまだ1件も動かさない。
//
// 計画と実行を分けておくと、お試し実行（dry run）と本番がまったく同じ判定を通る。
// 「試したときは何も起きなかったのに、本番では違うものが動いた」を防ぐ。

import fs from "node:fs/promises";
import path from "node:path";
import {
  type CleanupCategory,
  type Classification,
  type FileEntry,
  classifyEntry,
  organizedRelativePath,
  quarantineRelativePath,
} from "./classify.js";
import type { CleanupConfig } from "./config.js";
import { isInside } from "./safety.js";

export interface MoveAction {
  kind: "organize" | "trash";
  from: string;
  to: string;
  category: CleanupCategory;
  reason: string;
  size: number;
}

export interface PurgeAction {
  path: string;
  /** ゴミ箱待ちに入ってから何日たったか */
  ageDays: number;
  size: number;
  /** quarantine（ゴミ箱待ち） か trash（Macのゴミ箱） か */
  source: "quarantine" | "trash";
}

export interface CleanupPlan {
  dateJst: string;
  moves: MoveAction[];
  purges: PurgeAction[];
  /** 触らなかったもの（件数だけ数える。中身はログに出さない） */
  keptCount: number;
  /** 読み取れなかった場所 */
  errors: { path: string; message: string }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 1階層だけ読む。デスクトップの中を深追いしないのは、作業中のフォルダを壊さないため。 */
export async function listEntries(dir: string): Promise<FileEntry[]> {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const entries: FileEntry[] = [];

  for (const dirent of dirents) {
    const full = path.join(dir, dirent.name);
    let stat;
    try {
      // lstat を使う。シンボリックリンクはリンク自体として見る。
      stat = await fs.lstat(full);
    } catch {
      continue; // 読んでいる間に消えたものは無視する
    }
    entries.push({
      path: full,
      name: dirent.name,
      size: stat.size,
      modifiedMs: stat.mtimeMs,
      isDirectory: stat.isDirectory(),
      isSymbolicLink: stat.isSymbolicLink(),
    });
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

/** 自分が作った管理フォルダ（整頓先・ゴミ箱待ち）は片づけ対象にしない。 */
export function isManagedPath(entryPath: string, config: CleanupConfig): boolean {
  const managed = [config.organizedRoot, config.quarantineRoot].filter(Boolean);
  return managed.some(root => isInside(root, entryPath) || isInside(entryPath, root));
}

/** 移動先を決める。判定が "keep" のときは undefined。 */
export function destinationFor(
  entry: FileEntry,
  classification: Classification,
  config: CleanupConfig,
  dateJst: string,
): string | undefined {
  if (classification.action === "organize") {
    return path.join(config.organizedRoot, organizedRelativePath(entry, classification.category));
  }
  if (classification.action === "trash") {
    return path.join(config.quarantineRoot, quarantineRelativePath(entry, dateJst));
  }
  return undefined;
}

/** `99_ゴミ箱待ち/2026-09-01/...` の日付フォルダを読む。読めなければ undefined。 */
export function quarantineDateFromPath(root: string, filePath: string): string | undefined {
  const relative = path.relative(path.resolve(root), path.resolve(filePath));
  if (!relative || relative.startsWith("..")) return undefined;
  const first = relative.split(path.sep)[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(first) ? first : undefined;
}

/**
 * 「ここに置かれてから何日たったか」を出す。
 *
 * 更新日時(mtime)は使わない。ファイルを移動しても mtime は元のままなので、
 * 「90日前に作った書類」を今日ゴミ箱待ちへ入れた瞬間に削除対象になってしまう。
 * 代わりに次の2つを見て、短いほう（＝消すのが遅くなるほう）を採る。
 *   1. 日付フォルダ（ゴミ箱待ちへ入れた日そのもの）
 *   2. ctime（移動などでファイルの状態が変わった時刻）
 */
export function purgeAgeDays(
  root: string,
  filePath: string,
  stat: { ctimeMs: number },
  nowMs: number,
): number {
  const fromCtime = Math.floor(Math.max(0, nowMs - stat.ctimeMs) / DAY_MS);

  const dateFolder = quarantineDateFromPath(root, filePath);
  if (!dateFolder) return fromCtime;

  const enteredMs = Date.parse(`${dateFolder}T00:00:00+09:00`);
  if (Number.isNaN(enteredMs)) return fromCtime;

  const fromFolder = Math.floor(Math.max(0, nowMs - enteredMs) / DAY_MS);
  return Math.min(fromFolder, fromCtime);
}

/** 完全削除の候補を集める。保管日数を過ぎたファイルだけ、1件ずつ拾う。 */
export async function collectPurgeCandidates(
  root: string,
  source: PurgeAction["source"],
  retentionDays: number,
  nowMs: number,
  depth = 0,
  rootForAge = root,
): Promise<PurgeAction[]> {
  // 深追いしすぎない。ゴミ箱待ては「日付フォルダ / ファイル」の2階層で足りる。
  if (depth > 4) return [];

  let dirents;
  try {
    dirents = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const out: PurgeAction[] = [];
  for (const dirent of dirents) {
    const full = path.join(root, dirent.name);
    let stat;
    try {
      stat = await fs.lstat(full);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      out.push(
        ...(await collectPurgeCandidates(full, source, retentionDays, nowMs, depth + 1, rootForAge)),
      );
      continue;
    }
    // シンボリックリンクは追わない。リンク先の本体を消してしまう事故を避ける。
    if (stat.isSymbolicLink()) continue;

    const ageDays = purgeAgeDays(rootForAge, full, stat, nowMs);
    if (ageDays < retentionDays) continue;

    out.push({ path: full, ageDays, size: stat.size, source });
  }
  return out;
}

export interface BuildPlanOptions {
  config: CleanupConfig;
  dateJst: string;
  nowMs: number;
}

/** 対象フォルダを見て、計画を1つ作る。 */
export async function buildCleanupPlan(opts: BuildPlanOptions): Promise<CleanupPlan> {
  const { config, dateJst, nowMs } = opts;
  const plan: CleanupPlan = { dateJst, moves: [], purges: [], keptCount: 0, errors: [] };

  for (const target of config.targets) {
    let entries: FileEntry[];
    try {
      entries = await listEntries(target);
    } catch (error) {
      plan.errors.push({ path: target, message: (error as Error).message });
      continue;
    }

    for (const entry of entries) {
      if (isManagedPath(entry.path, config)) {
        plan.keptCount += 1;
        continue;
      }
      const classification = classifyEntry(entry, {
        idleDays: config.idleDays,
        includeFolders: config.includeFolders,
        nowMs,
      });
      const destination = destinationFor(entry, classification, config, dateJst);
      if (!destination || classification.action === "keep") {
        plan.keptCount += 1;
        continue;
      }
      plan.moves.push({
        kind: classification.action,
        from: entry.path,
        to: destination,
        category: classification.category,
        reason: classification.reason,
        size: entry.size,
      });
    }
  }

  // 完全削除は、許可されているときだけ候補を集める。集めた時点では消さない。
  if (config.purgeEnabled) {
    plan.purges.push(
      ...(await collectPurgeCandidates(
        config.quarantineRoot,
        "quarantine",
        config.retentionDays,
        nowMs,
      )),
    );
  }
  if (config.emptyTrashEnabled) {
    for (const trashRoot of config.trashRoots) {
      plan.purges.push(
        ...(await collectPurgeCandidates(trashRoot, "trash", config.retentionDays, nowMs)),
      );
    }
  }

  return plan;
}
