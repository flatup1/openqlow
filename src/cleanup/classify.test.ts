import assert from "node:assert/strict";
import {
  CATEGORY_FOLDER,
  categoryOf,
  classifyEntry,
  idleDaysOf,
  isJunkName,
  organizedRelativePath,
  quarantineRelativePath,
  type FileEntry,
} from "./classify.js";

const NOW = Date.parse("2026-09-01T00:00:00+09:00");
const DAY = 24 * 60 * 60 * 1000;
const OPTIONS = { idleDays: 1, includeFolders: false, nowMs: NOW };

function entry(overrides: Partial<FileEntry> & { name: string }): FileEntry {
  return {
    path: `/Users/test/Desktop/${overrides.name}`,
    size: 1024,
    modifiedMs: NOW - 5 * DAY,
    isDirectory: false,
    isSymbolicLink: false,
    ...overrides,
  };
}

// 拡張子から種類が決まる。知らない拡張子は「その他」。
{
  assert.equal(categoryOf("写真.PNG", false), "image");
  assert.equal(categoryOf("契約.pdf", false), "document");
  assert.equal(categoryOf("売上.xlsx", false), "spreadsheet");
  assert.equal(categoryOf("体験.mp4", false), "video");
  assert.equal(categoryOf("なぞ.qqq", false), "other");
  assert.equal(categoryOf("素材", true), "folder");
  assert.equal(CATEGORY_FOLDER.image, "画像");
}

// 名前だけでゴミと分かるもの。
{
  assert.equal(isJunkName(".DS_Store"), true);
  assert.equal(isJunkName("動画.mp4.crdownload"), true);
  assert.equal(isJunkName("メモ.tmp"), true);
  assert.equal(isJunkName("大事な資料.pdf"), false);
}

// 置かれた日数は切り捨て。
{
  assert.equal(idleDaysOf(entry({ name: "a.pdf", modifiedMs: NOW - 3 * DAY - 1000 }), NOW), 3);
  assert.equal(idleDaysOf(entry({ name: "a.pdf", modifiedMs: NOW + DAY }), NOW), 0, "未来の日付でも壊れない");
}

// 残骸はゴミ箱待ちへ。まだ消さない。
{
  const result = classifyEntry(entry({ name: ".DS_Store", modifiedMs: NOW }), OPTIONS);
  assert.equal(result.action, "trash");
}

// 中身が空のファイルもゴミ箱待ちへ。ただし放置日数を過ぎてから。
{
  assert.equal(classifyEntry(entry({ name: "空.txt", size: 0 }), OPTIONS).action, "trash");
  assert.equal(
    classifyEntry(entry({ name: "空.txt", size: 0, modifiedMs: NOW }), OPTIONS).action,
    "keep",
    "作ったばかりの空ファイルには触らない",
  );
}

// 今日さわったファイルは作業中かもしれない。触らない。
{
  const result = classifyEntry(entry({ name: "作業中.pdf", modifiedMs: NOW - 1000 }), OPTIONS);
  assert.equal(result.action, "keep");
  assert.match(result.reason, /作業中/);
}

// 放置されたファイルは整頓へ。
{
  const result = classifyEntry(entry({ name: "写真.png" }), OPTIONS);
  assert.equal(result.action, "organize");
  assert.equal(result.category, "image");
}

// 隠しファイルは設定ファイルのことが多い。ゴミと分かっているもの以外は触らない。
{
  assert.equal(classifyEntry(entry({ name: ".zshrc" }), OPTIONS).action, "keep");
  assert.equal(classifyEntry(entry({ name: ".env" }), OPTIONS).action, "keep");
}

// エイリアスは追いかけない。
{
  const result = classifyEntry(entry({ name: "近道", isSymbolicLink: true }), OPTIONS);
  assert.equal(result.action, "keep");
  assert.match(result.reason, /エイリアス/);
}

// フォルダは既定では対象外。明示したときだけ整頓する。
{
  const folder = entry({ name: "素材", isDirectory: true });
  assert.equal(classifyEntry(folder, OPTIONS).action, "keep");
  assert.equal(classifyEntry(folder, { ...OPTIONS, includeFolders: true }).action, "organize");
}

// 整頓先は「年 / 月 / 種類 / ファイル名」。更新日を基準にする。
{
  const file = entry({ name: "写真.png", modifiedMs: Date.parse("2026-07-15T12:00:00+09:00") });
  assert.equal(organizedRelativePath(file, "image"), "2026/07/画像/写真.png");
  assert.equal(quarantineRelativePath(file, "2026-09-01"), "2026-09-01/写真.png");
}

// 月末深夜の日本時間でも、月がずれない（UTCだと前月になる時刻）。
{
  const file = entry({ name: "深夜.png", modifiedMs: Date.parse("2026-08-01T00:30:00+09:00") });
  assert.equal(organizedRelativePath(file, "image"), "2026/08/画像/深夜.png");
}

console.log("cleanup classify tests passed");
