// OBS 接続（偽物の OBS 相手）。AT-P1・AT-P2・AT-P3・AT-P5・AT-P6 の自動部分
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { FakeObs } from "../src/obs/fake_obs.mjs";
import { ObsClient, authString } from "../src/obs/protocol.mjs";
import { ObsAdapter } from "../src/obs/adapter.mjs";
import { allowedRequests, NEVER_REQUESTS } from "../src/obs/allowlist.mjs";
import { exampleConfig, until, wait } from "./helpers.mjs";

const FAST = { pollMs: 40, reconnectBaseMs: 20, reconnectMaxMs: 80, requestTimeoutMs: 300, connectTimeoutMs: 500, pendingMs: 1000, diskEveryTicks: 3 };

const started = [];
afterEach(() => {
  while (started.length) started.pop().stop();
});

function setup({ password = "pass-1234", config = exampleConfig(), fakeOptions = {} } = {}) {
  const fake = new FakeObs({ password, ...fakeOptions });
  const adapter = new ObsAdapter({ config, password, WebSocketImpl: fake.webSocketClass(), timings: FAST, statfs: async () => ({ bavail: 100, bsize: 1024 ** 3 }) });
  started.push(adapter);
  return { fake, adapter, config };
}

// 準備中につないでから、大会中に切り替える（ふつうの使い方）。
async function connectRunning(adapter, first) {
  adapter.setDesired(first, "setup");
  adapter.start();
  await until(() => adapter.state.connection.status === "ok" && adapter.state.program === first.programScene);
  adapter.setDesired(first, "running");
}

const desired = (scene, extra = {}) => ({ sceneKey: scene, programScene: scene, subVisible: false, texts: {}, mute: {}, ...extra });

test("認証：公式の手順どおりの文字列を作る", () => {
  // 同じ入力なら同じ結果。パスワードが変われば結果も変わる。
  assert.equal(authString("p", "salt", "ch"), authString("p", "salt", "ch"));
  assert.notEqual(authString("p", "salt", "ch"), authString("q", "salt", "ch"));
});

test("AT-P1-01/02：正しいパスワードならつながり、違えば「パスワードが違う」で止まる（文字列は出さない）", async () => {
  const fake = new FakeObs({ password: "right-pass" });
  const good = new ObsClient({ WebSocketImpl: fake.webSocketClass(), allowed: allowedRequests() });
  await good.connect("ws://fake", "right-pass");
  assert.equal(good.identified, true);
  good.close();

  const { adapter } = (() => {
    const config = exampleConfig();
    const wrong = new ObsAdapter({ config, password: "wrong-pass", WebSocketImpl: fake.webSocketClass(), timings: FAST });
    return { adapter: wrong };
  })();
  const seen = [];
  adapter.on("change", () => seen.push(JSON.stringify(adapter.snapshot())));
  adapter.start();
  await until(() => adapter.state.connection.reason === "auth");
  assert.match(adapter.state.connection.message, /パスワードが違います/);
  assert.ok(seen.every(text => !text.includes("wrong-pass") && !text.includes("right-pass")));
  adapter.stop();
});

test("AT-P1-08：許可リストに無い命令は、送る前に止める", async () => {
  const fake = new FakeObs({ password: "" });
  const client = new ObsClient({ WebSocketImpl: fake.webSocketClass(), allowed: allowedRequests(1) });
  await client.connect("ws://fake", "");
  await assert.rejects(client.request("StartStream"), /許可されていない命令/);
  await assert.rejects(client.request("GetStreamServiceSettings"), /許可されていない命令/);
  assert.ok(!fake.requestLog.some(entry => entry.requestType === "StartStream"));
  client.close();
  for (const name of NEVER_REQUESTS) assert.ok(!allowedRequests(99).has(name), name);
  assert.ok(!allowedRequests(1).has("StartStream"));
  assert.ok(!allowedRequests(4).has("StopRecord"), "Phase 5 まで録画停止は持たない");
  assert.ok(allowedRequests(5).has("StopStream"));
});

test("AT-P1-09：OBSが固まったら、命令は時間切れで終わり、待ちっぱなしにならない", async () => {
  const fake = new FakeObs({ password: "" });
  const client = new ObsClient({ WebSocketImpl: fake.webSocketClass(), allowed: allowedRequests(), timeoutMs: 100 });
  await client.connect("ws://fake", "");
  fake.hang(true);
  await assert.rejects(client.request("GetVersion"), /応答がありません/);
  client.close();
});

test("切断されたら、待っている命令はすべて失敗で終わる（待ちっぱなしにしない）", async () => {
  const fake = new FakeObs({ password: "" });
  const client = new ObsClient({ WebSocketImpl: fake.webSocketClass(), allowed: allowedRequests(), timeoutMs: 5000 });
  await client.connect("ws://fake", "");
  fake.hang(true);
  const pending = client.request("GetVersion");
  fake.crash();
  await assert.rejects(pending, /切れました/);
});

test("AT-P1-03：あるべき場面に合わせる。命令の結果の通知では手動モードにならない", async () => {
  const { fake, adapter } = setup();
  adapter.setDesired(desired("WAIT"), "running");
  adapter.start();
  await until(() => adapter.state.connection.status === "ok" && fake.program === "WAIT");
  for (const scene of ["FIGHTER", "FIGHT", "WINNER", "SAFE", "WAIT"]) {
    adapter.setDesired(desired(scene), "running");
    await until(() => fake.program === scene);
  }
  await wait(100);
  assert.equal(adapter.state.manual, false);
  adapter.stop();
});

test("AT-P1-04：OBSに無い場面は、落ちずに「無い」と記録する", async () => {
  const { adapter } = setup({ fakeOptions: { scenes: ["WAIT", "FIGHT"] } });
  adapter.setDesired(desired("WINNER"), "running");
  adapter.start();
  await until(() => adapter.state.sceneMissing === "WINNER");
  adapter.stop();
});

test("AT-P1-07：人がOBSで場面を変えたら手動モード。自動では上書きしない。「自動に戻す」で再開", async () => {
  const { fake, adapter } = setup();
  await connectRunning(adapter, desired("FIGHT"));
  await until(() => fake.program === "FIGHT");
  await wait(60);
  fake.humanSetScene("SAFE");
  await until(() => adapter.state.manual === true);
  adapter.setDesired(desired("WINNER"), "running");
  await wait(200);
  assert.equal(fake.program, "SAFE", "手動モード中は場面を変えない");
  await adapter.resumeAuto();
  await until(() => fake.program === "WINNER");
  adapter.stop();
});

test("AT-P1-05/06・C4：OBSが落ちたら未確認になり、起動し直したら自動でつなぎ直して場面を合わせる", async () => {
  const { fake, adapter } = setup();
  await connectRunning(adapter, desired("FIGHT"));
  await until(() => fake.program === "FIGHT");
  fake.crash();
  await until(() => adapter.state.connection.status === "error");
  fake.program = "WAIT";
  fake.restart();
  await until(() => adapter.state.connection.status === "ok");
  await until(() => fake.program === "FIGHT");
  assert.equal(adapter.state.manual, false);
  adapter.stop();
});

test("C6：Event OS を大会の途中で起動し直し、OBSが予定と違う場面なら、勝手に変えず手動モードで知らせる", async () => {
  const { fake, adapter } = setup();
  fake.program = "SAFE";
  adapter.setDesired(desired("FIGHT"), "running");
  adapter.start();
  await until(() => adapter.state.manual === true);
  await wait(100);
  assert.equal(fake.program, "SAFE");
  adapter.stop();
});

test("準備中に起動したときは、そのまま場面を合わせる", async () => {
  const { fake, adapter } = setup();
  fake.program = "FIGHT";
  adapter.setDesired(desired("WAIT"), "setup");
  adapter.start();
  await until(() => fake.program === "WAIT");
  assert.equal(adapter.state.manual, false);
  adapter.stop();
});

test("OBS側から切られた（4011）ときは、自動でつなぎ直さない", async () => {
  const { fake, adapter } = setup();
  adapter.start();
  await until(() => adapter.state.connection.status === "ok");
  fake.kick();
  await until(() => adapter.state.connection.reason === "kicked");
  await wait(200);
  assert.equal(fake.sockets.size, 0);
  adapter.stop();
});

test("テロップ：決められた文字部品の中身だけを書き換え、他の部品はさわらない", async () => {
  const { fake, adapter } = setup();
  await connectRunning(adapter, desired("WAIT", { texts: { EOS_RED_NAME: "ヒカル", EOS_BLUE_NAME: "ソラ" } }));
  await until(() => fake.inputs.get("EOS_RED_NAME").settings.text === "ヒカル");
  assert.equal(fake.inputs.get("EOS_BLUE_NAME").settings.text, "ソラ");
  await assert.rejects(adapter.req("SetInputSettings", { inputName: "MAIN", inputSettings: { text: "x" } }), /テロップ部品以外/);
  await assert.rejects(adapter.req("SetInputSettings", { inputName: "EOS_RED_NAME", inputSettings: { font: {} } }), /文字以外/);
  adapter.stop();
});

test("AT-P2：サブの表示/非表示は CAM シーンの中だけ。人が切り替えたら手動モード", async () => {
  const { fake, adapter } = setup();
  await connectRunning(adapter, desired("WAIT", { subVisible: true }));
  await until(() => fake.camItems[1].sceneItemEnabled === true);
  await wait(60);
  assert.equal(adapter.state.manual, false);
  fake.humanToggleSub(false);
  await until(() => adapter.state.manual === true);
  await assert.rejects(adapter.req("SetSceneItemEnabled", { sceneName: "FIGHT", sceneItemId: 1, sceneItemEnabled: false }), /カメラ切替用のシーン以外/);
  adapter.stop();
});

test("AT-P2-02/04/05：カメラの生死を判定する（抜ける＝真っ黒、固まる＝同じ絵が続く）", async () => {
  const { fake, adapter } = setup();
  adapter.timings.pollMs = 20;
  adapter.start();
  await until(() => adapter.state.cameras.sub.status === "ok");
  fake.setCamera("SUB", "dead");
  await until(() => adapter.state.cameras.sub.status === "error");
  assert.match(adapter.state.cameras.sub.message, /真っ黒/);
  fake.setCamera("SUB", "alive");
  await until(() => adapter.state.cameras.sub.status === "ok");
  adapter.setSimulate({ mainDead: true });
  await until(() => adapter.state.cameras.main.status === "error");
  adapter.stop();
});

test("AT-P3-02 前提・C10：録画を始める。配信を止めても録画が残っているか必ず確かめる", async () => {
  const { fake, adapter } = setup();
  adapter.start();
  await until(() => adapter.state.connection.status === "ok");
  assert.equal((await adapter.startStream()).ok, true);
  assert.equal(fake.record.active, true, "配信の前に録画を始める");
  assert.equal(fake.stream.active, true);
  // OBS の設定次第で、配信停止と一緒に録画も止まることがある。その場合は強く知らせる。
  fake.record.active = false;
  const result = await adapter.stopStream();
  assert.equal(result.ok, false);
  assert.match(result.message, /録画も止まっています/);
  adapter.stop();
});

test("配信のやり直し：止めて、止まったのを確かめてから始め直す", async () => {
  const { fake, adapter } = setup();
  adapter.start();
  await until(() => adapter.state.connection.status === "ok");
  await adapter.startStream();
  const result = await adapter.restartStream();
  assert.equal(result.ok, true, result.message);
  assert.equal(fake.stream.active, true);
  assert.equal(fake.record.active, true);
  adapter.stop();
});

test("配信のつなぎ直し中を知らせ、戻ったら消す", async () => {
  const { fake, adapter } = setup();
  adapter.start();
  await until(() => adapter.state.connection.status === "ok");
  await adapter.startStream();
  fake.setStreamReconnecting(true);
  await until(() => adapter.state.stream.reconnectingSince != null);
  fake.setStreamReconnecting(false);
  await until(() => adapter.state.stream.reconnectingSince == null);
  adapter.stop();
});

test("チャプター：Hybrid MP4 なら入る。対応していない形式なら以後は送らない", async () => {
  const { fake, adapter } = setup();
  adapter.start();
  await until(() => adapter.state.connection.status === "ok");
  await adapter.startRecord();
  await adapter.chapter("第1試合");
  assert.deepEqual(fake.chapters, ["第1試合"]);
  fake.profile.SimpleOutput.RecFormat2 = "mkv";
  await adapter.chapter("第2試合");
  assert.equal(adapter.state.chaptersSupported, false);
  const before = fake.requestLog.length;
  await adapter.chapter("第3試合");
  assert.equal(fake.requestLog.length, before);
  adapter.stop();
});

test("録画の観測：始まり・止まり（ファイル名つき）を記録用に知らせる", async () => {
  const { fake, adapter } = setup();
  const observations = [];
  adapter.on("observation", entry => observations.push(entry));
  adapter.start();
  await until(() => adapter.state.connection.status === "ok");
  await adapter.startRecord();
  await until(() => observations.some(entry => entry.active === true));
  fake.externalStopRecord();
  await until(() => observations.some(entry => entry.active === false && entry.path));
  adapter.stop();
});

test("音のチェック：入力のメーターを数秒だけ受け取り、元に戻す", async () => {
  const { fake, adapter } = setup();
  adapter.start();
  await until(() => adapter.state.connection.status === "ok");
  const result = await adapter.audioCheck(80);
  assert.equal(result.ok, true, result.message);
  for (const input of fake.inputs.values()) if (typeof input.level === "number") input.level = 0;
  const silent = await adapter.audioCheck(80);
  assert.equal(silent.ok, false);
  adapter.stop();
});

test("練習用の擬似故障：OBSとの接続を一定時間切り、その後つなぎ直す", async () => {
  const { adapter } = setup();
  adapter.start();
  await until(() => adapter.state.connection.status === "ok");
  adapter.simulateObsDown(0.15);
  assert.equal(adapter.state.connection.status, "error");
  await until(() => adapter.state.connection.status === "ok", { timeoutMs: 2000 });
  adapter.stop();
});

test("どの場面でも、許可リストに無い命令は1つも OBS に届いていない", async () => {
  const { fake, adapter, config } = setup();
  config.audio.muteDuringEntrance = ["会場マイク"];
  adapter.guardCtx.muteInputs = new Set(["会場マイク"]);
  adapter.start();
  await until(() => adapter.state.connection.status === "ok");
  adapter.setDesired(desired("FIGHT", { subVisible: true, texts: { EOS_INFO: "x" }, mute: { 会場マイク: true } }), "running");
  await until(() => fake.inputs.get("会場マイク").muted === true);
  await adapter.startStream();
  await adapter.restartStream();
  await adapter.stopStream();
  await adapter.audioCheck(30);
  await wait(150);
  const allowed = allowedRequests();
  const unexpected = fake.requestLog.filter(entry => !allowed.has(entry.requestType)).map(entry => entry.requestType);
  assert.deepEqual(unexpected, []);
  adapter.stop();
});

test("C7：OBSが固まったら、「確かめた時刻」を進めない（✅ を出し続けない）", async () => {
  const { fake, adapter } = setup();
  adapter.start();
  await until(() => adapter.state.connection.status === "ok" && adapter.state.record.checkedAt != null);
  fake.hang(true);
  await wait(400);
  const frozenAt = adapter.state.connection.checkedAt;
  const recordAt = adapter.state.record.checkedAt;
  await wait(1200);
  assert.equal(adapter.state.connection.checkedAt, frozenAt, "返事が無い間は進まない");
  assert.equal(adapter.state.record.checkedAt, recordAt);
  fake.hang(false);
  await until(() => adapter.state.connection.checkedAt > frozenAt);
});

test("録画の一時停止を見つけ、再開できる。「始める」を押しても一時停止なら再開する", async () => {
  const { fake, adapter } = setup();
  adapter.start();
  await until(() => adapter.state.connection.status === "ok");
  await adapter.startRecord();
  await until(() => fake.record.active === true);
  fake.humanPauseRecord();
  await until(() => adapter.state.record.paused === true);
  const result = await adapter.startRecord();
  assert.match(result.message, /再開/);
  assert.equal(fake.record.paused, false);
});

test("OBSが落ちたら、録画の区切りを「切れた時刻」で記録する", async () => {
  const { fake, adapter } = setup();
  const observations = [];
  adapter.on("observation", entry => observations.push(entry));
  adapter.start();
  await until(() => adapter.state.connection.status === "ok");
  await adapter.startRecord();
  await until(() => observations.some(entry => entry.active === true));
  fake.crash();
  await until(() => observations.some(entry => entry.active === false && entry.reason === "disconnect"));
  assert.equal(adapter.state.record.active, null, "切れている間は分からない");
});

test("命令が届かなかったカメラ・テロップも、見回りで合わせ直す", async () => {
  const { fake, adapter } = setup();
  await connectRunning(adapter, desired("FIGHT", { texts: { EOS_RED_NAME: "A" } }));
  await until(() => fake.inputs.get("EOS_RED_NAME").settings.text === "A");
  fake.hang(true);
  adapter.setDesired(desired("FIGHT", { subVisible: true, texts: { EOS_RED_NAME: "B" } }), "running");
  await wait(500);
  fake.hang(false);
  await until(() => fake.camItems[1].sceneItemEnabled === true && fake.inputs.get("EOS_RED_NAME").settings.text === "B", { timeoutMs: 4000 });
});

test("つなぎ直しを押したとき、古い接続の失敗で新しい接続を壊さない", async () => {
  const { fake, adapter } = setup();
  fake.holdHello = true;
  const realClass = fake.webSocketClass();
  let created = 0;
  adapter.client.WebSocketImpl = class extends realClass {
    constructor(...args) {
      super(...args);
      created += 1;
    }
  };
  adapter.start();
  await wait(50);
  fake.holdHello = false;
  adapter.reconnect();
  await until(() => adapter.state.connection.status === "ok");
  const count = created;
  await wait(900);
  assert.equal(created, count, "成功した後に、つなぎ直しをくり返さない");
  assert.equal(adapter.state.connection.status, "ok");
  assert.equal(adapter.client.identified, true);
});
