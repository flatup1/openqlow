// NEXT ACTION（次の一手の案内）。普通のダッシュボードの代わりに、次に押すものを文章で1つ示す。
// 優先順位: ①安全（録画停止・カメラ・OBS接続）②進行 ③準備のお知らせ。
// 安全の知らせが出ていても、進行のボタンは止めない（大会を止めないため）。純ロジック。
// 仕様: docs/uizin-event-os/EVENT_OS_SPEC.md §5

import { lamp } from "./health.mjs";
import { stepGuide, doneText, entranceOrder } from "./flow.mjs";
import { currentBout, isLastBout, roleAtLeast } from "./engine.mjs";

const STREAM_SLOW_MS = 60_000;

function alert(level, text, button) {
  return button ? { level, text, button } : { level, text };
}

export function connectionAlert(connection, nowMs) {
  const result = lamp(connection, nowMs);
  if (result.status === "ok") return null;
  const reason = connection?.reason;
  if (reason === "auth") return alert("error", "❌ OBSのパスワードが違います。運営の人を呼んでください");
  if (reason === "kicked") return alert("error", "❌ OBS側から接続を切られました。運営の人を呼んでください");
  if (reason === "exiting") return alert("error", "⚠️ OBSが終了しています。OBSを開き直してください（録画が止まっています）");
  return alert(
    "warn",
    "⚠️ OBSとつながっていません。OBSが開いているか確かめてください（自動でつなぎ直しています）",
  );
}

// ctx: { state, config, obs, preflight, nowMs, role, rehearsal, findEvent }
export function nextAction(ctx) {
  const { state, config, obs, preflight, nowMs, role } = ctx;
  const alerts = [];
  const notices = [];
  const connected = lamp(obs?.connection, nowMs).status === "ok";
  const running = state.phase === "running";

  const connAlert = connectionAlert(obs?.connection, nowMs);
  if (connAlert) alerts.push(connAlert);

  if (connected && running && obs?.record && obs.record.active === false) {
    alerts.push(alert("error", "❌ 録画が止まっています。すぐに録画を始めてください", { cmd: "record_start", label: "● 録画を始める" }));
  }

  const main = lamp(obs?.cameras?.main, nowMs);
  if (connected && main.status === "error") {
    alerts.push(alert("error", `❌ メインカメラが映っていません（${main.message}）。ケーブルと電源を確かめてください`));
  }

  if (obs?.manual) {
    alerts.push(alert("warn", "✋ 手動モード：OBSを直接さわったので、自動の切り替えを止めています", { cmd: "resume_auto", label: "🔁 自動に戻す" }));
  }

  if (connected && obs?.stream?.reconnectingSince != null) {
    const slow = nowMs - obs.stream.reconnectingSince > STREAM_SLOW_MS;
    alerts.push(alert(
      slow ? "error" : "warn",
      slow
        ? "⚠️ 配信のつなぎ直しが長引いています（試合と録画は続けてOK）。回線が戻ったら運営モードの「配信をやり直す」"
        : "⚠️ 配信をつなぎ直しています（試合と録画は続けてOK）",
    ));
  } else if (connected && running && obs?.stream?.wanted && obs.stream.active === false) {
    alerts.push(alert("warn", "⚠️ 配信が止まっています（録画は続いています）。運営モードで「配信をやり直す」"));
  }

  const minFreeGB = config?.recording?.minFreeGB ?? 50;
  if (obs?.disk && typeof obs.disk.freeBytes === "number" && obs.disk.freeBytes / 1024 ** 3 < minFreeGB / 2) {
    alerts.push(alert("error", "❌ 録画の空き容量が少なくなっています。運営の人を呼んでください"));
  }

  const sub = lamp(obs?.cameras?.sub, nowMs);
  if (connected && sub.status === "error") notices.push("📹 サブカメラが映っていません（メインで続けます）");
  if (state.safe) notices.push("🛟 安全運転中です。落ち着いたら「通常に戻す」を押してください");
  if (obs?.power?.onAC === false) notices.push("🔋 Macが電池で動いています。電源をつないでください");

  const bout = running ? currentBout(state) : null;
  if (bout && bout.broadcast !== "OK") notices.push("🔒 この試合は配信しません（カメラを映さず進めます）");
  if (bout && state.step === "standby") {
    const unknown = [bout.red, bout.blue].filter(corner => !corner.music || corner.music === "未定");
    if (unknown.length > 0) notices.push("🎵 この試合の入場曲が未確認です");
  }

  const guide = stepGuide({
    phase: state.phase,
    step: state.step,
    bout,
    result: bout ? state.results[bout.no] : null,
    isLast: isLastBout(state),
    order: entranceOrder(config),
    preflightReady: preflight?.ready === true,
  });

  const nextBoutNo = state.card?.bouts?.[state.boutIndex]?.no;
  return {
    done: doneText(state.lastEvent, nextBoutNo),
    now: guide.now,
    next: guide.next,
    buttons: guide.buttons.filter(button => roleAtLeast(role, button.minRole ?? "easy")),
    alerts,
    notices,
  };
}
