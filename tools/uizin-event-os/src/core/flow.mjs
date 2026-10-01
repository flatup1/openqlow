// 大会の進行の「型」。画面の「今」「次」、押すボタン、OBSの場面をここ1か所で決める。
// 純ロジック（時計・通信・ファイルを持たない）。仕様: docs/uizin-event-os/EVENT_OS_SPEC.md §4・§5

export const CORNERS = {
  red: { key: "red", emoji: "🔴", label: "赤" },
  blue: { key: "blue", emoji: "🔵", label: "青" },
};

export const SCENE_KEYS = ["WAIT", "FIGHTER", "FIGHT", "WINNER", "SAFE"];

export const STEPS = ["standby", "entrance1", "entrance2", "fighting", "result", "winner", "break"];

export const WINNER_LABELS = {
  red: "🔴 赤の勝ち",
  blue: "🔵 青の勝ち",
  draw: "🤝 引き分け",
  nocontest: "⚠️ 無効試合",
  skipped: "⏭ この試合はなし",
};

// 入場の順番は大会ごとの設定。既定は赤→青（EVENT_OS_SPEC.md §4.2）。
export function entranceOrder(config) {
  const order = config?.flow?.entranceOrder;
  if (Array.isArray(order) && order.length === 2 && order.includes("red") && order.includes("blue")) {
    return order;
  }
  return ["red", "blue"];
}

export function sceneForStep(step) {
  switch (step) {
    case "entrance1":
    case "entrance2":
      return "FIGHTER";
    case "fighting":
    case "result":
      return "FIGHT";
    case "winner":
      return "WINNER";
    default:
      return "WAIT";
  }
}

// 状態から「今」「次」と、かんたんモードの大きいボタン（最大3つ）を返す。
// bout は今の試合（無ければ null）、isLast は最後の試合か。
export function stepGuide({ phase, step, bout, result, isLast, order, preflightReady }) {
  if (phase === "setup") {
    return {
      now: "準備中",
      next: preflightReady
        ? "準備ができました。運営の人が「大会を始める」を押してください"
        : "開始前チェックの ❌ を直してください",
      buttons: [{ cmd: "start_event", label: "▶ 大会を始める", minRole: "operator" }],
    };
  }
  if (phase === "ended") {
    return {
      now: "🎌 大会終了",
      next: "おつかれさまでした。配信と録画は運営の人が止めます",
      buttons: [],
    };
  }
  const [first, second] = order.map(key => CORNERS[key]);
  const no = bout ? `第${bout.no}試合` : "試合";
  switch (step) {
    case "standby":
      return {
        now: `${no} 待機中`,
        next: `${first.label}の選手を入場させてください`,
        buttons: [
          { cmd: "entrance", args: { corner: first.key }, label: `${first.emoji} ${first.label}入場` },
          { cmd: "break_start", label: "☕ 休憩" },
        ],
      };
    case "entrance1":
      return {
        now: `${first.emoji} ${first.label} 入場中`,
        next: `${second.label}の選手を入場させてください`,
        buttons: [{ cmd: "entrance", args: { corner: second.key }, label: `${second.emoji} ${second.label}入場` }],
      };
    case "entrance2":
      return {
        now: `${second.emoji} ${second.label} 入場中`,
        next: "準備ができたら「試合開始」を押してください",
        buttons: [{ cmd: "fight_start", label: "🥊 試合開始" }],
      };
    case "fighting":
      return {
        now: "🥊 試合中",
        next: "終わったら「試合終了」を押してください",
        buttons: [{ cmd: "fight_end", label: "🏁 試合終了" }],
      };
    case "result":
      return {
        now: "試合終了",
        next: "勝者を選んでください",
        buttons: [
          { cmd: "result", args: { winner: "red" }, label: WINNER_LABELS.red },
          { cmd: "result", args: { winner: "blue" }, label: WINNER_LABELS.blue },
          { cmd: "result", args: { winner: "draw" }, label: WINNER_LABELS.draw },
        ],
      };
    case "winner":
      return {
        now: result ? `🏆 ${WINNER_LABELS[result.winner] ?? "結果を記録しました"}` : "🏆 結果を記録しました",
        next: isLast ? "全試合が終わりました。「大会を終える」を押してください" : "次の試合へ進んでください",
        buttons: isLast
          ? [{ cmd: "event_end", label: "🎌 大会を終える" }]
          : [{ cmd: "next_bout", label: "▶ 次の試合へ" }],
      };
    case "break":
      return {
        now: "☕ 休憩中",
        next: "休憩が終わったら「再開」を押してください",
        buttons: [{ cmd: "break_end", label: "▶ 再開" }],
      };
    default:
      return { now: "状態が分かりません", next: "運営の人を呼んでください", buttons: [] };
  }
}

// 直前の操作を「✅ ○○しました」の文にする（EVENT_OS_SPEC.md §5.2）。
export function doneText(event, boutNo) {
  if (!event) return "";
  switch (event.type) {
    case "START_EVENT":
      return "✅ 大会を始めました";
    case "ENTRANCE":
      return `✅ ${CORNERS[event.corner]?.label ?? ""}の入場に切り替えました`;
    case "FIGHT_START":
      return "✅ 試合を始めました";
    case "FIGHT_END":
      return "✅ 試合が終わりました";
    case "RESULT":
      return `✅ 勝者を記録しました（${WINNER_LABELS[event.winner] ?? ""}）`;
    case "NEXT_BOUT":
      return boutNo ? `✅ 第${boutNo}試合の準備に進みました` : "✅ 次の試合に進みました";
    case "SKIP_BOUT":
      return `✅ 第${event.bout}試合を飛ばしました`;
    case "BREAK_START":
      return "✅ 休憩に入りました";
    case "BREAK_END":
      return "✅ 休憩が終わりました";
    case "EVENT_END":
      return "✅ 大会を終えました";
    case "UNDO":
      return "↩ ひとつ戻しました";
    default:
      return "";
  }
}
