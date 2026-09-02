// ゴミ収集クリーンシステムの設定。
//
// すべて環境変数で決まる。何も設定しなくても動くが、既定は「お試し実行（dry run）」で、
// ファイルは1つも動かない。実際に動かすには OPENQLOW_CLEANUP_APPLY=true が要る。
//
// 安全の考え方:
//   - 消す前に必ず「ゴミ箱待ち」フォルダへ移す。いきなり消さない。
//   - 完全削除は OPENQLOW_CLEANUP_PURGE=true のときだけ。しかも保管日数を過ぎたものだけ。
//   - Mac のゴミ箱を空にするのは OPENQLOW_CLEANUP_EMPTY_TRASH=true のときだけ。

import os from "node:os";
import path from "node:path";

export interface CleanupConfig {
  /** 片づける対象フォルダ（デスクトップなど）。 */
  targets: string[];
  /** 整頓後の保存先。 */
  organizedRoot: string;
  /** 捨て候補の一時置き場。ここに入れてから保管日数を過ぎたものだけ消す。 */
  quarantineRoot: string;
  /** 外付けドライブのルート。未設定・未接続ならバックアップはスキップする。 */
  backupRoot: string;
  /** 外付けドライブ内の保存先フォルダ名。 */
  backupFolderName: string;
  /** 最後に触ってから何日たったファイルを片づけるか。 */
  idleDays: number;
  /** ゴミ箱待ちで何日保管してから完全削除するか。 */
  retentionDays: number;
  /** true のとき実際にファイルを動かす。false（既定）はお試し実行。 */
  apply: boolean;
  /** true のときだけ、保管日数を過ぎたゴミ箱待ちファイルを完全削除する。 */
  purgeEnabled: boolean;
  /** true のときだけ、Mac のゴミ箱（~/.Trash）の古いファイルを消す。 */
  emptyTrashEnabled: boolean;
  /** Mac のゴミ箱の場所。 */
  trashRoots: string[];
  /** フォルダごと整頓するか。既定は false（フォルダには触らない）。 */
  includeFolders: boolean;
  /** 完全停止スイッチ。 */
  disabled: boolean;
}

/** `~/Desktop` のような書き方をホームからの絶対パスに直す。 */
export function expandHome(input: string, home = os.homedir()): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (trimmed === "~") return home;
  if (trimmed.startsWith("~/")) return path.join(home, trimmed.slice(2));
  return path.resolve(trimmed);
}

/** カンマ区切りの環境変数をパスの配列にする。空要素と重複は落とす。 */
export function parsePathList(value: string | undefined, home = os.homedir()): string[] {
  if (!value) return [];
  const out: string[] = [];
  for (const part of value.split(",")) {
    const expanded = expandHome(part, home);
    if (expanded && !out.includes(expanded)) out.push(expanded);
  }
  return out;
}

/** 数値の環境変数。読めない値・負の値は既定値に戻す（設定ミスで暴走させない）。 */
export function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function parseFlag(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return value.trim().toLowerCase() === "true";
}

export const DEFAULT_ORGANIZED_FOLDER = "00_整理済み";
export const DEFAULT_QUARANTINE_FOLDER = "99_ゴミ箱待ち";
export const DEFAULT_BACKUP_FOLDER = "FLATUP_CLEAN";

export function loadCleanupConfig(
  env: NodeJS.ProcessEnv = process.env,
  home = os.homedir(),
): CleanupConfig {
  const desktop = path.join(home, "Desktop");
  const targets = parsePathList(env.OPENQLOW_CLEANUP_TARGETS, home);

  return {
    targets: targets.length > 0 ? targets : [desktop, path.join(home, "Downloads")],
    organizedRoot: env.OPENQLOW_CLEANUP_ORGANIZED_ROOT
      ? expandHome(env.OPENQLOW_CLEANUP_ORGANIZED_ROOT, home)
      : path.join(desktop, DEFAULT_ORGANIZED_FOLDER),
    quarantineRoot: env.OPENQLOW_CLEANUP_QUARANTINE_ROOT
      ? expandHome(env.OPENQLOW_CLEANUP_QUARANTINE_ROOT, home)
      : path.join(desktop, DEFAULT_QUARANTINE_FOLDER),
    backupRoot: env.OPENQLOW_CLEANUP_BACKUP_ROOT
      ? expandHome(env.OPENQLOW_CLEANUP_BACKUP_ROOT, home)
      : "",
    backupFolderName: env.OPENQLOW_CLEANUP_BACKUP_FOLDER?.trim() || DEFAULT_BACKUP_FOLDER,
    idleDays: parsePositiveInt(env.OPENQLOW_CLEANUP_IDLE_DAYS, 1),
    retentionDays: parsePositiveInt(env.OPENQLOW_CLEANUP_RETENTION_DAYS, 30),
    apply: parseFlag(env.OPENQLOW_CLEANUP_APPLY),
    purgeEnabled: parseFlag(env.OPENQLOW_CLEANUP_PURGE),
    emptyTrashEnabled: parseFlag(env.OPENQLOW_CLEANUP_EMPTY_TRASH),
    trashRoots: (() => {
      const configured = parsePathList(env.OPENQLOW_CLEANUP_TRASH_ROOTS, home);
      return configured.length > 0 ? configured : [path.join(home, ".Trash")];
    })(),
    includeFolders: parseFlag(env.OPENQLOW_CLEANUP_INCLUDE_FOLDERS),
    disabled: parseFlag(env.OPENQLOW_CLEANUP_DISABLED),
  };
}
