// あるべき姿・画面・次の一手・開始前チェック・ランプ。AT-P1-10・AT-P3・AT-P4A-03/09/11・AT-P4B・AT-P5-01
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MiniEvent, exampleConfig, TOOL_DIR } from "./helpers.mjs";
import { desiredOutputs } from "../src/core/desired.mjs";
import { buildView, MAX_LARGE_BUTTONS } from "../src/core/view.mjs";
import { nextAction } from "../src/core/next_action.mjs";
import { evaluatePreflight, HUMAN_ITEMS } from "../src/core/preflight.mjs";
import { lamp } from "../src/core/health.mjs";
import { stepGuide, STEPS } from "../src/core/flow.mjs";

const NOW = Date.parse("2026-11-03T04:00:00.000Z");

function healthyObs(overrides = {}) {
  const fresh = { status: "ok", checkedAt: NOW, message: "" };
  return {
    connection: { ...fresh, reason: null },
    version: { obsVersion: "32.0.0" },
    scenes: ["WAIT", "FIGHTER", "FIGHT", "WINNER", "SAFE", "CAM"],
    inputs: ["EOS_BOUT_NO", "EOS_RED_NAME", "EOS_BLUE_NAME", "EOS_WINNER_NAME", "EOS_INFO", "MAIN", "SUB"],
    camItems: { main: true, sub: true },
    cameras: { main: { ...fresh }, sub: { ...fresh } },
    record: { active: true, checkedAt: NOW },
    stream: { active: false, checkedAt: NOW, reconnectingSince: null, wanted: false },
    disk: { freeBytes: 200 * 1024 ** 3, checkedAt: NOW },
    recFormat: "hybrid_mp4",
    audio: { ok: true, message: "ok", checkedAt: NOW },
    manual: false,
    ...overrides,
  };
}

function ctx(event, overrides = {}) {
  return {
    state: event.state,
    config: event.config,
    obs: healthyObs(),
    preflight: { ready: true, items: [], blocking: [] },
    nowMs: NOW,
    role: "easy",
    rehearsal: false,
    findEventType: seq => event.find(seq),
    ...overrides,
  };
}

test("場面：状態ごとの OBS シーンは仕様の表どおり", () => {
  const event = new MiniEvent().setup();
  const scene = () => desiredOutputs(event.state, event.config).programScene;
  const seen = [scene()];
  for (const [type, args] of [["entrance", { corner: "red" }], ["entrance", { corner: "blue" }], ["fight_start"], ["fight_end"], ["result", { winner: "red" }]]) {
    event.run(type, args, { role: "easy" });
    seen.push(scene());
  }
  assert.deepEqual(seen, ["WAIT", "FIGHTER", "FIGHTER", "FIGHT", "FIGHT", "WINNER"]);
  event.run("safe_on", {}, { role: "easy" });
  assert.equal(scene(), "SAFE");
});

test("配信しない試合：その試合の間はカメラを映さず、テロップにも名前を出さない", () => {
  const event = new MiniEvent().setup();
  event.playBout("red");
  event.run("next_bout", {}, { role: "easy" });
  for (const [type, args] of [[null], ["entrance", { corner: "red" }], ["entrance", { corner: "blue" }], ["fight_start"], ["fight_end"], ["result", { winner: "blue" }]]) {
    if (type) event.run(type, args, { role: "easy" });
    const desired = desiredOutputs(event.state, event.config);
    assert.equal(desired.programScene, "WAIT", event.state.step);
    assert.equal(desired.texts.EOS_RED_NAME, "");
    assert.equal(desired.texts.EOS_BLUE_NAME, "");
    assert.equal(desired.texts.EOS_WINNER_NAME, "");
    assert.equal(desired.texts.EOS_INFO, "この試合は配信をお休みします");
    assert.equal(desired.hidden, true);
  }
});

test("「録画のみ」の試合も、配信NGと同じ扱い（OBSは配信と録画が同じ画面のため）", () => {
  const event = new MiniEvent().setup();
  for (let index = 0; index < 2; index += 1) {
    event.playBout("red");
    event.run("next_bout", {}, { role: "easy" });
  }
  assert.equal(desiredOutputs(event.state, event.config).programScene, "WAIT");
  event.run("entrance", { corner: "red" }, { role: "easy" });
  assert.equal(desiredOutputs(event.state, event.config).programScene, "WAIT");
});

test("テロップ：試合番号・表示名・勝者・次の試合の案内", () => {
  const event = new MiniEvent().setup();
  let texts = desiredOutputs(event.state, event.config).texts;
  assert.equal(texts.EOS_BOUT_NO, "第1試合");
  assert.equal(texts.EOS_INFO, "次の試合 ヒカル vs ソラ");
  event.playBout("blue");
  texts = desiredOutputs(event.state, event.config).texts;
  assert.equal(texts.EOS_WINNER_NAME, "ソラ");
  assert.equal(texts.EOS_INFO, "");
  event.undoDraw = event.run("undo", {}, { role: "easy" });
  event.run("result", { winner: "draw" }, { role: "easy" });
  assert.equal(desiredOutputs(event.state, event.config).texts.EOS_WINNER_NAME, "引き分け");
});

test("カメラ：サブは「上に重ねて表示」するだけ。🛟中は必ずメイン", () => {
  const event = new MiniEvent().setup();
  event.run("camera", { to: "sub" }, { role: "easy" });
  assert.equal(desiredOutputs(event.state, event.config).subVisible, true);
  event.run("safe_on", {}, { role: "easy" });
  assert.equal(desiredOutputs(event.state, event.config).subVisible, false);
});

test("音声：設定した入力は、入場中だけミュートし、試合で戻す", () => {
  const config = exampleConfig();
  config.audio.muteDuringEntrance = ["会場マイク"];
  const event = new MiniEvent({ config }).setup();
  assert.deepEqual(desiredOutputs(event.state, config).mute, { 会場マイク: false });
  event.run("entrance", { corner: "red" }, { role: "easy" });
  assert.deepEqual(desiredOutputs(event.state, config).mute, { 会場マイク: true });
  event.run("entrance", { corner: "blue" }, { role: "easy" });
  assert.deepEqual(desiredOutputs(event.state, config).mute, { 会場マイク: true });
  event.run("fight_start", {}, { role: "easy" });
  assert.deepEqual(desiredOutputs(event.state, config).mute, { 会場マイク: false });
});

test("かんたんモードの大きいボタンは、どの状態でも3つ以下", () => {
  for (const phase of ["setup", "running", "ended"]) {
    for (const step of STEPS) {
      for (const isLast of [true, false]) {
        const guide = stepGuide({ phase, step, bout: { no: 1 }, result: { winner: "red" }, isLast, order: ["red", "blue"], preflightReady: true });
        assert.ok(guide.buttons.length <= MAX_LARGE_BUTTONS, `${phase}/${step}: ${guide.buttons.length}`);
      }
    }
  }
});

test("かんたんモードには、配信や録画を止めるボタンが出ない", () => {
  const event = new MiniEvent().setup();
  const view = buildView(ctx(event));
  const all = JSON.stringify([view.buttons, view.alerts, view.fixed]);
  assert.doesNotMatch(all, /stream_stop|record_stop|stream_start|stream_restart/);
  assert.equal(view.operator, undefined);
  assert.equal(view.admin, undefined);
});

test("仕様書 §4.2 の表と、実装の「主ボタン」「OBSシーン」が一致する", () => {
  const spec = readFileSync(join(TOOL_DIR, "../../docs/uizin-event-os/EVENT_OS_SPEC.md"), "utf8");
  const rows = Object.fromEntries(
    spec.split("\n")
      .filter(line => /^\| (待機|赤入場|青入場|試合中|判定待ち|勝者表示|休憩) \|/.test(line))
      .map(line => {
        const cells = line.split("|").map(cell => cell.trim());
        return [cells[1], { button: cells[4], scene: cells[6] }];
      }),
  );
  const map = { standby: "待機", entrance1: "赤入場", entrance2: "青入場", fighting: "試合中", result: "判定待ち", winner: "勝者表示", break: "休憩" };
  const scenes = { standby: "WAIT", entrance1: "FIGHTER", entrance2: "FIGHTER", fighting: "FIGHT", result: "FIGHT", winner: "WINNER", break: "WAIT" };
  for (const step of STEPS) {
    const row = rows[map[step]];
    assert.ok(row, `仕様書に「${map[step]}」の行がありません`);
    const guide = stepGuide({ phase: "running", step, bout: { no: 1 }, result: { winner: "red" }, isLast: false, order: ["red", "blue"], preflightReady: true });
    for (const label of guide.buttons.filter(button => button.cmd !== "break_start").map(button => button.label)) {
      assert.ok(row.button.includes(label), `${map[step]}: 仕様書「${row.button}」に「${label}」がありません`);
    }
    assert.ok(row.scene.startsWith(scenes[step]), `${map[step]}: 仕様書のシーン「${row.scene}」`);
  }
});

test("次の一手：録画停止は最優先の知らせ＋1タップで録画開始。進行のボタンは消さない", () => {
  const event = new MiniEvent().setup();
  const action = nextAction(ctx(event, { obs: healthyObs({ record: { active: false, checkedAt: NOW } }) }));
  assert.equal(action.alerts[0].level, "error");
  assert.equal(action.alerts[0].button.cmd, "record_start");
  assert.ok(action.buttons.length > 0);
});

test("次の一手：OBSにつながっていない理由ごとに、やさしい言葉で知らせる（かんたんモードでは「OBS」と言わない）", () => {
  const event = new MiniEvent().setup();
  const message = (reason, role = "operator") => nextAction(ctx(event, { role, obs: healthyObs({ connection: { status: "error", checkedAt: NOW, reason } }) })).alerts[0].text;
  assert.match(message("auth"), /パスワードが違います/);
  assert.match(message("kicked"), /接続を切られました/);
  assert.match(message("refused"), /OBSとつながっていません/);
  for (const reason of ["auth", "kicked", "refused", "exiting"]) {
    const text = message(reason, "easy");
    assert.doesNotMatch(text, /OBS/, text);
    assert.match(text, /映像ソフト/);
  }
  const manual = nextAction(ctx(event, { role: "easy", obs: healthyObs({ manual: true, program: "WAIT" }) }));
  assert.ok(manual.alerts.every(alert => !/OBS/.test(alert.text)));
});

test("次の一手：手動モードは「自動に戻す」ボタン付き。配信のつなぎ直しが長いと強く知らせる", () => {
  const event = new MiniEvent().setup();
  const manual = nextAction(ctx(event, { obs: healthyObs({ manual: true }) }));
  assert.equal(manual.alerts.find(alert => alert.button?.cmd === "resume_auto")?.button.label, "🔁 自動に戻す");
  const short = nextAction(ctx(event, { obs: healthyObs({ stream: { active: true, checkedAt: NOW, reconnectingSince: NOW - 10_000 } }) }));
  assert.equal(short.alerts[0].level, "warn");
  const long = nextAction(ctx(event, { obs: healthyObs({ stream: { active: true, checkedAt: NOW, reconnectingSince: NOW - 90_000 } }) }));
  assert.equal(long.alerts[0].level, "error");
  assert.match(long.alerts[0].text, /配信をやり直す/);
});

test("次の一手：「✅ 直前に終わったこと」を出す", () => {
  const event = new MiniEvent().setup();
  event.run("entrance", { corner: "red" }, { role: "easy" });
  assert.equal(nextAction(ctx(event)).done, "✅ 赤の入場に切り替えました");
  assert.equal(nextAction(ctx(event)).next, "青の選手を入場させてください");
});

test("ランプ：確かめてから時間がたった ✅ は、自動で ⚠️ 未確認になる", () => {
  assert.equal(lamp({ status: "ok", checkedAt: NOW }, NOW + 1000).status, "ok");
  assert.equal(lamp({ status: "ok", checkedAt: NOW }, NOW + 60_000).status, "unknown");
  assert.equal(lamp(null, NOW).status, "unknown");
  assert.equal(lamp({ status: "ok", checkedAt: null }, NOW).status, "unknown");
});

test("画面のランプ：OBSにつながっていないとき、録画を ✅ にも ❌ にもせず「未確認」", () => {
  const event = new MiniEvent().setup();
  const view = buildView(ctx(event, { obs: healthyObs({ connection: { status: "error", checkedAt: NOW, reason: "lost" } }) }));
  assert.equal(view.lamps.record.status, "unknown");
  assert.match(view.lamps.record.text, /未確認/);
});

test("開始前チェック：全部そろえば「始められます」。機械の確認と人の確認を分ける", () => {
  const event = new MiniEvent();
  event.run("load_card", { bouts: event.card.bouts, hash: event.card.hash });
  event.run("consent_ack");
  for (const item of HUMAN_ITEMS) event.run("human_check", { item: item.id, checked: true });
  const result = evaluatePreflight({ state: event.state, config: event.config, obs: healthyObs(), nowMs: NOW, rehearsal: false });
  assert.equal(result.ready, true, result.blocking.join());
  assert.ok(result.items.some(item => item.kind === "human"));
  assert.ok(result.items.some(item => item.kind === "machine"));
});

test("開始前チェック：録画形式が mp4/mov（落ちると全部失う）なら止める", () => {
  const event = new MiniEvent();
  event.run("load_card", { bouts: event.card.bouts, hash: event.card.hash });
  const result = evaluatePreflight({ state: event.state, config: event.config, obs: healthyObs({ recFormat: "mp4" }), nowMs: NOW, rehearsal: false });
  assert.equal(result.items.find(item => item.id === "rec_format").status, "error");
  assert.ok(result.blocking.includes("rec_format"));
});

test("開始前チェック：シーン・テロップ部品・空き容量が足りないと、名前付きで ❌", () => {
  const event = new MiniEvent();
  const obs = healthyObs({ scenes: ["WAIT", "FIGHT"], inputs: ["EOS_BOUT_NO"], disk: { freeBytes: 10 * 1024 ** 3, checkedAt: NOW } });
  const result = evaluatePreflight({ state: event.state, config: event.config, obs, nowMs: NOW, rehearsal: false });
  const byId = Object.fromEntries(result.items.map(item => [item.id, item]));
  assert.match(byId.scenes.detail, /FIGHTER/);
  assert.match(byId.texts.detail, /EOS_RED_NAME/);
  assert.equal(byId.disk.status, "error");
  assert.equal(result.ready, false);
});

test("開始前チェック：練習モードでは YouTube の確認は不要", () => {
  const event = new MiniEvent();
  const live = evaluatePreflight({ state: event.state, config: event.config, obs: healthyObs(), nowMs: NOW, rehearsal: false });
  const rehearsal = evaluatePreflight({ state: event.state, config: event.config, obs: healthyObs(), nowMs: NOW, rehearsal: true });
  assert.ok(live.items.some(item => item.id === "youtube_tested"));
  assert.ok(!rehearsal.items.some(item => item.id === "youtube_tested"));
});

test("運営の画面：練習モードでは配信の操作を出さない", () => {
  const event = new MiniEvent().setup();
  assert.equal(buildView(ctx(event, { role: "operator", rehearsal: true })).operator.canStream, false);
  assert.equal(buildView(ctx(event, { role: "operator", rehearsal: false })).operator.canStream, true);
});

test("🛟 安全運転でも、配信しない試合ではカメラを映さない（WAIT のまま）", () => {
  const event = new MiniEvent().setup();
  event.playBout("red");
  event.run("safe_on", {}, { role: "easy" });
  assert.equal(desiredOutputs(event.state, event.config).programScene, "SAFE", "配信する試合なら SAFE");
  event.run("next_bout", {}, { role: "easy" });
  for (const [type, args] of [[null], ["entrance", { corner: "red" }], ["entrance", { corner: "blue" }], ["fight_start"]]) {
    if (type) event.run(type, args, { role: "easy" });
    const desired = desiredOutputs(event.state, event.config);
    assert.equal(desired.programScene, "WAIT", event.state.step);
    assert.equal(desired.subVisible, false);
  }
});

test("手動モードのまま配信しない試合がカメラの場面なら、❌ で知らせ「配信しません」とは言わない", () => {
  const event = new MiniEvent().setup();
  event.playBout("red");
  event.run("next_bout", {}, { role: "easy" });
  const onCamera = nextAction(ctx(event, { obs: healthyObs({ manual: true, program: "FIGHT" }) }));
  assert.equal(onCamera.alerts[0].level, "error");
  assert.match(onCamera.alerts[0].text, /配信しない試合なのに/);
  assert.equal(onCamera.alerts[0].button.cmd, "resume_auto");
  assert.ok(!onCamera.notices.some(text => text.includes("カメラを映さず")));
  const onWait = nextAction(ctx(event, { obs: healthyObs({ manual: true, program: "WAIT" }) }));
  assert.ok(!onWait.alerts.some(alert => /配信しない試合なのに/.test(alert.text)));
  assert.ok(onWait.notices.some(text => text.includes("カメラを映さず")));
});

test("録画の一時停止は ❌ で知らせ、再開ボタンを出す。ランプも「録画中」にしない", () => {
  const event = new MiniEvent().setup();
  const obs = healthyObs({ record: { active: true, paused: true, checkedAt: NOW } });
  const action = nextAction(ctx(event, { obs }));
  assert.equal(action.alerts[0].button.cmd, "record_resume");
  assert.match(buildView(ctx(event, { obs })).lamps.record.text, /一時停止/);
});

test("ランプ：OBSにつながっていても、録画の確認が古ければ「未確認」", () => {
  const event = new MiniEvent().setup();
  const view = buildView(ctx(event, { obs: healthyObs({ record: { active: true, checkedAt: NOW - 30_000 } }) }));
  assert.equal(view.lamps.record.status, "unknown");
  const action = nextAction(ctx(event, { obs: healthyObs({ record: { active: false, checkedAt: NOW - 30_000 } }) }));
  assert.ok(!action.alerts.some(alert => alert.button?.cmd === "record_start"), "古い情報で「止まっています」とも言わない");
});

test("練習モード：録画しない設定なら「録画が止まっています」を出さない。配信していれば ❌", () => {
  const event = new MiniEvent().setup();
  const quiet = nextAction(ctx(event, { rehearsal: true, obs: healthyObs({ record: { active: false, checkedAt: NOW } }) }));
  assert.ok(!quiet.alerts.some(alert => alert.button?.cmd === "record_start"));
  assert.ok(quiet.notices.some(text => text.includes("録画していません")));
  const live = nextAction(ctx(event, { rehearsal: true, obs: healthyObs({ stream: { active: true, checkedAt: NOW, reconnectingSince: null } }) }));
  assert.match(live.alerts[0].text, /練習中なのに配信しています/);
});

test("記録を保存できないときは、最優先で知らせる", () => {
  const event = new MiniEvent().setup();
  const action = nextAction(ctx(event, { storageError: "ENOSPC" }));
  assert.match(action.alerts[0].text, /保存できません/);
});

test("開始前チェック：配信する日は「音のチェック」も必須。練習モードでは推奨", () => {
  const event = new MiniEvent();
  event.run("load_card", { bouts: event.card.bouts, hash: event.card.hash });
  const silent = healthyObs({ audio: { ok: false, message: "どの入力からも音が来ていません", checkedAt: NOW } });
  const live = evaluatePreflight({ state: event.state, config: event.config, obs: silent, nowMs: NOW, rehearsal: false });
  assert.ok(live.blocking.includes("audio"));
  const rehearsal = evaluatePreflight({ state: event.state, config: event.config, obs: silent, nowMs: NOW, rehearsal: true });
  assert.ok(!rehearsal.blocking.includes("audio"));
});
