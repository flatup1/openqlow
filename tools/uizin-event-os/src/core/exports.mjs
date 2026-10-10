// 大会後の書き出し。操作記録から次の3つを作る（純ロジック）。
//  1. YouTube 概要欄用のチャプター文（試合番号だけ。選手名は公開文に入れない）
//  2. 切り抜きツール（tools/uizin-clipper）用の segments.json（録画ファイルごと）
//  3. 切り抜きツールの精度検証用 truth.yml
// 仕様: docs/uizin-event-os/ARCHITECTURE.md §9

import { boutAt } from "./engine.mjs";
import { WINNER_LABELS } from "./flow.mjs";

const RESULT_TEXT = {
  red: "赤の勝ち",
  blue: "青の勝ち",
  draw: "引き分け",
  nocontest: "無効試合",
  skipped: "試合なし",
};

function ms(iso) {
  return Date.parse(iso);
}

export function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = value => String(value).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// 配信して映像が残っている試合だけを、時刻つきで並べる。
export function boutTimeline(state) {
  const list = [];
  for (let index = 0; index < (state.card?.bouts?.length ?? 0); index += 1) {
    const bout = boutAt(state, index);
    const times = state.boutTimes[bout.no];
    if (!times?.fightStartAt) continue;
    list.push({
      no: bout.no,
      bout,
      broadcast: bout.broadcast,
      entranceAt: times.entrance1At ?? times.fightStartAt,
      fightStartAt: times.fightStartAt,
      fightEndAt: times.fightEndAt ?? null,
      resultAt: times.resultAt ?? null,
      result: state.results[bout.no] ?? null,
    });
  }
  return list;
}

// YouTube のチャプターは「00:00 から始まる」「3つ以上」「各10秒以上」が条件。
export function youtubeChapters(state, { includeEntrance = true } = {}) {
  const stream = state.streams[0];
  if (!stream) return { ok: false, text: "", reason: "配信の開始時刻の記録がありません" };
  const start = ms(stream.startedAt);
  const lines = [{ t: 0, label: "オープニング" }];
  for (const entry of boutTimeline(state)) {
    if (entry.broadcast !== "OK") continue;
    const at = includeEntrance ? ms(entry.entranceAt) : ms(entry.fightStartAt);
    lines.push({ t: Math.max(0, (at - start) / 1000), label: `第${entry.no}試合` });
  }
  const chapters = [];
  for (const line of lines) {
    const previous = chapters[chapters.length - 1];
    if (previous && line.t - previous.t < 10) continue;
    chapters.push(line);
  }
  if (chapters.length < 3) return { ok: false, text: "", reason: "チャプターが3つに足りません" };
  return { ok: true, text: chapters.map(line => `${formatClock(line.t)} ${line.label}`).join("\n") };
}

function recordingFor(state, atIso) {
  const at = ms(atIso);
  return state.recordings.find(rec => ms(rec.startedAt) <= at && (!rec.stoppedAt || at <= ms(rec.stoppedAt)));
}

// 切り抜きツールの manifest（version 1）。録画ファイルごとに1つ作る。
// 必須: version, source.path, source.title, 各試合の index(1〜)・start_sec・end_sec・confidence(数値)
export function clipperManifests(state, { eventName, preRollSec = 6, postRollSec = 20, generatedAt }) {
  const groups = new Map();
  for (const entry of boutTimeline(state)) {
    if (entry.broadcast !== "OK" || !entry.fightEndAt) continue;
    const rec = recordingFor(state, entry.fightStartAt);
    if (!rec) continue;
    if (!groups.has(rec)) groups.set(rec, []);
    groups.get(rec).push(entry);
  }
  const manifests = [];
  let fileNo = 0;
  for (const [rec, entries] of groups) {
    fileNo += 1;
    const base = ms(rec.startedAt);
    const durationSec = rec.stoppedAt ? (ms(rec.stoppedAt) - base) / 1000 : null;
    const clamp = value => {
      const floored = Math.max(0, value);
      return durationSec == null ? floored : Math.min(floored, durationSec);
    };
    const round = value => Math.round(value * 1000) / 1000;
    const segments = entries.map((entry, index) => {
      const core0 = (ms(entry.fightStartAt) - base) / 1000;
      const core1 = (ms(entry.fightEndAt) - base) / 1000;
      const tail = entry.resultAt ? Math.max(core1, (ms(entry.resultAt) - base) / 1000) : core1;
      return {
        index: index + 1,
        start_sec: round(clamp(core0 - preRollSec)),
        end_sec: round(clamp(tail + postRollSec)),
        core_start_sec: round(clamp(core0)),
        core_end_sec: round(clamp(core1)),
        confidence: 1.0,
        flags: ["event_os"],
        red: entry.bout.red.name,
        blue: entry.bout.blue.name,
        result: RESULT_TEXT[entry.result?.winner] ?? "",
        title: `第${entry.no}試合`,
        note: "",
        skip: false,
        locked: true,
        event_os_bout: entry.no,
      };
    });
    manifests.push({
      fileNo,
      manifest: {
        version: 1,
        generated_at: generatedAt,
        source: { path: rec.path ?? "", title: eventName, recorded_at: rec.startedAt },
        profile: {},
        segments,
      },
    });
  }
  return manifests;
}

// 精度検証用（切り抜きツールの report --truth）。試合中（ゴング〜ゴング）だけ。
export function truthYaml(state) {
  const rec = state.recordings[0];
  if (!rec) return "";
  const base = ms(rec.startedAt);
  const lines = ["matches:"];
  for (const entry of boutTimeline(state)) {
    if (entry.broadcast !== "OK" || !entry.fightEndAt) continue;
    if (recordingFor(state, entry.fightStartAt) !== rec) continue;
    const start = ((ms(entry.fightStartAt) - base) / 1000).toFixed(1);
    const end = ((ms(entry.fightEndAt) - base) / 1000).toFixed(1);
    lines.push(`  - start: ${start}`, `    end: ${end}`, `    label: "第${entry.no}試合"`);
  }
  return `${lines.join("\n")}\n`;
}

// 結果の一覧（運営が確認・Sheetsへ手で戻す用）。
export function resultsCsv(state) {
  const rows = [["試合番号", "赤_表示名", "青_表示名", "結果"]];
  for (let index = 0; index < (state.card?.bouts?.length ?? 0); index += 1) {
    const bout = boutAt(state, index);
    const result = state.results[bout.no];
    rows.push([bout.no, bout.red.name, bout.blue.name, result ? (WINNER_LABELS[result.winner] ?? "") : ""]);
  }
  const escape = value => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `﻿${rows.map(row => row.map(escape).join(",")).join("\r\n")}\r\n`;
}
