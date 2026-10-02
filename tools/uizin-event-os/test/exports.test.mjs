// 大会後の書き出しとカメラ判定。ARCHITECTURE.md §9・§6.2、AT-P2-02/05
import { test } from "node:test";
import assert from "node:assert/strict";
import { MiniEvent, csv } from "./helpers.mjs";

const FOUR_BOUTS = csv([
  "1,ヒカル,架空ジムA,OK,ソラ,架空ジムB,OK,キッズ,曲A,曲B",
  "2,ミナト,架空ジムC,OK,ハル,架空ジムD,NG,一般,曲C,曲D",
  "3,アオイ,架空ジムA,OK,レン,架空ジムE,録画のみ,一般,曲E,曲F",
  "4,カイ,架空ジムB,OK,ユウ,架空ジムC,OK,一般,曲G,曲H",
]);
import { youtubeChapters, clipperManifests, truthYaml, resultsCsv, formatClock } from "../src/core/exports.mjs";
import { decodeBmpLuma, makeBmp, nextTrack, initialTrack } from "../src/obs/frame_check.mjs";

function playedEvent() {
  const event = new MiniEvent({ csvText: FOUR_BOUTS }).setup();
  event.observe({ type: "OBS_RECORD", active: true, path: null });
  event.observe({ type: "OBS_STREAM", active: true });
  for (let index = 0; index < 4; index += 1) {
    event.clock.advance(60_000);
    event.playBout(index === 0 ? "red" : "blue", 45_000);
    if (index < 3) event.run("next_bout", {}, { role: "easy" });
  }
  event.clock.advance(60_000);
  event.observe({ type: "OBS_RECORD", active: false, path: "/Videos/uizin.mp4" });
  return event;
}

test("時刻の表示（YouTube チャプター形式）", () => {
  assert.equal(formatClock(0), "00:00");
  assert.equal(formatClock(75), "01:15");
  assert.equal(formatClock(3723), "1:02:03");
});

test("YouTube チャプター：00:00 から始まり、配信した試合だけ、選手名は入れない", () => {
  const event = playedEvent();
  const chapters = youtubeChapters(event.state);
  assert.equal(chapters.ok, true);
  const lines = chapters.text.split("\n");
  assert.match(lines[0], /^00:00 /);
  assert.ok(lines.some(line => line.endsWith("第1試合")));
  assert.ok(lines.some(line => line.endsWith("第4試合")));
  assert.ok(!lines.some(line => line.includes("第2試合")), "配信NGの試合は入れない");
  assert.ok(!lines.some(line => line.includes("第3試合")), "録画のみの試合は入れない");
  assert.doesNotMatch(chapters.text, /ヒカル|ソラ|ミナト|ハル/);
});

test("切り抜き用 segments.json：切り抜きツールが必要とする項目がそろい、録画の長さ内に収まる", () => {
  const event = playedEvent();
  const manifests = clipperManifests(event.state, { eventName: "テスト大会", generatedAt: "2026-11-03T09:00:00Z", postRollSec: 1_000_000 });
  assert.equal(manifests.length, 1);
  const { manifest } = manifests[0];
  assert.equal(manifest.version, 1);
  assert.equal(manifest.source.path, "/Videos/uizin.mp4");
  assert.equal(manifest.source.title, "テスト大会");
  assert.equal(manifest.segments.length, 2, "配信した試合だけ");
  assert.deepEqual(manifest.segments.map(item => item.event_os_bout), [1, 4]);
  const segment = manifest.segments[0];
  assert.equal(segment.index, 1);
  assert.equal(typeof segment.confidence, "number");
  assert.equal(segment.locked, true);
  assert.equal(segment.red, "ヒカル");
  assert.ok(segment.start_sec >= 0 && segment.start_sec < segment.core_start_sec);
  const durationSec = (Date.parse(event.state.recordings[0].stoppedAt) - Date.parse(event.state.recordings[0].startedAt)) / 1000;
  assert.ok(segment.end_sec <= durationSec, "録画の長さを超えない");
});

test("録画が途中で分かれたら、録画ファイルごとに segments.json を分ける", () => {
  const event = new MiniEvent({ csvText: "試合番号,赤_表示名,赤_配信,青_表示名,青_配信\n1,A,OK,B,OK\n2,C,OK,D,OK\n" }).setup({ ack: false });
  event.observe({ type: "OBS_RECORD", active: true, path: null });
  event.playBout("red");
  event.run("next_bout", {}, { role: "easy" });
  event.observe({ type: "OBS_RECORD", active: false, path: "/v/1.mp4" });
  event.observe({ type: "OBS_RECORD", active: true, path: null });
  event.playBout("blue");
  const manifests = clipperManifests(event.state, { eventName: "x", generatedAt: "t" });
  assert.equal(manifests.length, 2);
  assert.equal(manifests[0].manifest.source.path, "/v/1.mp4");
  assert.equal(manifests[1].manifest.segments[0].index, 1);
});

test("truth.yml と結果CSV", () => {
  const event = playedEvent();
  assert.match(truthYaml(event.state), /^matches:\n {2}- start: \d/);
  const csvText = resultsCsv(event.state);
  assert.ok(csvText.startsWith("﻿試合番号"));
  assert.match(csvText, /1,ヒカル,ソラ,🔴 赤の勝ち/);
});

test("BMP を読み、明るさを取り出せる（24bit・下から上の並び）", () => {
  const frame = decodeBmpLuma(makeBmp(4, 2, (x, y) => (y === 0 ? [255, 255, 255] : [0, 0, 0])));
  assert.equal(frame.width, 4);
  assert.equal(frame.height, 2);
  assert.ok(Math.abs(frame.luma[0] - 255) < 0.01);
  assert.equal(frame.luma[7], 0);
});

test("カメラ判定：揺らぐ映像は ok、真っ黒・取れないが2回続けば error", () => {
  let track = initialTrack();
  let tick = 0;
  const alive = () => makeBmp(8, 4, (x, y) => [60 + ((x + y + tick) % 7), 70, 80]);
  for (let index = 0; index < 3; index += 1) {
    tick += 1;
    track = nextTrack(track, { ok: true, data: alive() }, 1000 * index);
  }
  assert.equal(track.status, "ok");
  const black = makeBmp(8, 4, () => [0, 0, 0]);
  track = nextTrack(track, { ok: true, data: black }, 4000);
  assert.equal(track.status, "ok", "1回だけなら様子を見る");
  track = nextTrack(track, { ok: true, data: black }, 5000);
  assert.equal(track.status, "error");
  assert.match(track.message, /真っ黒/);
  track = nextTrack(initialTrack(), { ok: false, error: "x" }, 0);
  track = nextTrack(track, { ok: false, error: "x" }, 1000);
  assert.equal(track.status, "error");
});

test("カメラ判定：まったく同じ絵が10秒続いたら「止まっている」", () => {
  const still = makeBmp(8, 4, (x, y) => [100 + x, 90 + y, 80]);
  let track = initialTrack();
  for (let ms = 0; ms <= 8000; ms += 2000) track = nextTrack(track, { ok: true, data: still }, ms);
  assert.equal(track.status, "ok");
  track = nextTrack(track, { ok: true, data: still }, 12_000);
  assert.equal(track.status, "error");
  assert.match(track.message, /止まっています/);
});
