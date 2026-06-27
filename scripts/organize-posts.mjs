#!/usr/bin/env node
// openqlow-posts/inbox/ の中身を拡張子で振り分けて
// ready/images/ または ready/videos/ に「移動」する。
//
// 絶対にやらないこと:
//   - ファイルの削除
//   - inbox/ 以外のフォルダの書き換え
//   - 未知拡張子の自動振り分け（残す）
//
// 使い方:
//   node scripts/organize-posts.mjs                 # デフォルト ~/Desktop/openqlow-posts/
//   node scripts/organize-posts.mjs /path/to/posts  # パス指定
//
// 環境変数:
//   OPENQLOW_POSTS_ROOT=/path/to/posts   # コマンドライン引数の代わりに使える
//   OPENQLOW_POSTS_DRY_RUN=true          # 移動せずプランだけ表示

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".heic", ".heif", ".gif", ".webp"]);
const VIDEO_EXTS = new Set([".mp4", ".mov", ".m4v", ".avi", ".webm"]);

const DEFAULT_ROOT = path.join(os.homedir(), "Desktop", "openqlow-posts");

export function classifyExtension(ext) {
  const lower = ext.toLowerCase();
  if (IMAGE_EXTS.has(lower)) return "image";
  if (VIDEO_EXTS.has(lower)) return "video";
  return "unknown";
}

/**
 * 衝突回避: 既存ファイルがあれば "name (1).ext" → "name (2).ext" ... と空きを探す。
 */
export async function resolveUniquePath(targetDir, fileName) {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let candidate = path.join(targetDir, fileName);
  let n = 1;
  while (true) {
    try {
      await fs.stat(candidate);
      candidate = path.join(targetDir, `${base} (${n})${ext}`);
      n += 1;
    } catch (err) {
      if (err.code === "ENOENT") return candidate;
      throw err;
    }
  }
}

export async function organizeOnce(root = DEFAULT_ROOT, opts = {}) {
  const dryRun = opts.dryRun ?? false;
  const inboxDir = path.join(root, "inbox");
  const imagesDir = path.join(root, "ready", "images");
  const videosDir = path.join(root, "ready", "videos");

  // 念のため出力先ディレクトリは事前作成（既存ならスキップ）
  await fs.mkdir(imagesDir, { recursive: true });
  await fs.mkdir(videosDir, { recursive: true });

  let entries;
  try {
    entries = await fs.readdir(inboxDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") {
      return { moved: [], skipped: [], inboxMissing: true };
    }
    throw err;
  }

  const moved = [];
  const skipped = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.startsWith(".")) continue; // .DS_Store 等

    const src = path.join(inboxDir, entry.name);
    const kind = classifyExtension(path.extname(entry.name));
    if (kind === "unknown") {
      skipped.push({ name: entry.name, reason: "unknown_extension" });
      continue;
    }

    const destDir = kind === "image" ? imagesDir : videosDir;
    const dest = await resolveUniquePath(destDir, entry.name);

    if (dryRun) {
      moved.push({ name: entry.name, from: src, to: dest, kind, dryRun: true });
      continue;
    }

    await fs.rename(src, dest);
    moved.push({ name: entry.name, from: src, to: dest, kind });
  }

  return { moved, skipped };
}

// CLI 実行時
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const root = process.argv[2] || process.env.OPENQLOW_POSTS_ROOT || DEFAULT_ROOT;
  const dryRun = process.env.OPENQLOW_POSTS_DRY_RUN === "true";

  const result = await organizeOnce(root, { dryRun });

  if (result.inboxMissing) {
    console.error(`[organize-posts] inbox not found: ${path.join(root, "inbox")}`);
    process.exit(1);
  }

  console.log(`[organize-posts] root: ${root}`);
  console.log(`[organize-posts] mode: ${dryRun ? "DRY-RUN" : "MOVE"}`);
  console.log(`[organize-posts] moved: ${result.moved.length}`);
  for (const m of result.moved) {
    console.log(`  ${m.kind === "image" ? "🖼" : "🎬"} ${m.name} → ready/${m.kind}s/`);
  }
  if (result.skipped.length > 0) {
    console.log(`[organize-posts] skipped (unknown extension): ${result.skipped.length}`);
    for (const s of result.skipped) {
      console.log(`  ⚠ ${s.name}`);
    }
  }
}
