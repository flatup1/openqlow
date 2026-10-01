// 操作記録の保存（追記だけ）。1行1操作の JSON Lines。書き換え・削除の関数は持たない。
// 本番（live）と練習（rehearsal）は別ファイル。保存先はリポジトリの外に限る（選手の表示名を含むため）。
// 仕様: docs/uizin-event-os/ARCHITECTURE.md §3

import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export function expandHome(path) {
  return String(path).replace(/^~(?=$|\/)/, homedir());
}

// 保存先がリポジトリの中なら止める（誤ってコミットされるのを防ぐ）。
export function resolveDataDir(path, { repoRoot = REPO_ROOT } = {}) {
  if (!path) throw new Error("保存先（dataDir）が決まっていません");
  const target = resolve(expandHome(path));
  const root = resolve(repoRoot);
  if (target === root || target.startsWith(root + sep)) {
    throw new Error(`保存先がリポジトリの中です（${target}）。選手名を含むため、リポジトリの外にしてください`);
  }
  return target;
}

export class EventLog {
  constructor(file) {
    this.file = file;
    this.events = [];
    this.skipped = 0;
    mkdirSync(dirname(file), { recursive: true });
    if (existsSync(file)) this.load();
  }

  load() {
    const text = readFileSync(this.file, "utf8");
    const lines = text.split("\n");
    for (const [index, line] of lines.entries()) {
      if (!line.trim()) continue;
      try {
        this.events.push(JSON.parse(line));
      } catch {
        // 書き込み途中で落ちた最後の1行だけは読み飛ばす。それ以外の壊れは止める。
        if (index >= lines.length - 2) {
          this.skipped += 1;
          continue;
        }
        throw new Error(`操作記録の ${index + 1} 行目が読めません（${this.file}）`);
      }
    }
  }

  nextSeq() {
    const last = this.events[this.events.length - 1];
    return last ? last.seq + 1 : 1;
  }

  // 1件ずつ書いて fsync する（落ちても、書いた分は残す）。
  append(entries) {
    const written = [];
    const fd = openSync(this.file, "a");
    try {
      for (const entry of entries) {
        const event = { seq: this.nextSeq(), ...entry };
        writeSync(fd, `${JSON.stringify(event)}\n`);
        this.events.push(event);
        written.push(event);
      }
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    return written;
  }

  find(seq) {
    return this.events.find(event => event.seq === seq);
  }
}

// 小さな設定値を原子的に書く（書き途中で落ちても壊れない）。
export function writeFileAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}`;
  writeFileSync(temp, text);
  renameSync(temp, file);
}

export function logFileFor(dataDir, mode) {
  return join(dataDir, mode === "rehearsal" ? "rehearsal.jsonl" : "live.jsonl");
}
