import { buildAiWorkOrder, daysBefore, renderWorkOrder, type WorkSignal } from "./ai_work_order.js";
import { parseArgs } from "./ai_work_order_cli.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const TODAY = "2026-09-13";

function signal(partial: Partial<WorkSignal> & Pick<WorkSignal, "kind">): WorkSignal {
  return { count: 1, evidence: "test", observedOn: TODAY, ...partial };
}

// --- 手がかりが無ければ仕事を作らない ---------------------------------------
const empty = buildAiWorkOrder({ dateJst: TODAY, signals: [] });
assert(empty.hasWork === false, "no signals => no work");
assert(empty.task === undefined, "no signals => no task");
assert(empty.notes.some(note => note.includes("追加のAI作業なし")), "no signals => says no work today");
assert(renderWorkOrder(empty).includes("今日は追加のAI作業なし"), "render says no work today");

// --- 件数0の手がかりは仕事にしない -------------------------------------------
const zero = buildAiWorkOrder({ dateJst: TODAY, signals: [signal({ kind: "reply_waiting", count: 0 })] });
assert(zero.hasWork === false, "count 0 => no work");

// --- 出す仕事は常に1件だけ ---------------------------------------------------
const many = buildAiWorkOrder({
  dateJst: TODAY,
  signals: [
    signal({ kind: "growth", count: 5 }),
    signal({ kind: "trial_followup", count: 2 }),
    signal({ kind: "reply_waiting", count: 3 }),
  ],
});
assert(many.hasWork, "signals => work");
assert(many.task?.kind === "reply_waiting", `returns waiting customers first, got ${many.task?.kind}`);
assert(many.skipped.length === 2, `other signals are skipped, got ${many.skipped.length}`);
assert(many.skipped.every(line => line.includes("1件だけ")), "skip reason explains the one-per-day rule");

// --- 優先順位は 朝の司令書 §今日の優先順位ルール に従う -----------------------
const order: Array<[WorkSignal["kind"], WorkSignal["kind"]]> = [
  ["reply_waiting", "trial_pending"],
  ["trial_pending", "trial_followup"],
  ["trial_followup", "in_progress"],
  ["in_progress", "decision_support"],
  ["decision_support", "growth"],
];
for (const [stronger, weaker] of order) {
  const picked = buildAiWorkOrder({
    dateJst: TODAY,
    signals: [signal({ kind: weaker, count: 9 }), signal({ kind: stronger, count: 1 })],
  });
  assert(picked.task?.kind === stronger, `${stronger} outranks ${weaker}, got ${picked.task?.kind}`);
}

// --- 古い未完了は今日の仕事にしない -------------------------------------------
const stale = buildAiWorkOrder({
  dateJst: TODAY,
  signals: [signal({ kind: "in_progress", observedOn: "2026-07-07", evidence: "tasks/today.md" })],
});
assert(stale.hasWork === false, "signal older than 14 days is not adopted");
assert(stale.skipped.some(line => line.includes("68日前")), `skip line reports the age, got ${stale.skipped.join(" / ")}`);

const freshEnough = buildAiWorkOrder({
  dateJst: TODAY,
  signals: [signal({ kind: "in_progress", observedOn: "2026-09-01" })],
});
assert(freshEnough.hasWork, "12 days old is still adopted with the default window");

const widened = buildAiWorkOrder({
  dateJst: TODAY,
  signals: [signal({ kind: "in_progress", observedOn: "2026-07-07" })],
  staleAfterDays: 120,
});
assert(widened.hasWork, "stale window is configurable");

// --- 持ち時間に収まる仕事だけを選ぶ -------------------------------------------
const short = buildAiWorkOrder({
  dateJst: TODAY,
  signals: [signal({ kind: "in_progress" }), signal({ kind: "trial_pending" })],
  minutesAvailable: 10,
});
assert(short.task?.kind === "trial_pending", `10分なら10分の仕事を選ぶ, got ${short.task?.kind}`);
assert(short.skipped.some(line => line.includes("持ち時間")), "skipped line explains the time limit");

const noTime = buildAiWorkOrder({
  dateJst: TODAY,
  signals: [signal({ kind: "in_progress" })],
  minutesAvailable: 5,
});
assert(noTime.hasWork === false, "nothing fits => no work today");
assert(noTime.notes.some(note => note.includes("持ち時間")), "explains why nothing was chosen");

// --- 依頼文はそのまま貼れて、実行系を含まない -------------------------------
for (const kind of ["reply_waiting", "trial_pending", "trial_followup", "in_progress", "decision_support", "growth"] as const) {
  const built = buildAiWorkOrder({ dateJst: TODAY, signals: [signal({ kind, count: 3 })] });
  const task = built.task;
  assert(task, `${kind} produces a task`);
  assert(task!.requestText.includes("やらないこと"), `${kind}: request text states what not to do`);
  assert(task!.requestText.length > 60, `${kind}: request text is usable as-is`);
  assert(task!.doneWhen.length >= 2, `${kind}: has done conditions`);
  assert(task!.references.length >= 1, `${kind}: has references`);
  assert(task!.humanCheckpoints.length >= 1, `${kind}: has human checkpoints`);
  assert(task!.reason.includes("根拠"), `${kind}: reason cites evidence`);
  assert(!/npm run (?:serve|loop|daily)\b/.test(task!.requestText), `${kind}: does not start production jobs`);
}

// --- 顧客対応の依頼は必ず「送らない」と書く -----------------------------------
for (const kind of ["reply_waiting", "trial_followup"] as const) {
  const built = buildAiWorkOrder({ dateJst: TODAY, signals: [signal({ kind })] });
  assert(built.task!.requestText.includes("送信"), `${kind}: request text forbids sending`);
  assert(built.task!.humanCheckpoints.some(point => point.includes("送信")), `${kind}: sending stays with the human`);
}

// --- 数字の意味が分かる書き方になっている -----------------------------------
const growthOnly = buildAiWorkOrder({ dateJst: TODAY, signals: [signal({ kind: "growth", count: 4, detail: "体験参加 2/30件" })] });
assert(growthOnly.task!.reason.includes("目安に4件不足"), `growth の数字は不足数だと分かる: ${growthOnly.task!.reason}`);
const growthSkipped = buildAiWorkOrder({
  dateJst: TODAY,
  signals: [signal({ kind: "reply_waiting" }), signal({ kind: "growth", count: 4 })],
});
assert(growthSkipped.skipped.some(line => line.includes("目安に4件不足")), "見送り行でも数字の意味を変えない");

// --- 聞くことは最大2件まで ----------------------------------------------------
const asked = buildAiWorkOrder({
  dateJst: TODAY,
  signals: [],
  askHuman: ["質問1", "質問2", "質問3"],
});
assert(asked.askHuman.length === 2, `asks at most 2 questions, got ${asked.askHuman.length}`);

// --- 表示は7項目と時間記録を含む ----------------------------------------------
const rendered = renderWorkOrder(buildAiWorkOrder({ dateJst: TODAY, signals: [signal({ kind: "reply_waiting", count: 2 })] }));
for (const heading of ["今日やること", "今やる理由", "参照する資料", "完成条件", "担当するAI", "そのまま使える依頼文", "人間確認が必要な地点", "時間の記録"]) {
  assert(rendered.includes(heading), `render includes ${heading}`);
}
assert(rendered.includes(TODAY), "render includes the date");

// --- 日付の差 -----------------------------------------------------------------
assert(daysBefore(TODAY, TODAY) === 0, "same day => 0");
assert(daysBefore(TODAY, "2026-09-06") === 7, "a week ago => 7");
assert(daysBefore(TODAY, "") === null, "unparsable date => null");
const acrossMonth = buildAiWorkOrder({ dateJst: "2026-03-02", signals: [signal({ kind: "in_progress", observedOn: "2026-02-28" })] });
assert(acrossMonth.hasWork, "month boundary is handled");

// --- CLI 引数 -----------------------------------------------------------------
const args = parseArgs(["--minutes", "15", "--date", "2026-09-13", "--json", "--stale", "7"]);
assert(args.minutesAvailable === 15, "parses --minutes");
assert(args.dateJst === "2026-09-13", "parses --date");
assert(args.staleAfterDays === 7, "parses --stale");
assert(args.json === true, "parses --json");
const bad = parseArgs(["--minutes", "0", "--date", "9/13"]);
assert(bad.minutesAvailable === undefined, "rejects non-positive minutes");
assert(bad.dateJst === undefined, "rejects a malformed date");
assert(parseArgs([]).json === false, "defaults to text output");

console.log("ai_work_order.test.ts: all assertions passed");
