#!/usr/bin/env node
// テストをグループに分けて実行する。
//
// これまでは package.json の "test" が90本以上を && でつないでいたため、
// 1本落ちると残りが走らず、原因を1つずつ潰すのに毎回やり直しが必要だった。
// このランナーは失敗しても最後まで走り、落ちたものを一覧で見せる。
//
// 使い方:
//   node scripts/run-tests.mjs                 全グループ（typecheck 込み）
//   node scripts/run-tests.mjs --group=line    そのグループだけ
//   node scripts/run-tests.mjs --list          どのテストがどのグループに入るか確認
//   node scripts/run-tests.mjs --bail          最初の失敗で止める
//   node scripts/run-tests.mjs --no-typecheck  typecheck を省く

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// グループ名 → 担当領域。パスの前方一致で振り分ける。
// 上から順に見て、最初に一致したものを採用する。
const GROUP_RULES = [
  ["line", ["src/line_bot/", "src/approval/", "src/commands/"]],
  ["crm", ["src/crm/"]],
  ["aika", ["port/aika/", "src/aika/", "src/generators/"]],
  ["publish", ["src/publish/"]],
  ["ops", ["src/scheduler/", "src/keihi/", "scripts/"]],
  ["core", ["src/"]],
];

const GROUP_LABELS = {
  core: "土台（正本・安全・共通）",
  aika: "AIKA（守りの顧客対応）",
  line: "LINE窓口・承認",
  crm: "顧客台帳",
  publish: "発信・メディア",
  ops: "定時処理・経費・運用スクリプト",
};

const GROUP_ORDER = ["core", "aika", "line", "crm", "publish", "ops"];

function testTarget(command) {
  return command.match(/(?:src|scripts|port)\/[^\s]+/)?.[0] ?? "";
}

function classify(target) {
  for (const [group, prefixes] of GROUP_RULES) {
    if (prefixes.some(prefix => target.startsWith(prefix))) return group;
  }
  return "core";
}

function collectTests(packageJsonPath) {
  const { scripts } = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const grouped = new Map(GROUP_ORDER.map(group => [group, []]));
  const unclassified = [];

  for (const [name, command] of Object.entries(scripts)) {
    if (!name.startsWith("test:")) continue;
    // ランナー自身を呼ぶスクリプト（グループ用ショートカット）は除く。無限再帰を防ぐ。
    // ただしランナーのテスト（run-tests.test.mjs）は普通のテストとして走らせる。
    if (/run-tests\.mjs/.test(command) && !/run-tests\.test\.mjs/.test(command)) continue;

    const target = testTarget(command);
    if (!target) unclassified.push(name);
    grouped.get(classify(target)).push(name);
  }

  return { grouped, unclassified };
}

function parseArgs(argv) {
  const options = {
    groups: [],
    list: false,
    bail: false,
    typecheck: true,
    // 既定はこのリポジトリの package.json。ランナー自身のテストだけが差し替える。
    packageJsonPath: fileURLToPath(new URL("../package.json", import.meta.url)),
  };
  for (const arg of argv) {
    if (arg === "--list") options.list = true;
    else if (arg === "--bail") options.bail = true;
    else if (arg === "--no-typecheck") options.typecheck = false;
    else if (arg.startsWith("--package=")) {
      options.packageJsonPath = resolve(arg.slice("--package=".length));
    } else if (arg.startsWith("--group=")) {
      options.groups.push(...arg.slice("--group=".length).split(",").filter(Boolean));
    } else {
      console.error(`不明な引数です: ${arg}`);
      process.exit(2);
    }
  }
  return options;
}

function runStep(name, command, args, cwd) {
  const startedAt = Date.now();
  const result = spawnSync(command, args, { cwd, encoding: "utf8", shell: false });
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  const ok = result.status === 0;
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  console.log(`  ${ok ? "OK  " : "FAIL"} ${name} (${seconds}s)`);
  return { name, ok, output };
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const options = parseArgs(process.argv.slice(2));
const workingDir = dirname(options.packageJsonPath);
const { grouped, unclassified } = collectTests(options.packageJsonPath);

if (unclassified.length > 0) {
  console.log(`注意: 対象ファイルを読み取れず core に入れたテスト: ${unclassified.join(", ")}`);
}

if (options.list) {
  for (const group of GROUP_ORDER) {
    const names = grouped.get(group);
    console.log(`\n[${group}] ${GROUP_LABELS[group]} — ${names.length}本`);
    for (const name of names) console.log(`  ${name}`);
  }
  process.exit(0);
}

const unknownGroups = options.groups.filter(group => !GROUP_ORDER.includes(group));
if (unknownGroups.length > 0) {
  console.error(`不明なグループです: ${unknownGroups.join(", ")}`);
  console.error(`使えるグループ: ${GROUP_ORDER.join(", ")}`);
  process.exit(2);
}

const targetGroups = options.groups.length > 0 ? options.groups : GROUP_ORDER;
// グループ指定のときは typecheck を省く（CIでは専用ジョブが1回だけ実行する）。
const runTypecheck = options.typecheck && options.groups.length === 0;

const failures = [];
let passed = 0;
let bailed = false;

if (runTypecheck) {
  console.log("\n[typecheck]");
  const result = runStep("typecheck", npm, ["run", "typecheck"], workingDir);
  if (result.ok) passed += 1;
  else {
    failures.push(result);
    if (options.bail) bailed = true;
  }
}

for (const group of targetGroups) {
  if (bailed) break;
  const names = grouped.get(group);
  if (names.length === 0) continue;
  console.log(`\n[${group}] ${GROUP_LABELS[group]} — ${names.length}本`);
  for (const name of names) {
    const result = runStep(name, npm, ["run", name], workingDir);
    if (result.ok) passed += 1;
    else {
      failures.push(result);
      if (options.bail) {
        bailed = true;
        break;
      }
    }
  }
}

if (failures.length > 0) {
  console.log(`\n${"=".repeat(60)}\n失敗したテストの出力\n${"=".repeat(60)}`);
  for (const failure of failures) {
    console.log(`\n--- ${failure.name} ---`);
    console.log(failure.output.trimEnd().split("\n").slice(-40).join("\n"));
  }
}

console.log(`\n${"=".repeat(60)}`);
console.log(`成功 ${passed}件 / 失敗 ${failures.length}件`);
if (failures.length > 0) {
  console.log(`失敗: ${failures.map(failure => failure.name).join(", ")}`);
  console.log("1本だけ再実行するには: npm run <テスト名>");
}
if (bailed) console.log("--bail のため途中で止めました。");
console.log(`${"=".repeat(60)}`);

process.exit(failures.length > 0 ? 1 : 0);
