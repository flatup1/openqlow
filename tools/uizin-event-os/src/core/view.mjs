// 画面に渡す中身（ビュー）を作る。モード（かんたん/運営/管理）で見える範囲だけが変わる。
// かんたんモードの大きいボタンは最大3つ、固定の小ボタンは 📹・🛟・↩ の3つ。純ロジック。
// 仕様: docs/uizin-event-os/EVENT_OS_SPEC.md §2・§3

import { lamp } from "./health.mjs";
import { nextAction } from "./next_action.mjs";
import { currentBout, roleAtLeast, boutAt } from "./engine.mjs";
import { BROADCAST_LABELS } from "./card.mjs";
import { WINNER_LABELS } from "./flow.mjs";
import { upcomingBouts } from "./desired.mjs";

export const MAX_LARGE_BUTTONS = 3;

// 確かめてから時間がたった値は「未確認」にする（✅ を出しっぱなしにしない）。
function outputLamp(output, connected, label, nowMs) {
  const fresh = output && lamp({ status: "ok", checkedAt: output.checkedAt ?? null }, nowMs).status === "ok";
  if (!connected || !fresh) return { status: "unknown", text: `⚠️ ${label} 未確認` };
  if (output.reconnectingSince != null) return { status: "warn", text: `⚠️ ${label} つなぎ直し中` };
  if (output.active && output.paused) return { status: "error", text: `⏸ ${label}一時停止中` };
  return output.active ? { status: "ok", text: `● ${label}中` } : { status: "off", text: `○ ${label}していない` };
}

function cornerView(corner) {
  return { name: corner.name, team: corner.team, broadcast: BROADCAST_LABELS[corner.broadcast] ?? corner.broadcast };
}

// ctx: { state, config, obs, preflight, nowMs, role, rehearsal, findEventType, extras }
export function buildView(ctx) {
  const { state, obs, preflight, nowMs, role, rehearsal } = ctx;
  const action = nextAction(ctx);
  const connected = lamp(obs?.connection, nowMs).status === "ok";
  const bout = state.phase === "running" ? currentBout(state) : null;

  const undoTarget = state.undoStack[state.undoStack.length - 1];
  const undoType = undoTarget === undefined ? null : ctx.findEventType?.(undoTarget);
  const undoNeedsOperator = ["NEXT_BOUT", "SKIP_BOUT", "EVENT_END"].includes(undoType);

  const view = {
    rev: state.rev,
    role,
    rehearsal: Boolean(rehearsal),
    eventName: ctx.config?.eventName ?? "UIZIN",
    phase: state.phase,
    step: state.step,
    bout: bout
      ? { no: bout.no, category: bout.category, red: cornerView(bout.red), blue: cornerView(bout.blue), hidden: bout.broadcast !== "OK" }
      : null,
    done: action.done,
    now: action.now,
    next: action.next,
    buttons: action.buttons.slice(0, MAX_LARGE_BUTTONS),
    alerts: action.alerts,
    notices: action.notices,
    fixed: {
      camera: { current: state.camera, enabled: state.phase === "running" && !state.safe },
      safe: { on: state.safe },
      undo: { enabled: undoTarget !== undefined && (!undoNeedsOperator || roleAtLeast(role, "operator")) },
    },
    lamps: {
      record: outputLamp(obs?.record, connected, "録画", nowMs),
      stream: outputLamp(obs?.stream, connected, "配信", nowMs),
    },
    preflightReady: preflight?.ready === true,
  };

  if (roleAtLeast(role, "operator")) {
    view.operator = {
      lamps: {
        obs: lamp(obs?.connection, nowMs),
        main: lamp(obs?.cameras?.main, nowMs),
        sub: lamp(obs?.cameras?.sub, nowMs),
      },
      manual: Boolean(obs?.manual),
      preflight,
      upcoming: upcomingBouts(state, 4).map(item => ({ no: item.no, red: item.red.name, blue: item.blue.name, broadcast: item.broadcast })),
      results: (state.card?.bouts ?? []).map((_, index) => {
        const item = boutAt(state, index);
        const result = state.results[item.no];
        return { no: item.no, red: item.red.name, blue: item.blue.name, result: result ? WINNER_LABELS[result.winner] : "", winner: result?.winner ?? null };
      }),
      stream: { reconnectingSince: obs?.stream?.reconnectingSince ?? null },
      card: state.card ? { count: state.card.bouts.length, hash: state.card.hash, loadedAt: state.card.loadedAt } : null,
      storageError: Boolean(ctx.storageError),
      canStream: !rehearsal,
      streamActive: obs?.stream?.active === true,
    };
  }
  if (roleAtLeast(role, "admin")) {
    view.admin = { ...(ctx.extras ?? {}) };
  }
  return view;
}
