// 操作記録の保存（追記だけ）。1行1操作の JSON Lines。書き換え・削除の関数は持たない。
// 本番（live）と練習（rehearsal）は別ファイル。保存先はリポジトリの外に限る（選手の表示名を含むため）。
// 仕様: docs/uizin-event-os/ARCHITECTURE.md §3

import { closeSync, existsSync, fstatSync, fsyncSync, ftruncateSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, writeSync, writeFileSync, renameSync, truncateSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export function expandHome(path) {
  return String(path).replace(/^~(?=$|\/)/, homedir());
}

// まだ無いフォルダも含めて、シンボリックリンクをたどった本当の場所を求める（あるところまでを realpath にする）。
function realLocation(path) {
  let head = resolve(path);
  const rest = [];
  for (;;) {
    try {
      return join(realpathSync(head), ...rest);
    } catch {
      const parent = dirname(head);
      if (parent === head) return resolve(path);
      rest.unshift(basename(head));
      head = parent;
    }
  }
}

// 保存先がリポジトリの中なら止める（誤ってコミットされるのを防ぐ）。
// シンボリックリンク経由や、Mac で大文字・小文字だけ違う書き方でも、リポジトリの中なら止める。
export function resolveDataDir(path, { repoRoot = REPO_ROOT, caseInsensitive = process.platform === "darwin" || process.platform === "win32" } = {}) {
  if (!path) throw new Error("保存先（dataDir）が決まっていません");
  const target = resolve(expandHome(path));
  const fold = value => (caseInsensitive ? value.toLowerCase() : value);
  const real = fold(realLocation(target));
  const root = fold(realLocation(repoRoot));
  if (real === root || real.startsWith(root + sep)) {
    throw new Error(`保存先がリポジトリの中です（${target}）。選手名を含むため、リポジトリの外にしてください`);
  }
  return target;
}

export class EventLog {
  constructor(file) {
    this.file = file;
    this.events = [];
    this.skipped = 0;
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    if (existsSync(file)) this.load();
  }

  load() {
    const buffer = readFileSync(this.file);
    // 書き込み途中で落ちると、最後の行が改行なしで途中まで残る。そのかけらは切り取ってから読む
    // （残したまま追記すると、次の行とくっついて記録が壊れるため）。
    const end = buffer.lastIndexOf(0x0a) + 1;
    if (end < buffer.length) {
      if (buffer.subarray(end).toString("utf8").trim()) this.skipped += 1;
      truncateSync(this.file, end);
    }
    const lines = buffer.subarray(0, end).toString("utf8").split("\n");
    for (const [index, line] of lines.entries()) {
      if (!line.trim()) continue;
      try {
        this.events.push(JSON.parse(line));
      } catch {
        throw new Error(`操作記録の ${index + 1} 行目が読めません（${this.file}）`);
      }
    }
  }

  nextSeq() {
    const last = this.events[this.events.length - 1];
    return last ? last.seq + 1 : 1;
  }

  // まとめて書いて fsync する。書けなかったら、途中まで書いたかけらを切り取ってから失敗を返す
  // （かけらが残ると次の記録とくっついて、次に起動できなくなるため。容量不足のときに起きる）。
  append(entries) {
    const first = this.nextSeq();
    const events = entries.map((entry, index) => ({ seq: first + index, ...entry }));
    const bytes = Buffer.from(events.map(event => `${JSON.stringify(event)}\n`).join(""), "utf8");
    const fd = openSync(this.file, "a+", 0o600);
    let start = null;
    try {
      start = repairTail(fd);
      // 一度で全部書けないこともあるので、書き切るまで続ける。
      let offset = 0;
      while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
      fsyncSync(fd);
    } catch (error) {
      if (start !== null) {
        try {
          ftruncateSync(fd, start);
        } catch {
          /* 切り取れなくても、次に書く前と次に読むときに直す */
        }
      }
      throw error;
    } finally {
      closeSync(fd);
    }
    this.events.push(...events);
    return events;
  }

  find(seq) {
    return this.events.find(event => event.seq === seq);
  }
}

// 最後が改行で終わっていなければ（前に書きかけで失敗した）、最後の改行までに切り詰める。書き始める位置を返す。
function repairTail(fd) {
  const size = fstatSync(fd).size;
  if (size === 0) return 0;
  const last = Buffer.alloc(1);
  readSync(fd, last, 0, 1, size - 1);
  if (last[0] === 0x0a) return size;
  const all = Buffer.alloc(size);
  let read = 0;
  while (read < size) read += readSync(fd, all, read, size - read, read);
  const end = all.lastIndexOf(0x0a) + 1;
  ftruncateSync(fd, end);
  return end;
}

// 小さな設定値を原子的に書く（書き途中で落ちても壊れない）。
export function writeFileAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.tmp-${process.pid}`;
  writeFileSync(temp, text, { mode: 0o600 });
  renameSync(temp, file);
}

export function logFileFor(dataDir, mode) {
  return join(dataDir, mode === "rehearsal" ? "rehearsal.jsonl" : "live.jsonl");
}
