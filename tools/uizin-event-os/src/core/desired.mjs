// 今の状態から「OBSがどうなっているべきか（あるべき姿）」を計算する。
// Adapterはこの姿にOBSを合わせる（reconcile）。純ロジック。
// 仕様: docs/uizin-event-os/ARCHITECTURE.md §5.2・§7・§8、EVENT_OS_SPEC.md §12.3

import { currentBout, boutAt } from "./engine.mjs";
import { sceneForStep, WINNER_LABELS } from "./flow.mjs";

export const DEFAULT_SCENES = { WAIT: "WAIT", FIGHTER: "FIGHTER", FIGHT: "FIGHT", WINNER: "WINNER", SAFE: "SAFE", CAM: "CAM" };
export const DEFAULT_CAMERAS = { main: "MAIN", sub: "SUB" };
export const DEFAULT_TEXTS = {
  boutNo: "EOS_BOUT_NO",
  redName: "EOS_RED_NAME",
  blueName: "EOS_BLUE_NAME",
  winnerName: "EOS_WINNER_NAME",
  info: "EOS_INFO",
};

export function sceneNames(config) {
  return { ...DEFAULT_SCENES, ...(config?.scenes ?? {}) };
}

export function cameraNames(config) {
  return { ...DEFAULT_CAMERAS, ...(config?.cameras ?? {}) };
}

export function textNames(config) {
  return { ...DEFAULT_TEXTS, ...(config?.texts ?? {}) };
}

function sceneKeyFor(state, bout) {
  // 配信しない試合は、その試合の間ずっとカメラを映さない（WAIT＝静止画）。
  // 🛟 安全運転より先に判定する（SAFE はメインカメラを直接映すため）。
  if (state.phase === "running" && state.step !== "break" && bout && bout.broadcast !== "OK") return "WAIT";
  if (state.safe) return "SAFE";
  if (state.phase !== "running") return "WAIT";
  if (state.step === "break") return "WAIT";
  return sceneForStep(state.step);
}

function winnerText(bout, result) {
  if (!bout || !result) return "";
  if (result.winner === "red") return bout.red.name;
  if (result.winner === "blue") return bout.blue.name;
  return (WINNER_LABELS[result.winner] ?? "").replace(/^\S+\s/, "");
}

function infoText(state, bout) {
  if (state.phase === "setup") return "まもなく開始します";
  if (state.phase === "ended") return "本日の試合はすべて終了しました";
  if (state.step === "break") return "休憩中";
  if (bout && bout.broadcast !== "OK") return "この試合は配信をお休みします";
  if (state.step === "standby" && bout) return `次の試合 ${bout.red.name} vs ${bout.blue.name}`;
  return "";
}

export function desiredOutputs(state, config) {
  const bout = state.phase === "running" ? currentBout(state) : null;
  const sceneKey = sceneKeyFor(state, bout);
  const scenes = sceneNames(config);
  const texts = textNames(config);
  const hidden = !bout || bout.broadcast !== "OK";
  const result = bout ? state.results[bout.no] : null;

  const textValues = {
    [texts.boutNo]: bout ? `第${bout.no}試合` : "",
    [texts.redName]: hidden ? "" : bout.red.name,
    [texts.blueName]: hidden ? "" : bout.blue.name,
    [texts.winnerName]: hidden || state.step !== "winner" ? "" : winnerText(bout, result),
    [texts.info]: infoText(state, bout),
  };

  const entrance = state.phase === "running" && (state.step === "entrance1" || state.step === "entrance2");
  const mute = {};
  for (const input of config?.audio?.muteDuringEntrance ?? []) mute[input] = entrance;

  return {
    sceneKey,
    programScene: scenes[sceneKey],
    subVisible: state.camera === "sub" && !state.safe,
    texts: textValues,
    mute,
    hidden: Boolean(bout) && hidden,
  };
}

// 次の試合（プレビュー用）。運営画面の一覧で使う。
export function upcomingBouts(state, count = 3) {
  const list = [];
  for (let index = state.boutIndex; index < (state.card?.bouts?.length ?? 0) && list.length < count; index += 1) {
    list.push(boutAt(state, index));
  }
  return list;
}
