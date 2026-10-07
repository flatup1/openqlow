// NEXT ACTION（次の一手の案内）。普通のダッシュボードの代わりに、次に押すものを文章で1つ示す。
// 優先順位: ①安全（録画停止・カメラ・OBS接続）②進行 ③準備のお知らせ。
// 安全の知らせが出ていても、進行のボタンは止めない（大会を止めないため）。純ロジック。
// かんたんモードでは「OBS」などの英語の専門用語を出さない（EVENT_OS_SPEC.md §2）。
// 仕様: docs/uizin-event-os/EVENT_OS_SPEC.md §5

import { lamp } from "./health.mjs";
import { stepGuide, doneText, entranceOrder } from "./flow.mjs";
import { currentBout, isLastBout, roleAtLeast } from "./engine.mjs";
import { sceneNames } from "./desired.mjs";

const STREAM_SLOW_MS = 60_000;

function alert(level, text, button) {
  return button ? { level, text, button } : { level, text };
}

export function softwareWord(role) {
  return role === "easy" ? "映像ソフト" : "OBS";
}

export function connectionAlert(connection, nowMs, role = "operator") {
  const result = lamp(connection, nowMs);
  if (result.status === "ok") return null;
  const obs = softwareWord(role);
  const reason = connection?.reason;
  if (reason === "auth") return alert("error", `❌ ${obs}のパスワードが違います。運営の人を呼んでください`);
  if (reason === "kicked") return alert("error", `❌ ${obs}側から接続を切られました。運営の人を呼んでください`);
  if (reason === "exiting") return alert("error", `⚠️ ${obs}が終了しています。${obs}を開き直してください（録画が止まっています）`);
  return alert("warn", `⚠️ ${obs}とつながっていません。${obs}が開いているか確かめてください（自動でつなぎ直しています）`);
}

// ctx: { state, config, obs, preflight, nowMs, role, rehearsal, storageError }
export function nextAction(ctx) {
  const { state, config, obs, preflight, nowMs, role } = ctx;
  const word = softwareWord(role);
  const alerts = [];
  const notices = [];
  const connected = lamp(obs?.connection, nowMs).status === "ok";
  const running = state.phase === "running";
  const rehearsalNoRecord = ctx.rehearsal && config?.rehearsal?.record !== true;
  const bout = running ? currentBout(state) : null;
  const hidden = Boolean(bout) && bout.broadcast !== "OK";

  if (ctx.storageError) {
    alerts.push(alert("error", "❌ 操作の記録を保存できません（Macの空き容量を確かめてください）。運営の人を呼んでください"));
  }

  const connAlert = connectionAlert(obs?.connection, nowMs, role);
  if (connAlert) alerts.push(connAlert);

  if (connected && ctx.rehearsal && obs?.stream?.active === true) {
    alerts.push(alert("error", "❌ 練習中なのに配信しています。運営モードで「配信を終える」を押してください"));
  }

  const recordFresh = lamp({ status: "ok", checkedAt: obs?.record?.checkedAt ?? null }, nowMs).status === "ok";
  if (connected && recordFresh && running && obs.record.active === false) {
    if (rehearsalNoRecord) {
      notices.push("🧪 練習中なので録画していません");
    } else {
      alerts.push(alert("error", "❌ 録画が止まっています。すぐに録画を始めてください", { cmd: "record_start", label: "● 録画を始める" }));
    }
  }
  if (connected && recordFresh && obs.record.active === true && obs.record.paused === true) {
    alerts.push(alert("error", "❌ 録画が一時停止しています。すぐに再開してください", { cmd: "record_resume", label: "● 録画を再開する" }));
  }

  const main = lamp(obs?.cameras?.main, nowMs);
  if (connected && main.status === "error") {
    if (obs.cameras.main.kind === "missing") {
      // 部品が無いのは設定の問題。ケーブルを見ても直らないので、運営の人に任せる。
      alerts.push(alert("error", role === "easy"
        ? "❌ メインカメラが映像ソフトの設定にありません。運営の人を呼んでください"
        : `❌ メインカメラが映っていません（${main.message}）。OBSの部品名と設定ファイルの cameras.main を確かめてください`));
    } else {
      alerts.push(alert("error", `❌ メインカメラが映っていません（${main.message}）。ケーブルと電源を確かめてください`));
    }
  }

  // 手動モードのまま配信しない試合に進むと、カメラが映ったままになりうる（人の操作を優先するため）。
  const waitScene = sceneNames(config).WAIT;
  const ngOnCamera = hidden && obs?.manual && obs?.program && obs.program !== waitScene;
  if (ngOnCamera) {
    alerts.push(alert("error", "❌ 配信しない試合なのに、カメラの場面になっています。すぐに「🔁 自動に戻す」を押してください", { cmd: "resume_auto", label: "🔁 自動に戻す" }));
  } else if (obs?.manual) {
    alerts.push(alert("warn", `✋ 手動モード：${word}を直接さわったので、自動の切り替えを止めています`, { cmd: "resume_auto", label: "🔁 自動に戻す" }));
  }

  if (connected && obs?.stream?.reconnectingSince != null) {
    const slow = nowMs - obs.stream.reconnectingSince > STREAM_SLOW_MS;
    alerts.push(alert(
      slow ? "error" : "warn",
      slow
        ? "⚠️ 配信のつなぎ直しが長引いています（試合と録画は続けてOK）。回線が戻ったら運営モードの「配信をやり直す」"
        : "⚠️ 配信をつなぎ直しています（試合と録画は続けてOK）",
    ));
  } else if (connected && running && !ctx.rehearsal && obs?.stream?.wanted && obs.stream.active === false) {
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

  if (hidden && !ngOnCamera) notices.push("🔒 この試合は配信しません（カメラを映さず進めます）");
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

  // かんたんモードには開始前チェックが見えないので、「❌ を直して」ではなく待つように伝える。
  if (state.phase === "setup" && role === "easy") guide.next = "運営の人が準備をしています。少し待ってください";

  const nextBoutNo = state.card?.bouts?.[state.boutIndex]?.no;
  const last = state.lastEvent;
  const undoneType = last?.type === "UNDO" ? ctx.findEventType?.(last.target) : undefined;
  return {
    done: doneText(last, nextBoutNo, undoneType),
    now: guide.now,
    next: guide.next,
    buttons: guide.buttons.filter(button => roleAtLeast(role, button.minRole ?? "easy")),
    alerts,
    notices,
  };
}
