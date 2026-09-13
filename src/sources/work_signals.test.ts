import { mkdir, mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { collectWorkSignals } from "./work_signals.js";
import type { WorkSignal } from "../generators/ai_work_order.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const NOW = new Date("2026-09-13T00:30:00Z"); // JST 2026-09-13 09:30
const TODAY = "2026-09-13";

function trackerRow(cells: string[]): string {
  return `| ${cells.join(" | ")} |`;
}

async function makeVault(rows: string[][], logs: Record<string, string> = {}): Promise<string> {
  const vault = await mkdtemp(path.join(tmpdir(), "openqlow-work-signals-vault-"));
  await mkdir(path.join(vault, "01_DAILY_OPERATIONS", "daily_logs"), { recursive: true });
  await writeFile(
    path.join(vault, "01_DAILY_OPERATIONS", "体験予約・入会管理.md"),
    ["# 体験予約・入会管理", "", "| ID | 表示名 | 予約受付日 | 体験予定日 | 参加状況 | 入会状況 | 入会日 | 更新日時 | 記録元 | 流入 |", "|---|---|---|---|---|---|---|---|---|---|", ...rows.map(trackerRow), ""].join("\n"),
    "utf8",
  );
  for (const [name, body] of Object.entries(logs)) {
    await writeFile(path.join(vault, "01_DAILY_OPERATIONS", "daily_logs", `${name}.md`), body, "utf8");
  }
  return vault;
}

async function makeRoot(pending: Array<{ id: string; dateJst: string }> | null): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "openqlow-work-signals-root-"));
  if (pending) {
    await mkdir(path.join(root, "state", "reply_drafts"), { recursive: true });
    await writeFile(
      path.join(root, "state", "reply_drafts", "pending_notify.json"),
      `${JSON.stringify({ version: 1, items: pending }, null, 2)}\n`,
      "utf8",
    );
  }
  return root;
}

function find(signals: WorkSignal[], kind: WorkSignal["kind"]): WorkSignal | undefined {
  return signals.find(signal => signal.kind === kind);
}

// --- 何も無い場所を読んでも落ちない -------------------------------------------
const emptyRoot = await mkdtemp(path.join(tmpdir(), "openqlow-work-signals-empty-"));
const nothing = await collectWorkSignals({ vaultRoot: emptyRoot, openqlowRoot: emptyRoot, now: NOW });
assert(nothing.signals.length === 0, `missing files => no signals, got ${nothing.signals.length}`);
assert(nothing.notes.some(note => note.includes("記録が無い")), "says the tracker has no records");
assert(nothing.askHuman.length === 1, "asks the one thing it could not read");

// --- 保留中の返信下書き --------------------------------------------------------
const withDrafts = await collectWorkSignals({
  vaultRoot: emptyRoot,
  openqlowRoot: await makeRoot([
    { id: "d1", dateJst: "2026-09-12" },
    { id: "d2", dateJst: TODAY },
  ]),
  now: NOW,
});
const reply = find(withDrafts.signals, "reply_waiting");
assert(reply?.count === 2, `counts pending drafts, got ${reply?.count}`);
assert(reply?.observedOn === TODAY, `uses the newest draft date, got ${reply?.observedOn}`);
assert(!JSON.stringify(withDrafts.signals).includes("d1"), "draft ids and bodies stay out of the signal");

// --- 壊れた pending ファイルでも落ちない ---------------------------------------
const brokenRoot = await mkdtemp(path.join(tmpdir(), "openqlow-work-signals-broken-"));
await mkdir(path.join(brokenRoot, "state", "reply_drafts"), { recursive: true });
await writeFile(path.join(brokenRoot, "state", "reply_drafts", "pending_notify.json"), "{ broken", "utf8");
const broken = await collectWorkSignals({ vaultRoot: emptyRoot, openqlowRoot: brokenRoot, now: NOW });
assert(find(broken.signals, "reply_waiting") === undefined, "broken pending file => no signal, no crash");

// --- 体験台帳: 結果待ち / 未入会フォロー / ペース ------------------------------
const vault = await makeVault([
  ["TRIAL-20260901-001", "山田 T.", "2026-09-01", "2026-09-05", "予約", "未確認", "-", "2026-09-01", "LINE", "LINE"],
  ["TRIAL-20260902-002", "佐藤 K.", "2026-09-02", "2026-09-08", "参加", "検討", "-", "2026-09-08", "LINE", "Google"],
  ["TRIAL-20260903-003", "鈴木 M.", "2026-09-03", "2026-09-09", "参加", "入会", "2026-09-10", "2026-09-10", "LINE", "紹介"],
  ["TRIAL-20260910-004", "田中 A.", "2026-09-10", "2026-09-20", "予約", "未確認", "-", "2026-09-10", "LINE", "SNS"],
]);
const trial = await collectWorkSignals({ vaultRoot: vault, openqlowRoot: emptyRoot, now: NOW });
const pending = find(trial.signals, "trial_pending");
assert(pending?.count === 1, `only past-due bookings count as result-pending, got ${pending?.count}`);
assert(pending?.detail === "TRIAL-20260901-001", `refers to records by id only, got ${pending?.detail}`);
assert(!JSON.stringify(trial.signals).includes("山田"), "customer names never reach the signal");
const followup = find(trial.signals, "trial_followup");
assert(followup?.count === 1, `参加かつ未入会だけがフォロー対象, got ${followup?.count}`);
const growth = find(trial.signals, "growth");
assert(growth, "behind target pace => growth signal");
assert(growth!.detail?.includes("2/30件"), `reports completed vs target, got ${growth!.detail}`);
assert(trial.askHuman.length === 0, "tracker in use => nothing to ask");

// --- 台帳が使われていない月は「遅れ」の根拠にしない ---------------------------
const emptyTracker = await makeVault([]);
const noRecords = await collectWorkSignals({ vaultRoot: emptyTracker, openqlowRoot: emptyRoot, now: NOW });
assert(find(noRecords.signals, "growth") === undefined, "no records => no growth signal (未記録であって遅れではない)");

// --- 壊れた台帳は止めずに未確認として進む -------------------------------------
const badTracker = await makeVault([["TRIAL-20260901-001", "山田 T.", "2026-09-01", "2026-09-05", "?????", "未確認", "-", "2026-09-01", "LINE", "LINE"]]);
const bad = await collectWorkSignals({ vaultRoot: badTracker, openqlowRoot: emptyRoot, now: NOW });
assert(bad.signals.every(signal => signal.kind !== "trial_pending"), "malformed tracker => no trial signals");
assert(bad.notes.some(note => note.includes("読めませんでした")), "malformed tracker is reported, not guessed");

// --- 日次ログの進行中・保留メモ ------------------------------------------------
const logVault = await makeVault([], {
  "2026-09-10": [
    "## LINE自動メモ 2026-09-10T01:00:00.000Z",
    "- source: LINE",
    "- status: CONSIDERING",
    "",
    "体験後アンケートを紙にするか LINE にするか決める",
    "",
  ].join("\n"),
  "2026-09-12": [
    "## LINE自動メモ 2026-09-12T01:00:00.000Z",
    "- source: LINE",
    "- status: IMPLEMENTING",
    "",
    "口コミ依頼のテンプレをAIKAへ入れる途中。連絡先 090-1234-5678 は伏せる",
    "",
  ].join("\n"),
});
const logs = await collectWorkSignals({ vaultRoot: logVault, openqlowRoot: emptyRoot, now: NOW });
const implementing = find(logs.signals, "in_progress");
assert(implementing?.observedOn === "2026-09-12", `uses the memo date, got ${implementing?.observedOn}`);
assert(implementing?.detail?.includes("口コミ依頼のテンプレ"), "carries a short excerpt");
assert(!implementing?.detail?.includes("090-1234-5678"), "phone numbers are masked out of the excerpt");
assert(find(logs.signals, "decision_support")?.observedOn === "2026-09-10", "CONSIDERING memo becomes a decision signal");

// --- 古い未完了リストは採用せず、あることだけ伝える ---------------------------
const aiOs = await mkdtemp(path.join(tmpdir(), "openqlow-work-signals-aios-"));
await mkdir(path.join(aiOs, "tasks"), { recursive: true });
await writeFile(path.join(aiOs, "tasks", "today.md"), "# Today\n- [ ] 古い宿題1\n- [ ] 古い宿題2\n- [x] 済み\n", "utf8");
await utimes(path.join(aiOs, "tasks", "today.md"), new Date("2026-07-07T00:00:00Z"), new Date("2026-07-07T00:00:00Z"));
const withStale = await collectWorkSignals({ vaultRoot: emptyTracker, openqlowRoot: emptyRoot, aiOsRoot: aiOs, now: NOW });
assert(withStale.signals.every(signal => signal.evidence !== "tasks/today.md"), "old checklist never becomes today's work");
const staleNote = withStale.notes.find(note => note.includes("tasks/today.md"));
assert(staleNote?.includes("未完了2件"), `counts only open items, got ${staleNote}`);
assert(staleNote?.includes("2026-07-07"), `shows how old the list is, got ${staleNote}`);

// --- 見出しに書かれた日付を、ファイルの更新日時より優先する -------------------
const datedAiOs = await mkdtemp(path.join(tmpdir(), "openqlow-work-signals-aios-dated-"));
await mkdir(path.join(datedAiOs, "tasks"), { recursive: true });
await writeFile(path.join(datedAiOs, "tasks", "today.md"), "# Today（2026-07-07 の宿題）\n- [ ] 古い宿題\n", "utf8");
const dated = await collectWorkSignals({ vaultRoot: emptyTracker, openqlowRoot: emptyRoot, aiOsRoot: datedAiOs, now: NOW });
assert(
  dated.notes.some(note => note.includes("2026-07-07")),
  `クローンで更新日時がずれても、書かれた日付を使う: ${dated.notes.join(" / ")}`,
);

// --- 今日更新されたリストは「古い」と言わない ---------------------------------
const freshAiOs = await mkdtemp(path.join(tmpdir(), "openqlow-work-signals-aios-fresh-"));
await mkdir(path.join(freshAiOs, "tasks"), { recursive: true });
await writeFile(path.join(freshAiOs, "tasks", "today.md"), "# Today\n- [ ] 今日の宿題\n", "utf8");
await utimes(path.join(freshAiOs, "tasks", "today.md"), NOW, NOW);
const fresh = await collectWorkSignals({ vaultRoot: emptyTracker, openqlowRoot: emptyRoot, aiOsRoot: freshAiOs, now: NOW });
assert(!fresh.notes.some(note => note.includes("tasks/today.md")), "a list updated today is not called stale");

console.log("work_signals.test.ts: all assertions passed");
