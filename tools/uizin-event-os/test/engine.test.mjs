// 状態エンジン：進行・戻る・二重操作・役割・配信NG。AT-P4A-03〜06・09・10
import { test } from "node:test";
import assert from "node:assert/strict";
import { MiniEvent, exampleConfig } from "./helpers.mjs";
import { currentBout, notBroadcastCount, consentAcknowledged } from "../src/core/engine.mjs";

test("1試合の流れ：待機→赤入場→青入場→試合中→判定待ち→勝者表示→次の試合", () => {
  const event = new MiniEvent().setup();
  assert.equal(event.state.phase, "running");
  const steps = [event.state.step];
  for (const [type, args] of [["entrance", { corner: "red" }], ["entrance", { corner: "blue" }], ["fight_start"], ["fight_end"], ["result", { winner: "red" }], ["next_bout"]]) {
    const result = event.run(type, args, { role: "easy" });
    assert.equal(result.ok, true, `${type}: ${result.message}`);
    steps.push(event.state.step);
  }
  assert.deepEqual(steps, ["standby", "entrance1", "entrance2", "fighting", "result", "winner", "standby"]);
  assert.equal(currentBout(event.state).no, 2);
  assert.equal(event.state.results[1].winner, "red");
});

test("入場の順番を守る（設定で青→赤にも変えられる）", () => {
  const event = new MiniEvent().setup();
  assert.equal(event.run("entrance", { corner: "blue" }, { role: "easy" }).code, "order");
  const config = exampleConfig();
  config.flow.entranceOrder = ["blue", "red"];
  const blueFirst = new MiniEvent({ config }).setup();
  assert.equal(blueFirst.run("entrance", { corner: "blue" }, { role: "easy" }).ok, true);
  assert.equal(blueFirst.run("entrance", { corner: "red" }, { role: "easy" }).ok, true);
});

test("同じ版番号で2回押しても1回分しか進まない（連打・2台同時押し）", () => {
  const event = new MiniEvent().setup();
  const rev = event.state.rev;
  assert.equal(event.run("entrance", { corner: "red" }, { role: "easy", rev }).ok, true);
  const second = event.run("entrance", { corner: "blue" }, { role: "easy", rev });
  assert.equal(second.ok, false);
  assert.equal(second.code, "stale");
  assert.equal(event.state.step, "entrance1");
});

test("戻る：直前の1手だけ取り消し、記録は消さずに「取り消し」を足す", () => {
  const event = new MiniEvent().setup();
  event.run("entrance", { corner: "red" }, { role: "easy" });
  event.run("entrance", { corner: "blue" }, { role: "easy" });
  const before = event.events.length;
  assert.equal(event.run("undo", {}, { role: "easy" }).ok, true);
  assert.equal(event.state.step, "entrance1");
  assert.equal(event.events.length, before + 1);
  assert.equal(event.events.at(-1).type, "UNDO");
  assert.equal(event.run("undo", {}, { role: "easy" }).ok, true);
  assert.equal(event.state.step, "standby");
  assert.equal(event.run("undo", {}, { role: "easy" }).code, "nothing");
});

test("戻る：かんたんモードでは「次の試合へ」より前に戻れない。運営モードなら戻れる", () => {
  const event = new MiniEvent().setup();
  event.playBout("blue");
  event.run("next_bout", {}, { role: "easy" });
  assert.equal(event.run("undo", {}, { role: "easy" }).code, "forbidden");
  assert.equal(event.run("undo", {}, { role: "operator" }).ok, true);
  assert.equal(event.state.step, "winner");
  assert.equal(currentBout(event.state).no, 1);
});

test("勝者を取り消すと、結果も取り消される", () => {
  const event = new MiniEvent().setup();
  event.playBout("red");
  assert.equal(event.state.results[1].winner, "red");
  event.run("undo", {}, { role: "easy" });
  assert.equal(event.state.step, "result");
  assert.equal(event.state.results[1], undefined);
});

test("かんたんモードでは無効試合を選べない。運営モードなら選べる", () => {
  const event = new MiniEvent().setup();
  for (const [type, args] of [["entrance", { corner: "red" }], ["entrance", { corner: "blue" }], ["fight_start"], ["fight_end"]]) event.run(type, args, { role: "easy" });
  assert.equal(event.run("result", { winner: "nocontest" }, { role: "easy" }).ok, false);
  assert.equal(event.run("result", { winner: "nocontest" }, { role: "operator" }).ok, true);
});

test("運営の操作はかんたんモードでは受け付けない", () => {
  const event = new MiniEvent();
  for (const type of ["start_event", "skip_bout", "fix_result", "edit_name", "consent_ack", "human_check", "load_card"]) {
    assert.equal(event.run(type, {}, { role: "easy" }).code, "forbidden", type);
  }
});

test("配信しない試合があるとき、👤確認するまで大会を始められない", () => {
  const event = new MiniEvent();
  event.run("load_card", { bouts: event.card.bouts, hash: event.card.hash });
  assert.equal(notBroadcastCount(event.state), 2);
  assert.equal(consentAcknowledged(event.state), false);
  assert.equal(event.run("start_event").code, "consent");
  event.run("consent_ack");
  assert.equal(event.run("start_event").ok, true);
});

test("開始前チェックに ❌ があれば始められない。管理モード＋確認なら始められる（記録に残る）", () => {
  const event = new MiniEvent();
  event.run("load_card", { bouts: event.card.bouts, hash: event.card.hash });
  event.run("consent_ack");
  assert.equal(event.run("start_event", {}, { preflightReady: false }).code, "preflight");
  assert.equal(event.run("start_event", {}, { preflightReady: false, role: "operator", confirm: true }).code, "preflight");
  const result = event.run("start_event", {}, { preflightReady: false, role: "admin", confirm: true });
  assert.equal(result.ok, true);
  assert.equal(event.events.at(-1).forced, true);
});

test("最後の試合は「大会を終える」で終わる。途中では終えられない", () => {
  const event = new MiniEvent().setup();
  event.playBout("red");
  assert.equal(event.run("event_end", {}, { role: "easy" }).code, "not_last");
  event.run("next_bout", {}, { role: "easy" });
  event.playBout("blue");
  event.run("next_bout", {}, { role: "easy" });
  event.playBout("draw");
  assert.equal(event.run("next_bout", {}, { role: "easy" }).code, "last");
  assert.equal(event.run("event_end", {}, { role: "easy" }).ok, true);
  assert.equal(event.state.phase, "ended");
});

test("休憩は待機中だけ。再開で待機に戻る", () => {
  const event = new MiniEvent().setup();
  assert.equal(event.run("break_start", {}, { role: "easy" }).ok, true);
  assert.equal(event.state.step, "break");
  assert.equal(event.run("entrance", { corner: "red" }, { role: "easy" }).code, "step");
  assert.equal(event.run("break_end", {}, { role: "easy" }).ok, true);
  assert.equal(event.state.step, "standby");
});

test("試合を飛ばす（運営）。最後の試合なら大会終了", () => {
  const event = new MiniEvent().setup();
  assert.equal(event.run("skip_bout").ok, true);
  assert.equal(currentBout(event.state).no, 2);
  assert.equal(event.state.results[1].winner, "skipped");
});

test("カメラと🛟は版番号なしで受け付け、同じ指示は何も足さない", () => {
  const event = new MiniEvent().setup();
  assert.equal(event.run("camera", { to: "sub" }, { role: "easy", rev: -1 }).ok, true);
  assert.equal(event.state.camera, "sub");
  const count = event.events.length;
  event.run("camera", { to: "sub" }, { role: "easy" });
  assert.equal(event.events.length, count);
  event.run("safe_on", {}, { role: "easy" });
  assert.equal(event.state.safe, true);
  event.run("safe_off", {}, { role: "easy" });
  assert.equal(event.state.safe, false);
});

test("結果の修正と表示名の手直し（運営）", () => {
  const event = new MiniEvent().setup();
  event.playBout("red");
  assert.equal(event.run("fix_result", { bout: 1, winner: "blue" }).ok, true);
  assert.equal(event.state.results[1].winner, "blue");
  assert.equal(event.run("edit_name", { bout: 2, corner: "red", name: "ミナトＪｒ" }).ok, true);
  event.run("next_bout", {}, { role: "easy" });
  assert.equal(currentBout(event.state).red.name, "ミナトＪｒ");
  assert.equal(event.run("fix_result", { bout: 99, winner: "red" }).code, "bout");
});

test("大会中の試合データ読み直しは確認が必要", () => {
  const event = new MiniEvent().setup();
  assert.equal(event.run("load_card", { bouts: event.card.bouts, hash: "x" }).code, "confirm");
  assert.equal(event.run("load_card", { bouts: event.card.bouts, hash: "x" }, { confirm: true }).ok, true);
});

test("記録を最初から積み直すと、同じ状態になる（再起動しても戻る）", async () => {
  const event = new MiniEvent().setup();
  event.playBout("red");
  event.run("undo", {}, { role: "easy" });
  event.run("result", { winner: "blue" }, { role: "easy" });
  const { reduce } = await import("../src/core/engine.mjs");
  const replayed = reduce(JSON.parse(JSON.stringify(event.events)));
  assert.deepEqual(replayed, event.state);
});
