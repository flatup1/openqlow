#!/usr/bin/env node
// UIZIN Event OS の起動口。
//   node tools/uizin-event-os/src/server/main.mjs            本番（設定ファイルを読む）
//   node tools/uizin-event-os/src/server/main.mjs --demo     体験モード（偽物のOBSで動く。OBS不要）
// 設定ファイル: --config <path> / 環境変数 EVENT_OS_CONFIG / ~/UIZIN-EventOS/config.json の順に探す。
// 秘密（OBSのパスワード・PIN）は設定ファイルと同じフォルダの secrets.env か環境変数から読む。画面とログには出さない。

import { chmodSync, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { networkInterfaces } from "node:os";
import { randomBytes, randomInt } from "node:crypto";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ObsAdapter } from "../obs/adapter.mjs";
import { FakeObs } from "../obs/fake_obs.mjs";
import { EventOsApp } from "./app.mjs";
import { createHttpServer } from "./http.mjs";
import { expandHome, resolveDataDir, writeFileAtomic } from "./store.mjs";
import { parseSecretsEnv, readPin } from "./secrets.mjs";

// 作るファイル（選手の表示名を含む記録・書き出し・合言葉）は、このMacの自分のアカウントだけが読めるようにする。
process.umask(0o077);

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = resolve(HERE, "../..");

function fail(message) {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const major = Number(process.versions.node.split(".")[0]);
if (major < 22 || typeof globalThis.WebSocket !== "function") {
  fail(`Node.js 22 以上が必要です（今は ${process.versions.node}）。https://nodejs.org から入れてください`);
}

const demo = process.argv.includes("--demo");
const configPath = resolve(expandHome(argValue("--config") ?? process.env.EVENT_OS_CONFIG ?? "~/UIZIN-EventOS/config.json"));

let config;
if (existsSync(configPath)) {
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    fail(`設定ファイルが読めません（${configPath}）：${error.message}`);
  }
} else if (demo) {
  config = JSON.parse(readFileSync(join(TOOL_DIR, "config.example.json"), "utf8"));
} else {
  fail(
    [
      `設定ファイルがありません（${configPath}）。`,
      "  1. tools/uizin-event-os/config.example.json を ~/UIZIN-EventOS/config.json にコピー",
      "  2. 大会名などを書きかえる",
      "  3. もう一度起動する",
      "OBSなしで試すだけなら --demo を付けて起動してください。",
    ].join("\n"),
  );
}

// 体験モードは、本番の設定ファイルがあっても必ず別の保存先を使う（本番の記録に混ぜない）。
if (demo) {
  config.eventName = `${config.eventName ?? "UIZIN"}（体験）`;
  config.dataDir = "~/UIZIN-EventOS/demo";
}

// secrets.env（KEY=VALUE の行）を読む。すでにある環境変数は上書きしない。
// パスワードと PIN が入っているので、自分のアカウントだけが読めるようにしておく。
const secretsFile = join(dirname(configPath), "secrets.env");
if (existsSync(secretsFile)) {
  try {
    if (statSync(secretsFile).mode & 0o077) chmodSync(secretsFile, 0o600);
  } catch {
    /* 直せなくても読む */
  }
  for (const [key, value] of Object.entries(parseSecretsEnv(readFileSync(secretsFile, "utf8")))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

let dataDir;
try {
  dataDir = resolveDataDir(config.dataDir ?? "~/UIZIN-EventOS/data");
} catch (error) {
  fail(error.message);
}

try {
  chmodSync(dataDir, 0o700);
} catch {
  /* まだ無ければ、作るときに自分だけのフォルダになる */
}

// iPad 用の合言葉。大会の途中で起動し直しても同じものを使う（iPad が開き直さなくて済む）。
// ただし作ってから48時間たったら新しくする（前の大会で開いた端末が、次の大会でそのまま使えないように）。
const TOKEN_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const tokenFile = join(dataDir, "access_token");
let token = existsSync(tokenFile) ? readFileSync(tokenFile, "utf8").trim() : "";
const tokenOld = existsSync(tokenFile) && Date.now() - statSync(tokenFile).mtimeMs > TOKEN_MAX_AGE_MS;
if (!/^[0-9a-f]{24}$/.test(token) || tokenOld) {
  token = randomBytes(12).toString("hex");
  writeFileAtomic(tokenFile, token);
}

// PIN は secrets.env か環境変数から。書いてあるのに使えない形なら、そのことをはっきり伝える（黙って別の PIN にしない）。
const pinNotes = [];
const pinFrom = (name, label) => {
  const result = readPin(process.env[name]);
  if (result.problem) pinNotes.push(`⚠️ ${name}（${label}）が使えません：${result.problem}。今回だけの PIN にしました`);
  return result.pin;
};
const operatorFixed = pinFrom(config.pins?.operatorEnv ?? "EVENT_OS_OPERATOR_PIN", "運営PIN");
const adminFixed = pinFrom(config.pins?.adminEnv ?? "EVENT_OS_ADMIN_PIN", "管理PIN");
const operatorPin = operatorFixed ?? String(randomInt(1000, 10000));
let adminPin = adminFixed ?? String(randomInt(100000, 1000000));
if (adminPin === operatorPin) {
  if (adminFixed) pinNotes.push("⚠️ 管理PINが運営PINと同じなので、管理PINを今回だけのものにしました");
  adminPin = String(randomInt(100000, 1000000));
}

let fake = null;
let WebSocketImpl = globalThis.WebSocket;
let password = process.env[config.obs?.passwordEnv ?? "EVENT_OS_OBS_PASSWORD"] ?? "";
if (demo) {
  password = randomBytes(8).toString("hex");
  fake = new FakeObs({ password, recordDirectory: dataDir });
  WebSocketImpl = fake.webSocketClass();
}

const port = Number(config.server?.port ?? 8787);
const host = config.server?.host ?? "0.0.0.0";
const lanUrls = Object.values(networkInterfaces())
  .flat()
  .filter(item => item && item.family === "IPv4" && !item.internal)
  .map(item => `http://${item.address}:${port}/?t=${token}`);

const adapter = new ObsAdapter({ config, password, WebSocketImpl });
let app;
try {
  app = new EventOsApp({ config, dataDir, adapter, fake, extras: { lanUrls } }).init();
} catch (error) {
  fail(`操作の記録を読めませんでした：${error.message}\n   記録のファイルは消さずに、運営の人を呼んでください（OBS の録画は続いています）`);
}
const server = createHttpServer({ app, uiDir: join(TOOL_DIR, "src/ui"), token, pins: { operator: operatorPin, admin: adminPin } });

if (process.platform === "darwin") {
  const probe = () =>
    execFile("pmset", ["-g", "batt"], (error, stdout) => {
      if (error) return;
      const onAC = /AC Power/.test(stdout) ? true : /Battery Power/.test(stdout) ? false : null;
      app.setPower({ onAC, checkedAt: Date.now() });
    });
  probe();
  setInterval(probe, 60_000).unref();
}

server.listen(port, host, () => {
  console.log("");
  console.log(`✅ UIZIN Event OS を起動しました${demo ? "（体験モード：偽物のOBSで動いています）" : ""}`);
  console.log(`   大会名: ${config.eventName ?? "UIZIN"}`);
  console.log(`   保存先: ${dataDir}`);
  console.log("");
  console.log(`   このMacで開く:  http://localhost:${port}/`);
  for (const url of lanUrls) console.log(`   iPad等で開く:   ${url}`);
  console.log("");
  const fixed = operatorFixed && adminPin === adminFixed;
  console.log(`   運営PIN: ${operatorPin}   管理PIN: ${adminPin}${fixed ? "" : "（起動のたびに変わります。固定するなら secrets.env に書く）"}`);
  for (const note of pinNotes) console.log(`   ${note}`);
  console.log("   止めるときは Ctrl + C");
  console.log("");
  adapter.start();
});

server.on("error", error => fail(`画面を開けませんでした（ポート ${port}）：${error.message}`));

// 想定外の失敗でも、Event OS は止めない（OBS の映像と録画は Event OS が止まっても続くが、画面は使えなくなるため）。
process.on("unhandledRejection", error => console.error(`⚠️ 想定外のエラー（動作は続けます）：${error?.message ?? error}`));
process.on("uncaughtException", error => console.error(`⚠️ 想定外のエラー（動作は続けます）：${error?.message ?? error}`));

const shutdown = () => {
  adapter.stop();
  server.close();
  setTimeout(() => process.exit(0), 300).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
