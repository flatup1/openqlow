// 「このファイルをどうするか」を決めるところ。
//
// ここは純粋な判定だけを持つ。ファイルは触らない。
// 判定を1か所に集めておくと、テストで全パターンを確かめられる。

import path from "node:path";

export type CleanupAction =
  /** 整頓先へ移す */
  | "organize"
  /** ゴミ箱待ちへ移す（まだ消さない） */
  | "trash"
  /** 触らない */
  | "keep";

export type CleanupCategory =
  | "image"
  | "video"
  | "audio"
  | "document"
  | "spreadsheet"
  | "slide"
  | "archive"
  | "installer"
  | "code"
  | "folder"
  | "other";

/** 整頓先のフォルダ名。日本語にして、開いた瞬間に分かるようにする。 */
export const CATEGORY_FOLDER: Record<CleanupCategory, string> = {
  image: "画像",
  video: "動画",
  audio: "音声",
  document: "書類",
  spreadsheet: "表計算",
  slide: "スライド",
  archive: "圧縮ファイル",
  installer: "インストーラ",
  code: "コード",
  folder: "フォルダ",
  other: "その他",
};

const EXTENSION_CATEGORY: Record<string, CleanupCategory> = {
  ".png": "image", ".jpg": "image", ".jpeg": "image", ".gif": "image", ".heic": "image",
  ".webp": "image", ".bmp": "image", ".tiff": "image", ".tif": "image", ".svg": "image",
  ".mp4": "video", ".mov": "video", ".m4v": "video", ".avi": "video", ".mkv": "video", ".webm": "video",
  ".mp3": "audio", ".wav": "audio", ".m4a": "audio", ".aac": "audio", ".flac": "audio", ".aiff": "audio",
  ".pdf": "document", ".doc": "document", ".docx": "document", ".txt": "document",
  ".md": "document", ".rtf": "document", ".pages": "document",
  ".xls": "spreadsheet", ".xlsx": "spreadsheet", ".csv": "spreadsheet", ".numbers": "spreadsheet",
  ".ppt": "slide", ".pptx": "slide", ".key": "slide",
  ".zip": "archive", ".rar": "archive", ".7z": "archive", ".tar": "archive", ".gz": "archive", ".tgz": "archive",
  ".dmg": "installer", ".pkg": "installer", ".app": "installer", ".exe": "installer", ".msi": "installer",
  ".ts": "code", ".js": "code", ".mjs": "code", ".cjs": "code", ".py": "code", ".sh": "code",
  ".json": "code", ".html": "code", ".css": "code",
};

/** 中身のない残骸。名前だけで捨て候補と分かるもの。 */
const JUNK_NAMES: ReadonlySet<string> = new Set([
  ".DS_Store",
  "Thumbs.db",
  "desktop.ini",
  ".localized",
]);

/** 途中で止まったダウンロードや一時ファイル。 */
const JUNK_EXTENSIONS: ReadonlySet<string> = new Set([
  ".crdownload",
  ".part",
  ".partial",
  ".download",
  ".tmp",
  ".temp",
]);

export interface FileEntry {
  /** 絶対パス */
  path: string;
  /** ファイル名（拡張子込み） */
  name: string;
  /** バイト数 */
  size: number;
  /** 最終更新時刻（ミリ秒） */
  modifiedMs: number;
  /** フォルダなら true */
  isDirectory: boolean;
  /** シンボリックリンク・エイリアスなら true */
  isSymbolicLink: boolean;
}

export interface ClassifyOptions {
  /** 何日触られていないファイルを片づけるか */
  idleDays: number;
  /** フォルダごと整頓するか */
  includeFolders: boolean;
  /** 判定の基準時刻（ミリ秒） */
  nowMs: number;
}

export interface Classification {
  action: CleanupAction;
  category: CleanupCategory;
  /** 日本語の理由。ログとLINE通知にそのまま出す。 */
  reason: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function categoryOf(name: string, isDirectory: boolean): CleanupCategory {
  if (isDirectory) return "folder";
  const ext = path.extname(name).toLowerCase();
  return EXTENSION_CATEGORY[ext] ?? "other";
}

export function isJunkName(name: string): boolean {
  if (JUNK_NAMES.has(name)) return true;
  return JUNK_EXTENSIONS.has(path.extname(name).toLowerCase());
}

/** 何日置かれているか（切り捨て）。 */
export function idleDaysOf(entry: FileEntry, nowMs: number): number {
  return Math.floor(Math.max(0, nowMs - entry.modifiedMs) / DAY_MS);
}

/**
 * 1件の判定。迷ったら "keep"（触らない）に倒す。
 * 「動かさなかった」はやり直せるが、「動かした」は相手を驚かせる。
 */
export function classifyEntry(entry: FileEntry, opts: ClassifyOptions): Classification {
  const category = categoryOf(entry.name, entry.isDirectory);

  // エイリアス・シンボリックリンクは追いかけない。リンク先を巻き込む事故を避ける。
  if (entry.isSymbolicLink) {
    return { action: "keep", category, reason: "エイリアスのため触らない" };
  }

  // 隠しファイルは設定ファイルのことが多い。ゴミとして名前が分かっているものだけ拾う。
  if (entry.name.startsWith(".") && !isJunkName(entry.name)) {
    return { action: "keep", category, reason: "隠しファイルのため触らない" };
  }

  if (isJunkName(entry.name)) {
    return { action: "trash", category, reason: "システムの残骸・未完了ファイル" };
  }

  const idle = idleDaysOf(entry, opts.nowMs);
  if (idle < opts.idleDays) {
    return { action: "keep", category, reason: `作業中の可能性（${idle}日前に更新）` };
  }

  if (entry.isDirectory) {
    if (!opts.includeFolders) {
      return { action: "keep", category, reason: "フォルダは対象外（既定）" };
    }
    return { action: "organize", category, reason: `${idle}日触っていないフォルダ` };
  }

  if (entry.size === 0) {
    return { action: "trash", category, reason: "中身が空のファイル" };
  }

  return { action: "organize", category, reason: `${idle}日触っていない` };
}

/** 整頓先の相対パス。`2026/09/画像/写真.png` の形。 */
export function organizedRelativePath(
  entry: FileEntry,
  category: CleanupCategory,
  timeZone = "Asia/Tokyo",
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date(entry.modifiedMs));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return path.join(String(values.year), String(values.month), CATEGORY_FOLDER[category], entry.name);
}

/** ゴミ箱待ちの相対パス。日付フォルダに入れて、いつ入れたかを残す。 */
export function quarantineRelativePath(entry: FileEntry, dateJst: string): string {
  return path.join(dateJst, entry.name);
}
