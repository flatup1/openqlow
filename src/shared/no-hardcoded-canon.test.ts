// A-6: 正本値の直書き禁止チェック。
//
// src/ と port/ を走査し、料金・住所・スケジュールの具体値が
// shared/canon.ts と port/aika/flatup_canon.ts 以外のファイルに
// 直書きされていないことを assert する。
//
// 除外ルール:
//   1. *.test.ts — テストデータ・ダミー値を意図的に含むため除外。
//   2. shared/canon.ts — 正本ファイル自身（定義元）。
//   3. port/aika/flatup_canon.ts — AIKA向け正規配布コピー（canon.ts と同期）。
//   4. コメント行（先頭が // の行）は人間向け説明で値を持ち得るため除外。

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "data", "logs", "reports"]);
const ALLOWED_FILES = new Set([
  path.join(repoRoot, "src", "shared", "canon.ts"),
  path.join(repoRoot, "port", "aika", "flatup_canon.ts"),
]);

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(full);
  }
}

const files: string[] = [];
walk(path.join(repoRoot, "src"), files);
walk(path.join(repoRoot, "port"), files);

// 正本から引いた「他のファイルに直書きしてはいけない」具体値。
// これらが出てきたら FLATUP_CANON を参照すべき。
const FORBIDDEN_LITERALS: ReadonlyArray<readonly [string, RegExp]> = [
  ["kids_price",    /7[,，]700/],
  ["women_price",   /8[,，]800/],
  ["men_price",     /9[,，]900/],
  ["address",       /成田市土屋516/],
  ["access_route",  /イオンモール行き/],
  ["kids_schedule", /火曜・木曜18:00/],
  ["ladies_schedule", /土曜14:00.*レディース|レディース.*土曜14:00|scheduleLadies.*14:00/],
];

const violations: string[] = [];

for (const f of files) {
  if (ALLOWED_FILES.has(f)) continue;

  const lines = readFileSync(f, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // コメント行は除外（正規表現の説明など）
    if (line.trimStart().startsWith("//")) continue;

    for (const [kind, re] of FORBIDDEN_LITERALS) {
      if (re.test(line)) {
        violations.push(`${path.relative(repoRoot, f)}:${i + 1} [${kind}] ${line.trim().slice(0, 80)}`);
      }
    }
  }
}

assert(
  violations.length === 0,
  `正本値の直書き検出 — FLATUP_CANON を参照してください:\n${violations.join("\n")}`,
);

console.log(`no-hardcoded-canon tests passed (scanned ${files.length} files, 0 violations)`);
