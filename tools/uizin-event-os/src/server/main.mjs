#!/usr/bin/env node
// UIZIN Event OS の起動口。
//   node tools/uizin-event-os/src/server/main.mjs            本番（設定ファイルを読む）
//   node tools/uizin-event-os/src/server/main.mjs --demo     体験モード（偽物のOBSで動く。OBS不要）
// 設定ファイル: --config <path> / 環境変数 EVENT_OS_CONFIG / ~/UIZIN-EventOS/config.json の順に探す。
// 秘密（OBSのパスワード・PIN）は設定ファイルと同じフォルダの secrets.env か環境変数から読む。画面とログには出さない。

import { existsSync, readFileSync } from "node:fs";
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
  config.eventName = `${config.eventName}（体験）`;
  config.dataDir = "~/UIZIN-EventOS/demo";
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

// secrets.env（KEY=VALUE の行）を読む。すでにある環境変数は上書きしない。
const secretsFile = join(dirname(configPath), "secrets.env");
if (existsSync(secretsFile)) {
  for (const line of readFileSync(secretsFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

let dataDir;
try {
  dataDir = resolveDataDir(config.dataDir ?? "~/UIZIN-EventOS/data");
} catch (error) {
  fail(error.message);
}

const tokenFile = join(dataDir, "access_token");
let token = existsSync(tokenFile) ? readFileSync(tokenFile, "utf8").trim() : "";
if (!/^[0-9a-f]{24}$/.test(token)) {
  token = randomBytes(12).toString("hex");
  writeFileAtomic(tokenFile, token);
}

const pinFromEnv = name => (process.env[name] && /^\d{4,8}$/.test(process.env[name]) ? process.env[name] : null);
const operatorPin = pinFromEnv(config.pins?.operatorEnv ?? "EVENT_OS_OPERATOR_PIN") ?? String(randomInt(1000, 10000));
let adminPin = pinFromEnv(config.pins?.adminEnv ?? "EVENT_OS_ADMIN_PIN") ?? String(randomInt(100000, 1000000));
if (adminPin === operatorPin) adminPin = String(randomInt(100000, 1000000));

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
const app = new EventOsApp({ config, dataDir, adapter, fake, extras: { lanUrls } }).init();
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
  console.log(`   運営PIN: ${operatorPin}   管理PIN: ${adminPin}${process.env.EVENT_OS_OPERATOR_PIN ? "" : "（起動のたびに変わります。固定するなら secrets.env に書く）"}`);
  console.log("   止めるときは Ctrl + C");
  console.log("");
  adapter.start();
});

server.on("error", error => fail(`画面を開けませんでした（ポート ${port}）：${error.message}`));

const shutdown = () => {
  adapter.stop();
  server.close();
  setTimeout(() => process.exit(0), 300).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
