// 計画を実行する。ここが唯一ファイルを動かす場所。
//
// 既定は dryRun=true。呼び出し側が明示的に false を渡したときだけ実際に動く。
// 失敗した1件で全体を止めない。1件ずつ結果を記録して、最後にまとめて報告する。

import fs from "node:fs/promises";
import path from "node:path";
import type { CleanupPlan, MoveAction, PurgeAction } from "./plan.js";
import { assertSafeToMove, assertSafeToPurge } from "./safety.js";

export interface ActionResult {
  ok: boolean;
  from: string;
  to?: string;
  error?: string;
}

export interface ApplyResult {
  dryRun: boolean;
  organized: ActionResult[];
  trashed: ActionResult[];
  purged: ActionResult[];
  backup: BackupResult;
  errors: { path: string; message: string }[];
}

export interface BackupResult {
  /** 外付けドライブが使えたか */
  available: boolean;
  /** 使えなかった理由（未設定・未接続など） */
  reason?: string;
  copied: number;
  skipped: number;
  bytes: number;
  errors: { path: string; message: string }[];
}

/** 同名ファイルがあるときに `写真_1.png` のような名前を作る。上書きは絶対にしない。 */
export async function uniqueDestination(destination: string): Promise<string> {
  const dir = path.dirname(destination);
  const ext = path.extname(destination);
  const base = path.basename(destination, ext);

  for (let i = 0; i <= 100; i += 1) {
    const candidate = i === 0 ? destination : path.join(dir, `${base}_${i}${ext}`);
    try {
      await fs.lstat(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return candidate;
      throw error;
    }
  }
  throw new Error(`同名ファイルが多すぎます: ${destination}`);
}

/** 別ドライブへの移動は rename が使えない。その場合だけコピーしてから元を消す。 */
async function moveFile(from: string, to: string): Promise<void> {
  try {
    await fs.rename(from, to);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    await fs.cp(from, to, { recursive: true, errorOnExist: true, force: false });
    await fs.rm(from, { recursive: true, force: false });
  }
}

export async function applyMove(action: MoveAction, dryRun: boolean): Promise<ActionResult> {
  try {
    assertSafeToMove(action.from, action.to);
    if (dryRun) return { ok: true, from: action.from, to: action.to };

    await fs.mkdir(path.dirname(action.to), { recursive: true });
    const destination = await uniqueDestination(action.to);
    await moveFile(action.from, destination);
    return { ok: true, from: action.from, to: destination };
  } catch (error) {
    return { ok: false, from: action.from, to: action.to, error: (error as Error).message };
  }
}

export async function applyPurge(
  action: PurgeAction,
  purgeRoots: readonly string[],
  dryRun: boolean,
): Promise<ActionResult> {
  try {
    // 消してよい場所かを1件ずつ確認する。フォルダごとの再帰削除はしない。
    assertSafeToPurge(action.path, purgeRoots);
    if (dryRun) return { ok: true, from: action.path };

    await fs.unlink(action.path);
    return { ok: true, from: action.path };
  } catch (error) {
    return { ok: false, from: action.path, error: (error as Error).message };
  }
}

export interface BackupOptions {
  /** 整頓済みフォルダ（コピー元） */
  organizedRoot: string;
  /** 外付けドライブのルート。空なら何もしない。 */
  backupRoot: string;
  /** 外付けドライブ内の保存先フォルダ名 */
  backupFolderName: string;
  dryRun: boolean;
}

/** 外付けドライブが今つながっているか。書き込めるかまでは見ない（読めれば十分）。 */
async function isMounted(root: string): Promise<boolean> {
  try {
    const stat = await fs.stat(root);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * 整頓済みフォルダを外付けドライブへ写す。
 * 移動ではなくコピー。手元からは消さないので、ドライブを外しても手元は無事。
 */
export async function backupOrganized(opts: BackupOptions): Promise<BackupResult> {
  const empty: BackupResult = { available: false, copied: 0, skipped: 0, bytes: 0, errors: [] };

  if (!opts.backupRoot) {
    return { ...empty, reason: "外付けドライブが未設定（OPENQLOW_CLEANUP_BACKUP_ROOT）" };
  }
  if (!(await isMounted(opts.backupRoot))) {
    return { ...empty, reason: "外付けドライブが見つかりません（未接続）" };
  }
  if (!(await isMounted(opts.organizedRoot))) {
    return { ...empty, available: true, reason: "整頓済みフォルダがまだありません" };
  }

  const destinationRoot = path.join(opts.backupRoot, opts.backupFolderName);
  const result: BackupResult = { available: true, copied: 0, skipped: 0, bytes: 0, errors: [] };

  const walk = async (relative: string, depth: number): Promise<void> => {
    if (depth > 10) return;
    const sourceDir = path.join(opts.organizedRoot, relative);
    let dirents;
    try {
      dirents = await fs.readdir(sourceDir, { withFileTypes: true });
    } catch (error) {
      result.errors.push({ path: sourceDir, message: (error as Error).message });
      return;
    }

    for (const dirent of dirents) {
      const relativePath = path.join(relative, dirent.name);
      const source = path.join(opts.organizedRoot, relativePath);
      const destination = path.join(destinationRoot, relativePath);

      let stat;
      try {
        stat = await fs.lstat(source);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        await walk(relativePath, depth + 1);
        continue;
      }

      // 既に同じ大きさで、コピー先の方が新しければ触らない。毎朝の実行を軽くする。
      try {
        const existing = await fs.stat(destination);
        if (existing.size === stat.size && existing.mtimeMs >= stat.mtimeMs) {
          result.skipped += 1;
          continue;
        }
      } catch {
        // コピー先に無い＝初回コピー。そのまま進む。
      }

      if (opts.dryRun) {
        result.copied += 1;
        result.bytes += stat.size;
        continue;
      }

      try {
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.copyFile(source, destination);
        // 元の更新時刻を残す。次回の比較を正しくするため。
        await fs.utimes(destination, new Date(), new Date(stat.mtimeMs));
        result.copied += 1;
        result.bytes += stat.size;
      } catch (error) {
        result.errors.push({ path: source, message: (error as Error).message });
      }
    }
  };

  await walk("", 0);
  return result;
}

export interface ApplyOptions {
  dryRun: boolean;
  /** 完全削除してよい場所（ゴミ箱待ち・Macのゴミ箱） */
  purgeRoots: readonly string[];
  backup: Omit<BackupOptions, "dryRun">;
}

/** 計画を上から順に実行する。移動 → 外付け保存 → 完全削除の順。 */
export async function applyCleanupPlan(plan: CleanupPlan, opts: ApplyOptions): Promise<ApplyResult> {
  const organized: ActionResult[] = [];
  const trashed: ActionResult[] = [];

  for (const move of plan.moves) {
    const result = await applyMove(move, opts.dryRun);
    (move.kind === "organize" ? organized : trashed).push(result);
  }

  // 外付けへの保存は、整頓が終わってから。整頓済みフォルダの中身を写すため。
  const backup = await backupOrganized({ ...opts.backup, dryRun: opts.dryRun });

  // 完全削除は最後。ここまでの結果が残っているので、消えた理由を後から追える。
  const purged: ActionResult[] = [];
  for (const purge of plan.purges) {
    purged.push(await applyPurge(purge, opts.purgeRoots, opts.dryRun));
  }

  return { dryRun: opts.dryRun, organized, trashed, purged, backup, errors: plan.errors };
}
