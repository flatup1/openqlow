// 状態エンジン。操作記録（追記だけのイベント列）から今の状態を組み立て、
// 押されたボタンを受け付けるかどうかを決める。純ロジック（時計・通信・ファイルを持たない）。
// 仕様: docs/uizin-event-os/ARCHITECTURE.md §3、EVENT_OS_SPEC.md §4・§6

import { entranceOrder } from "./flow.mjs";

export const ROLES = ["easy", "operator", "admin"];

// 進行を変える操作。画面の版番号（rev）を照合し、受け付けたら rev を1つ進める。
const REV_TYPES = new Set([
  "LOAD_CARD", "START_EVENT", "ENTRANCE", "FIGHT_START", "FIGHT_END", "RESULT",
  "NEXT_BOUT", "SKIP_BOUT", "BREAK_START", "BREAK_END", "EVENT_END", "UNDO",
]);

// 「↩ 戻る」で取り消せる操作。
const UNDOABLE_TYPES = new Set([
  "ENTRANCE", "FIGHT_START", "FIGHT_END", "RESULT", "NEXT_BOUT", "SKIP_BOUT",
  "BREAK_START", "BREAK_END", "EVENT_END",
]);

// かんたんモードでは戻せない操作（試合をまたぐもの）。EVENT_OS_SPEC.md §4.3
const UNDO_NEEDS_OPERATOR = new Set(["NEXT_BOUT", "SKIP_BOUT", "EVENT_END"]);

const BROADCAST_RANK = { OK: 0, REC_ONLY: 1, NG: 2 };

export function roleAtLeast(role, needed) {
  return ROLES.indexOf(role) >= ROLES.indexOf(needed);
}

export function initialState() {
  return {
    rev: 0,
    phase: "setup",
    card: null,
    boutIndex: 0,
    step: "standby",
    results: {},
    edits: {},
    safe: false,
    camera: "main",
    consentAckHash: null,
    humanChecks: {},
    undoStack: [],
    lastEvent: null,
    boutTimes: {},
    recordings: [],
    streams: [],
  };
}

// ---- 読み出し用の小さな関数 ----

export function boutAt(state, index) {
  const raw = state.card?.bouts?.[index];
  if (!raw) return null;
  const corner = key => {
    const edited = state.edits[`${raw.no}:${key}`];
    return edited === undefined ? raw[key] : { ...raw[key], name: edited };
  };
  const red = corner("red");
  const blue = corner("blue");
  return { ...raw, red, blue, broadcast: strictestBroadcast(red.broadcast, blue.broadcast) };
}

export function currentBout(state) {
  return boutAt(state, state.boutIndex);
}

export function strictestBroadcast(a, b) {
  const rank = value => BROADCAST_RANK[value] ?? BROADCAST_RANK.NG;
  return rank(a) >= rank(b) ? normalizeBroadcast(a) : normalizeBroadcast(b);
}

function normalizeBroadcast(value) {
  return value in BROADCAST_RANK ? value : "NG";
}

export function isLastBout(state) {
  const count = state.card?.bouts?.length ?? 0;
  return state.boutIndex >= count - 1;
}

export function notBroadcastCount(state) {
  const bouts = state.card?.bouts ?? [];
  return bouts.filter((_, index) => boutAt(state, index).broadcast !== "OK").length;
}

export function consentAcknowledged(state) {
  if (!state.card) return false;
  if (notBroadcastCount(state) === 0) return true;
  return state.consentAckHash === state.card.hash;
}

// ---- 組み立て（reduce） ----

export function reduce(events) {
  const undone = new Set(events.filter(event => event.type === "UNDO").map(event => event.target));
  let state = initialState();
  for (const event of events) {
    if (typeof event.rev === "number" && event.rev > state.rev) state = { ...state, rev: event.rev };
    if (event.type === "UNDO" || undone.has(event.seq)) {
      if (event.type === "UNDO") state = { ...state, lastEvent: event };
      continue;
    }
    state = apply(state, event);
  }
  return state;
}

function apply(state, event) {
  const s = { ...state };
  const boutNo = s.card?.bouts?.[s.boutIndex]?.no;
  const markTime = key => {
    if (boutNo === undefined) return;
    s.boutTimes = { ...s.boutTimes, [boutNo]: { ...(s.boutTimes[boutNo] ?? {}), [key]: event.at } };
  };
  const pushUndo = () => {
    s.undoStack = [...s.undoStack, event.seq];
    s.lastEvent = event;
  };

  switch (event.type) {
    case "LOAD_CARD": {
      // 読み直したら当日の手直しは消す（別の選手の名前が残らないように）。
      // 今の試合は「位置」ではなく「試合番号」で探し直す。見つからなければ、その試合の最初（待機）に戻す。
      const currentNo = s.card?.bouts?.[s.boutIndex]?.no;
      s.card = { bouts: event.bouts, hash: event.hash, source: event.source, loadedAt: event.at };
      s.edits = {};
      const found = currentNo === undefined ? -1 : event.bouts.findIndex(item => item.no === currentNo);
      if (found >= 0) {
        s.boutIndex = found;
      } else {
        s.boutIndex = Math.min(s.boutIndex, Math.max(0, event.bouts.length - 1));
        if (s.phase === "running" && s.step !== "break") s.step = "standby";
      }
      s.lastEvent = event;
      return s;
    }
    case "START_EVENT":
      s.phase = "running";
      s.boutIndex = 0;
      s.step = "standby";
      s.lastEvent = event;
      return s;
    case "ENTRANCE":
      s.step = s.step === "standby" ? "entrance1" : "entrance2";
      markTime(s.step === "entrance1" ? "entrance1At" : "entrance2At");
      pushUndo();
      return s;
    case "FIGHT_START":
      s.step = "fighting";
      markTime("fightStartAt");
      pushUndo();
      return s;
    case "FIGHT_END":
      s.step = "result";
      markTime("fightEndAt");
      pushUndo();
      return s;
    case "RESULT":
      s.step = "winner";
      s.results = { ...s.results, [event.bout]: { winner: event.winner, at: event.at } };
      markTime("resultAt");
      pushUndo();
      return s;
    case "NEXT_BOUT":
      s.boutIndex += 1;
      s.step = "standby";
      pushUndo();
      return s;
    case "SKIP_BOUT":
      s.results = { ...s.results, [event.bout]: { winner: "skipped", at: event.at } };
      if (event.last) {
        s.phase = "ended";
      } else {
        s.boutIndex += 1;
        s.step = "standby";
      }
      pushUndo();
      return s;
    case "BREAK_START":
      s.step = "break";
      pushUndo();
      return s;
    case "BREAK_END":
      s.step = "standby";
      pushUndo();
      return s;
    case "EVENT_END":
      s.phase = "ended";
      pushUndo();
      return s;
    case "CAMERA":
      s.camera = event.to;
      return s;
    case "SAFE":
      s.safe = Boolean(event.on);
      return s;
    case "FIX_RESULT":
      s.results = { ...s.results, [event.bout]: { winner: event.winner, at: event.at, fixed: true } };
      return s;
    case "EDIT_NAME":
      s.edits = { ...s.edits, [`${event.bout}:${event.corner}`]: event.name };
      return s;
    case "CONSENT_ACK":
      s.consentAckHash = event.hash;
      return s;
    case "HUMAN_CHECK":
      s.humanChecks = { ...s.humanChecks, [event.item]: { checked: Boolean(event.checked), at: event.at } };
      return s;
    case "OBS_RECORD":
      s.recordings = applyOutput(s.recordings, event, true);
      return s;
    case "OBS_STREAM":
      s.streams = applyOutput(s.streams, event, false);
      return s;
    default:
      // 監査用の記録（OPERATOR_ACTION など）は状態を変えない。
      return s;
  }
}

// 録画・配信の「始まった／止まった」を区間の一覧にする。
//  - 開いている区間があるのに「始まった」が来たら重ねない（Event OS の再起動で同じ録画を二度数えない）
//  - 接続が切れて「止まった」とした後、同じ録画のまま続いていた（開始時刻がほぼ同じ）なら区間を開き直す
const SAME_OUTPUT_MS = 5000;
function applyOutput(list, event, withPath) {
  const last = list[list.length - 1];
  if (event.active) {
    if (last && !last.stoppedAt) {
      return withPath && event.path && !last.path ? [...list.slice(0, -1), { ...last, path: event.path }] : list;
    }
    if (last && last.stoppedReason === "disconnect" && Math.abs(Date.parse(event.at) - Date.parse(last.startedAt)) <= SAME_OUTPUT_MS) {
      const reopened = { ...last, stoppedAt: null };
      delete reopened.stoppedReason;
      return [...list.slice(0, -1), reopened];
    }
    const entry = { startedAt: event.at, stoppedAt: null };
    if (withPath) entry.path = event.path ?? null;
    return [...list, entry];
  }
  if (!last || last.stoppedAt) return list;
  const closed = { ...last, stoppedAt: event.at };
  if (withPath) closed.path = event.path ?? last.path ?? null;
  if (event.reason) closed.stoppedReason = event.reason;
  return [...list.slice(0, -1), closed];
}

// ---- 受け付け（decide） ----

function reject(code, message) {
  return { ok: false, code, message };
}

function accept(events) {
  return { ok: true, events };
}

const MIN_ROLE = {
  entrance: "easy",
  fight_start: "easy",
  fight_end: "easy",
  result: "easy",
  next_bout: "easy",
  break_start: "easy",
  break_end: "easy",
  event_end: "easy",
  undo: "easy",
  camera: "easy",
  safe_on: "easy",
  safe_off: "easy",
  start_event: "operator",
  skip_bout: "operator",
  fix_result: "operator",
  edit_name: "operator",
  consent_ack: "operator",
  human_check: "operator",
  load_card: "operator",
};

export function isEngineCommand(type) {
  return type in MIN_ROLE;
}

// ctx: { state, role, now, config, preflightReady, device }
// cmd: { type, args, expectedRev, confirm }
export function decide(ctx, cmd) {
  const { state, role, now, config, device } = ctx;
  const args = cmd.args ?? {};
  const needed = MIN_ROLE[cmd.type];
  if (!needed) return reject("unknown", "知らない操作です");
  if (!roleAtLeast(role, needed)) return reject("forbidden", "この操作は運営モードで行います");

  const base = { at: now, by: device ?? "unknown", role };
  const withRev = extra => ({ ...base, ...extra, rev: state.rev + 1 });
  const revBearing = !["camera", "safe_on", "safe_off", "fix_result", "edit_name", "consent_ack", "human_check"].includes(cmd.type);
  if (revBearing && cmd.expectedRev !== state.rev) {
    return reject("stale", "画面を更新しました。もう一度確かめて押してください");
  }

  const bout = currentBout(state);
  const running = state.phase === "running";
  const needRunning = () => (running ? null : reject("phase", "大会が始まっていません"));
  const needStep = (...steps) => (steps.includes(state.step) ? null : reject("step", "今はその操作はできません"));
  const order = entranceOrder(config);

  switch (cmd.type) {
    case "load_card": {
      if (!Array.isArray(args.bouts) || args.bouts.length === 0) return reject("card", "試合データが空です");
      if (state.phase !== "setup" && !cmd.confirm) return reject("confirm", "大会中の読み直しは確認が必要です");
      return accept([withRev({ type: "LOAD_CARD", bouts: args.bouts, hash: args.hash, source: args.source ?? "csv" })]);
    }
    case "start_event": {
      if (state.phase !== "setup") return reject("phase", "大会はすでに始まっています");
      if (!state.card) return reject("card", "試合データを読み込んでください");
      if (!consentAcknowledged(state)) return reject("consent", "配信しない試合の確認（👤）が済んでいません");
      if (!ctx.preflightReady && !(cmd.confirm && roleAtLeast(role, "admin"))) {
        return reject("preflight", "開始前チェックに ❌ があります");
      }
      return accept([withRev({ type: "START_EVENT", forced: !ctx.preflightReady })]);
    }
    case "entrance": {
      const problem = needRunning() ?? needStep("standby", "entrance1");
      if (problem) return problem;
      const expected = state.step === "standby" ? order[0] : order[1];
      if (args.corner !== expected) return reject("order", "入場の順番が違います");
      return accept([withRev({ type: "ENTRANCE", corner: expected, bout: bout?.no })]);
    }
    case "fight_start": {
      const problem = needRunning() ?? needStep("entrance2");
      if (problem) return problem;
      return accept([withRev({ type: "FIGHT_START", bout: bout?.no })]);
    }
    case "fight_end": {
      const problem = needRunning() ?? needStep("fighting");
      if (problem) return problem;
      return accept([withRev({ type: "FIGHT_END", bout: bout?.no })]);
    }
    case "result": {
      const problem = needRunning() ?? needStep("result");
      if (problem) return problem;
      const allowed = roleAtLeast(role, "operator") ? ["red", "blue", "draw", "nocontest"] : ["red", "blue", "draw"];
      if (!allowed.includes(args.winner)) return reject("winner", "勝者の選び方が違います");
      return accept([withRev({ type: "RESULT", bout: bout?.no, winner: args.winner })]);
    }
    case "next_bout": {
      const problem = needRunning() ?? needStep("winner");
      if (problem) return problem;
      if (isLastBout(state)) return reject("last", "最後の試合です。「大会を終える」を押してください");
      return accept([withRev({ type: "NEXT_BOUT", bout: bout?.no })]);
    }
    case "skip_bout": {
      const problem = needRunning() ?? needStep("standby");
      if (problem) return problem;
      return accept([withRev({ type: "SKIP_BOUT", bout: bout?.no, last: isLastBout(state) })]);
    }
    case "break_start": {
      const problem = needRunning() ?? needStep("standby");
      if (problem) return problem;
      return accept([withRev({ type: "BREAK_START" })]);
    }
    case "break_end": {
      const problem = needRunning() ?? needStep("break");
      if (problem) return problem;
      return accept([withRev({ type: "BREAK_END" })]);
    }
    case "event_end": {
      const problem = needRunning() ?? needStep("winner");
      if (problem) return problem;
      if (!isLastBout(state)) return reject("not_last", "まだ試合が残っています");
      return accept([withRev({ type: "EVENT_END" })]);
    }
    case "undo": {
      const target = state.undoStack[state.undoStack.length - 1];
      if (target === undefined) return reject("nothing", "戻せる操作がありません");
      const targetType = ctx.findEventType?.(target);
      if (UNDO_NEEDS_OPERATOR.has(targetType) && !roleAtLeast(role, "operator")) {
        return reject("forbidden", "試合をまたいで戻すのは運営モードで行います");
      }
      return accept([withRev({ type: "UNDO", target })]);
    }
    case "camera": {
      if (!["main", "sub"].includes(args.to)) return reject("camera", "カメラの指定が違います");
      if (state.camera === args.to) return accept([]);
      return accept([{ ...base, type: "CAMERA", to: args.to, auto: false }]);
    }
    case "safe_on":
      return accept(state.safe ? [] : [{ ...base, type: "SAFE", on: true }]);
    case "safe_off":
      return accept(state.safe ? [{ ...base, type: "SAFE", on: false }] : []);
    case "fix_result": {
      const known = state.card?.bouts?.some(item => item.no === args.bout);
      if (!known) return reject("bout", "その試合番号はありません");
      if (!["red", "blue", "draw", "nocontest"].includes(args.winner)) return reject("winner", "勝者の選び方が違います");
      return accept([{ ...base, type: "FIX_RESULT", bout: args.bout, winner: args.winner }]);
    }
    case "edit_name": {
      const known = state.card?.bouts?.some(item => item.no === args.bout);
      if (!known) return reject("bout", "その試合番号はありません");
      if (!["red", "blue"].includes(args.corner)) return reject("corner", "赤か青を選んでください");
      const name = String(args.name ?? "").trim();
      if (!name) return reject("name", "表示名が空です");
      return accept([{ ...base, type: "EDIT_NAME", bout: args.bout, corner: args.corner, name }]);
    }
    case "consent_ack": {
      if (!state.card) return reject("card", "試合データを読み込んでください");
      // 画面で見ていた試合データと違えば受け付けない（見ていないデータを「確認した」にしない）。
      if (args.hash !== undefined && args.hash !== state.card.hash) {
        return reject("stale", "試合データが読み直されました。配信しない試合をもう一度確かめてください");
      }
      return accept([{ ...base, type: "CONSENT_ACK", hash: state.card.hash, count: notBroadcastCount(state) }]);
    }
    case "human_check": {
      if (typeof args.item !== "string" || !args.item) return reject("item", "確認項目が分かりません");
      return accept([{ ...base, type: "HUMAN_CHECK", item: args.item, checked: Boolean(args.checked) }]);
    }
    default:
      return reject("unknown", "知らない操作です");
  }
}

export function isUndoable(type) {
  return UNDOABLE_TYPES.has(type);
}

export function isRevType(type) {
  return REV_TYPES.has(type);
}
