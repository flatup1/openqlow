// 本体・保存・画面サーバー。AT-P4A-02/05/06/07/08、AT-P5-01/02/03、AT-P6 C1/C2、ARCHITECTURE.md §10
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FakeObs } from "../src/obs/fake_obs.mjs";
import { ObsAdapter } from "../src/obs/adapter.mjs";
import { EventOsApp } from "../src/server/app.mjs";
import { createHttpServer } from "../src/server/http.mjs";
import { EventLog, resolveDataDir, REPO_ROOT, logFileFor } from "../src/server/store.mjs";
import { HUMAN_ITEMS } from "../src/core/preflight.mjs";
import { exampleConfig, tempDir, until, wait, SAMPLE_CSV, TOOL_DIR } from "./helpers.mjs";

const FAST = { pollMs: 30, reconnectBaseMs: 20, reconnectMaxMs: 80, requestTimeoutMs: 300, connectTimeoutMs: 500, pendingMs: 1000, diskEveryTicks: 3 };
const cleanups = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()();
});

async function makeApp({ dataDir = tempDir(), config = exampleConfig() } = {}) {
  config.recording.minFreeGB = 1;
  const fake = new FakeObs({ password: "pw-123456" });
  const adapter = new ObsAdapter({ config, password: "pw-123456", WebSocketImpl: fake.webSocketClass(), timings: FAST, statfs: async () => ({ bavail: 500, bsize: 1024 ** 3 }) });
  const app = new EventOsApp({ config, dataDir, adapter, fake }).init();
  adapter.start();
  cleanups.push(() => adapter.stop());
  await until(() => adapter.state.connection.status === "ok" && adapter.state.cameras.main.status === "ok");
  return { app, fake, adapter, dataDir, config };
}

const OP = { role: "operator", device: "test" };
const EASY = { role: "easy", device: "test" };

async function ready(app) {
  await app.handle({ type: "load_card", args: { csv: SAMPLE_CSV }, expectedRev: app.state.rev }, OP);
  await app.handle({ type: "consent_ack" }, OP);
  for (const item of HUMAN_ITEMS) await app.handle({ type: "human_check", args: { item: item.id, checked: true } }, OP);
  await app.adapter.audioCheck(30);
}

const press = (app, type, args, auth = EASY, extra = {}) => app.handle({ type, args, expectedRev: app.state.rev, ...extra }, auth);

test("保存先：リポジトリの中は拒否する（選手名を誤ってコミットしないため）", () => {
  assert.throws(() => resolveDataDir(join(REPO_ROOT, "tools/uizin-event-os/runtime")), /リポジトリの中/);
  assert.throws(() => resolveDataDir(REPO_ROOT), /リポジトリの中/);
  assert.ok(resolveDataDir(tempDir()));
});

test("操作記録：追記して読み直せる。書き込み途中で落ちた最後の1行だけは読み飛ばす", () => {
  const file = logFileFor(tempDir(), "live");
  const log = new EventLog(file);
  log.append([{ type: "A" }, { type: "B" }]);
  appendFileSync(file, '{"seq":3,"type":"C"');
  const again = new EventLog(file);
  assert.deepEqual(again.events.map(event => event.type), ["A", "B"]);
  assert.equal(again.skipped, 1);
  writeFileSync(file, '{"seq":1}\nこわれた行\n{"seq":3}\n');
  assert.throws(() => new EventLog(file), /読めません/);
});

test("開始前チェックがそろえば始められ、大会開始で録画が自動で始まる", async () => {
  const { app, fake } = await makeApp();
  await ready(app);
  assert.equal(app.preflight().ready, true, app.preflight().blocking.join());
  assert.equal((await press(app, "start_event", {}, OP)).ok, true);
  await until(() => fake.record.active === true);
});

test("AT-P4A-06：2台から同じ版番号で同時に押しても、1回分しか進まない", async () => {
  const { app } = await makeApp();
  await ready(app);
  await press(app, "start_event", {}, OP);
  const rev = app.state.rev;
  const [first, second] = await Promise.all([
    app.handle({ type: "entrance", args: { corner: "red" }, expectedRev: rev }, { role: "easy", device: "ipad" }),
    app.handle({ type: "entrance", args: { corner: "red" }, expectedRev: rev }, { role: "easy", device: "mac" }),
  ]);
  assert.equal([first, second].filter(result => result.ok).length, 1);
  assert.equal([first, second].find(result => !result.ok).code, "stale");
  assert.equal(app.state.step, "entrance1");
});

test("AT-P4A-08：Event OS を作り直す（再起動）と、記録から同じ状態に戻る", async () => {
  const dataDir = tempDir();
  const first = await makeApp({ dataDir });
  await ready(first.app);
  await press(first.app, "start_event", {}, OP);
  await press(first.app, "entrance", { corner: "red" });
  await press(first.app, "entrance", { corner: "blue" });
  const before = first.app.state;
  first.adapter.stop();
  const second = await makeApp({ dataDir });
  assert.equal(second.app.state.step, before.step);
  assert.equal(second.app.state.rev, before.rev);
});

test("C1：サブ表示中にサブが映らなくなったら、自動でメインに戻す（逆向きには自動で戻さない）", async () => {
  const { app, fake } = await makeApp();
  await ready(app);
  await press(app, "start_event", {}, OP);
  await press(app, "camera", { to: "sub" });
  await until(() => fake.camItems[1].sceneItemEnabled === true);
  fake.setCamera("SUB", "dead");
  await until(() => app.state.camera === "main");
  await until(() => fake.camItems[1].sceneItemEnabled === false);
  const auto = app.log.events.filter(event => event.type === "CAMERA" && event.auto);
  assert.equal(auto.length, 1);
  fake.setCamera("SUB", "alive");
  await wait(200);
  assert.equal(app.state.camera, "main", "サブが戻っても自動ではサブにしない");
});

test("C2：メインが映らず、サブが映っていればサブを表示し、最優先で知らせる", async () => {
  const { app, fake } = await makeApp();
  await ready(app);
  await press(app, "start_event", {}, OP);
  fake.setCamera("MAIN", "dead");
  await until(() => app.state.camera === "sub");
  assert.ok(app.view("easy").alerts.some(alert => /メインカメラが映っていません/.test(alert.text)));
});

test("🛟安全運転：手動モードも解いて SAFE にし、止まっていた録画を始める。配信には触らない", async () => {
  const { app, fake, adapter } = await makeApp();
  await ready(app);
  await press(app, "start_event", {}, OP);
  await until(() => fake.record.active === true);
  fake.externalStopRecord();
  fake.humanSetScene("FIGHT");
  await until(() => adapter.state.manual === true);
  const before = fake.requestLog.length;
  await press(app, "safe_on");
  await until(() => fake.program === "SAFE");
  await until(() => fake.record.active === true);
  assert.equal(adapter.state.manual, false);
  assert.ok(!fake.requestLog.slice(before).some(entry => /Stream/.test(entry.requestType) && entry.requestType !== "GetStreamStatus"));
});

test("AT-P5-01：練習モードでは配信の操作を受け付けない。記録も本番と別", async () => {
  const { app, dataDir } = await makeApp();
  assert.equal((await press(app, "set_mode", { mode: "rehearsal" }, { role: "admin" }, { confirm: true })).ok, true);
  assert.equal(app.rehearsal, true);
  const result = await press(app, "stream_start", {}, OP, { confirm: true });
  assert.equal(result.ok, false);
  assert.match(result.message, /練習モード/);
  await press(app, "load_card", { csv: SAMPLE_CSV }, OP);
  assert.ok(existsSync(join(dataDir, "rehearsal.jsonl")));
  assert.ok(!existsSync(join(dataDir, "live.jsonl")) || !readFileSync(join(dataDir, "live.jsonl"), "utf8").includes("LOAD_CARD"));
});

test("AT-P5-03：危険な操作は運営モード＋確認が無いと動かない", async () => {
  const { app, fake } = await makeApp();
  for (const type of ["stream_start", "stream_stop", "stream_restart", "record_stop"]) {
    assert.equal((await press(app, type, {}, EASY, { confirm: true })).ok, false, `${type} かんたん`);
    assert.equal((await press(app, type, {}, OP)).code, "confirm", `${type} 確認なし`);
  }
  assert.equal(fake.stream.active, false);
  assert.equal((await press(app, "stream_start", {}, OP, { confirm: true })).ok, true);
  assert.equal(fake.stream.active, true);
  assert.ok(app.log.events.some(event => event.type === "OPERATOR_ACTION" && event.action === "stream_start"));
});

test("わざと壊す練習は、管理モードかつ練習モードのときだけ", async () => {
  const { app } = await makeApp();
  assert.equal((await press(app, "chaos", { kind: "sub_dead" }, { role: "admin" })).ok, false);
  await press(app, "set_mode", { mode: "rehearsal" }, { role: "admin" }, { confirm: true });
  assert.equal((await press(app, "chaos", { kind: "sub_dead" }, OP)).ok, false);
  assert.equal((await press(app, "chaos", { kind: "sub_dead" }, { role: "admin" })).ok, true);
});

test("書き出し：チャプター・結果・切り抜き用ファイルを、保存先の中に作る", async () => {
  const { app, fake, dataDir } = await makeApp();
  await ready(app);
  await press(app, "start_event", {}, OP);
  await until(() => fake.record.active === true);
  await press(app, "stream_start", {}, OP, { confirm: true });
  for (const [type, args] of [["entrance", { corner: "red" }], ["entrance", { corner: "blue" }], ["fight_start"], ["fight_end"], ["result", { winner: "red" }]]) {
    await press(app, type, args);
    await wait(20);
  }
  await until(() => app.state.recordings.length > 0 && app.state.streams.length > 0);
  const result = await press(app, "export", {}, OP);
  assert.equal(result.ok, true);
  const dir = join(dataDir, "exports", readdirSync(join(dataDir, "exports"))[0]);
  assert.ok(existsSync(join(dir, "results.csv")));
  assert.ok(existsSync(join(dir, "clipper", "01", "segments.json")));
  const manifest = JSON.parse(readFileSync(join(dir, "clipper", "01", "segments.json"), "utf8"));
  assert.equal(manifest.version, 1);
  assert.equal(manifest.segments[0].index, 1);
});

// ---- 画面サーバー ----

async function serve() {
  const made = await makeApp();
  const server = createHttpServer({ app: made.app, uiDir: join(TOOL_DIR, "src/ui"), token: "a".repeat(24), pins: { operator: "2468", admin: "135790" } });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { ...made, base };
}

test("画面のファイルを、安全なヘッダー付きで返す", async () => {
  const { base } = await serve();
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-security-policy"), /default-src 'self'/);
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  assert.match(await res.text(), /UIZIN Event OS/);
});

test("命令：JSON だけ。ほかのページ（Origin 違い）からは受け付けない", async () => {
  const { base, app } = await serve();
  const post = (headers, body = { type: "safe_on" }) => fetch(`${base}/api/command`, { method: "POST", headers, body: JSON.stringify(body) });
  assert.equal((await post({ "content-type": "text/plain" })).status, 415);
  assert.equal((await post({ "content-type": "application/json", origin: "http://evil.example" })).status, 403);
  assert.equal((await post({ "content-type": "application/json", "sec-fetch-site": "cross-site" })).status, 403);
  const ok = await post({ "content-type": "application/json", origin: base });
  assert.equal(ok.status, 200);
  assert.equal(app.state.safe, true);
});

test("PIN：運営/管理の見分け。何度も間違えたら、しばらく受け付けない", async () => {
  const { base } = await serve();
  const view = pin => fetch(`${base}/api/view`, { headers: pin ? { "x-eos-pin": pin } : {} });
  assert.equal((await (await view()).json()).view.role, "easy");
  assert.equal((await (await view("2468")).json()).view.role, "operator");
  assert.equal((await (await view("135790")).json()).view.role, "admin");
  for (let index = 0; index < 5; index += 1) assert.equal((await view("0000")).status, 403);
  const lockedRes = await view("2468");
  assert.equal(lockedRes.status, 403);
  assert.match((await lockedRes.json()).message, /しばらく/);
});

test("かんたん画面には、運営・管理の情報（PIN・URL・合言葉）が入らない", async () => {
  const { base } = await serve();
  const text = await (await fetch(`${base}/api/view`)).text();
  assert.doesNotMatch(text, /2468|135790|aaaaaaaaaaaaaaaaaaaaaaaa|lanUrls/);
});

test("SSE：変化があれば知らせる", async () => {
  const { base, app } = await serve();
  const controller = new AbortController();
  const res = await fetch(`${base}/api/events`, { signal: controller.signal });
  const reader = res.body.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.match(first, /event: change/);
  app.handle({ type: "safe_on" }, EASY);
  const next = new TextDecoder().decode((await reader.read()).value);
  assert.match(next, /event: change/);
  controller.abort();
});
