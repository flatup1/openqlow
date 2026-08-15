// テストランナーの回帰テスト。
// 一番守りたいのは「1本落ちても最後まで走り、落ちたものを一覧で出す」こと。
// 使い捨ての package.json を作り、わざと失敗するテストを混ぜて確かめる。

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const runner = fileURLToPath(new URL("./run-tests.mjs", import.meta.url));
const fixtureDir = mkdtempSync(join(tmpdir(), "openqlow-run-tests-"));

function runRunner(args) {
  return spawnSync(process.execPath, [runner, `--package=${join(fixtureDir, "package.json")}`, ...args], {
    encoding: "utf8",
  });
}

try {
  writeFileSync(
    join(fixtureDir, "package.json"),
    JSON.stringify(
      {
        name: "fixture",
        private: true,
        scripts: {
          typecheck: "node -e \"process.exit(0)\"",
          // 実行順に意味がある。失敗を真ん中に置き、その後ろが走るかを見る。
          "test:line-first": "node -e \"console.log('src/line_bot/a.test.ts ok')\"",
          "test:line-broken": "node -e \"console.error('src/line_bot/b.test.ts 失敗しました'); process.exit(1)\"",
          "test:line-last": "node -e \"console.log('src/line_bot/c.test.ts ok')\"",
          "test:crm-only": "node -e \"console.log('src/crm/d.test.ts ok')\"",
          // グループ用ショートカットはランナー自身を呼ぶ。これを拾うと無限再帰する。
          "test:group:line": "node scripts/run-tests.mjs --group=line",
        },
      },
      null,
      2,
    ),
  );

  // 1) 失敗しても後続が走る。
  const all = runRunner(["--no-typecheck"]);
  assert.equal(all.status, 1, "失敗が1件でもあれば終了コードは1");
  assert.match(all.stdout, /OK   test:line-first/, "失敗より前のテストは走る");
  assert.match(all.stdout, /FAIL test:line-broken/, "失敗は FAIL と表示する");
  assert.match(all.stdout, /OK   test:line-last/, "失敗の後ろのテストも走る（これが今回の狙い）");
  assert.match(all.stdout, /OK   test:crm-only/, "別グループも走る");
  assert.match(all.stdout, /成功 3件 \/ 失敗 1件/, "件数を集計する");
  assert.match(all.stdout, /失敗: test:line-broken/, "落ちたテスト名を一覧に出す");
  assert.match(all.stdout, /失敗しました/, "落ちたテストの出力を最後にまとめて出す");
  assert.doesNotMatch(all.stdout, /test:group:line/, "ランナー自身を呼ぶスクリプトは拾わない（無限再帰を防ぐ）");

  // 2) --bail なら最初の失敗で止まる（従来どおりの動きも残す）。
  const bail = runRunner(["--no-typecheck", "--bail"]);
  assert.equal(bail.status, 1);
  assert.match(bail.stdout, /FAIL test:line-broken/);
  assert.doesNotMatch(bail.stdout, /test:line-last/, "--bail のときは後続を走らせない");
  assert.match(bail.stdout, /--bail のため途中で止めました。/);

  // 3) グループ指定はそのグループだけを走らせる。
  const crmOnly = runRunner(["--group=crm"]);
  assert.equal(crmOnly.status, 0, "crm グループは全部通る");
  assert.match(crmOnly.stdout, /OK   test:crm-only/);
  assert.doesNotMatch(crmOnly.stdout, /test:line-broken/, "他グループは走らせない");
  assert.doesNotMatch(crmOnly.stdout, /\[typecheck\]/, "グループ指定のときは typecheck を省く");

  // 4) グループ名の打ち間違いは黙って0本成功にせず、はっきり止める。
  const typo = runRunner(["--group=lien"]);
  assert.equal(typo.status, 2, "不明なグループは終了コード2");
  assert.match(typo.stderr, /不明なグループです: lien/);

  // 5) --list は分類を出すだけで、テストは走らせない。
  const list = runRunner(["--list"]);
  assert.equal(list.status, 0);
  assert.match(list.stdout, /\[line\].*3本/s);
  assert.doesNotMatch(list.stdout, /OK   test:/, "--list ではテストを実行しない");
  // 6) 本物の package.json のテストが1本残らずどれかのグループに入っていること。
  //    ここが崩れると、増やしたテストが誰にも実行されないまま残る。
  const realPackageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));
  const realScripts = JSON.parse(readFileSync(realPackageJsonPath, "utf8")).scripts;
  const expected = Object.entries(realScripts)
    .filter(([name]) => name.startsWith("test:"))
    .filter(([, command]) => !/run-tests\.mjs/.test(command) || /run-tests\.test\.mjs/.test(command))
    .map(([name]) => name);

  const realList = spawnSync(process.execPath, [runner, "--list"], { encoding: "utf8" });
  assert.equal(realList.status, 0);
  const listed = realList.stdout
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.startsWith("test:"));

  assert.deepEqual(
    [...listed].sort(),
    [...expected].sort(),
    "package.json の test:* とグループ分けの中身が一致しないといけない",
  );
  assert.equal(new Set(listed).size, listed.length, "同じテストが2つのグループに入ってはいけない");
} finally {
  rmSync(fixtureDir, { recursive: true, force: true });
}

console.log("run-tests runner tests passed");
