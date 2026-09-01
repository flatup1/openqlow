// 触ってはいけない場所を、実装で通れなくする。
//
// AGENTS.md / approval_matrix.md の「破壊的な再帰削除」「リポジトリ・本番データの削除」を、
// ルールとして書くだけでなく、ここで throw して止める。
// 設定ミス（例: OPENQLOW_CLEANUP_TARGETS=/ ）でも壊れないことが目的。

import os from "node:os";
import path from "node:path";

export class UnsafePathError extends Error {
  constructor(public readonly targetPath: string, public readonly reason: string) {
    super(`unsafe path "${targetPath}": ${reason}`);
    this.name = "UnsafePathError";
  }
}

/** これ自体を対象にしてはいけない場所。 */
const PROTECTED_ROOTS: readonly string[] = [
  "/",
  "/System",
  "/Library",
  "/Applications",
  "/Users",
  "/Volumes",
  "/bin",
  "/usr",
  "/etc",
  "/var",
];

/** この名前がパスに含まれていたら触らない。 */
const PROTECTED_SEGMENTS: ReadonlySet<string> = new Set([
  ".git",
  "node_modules",
  "Library",
  ".ssh",
  ".config",
  ".Trash",
]);

/** `child` が `parent` の中（または同一）か。パス区切りまで見るので `/a/bc` は `/a/b` の中ではない。 */
export function isInside(parent: string, child: string): boolean {
  const from = path.resolve(parent);
  const to = path.resolve(child);
  if (from === to) return true;
  const relative = path.relative(from, to);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * 片づけ対象フォルダとして使ってよいか。
 * ホーム直下・システム領域・リポジトリ内は拒否する。
 */
export function assertSafeTargetRoot(targetPath: string, home = os.homedir()): void {
  const resolved = path.resolve(targetPath);

  if (PROTECTED_ROOTS.includes(resolved)) {
    throw new UnsafePathError(resolved, "システム領域は対象にできません");
  }
  if (resolved === path.resolve(home)) {
    throw new UnsafePathError(resolved, "ホーム直下をまるごと対象にはできません");
  }
  for (const segment of resolved.split(path.sep)) {
    if (PROTECTED_SEGMENTS.has(segment)) {
      throw new UnsafePathError(resolved, `保護された場所（${segment}）です`);
    }
  }
}

/**
 * 完全削除してよいか。ゴミ箱待ち（または明示したゴミ箱）の中のファイルだけ許す。
 * 1件ずつこの関数を通す。ディレクトリごとの再帰削除はしない。
 */
export function assertSafeToPurge(filePath: string, purgeRoots: readonly string[]): void {
  const resolved = path.resolve(filePath);

  if (purgeRoots.length === 0) {
    throw new UnsafePathError(resolved, "削除してよい場所が設定されていません");
  }
  const inside = purgeRoots.some(root => {
    const resolvedRoot = path.resolve(root);
    // ルート自身は消さない。中身だけ。
    return resolved !== resolvedRoot && isInside(resolvedRoot, resolved);
  });
  if (!inside) {
    throw new UnsafePathError(resolved, "ゴミ箱待ちの外は削除しません");
  }
  if (PROTECTED_ROOTS.includes(resolved)) {
    throw new UnsafePathError(resolved, "システム領域は削除しません");
  }
}

/**
 * 移動してよいか。移動元・移動先ともシステム領域を拒否し、
 * 自分の中へ自分を入れる（無限に潜る）動きも止める。
 */
export function assertSafeToMove(from: string, to: string): void {
  const source = path.resolve(from);
  const destination = path.resolve(to);

  if (PROTECTED_ROOTS.includes(source) || PROTECTED_ROOTS.includes(destination)) {
    throw new UnsafePathError(source, "システム領域は移動できません");
  }
  if (source === destination) {
    throw new UnsafePathError(source, "移動元と移動先が同じです");
  }
  if (isInside(source, destination)) {
    throw new UnsafePathError(source, "自分の中へは移動できません");
  }
}
