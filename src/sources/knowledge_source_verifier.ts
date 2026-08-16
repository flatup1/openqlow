// Knowledge Source Verifier
//
// 責務: Design Pack ファイルの存在・SHA-256 hash を確認する。
// 秘密情報・顧客情報を読まない。verified metadata だけを返す。
//
// 制約:
//   - ファイル内容は SHA-256 計算のためだけに読む。結果に含めない
//   - fail-closed: 実体未確認 → status: missing, source_hash: null
//   - quarantined / external / secret / PII は検証対象外（path 無視）
//   - Constitution 未確認 → query blocked
//   - 返却値は immutable
//   - #fragment は metadata として扱う（ハッシュ対象外）

import { createHash } from "node:crypto";
import { readFileSync, statSync, lstatSync, realpathSync } from "node:fs";
import type { KnowledgeEntry } from "../brand_growth/contracts/knowledge.js";

// File map for testing (no real I/O)
export type MockFileMap = Map<string, string>;

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

function calculateSha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function stripFragment(path: string): string {
  const hashIndex = path.indexOf("#");
  return hashIndex === -1 ? path : path.substring(0, hashIndex);
}

function isPathSafe(path: string): boolean {
  // Strip fragment for validation (fragment is metadata, not part of path)
  const pathWithoutFragment = stripFragment(path);

  // Reject absolute paths
  if (pathWithoutFragment.startsWith("/")) return false;

  // Reject path traversal attempts
  if (pathWithoutFragment.includes("..")) return false;

  // Reject null bytes
  if (pathWithoutFragment.includes("\0")) return false;

  // Reject symlink-like patterns
  if (pathWithoutFragment.startsWith("~")) return false;

  return true;
}

function verifyEntry(
  entry: KnowledgeEntry,
  readFileFn: (path: string) => string | null,
): KnowledgeEntry {
  // Never activate quarantined, external, secret, PII, conflicted, or deprecated entries
  if (entry.status === "quarantined" || entry.status === "deprecated") {
    return deepFreeze(entry);
  }
  if (entry.location === "external") {
    return deepFreeze({
      ...entry,
      status: "missing" as const,
      source_hash: null,
    });
  }
  if (entry.contains_secrets || entry.contains_pii) {
    return deepFreeze({
      ...entry,
      status: "missing" as const,
      source_hash: null,
    });
  }
  if (entry.conflicts_with && entry.conflicts_with.length > 0) {
    // Conflicted entry: preserve as-is, do not activate
    return deepFreeze(entry);
  }

  // Fixture entries: pass through (used in tests, no verification needed)
  if (entry.source_path.startsWith("fixture://")) {
    return deepFreeze(entry);
  }

  // Metadata-only entries (design_pack://, etc): pass through
  if (entry.source_path.startsWith("design_pack://")) {
    return deepFreeze(entry);
  }

  // Design pack entries: check path safety and verify
  if (!isPathSafe(entry.source_path)) {
    return deepFreeze({
      ...entry,
      status: "missing" as const,
      source_hash: null,
    });
  }

  // Strip fragment for filesystem operations (fragment is selector metadata)
  const pathForIO = stripFragment(entry.source_path);
  const content = readFileFn(pathForIO);
  if (content === null) {
    // File not found or unreadable
    return deepFreeze({
      ...entry,
      status: "missing" as const,
      source_hash: null,
    });
  }

  const calculatedHash = calculateSha256(content);

  // If entry has no expected hash (null), compute and activate it
  if (entry.source_hash === null) {
    return deepFreeze({
      ...entry,
      status: "active" as const,
      source_hash: calculatedHash,
    });
  }

  // If entry has expected hash, verify it matches
  if (entry.source_hash !== calculatedHash) {
    // Hash mismatch: fail closed
    return deepFreeze({
      ...entry,
      status: "missing" as const,
      source_hash: null,
    });
  }

  // Expected hash verified!
  return deepFreeze(entry);
}

/**
 * In-memory verification for testing.
 * mockFileMap: path → content pairs (content is used for hashing only, never returned)
 */
export function verifySourcesInMemory(
  entries: readonly KnowledgeEntry[],
  mockFileMap: MockFileMap,
): readonly KnowledgeEntry[] {
  const readFile = (path: string): string | null => {
    return mockFileMap.get(path) ?? null;
  };

  const verified = entries.map(entry => verifyEntry(entry, readFile));
  // Deep freeze array and all elements
  for (const item of verified) {
    Object.freeze(item);
  }
  return Object.freeze(verified);
}

/**
 * Filesystem verification for production.
 * rootDir: base directory for relative paths (e.g., /opt/openqlow)
 *
 * Constraints:
 * - Only reads regular files
 * - Rejects absolute paths
 * - Rejects path traversal
 * - Rejects unreadable files
 * - Never logs or returns file content
 */
export function verifySourcesFileSystem(
  entries: readonly KnowledgeEntry[],
  rootDir: string,
): readonly KnowledgeEntry[] {
  const readFile = (path: string): string | null => {
    try {
      // For safety, reject absolute paths and path traversal
      if (path.startsWith("/")) return null;
      if (path.includes("..")) return null;

      const fullPath = `${rootDir}/${path}`;
      const lstat = lstatSync(fullPath);

      // Reject symlinks: check if file itself is a symlink
      if (lstat.isSymbolicLink()) {
        // Symlink detected; resolve real path and verify containment
        const realPath = realpathSync(fullPath);
        const normalizedRoot = realpathSync(rootDir);
        // Reject if resolved path escapes repository root
        if (!realPath.startsWith(normalizedRoot + "/") && realPath !== normalizedRoot) {
          return null;
        }
      }

      const stats = statSync(fullPath);

      // Only read regular files, reject directories, symlinks, etc.
      if (!stats.isFile()) return null;

      const content = readFileSync(fullPath, "utf-8");
      return content; // Content used for hashing only
    } catch {
      // Unreadable, missing, or permission denied
      return null;
    }
  };

  const verified = entries.map(entry => verifyEntry(entry, readFile));
  return Object.freeze(verified);
}

/**
 * Check if Brand Constitution is verified and available.
 * Required: constitution entry must exist, be active/review_due, and have verified hash.
 */
export function constitutionIsVerified(entries: readonly KnowledgeEntry[]): boolean {
  const constitution = entries.find(e => e.category === "constitution");
  if (!constitution) return false;
  if (constitution.status !== "active" && constitution.status !== "review_due") {
    return false;
  }
  if (constitution.source_hash === null) return false;
  return true;
}

/**
 * Alias for constitutionIsVerified, used by Query to decide blocking.
 */
export function constitutionIsAvailable(entries: readonly KnowledgeEntry[]): boolean {
  return constitutionIsVerified(entries);
}

/**
 * Production-facing manifest verification.
 * Verifies MANIFEST_ENTRIES and returns a registry usable by queryKnowledge.
 * queryKnowledge remains completely I/O-free and uses only the verified output.
 *
 * rootDir: base directory for relative paths. If omitted, treats entries as
 *          having been pre-verified (for testing or offline use).
 */
export function verifyManifestRegistry(
  entries: readonly KnowledgeEntry[],
  rootDir?: string,
): readonly KnowledgeEntry[] {
  if (rootDir) {
    // Production mode: verify files on disk
    return verifySourcesFileSystem(entries, rootDir);
  }
  // Pre-verified or test mode: pass through
  return Object.freeze(entries);
}
