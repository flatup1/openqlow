// 保存・秘密・起動まわり（容量不足での書きかけ・リポジトリの中への保存・ファイルの読める人・PIN・合言葉）。
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs, { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { EventLog, resolveDataDir, REPO_ROOT, logFileFor } from "../src/server/store.mjs";
import { parseSecretsEnv, readPin } from "../src/server/secrets.mjs";
import { EventOsApp } from "../src/server/app.mjs";
import { exampleConfig, tempDir, until, TOOL_DIR } from "./helpers.mjs";

const cleanups = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()();
});

test("容量不足で書きかけになっても、かけらを残さない（次の記録とくっついて起動できなくなるのを防ぐ）", () => {
  const file = logFileFor(tempDir(), "live");
  const log = new EventLog(file);
  log.append([{ type: "A" }, { type: "B" }]);
  const before = readFileSync(file, "utf8");
  const original = fs.writeSync;
  let calls = 0;
  fs.writeSync = (fd, buffer, offset, length, ...rest) => {
    calls += 1;
    if (calls === 1) return original(fd, buffer, offset, Math.min(length, 10), ...rest);
    throw Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" });
  };
  syncBuiltinESMExports();
  try {
    assert.throws(() => log.append([{ type: "C" }]), /ENOSPC/);
  } finally {
    fs.writeSync = original;
    syncBuiltinESMExports();
  }
  assert.equal(readFileSync(file, "utf8"), before, "書きかけのかけらは切り取る");
  assert.deepEqual(log.events.map(event => event.type), ["A", "B"]);
  // 空きができたら、続きから正しく書ける。起動し直しても読める。
  log.append([{ type: "D" }]);
  assert.deepEqual(new EventLog(file).events.map(event => [event.seq, event.type]), [[1, "A"], [2, "B"], [3, "D"]]);
});

test("前に書きかけのかけらが残っていても、次に書く前に切り取る", () => {
  const file = logFileFor(tempDir(), "live");
  const log = new EventLog(file);
  log.append([{ type: "A" }]);
  appendFileSync(file, '{"seq":2,"type":"か');
  log.append([{ type: "B" }]);
  assert.deepEqual(new EventLog(file).events.map(event => event.type), ["A", "B"]);
});

test("保存先：シンボリックリンク経由でも、リポジトリの中なら止める", () => {
  const link = join(tempDir(), "into-repo");
  symlinkSync(join(REPO_ROOT, "tools"), link);
  assert.throws(() => resolveDataDir(join(link, "data")), /リポジトリの中/);
  assert.throws(() => resolveDataDir(join(link, "まだ無い", "data")), /リポジトリの中/);
});

test("保存先：Mac のように大文字・小文字を区別しない場所では、書き方の違いでも止める", () => {
  const upper = REPO_ROOT.toUpperCase();
  assert.throws(() => resolveDataDir(join(upper, "data"), { caseInsensitive: true }), /リポジトリの中/);
  assert.ok(resolveDataDir(join(tempDir(), "data"), { caseInsensitive: true }));
});

test("保存先のフォルダは、自分のアカウントだけが開ける", () => {
  const dataDir = join(tempDir(), "data");
  mkdirSync(dataDir, { mode: 0o755 });
  const adapter = { on() {}, snapshot: () => ({}), setDesired() {} };
  new EventOsApp({ config: exampleConfig(), dataDir, adapter }).init();
  assert.equal(statSync(dataDir).mode & 0o777, 0o700);
});

test("secrets.env：export・コメント・対になった引用符・CRLF・BOM を受け入れる", () => {
  const text = "﻿# メモ\r\nexport EVENT_OS_OPERATOR_PIN=2468  # 運営\r\nEVENT_OS_ADMIN_PIN = '135790'\r\nEVENT_OS_OBS_PASSWORD=\"pw test only\"\r\nOTHER=ends-with-quote'\r\n";
  assert.deepEqual(parseSecretsEnv(text), {
    EVENT_OS_OPERATOR_PIN: "2468",
    EVENT_OS_ADMIN_PIN: "135790",
    EVENT_OS_OBS_PASSWORD: "pw test only",
    OTHER: "ends-with-quote'",
  });
});

test("PIN：全角数字は半角にする。使えない形なら理由を返す（黙って別の PIN にしない）", () => {
  assert.deepEqual(readPin("２４６８"), { pin: "2468", problem: null });
  assert.deepEqual(readPin(undefined), { pin: null, problem: null });
  assert.equal(readPin("12").pin, null);
  assert.match(readPin("12ab").problem, /4〜8桁/);
});

function startDemo(home, extraEnv = {}) {
  const config = exampleConfig();
  config.server.port = 0;
  config.server.host = "127.0.0.1";
  mkdirSync(join(home, "UIZIN-EventOS"), { recursive: true });
  const configPath = join(home, "UIZIN-EventOS", "config.json");
  writeFileSync(configPath, JSON.stringify(config));
  const child = spawn(process.execPath, [join(TOOL_DIR, "src/server/main.mjs"), "--demo", "--config", configPath], {
    env: { ...process.env, HOME: home, EVENT_OS_OPERATOR_PIN: "", EVENT_OS_ADMIN_PIN: "", ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  cleanups.push(() => child.kill());
  const state = { output: "" };
  child.stdout.on("data", chunk => {
    state.output += chunk;
  });
  return state;
}

test("iPad 用の合言葉：起動し直しても同じ。ただし48時間たったら新しくする", async () => {
  const home = tempDir();
  const dir = join(home, "UIZIN-EventOS", "demo");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "access_token");
  writeFileSync(file, "0123456789abcdef01234567");
  let run = startDemo(home);
  await until(() => run.output.includes("保存先"), { timeoutMs: 8000 });
  assert.equal(readFileSync(file, "utf8").trim(), "0123456789abcdef01234567", "新しければ同じものを使う");
  cleanups.pop()();
  const old = (Date.now() - 49 * 60 * 60 * 1000) / 1000;
  utimesSync(file, old, old);
  run = startDemo(home);
  await until(() => run.output.includes("保存先"), { timeoutMs: 8000 });
  const renewed = readFileSync(file, "utf8").trim();
  assert.match(renewed, /^[0-9a-f]{24}$/);
  assert.notEqual(renewed, "0123456789abcdef01234567", "古ければ新しくする");
  assert.equal(statSync(file).mode & 0o077, 0, "合言葉は自分だけが読める");
});

test("secrets.env の PIN が使えない形なら、起動画面で名前を出して知らせる（値は出さない）", async () => {
  const home = tempDir();
  mkdirSync(join(home, "UIZIN-EventOS"), { recursive: true });
  writeFileSync(join(home, "UIZIN-EventOS", "secrets.env"), "EVENT_OS_OPERATOR_PIN=24-68\n", { mode: 0o644 });
  const run = startDemo(home, { EVENT_OS_OPERATOR_PIN: undefined });
  await until(() => run.output.includes("止めるときは"), { timeoutMs: 8000 });
  assert.match(run.output, /EVENT_OS_OPERATOR_PIN（運営PIN）が使えません/);
  assert.doesNotMatch(run.output, /24-68/);
  assert.match(run.output, /起動のたびに変わります/);
  assert.equal(statSync(join(home, "UIZIN-EventOS", "secrets.env")).mode & 0o077, 0, "secrets.env を自分だけが読めるようにする");
  assert.ok(existsSync(join(home, "UIZIN-EventOS", "demo")));
});

test("secrets.env：引用符で囲んだ値の後ろにコメントがあっても、値だけを読む", () => {
  assert.deepEqual(parseSecretsEnv('EVENT_OS_OBS_PASSWORD="ab #c"  # メモ\nEVENT_OS_OPERATOR_PIN="2468"  # 運営\n'), {
    EVENT_OS_OBS_PASSWORD: "ab #c",
    EVENT_OS_OPERATOR_PIN: "2468",
  });
});

test("大会が進行中なら、48時間たっていても合言葉を変えない（途中の再起動で iPad を締め出さない）", async () => {
  const home = tempDir();
  const dir = join(home, "UIZIN-EventOS", "demo");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "access_token");
  writeFileSync(file, "0123456789abcdef01234567");
  writeFileSync(join(dir, "live.jsonl"), `${JSON.stringify({ seq: 1, type: "START_EVENT", at: "2026-11-03T00:00:00.000Z", role: "operator", rev: 1 })}\n`);
  const old = (Date.now() - 49 * 60 * 60 * 1000) / 1000;
  utimesSync(file, old, old);
  const run = startDemo(home);
  await until(() => run.output.includes("保存先"), { timeoutMs: 8000 });
  assert.equal(readFileSync(file, "utf8").trim(), "0123456789abcdef01234567");
});
