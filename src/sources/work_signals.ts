// 「今日のAI依頼」を決めるための手がかりを、既にある記録から集める。
//
// 読むのは4か所だけ。新しい保存先は作らない。
//   1. state/reply_drafts/pending_notify.json … JINにまだ渡せていない返信下書き
//   2. 01_DAILY_OPERATIONS/体験予約・入会管理.md … 体験の結果待ち / 体験済み未入会 / 進み具合
//   3. 01_DAILY_OPERATIONS/daily_logs/ … status: IMPLEMENTING / CONSIDERING のメモ
//   4. tasks/today.md（flatup-ai-os） … 古い未完了リスト。採用はせず「古い」とだけ伝える
//
// 読むだけ。書き込みも送信もしない。個人名・連絡先は手がかりに載せない。

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { readTrialRecords, type TrialRecord } from "../commands/trial_kpi.js";
import { sanitiseFreeText } from "../privacy/rules.js";
import { formatDateInTimeZone } from "../utils/date.js";
import type { WorkSignal } from "../generators/ai_work_order.js";

export interface CollectWorkSignalsOptions {
  vaultRoot: string;
  openqlowRoot: string;
  /** flatup-ai-os の場所。古い未完了リストの確認にだけ使う。 */
  aiOsRoot?: string;
  now?: Date;
  /** 体験の月間目標件数。既定30件（体験予約・入会管理.md と同じ）。 */
  monthlyTrialTarget?: number;
}

export interface CollectedWorkSignals {
  signals: WorkSignal[];
  /** AIでは取れなかった情報への質問。 */
  askHuman: string[];
  notes: string[];
}

const MEMO_HEADING = /^## LINE(?:自動メモ|追記) /;

function compact(value: string, max = 60): string {
  const clean = sanitiseFreeText(value).replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

async function readMissing<T>(task: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await task();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

/** JINにまだ渡せていない返信下書き。件数と日付だけを見る（本文は読まない）。 */
async function pendingReplyDrafts(openqlowRoot: string): Promise<WorkSignal[]> {
  const file = path.join(openqlowRoot, "state", "reply_drafts", "pending_notify.json");
  const text = await readMissing(() => readFile(file, "utf8"), "");
  if (!text.trim()) return [];
  let items: Array<{ id?: string; dateJst?: string }> = [];
  try {
    const parsed = JSON.parse(text) as { items?: unknown };
    items = Array.isArray(parsed.items) ? (parsed.items as Array<{ id?: string; dateJst?: string }>) : [];
  } catch {
    // 壊れていたら手がかりが無いものとして扱う。ここで落とさない。
    return [];
  }
  if (items.length === 0) return [];
  const dates = items.map(item => item.dateJst).filter((value): value is string => Boolean(value)).sort();
  return [{
    kind: "reply_waiting",
    count: items.length,
    evidence: "state/reply_drafts/pending_notify.json",
    observedOn: dates.at(-1) ?? "",
  }];
}

function latestDate(values: string[]): string {
  return values.filter(Boolean).sort().at(-1) ?? "";
}

/** 体験台帳から、結果待ち・未入会フォロー・進み具合を読む。 */
function trialSignals(records: TrialRecord[], todayJst: string, monthlyTarget: number): WorkSignal[] {
  const signals: WorkSignal[] = [];
  const evidence = "01_DAILY_OPERATIONS/体験予約・入会管理.md";

  // 体験予定日を過ぎているのに参加状況が「予約」のまま = 結果が未記録。
  const resultPending = records.filter(r => r.attendance === "予約" && r.trialDate && r.trialDate < todayJst);
  if (resultPending.length > 0) {
    signals.push({
      kind: "trial_pending",
      count: resultPending.length,
      evidence,
      observedOn: latestDate(resultPending.map(r => r.trialDate)),
      detail: resultPending.map(r => r.id).slice(0, 5).join(" / "),
    });
  }

  // 体験に参加したが入会が決まっていない = フォロー対象。
  const followup = records.filter(r => r.attendance === "参加" && (r.enrollment === "未確認" || r.enrollment === "検討"));
  if (followup.length > 0) {
    signals.push({
      kind: "trial_followup",
      count: followup.length,
      evidence,
      observedOn: latestDate(followup.map(r => r.trialDate || r.updatedAt.slice(0, 10))),
      detail: followup.map(r => r.id).slice(0, 5).join(" / "),
    });
  }

  // 目標ペースとの比較。台帳が1件も使われていない月は「未記録」であって、遅れの根拠にしない。
  const month = todayJst.slice(0, 7);
  const thisMonth = records.filter(r => (r.trialDate || r.bookedAt).startsWith(month));
  if (thisMonth.length > 0) {
    const completed = thisMonth.filter(r => r.attendance === "参加").length;
    const day = Number(todayJst.slice(8, 10));
    const daysInMonth = new Date(Date.UTC(Number(todayJst.slice(0, 4)), Number(todayJst.slice(5, 7)), 0)).getUTCDate();
    const pace = Math.floor((monthlyTarget * day) / daysInMonth);
    if (completed < pace) {
      signals.push({
        kind: "growth",
        count: pace - completed,
        evidence,
        observedOn: todayJst,
        detail: `体験参加 ${completed}/${monthlyTarget}件・今日時点の目安 ${pace}件`,
      });
    }
  }

  return signals;
}

interface DailyMemo {
  status: string;
  body: string;
  date: string;
}

function parseMemos(text: string, date: string): DailyMemo[] {
  const sections = Array.from(text.matchAll(/^## .+$/gm));
  return sections
    .filter(section => MEMO_HEADING.test(section[0]))
    .map((section) => {
      const start = (section.index ?? 0) + section[0].length;
      const end = sections.find(next => (next.index ?? 0) > (section.index ?? 0))?.index ?? text.length;
      const block = text.slice(start, end);
      const status = block.match(/^- status:\s*(.+)$/m)?.[1]?.trim() ?? "IDEA";
      const body = block
        .split("\n")
        .filter(line => !/^- (?:source|status|capture):/.test(line) && !/^-{3,}$/.test(line.trim()))
        .join("\n")
        .trim();
      return { status, body, date };
    })
    .filter(memo => memo.body);
}

/** 日次ログの「進行中」「保留」メモ。直近14ファイルだけを見る。 */
async function dailyLogSignals(vaultRoot: string): Promise<WorkSignal[]> {
  const dir = path.join(vaultRoot, "01_DAILY_OPERATIONS", "daily_logs");
  const names = await readMissing(async () => await readdir(dir), [] as string[]);
  const targets = names.filter(name => /^\d{4}-\d{2}-\d{2}\.md$/.test(name)).sort().slice(-14);
  const memos: DailyMemo[] = [];
  for (const name of targets) {
    const text = await readMissing(() => readFile(path.join(dir, name), "utf8"), "");
    memos.push(...parseMemos(text, name.replace(/\.md$/, "")));
  }

  const signals: WorkSignal[] = [];
  const pick = (status: string, kind: WorkSignal["kind"]): void => {
    const hit = memos.filter(memo => memo.status === status);
    const newest = hit.at(-1);
    if (!newest) return;
    signals.push({
      kind,
      count: hit.length,
      evidence: `01_DAILY_OPERATIONS/daily_logs/${newest.date}.md`,
      observedOn: newest.date,
      detail: compact(newest.body),
    });
  };
  pick("IMPLEMENTING", "in_progress");
  pick("CONSIDERING", "decision_support");
  return signals;
}

/**
 * リストが「いつのものか」を決める。
 * 見出しに書かれた日付を優先する。ファイルの更新日時は、コピーやクローンでずれるため後回し。
 */
async function checklistDate(file: string, text: string): Promise<string> {
  const written = text.split("\n").slice(0, 5).join("\n").match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (written) return written;
  const info = await readMissing(() => stat(file), undefined);
  return info ? formatDateInTimeZone(info.mtime) : "不明";
}

/** 古い未完了リストは今日の仕事にしない。あることだけ伝える。 */
async function staleChecklistNote(aiOsRoot: string, todayJst: string): Promise<string | undefined> {
  const file = path.join(aiOsRoot, "tasks", "today.md");
  const text = await readMissing(() => readFile(file, "utf8"), "");
  if (!text) return undefined;
  const open = (text.match(/^\s*- \[ \]/gm) ?? []).length;
  if (open === 0) return undefined;
  const writtenOn = await checklistDate(file, text);
  if (writtenOn === todayJst) return undefined;
  return `tasks/today.md に未完了${open}件（日付 ${writtenOn}）。古いので今日の仕事には採用していない。棚卸しが要るならJINが指示する。`;
}

/**
 * 体験台帳を読む。壊れた行があっても落とさず、「未確認」として先へ進む。
 * 直すのはJINの仕事なので、勝手に書き換えない。
 */
async function readTrialTracker(vaultRoot: string): Promise<{ records: TrialRecord[]; notes: string[] }> {
  try {
    return { records: await readTrialRecords(vaultRoot), notes: [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { records: [], notes: [] };
    return {
      records: [],
      notes: [`体験予約・入会管理.md を読めませんでした（${(error as Error).message}）。体験まわりは未確認のまま進めています。`],
    };
  }
}

/** 既存の記録だけから手がかりを集める。読み取り専用。 */
export async function collectWorkSignals(options: CollectWorkSignalsOptions): Promise<CollectedWorkSignals> {
  const now = options.now ?? new Date();
  const todayJst = formatDateInTimeZone(now, "Asia/Tokyo");
  const monthlyTarget = options.monthlyTrialTarget ?? 30;

  const [drafts, trial, logs] = await Promise.all([
    pendingReplyDrafts(options.openqlowRoot),
    readTrialTracker(options.vaultRoot),
    dailyLogSignals(options.vaultRoot),
  ]);
  const records = trial.records;

  const signals = [...drafts, ...trialSignals(records, todayJst, monthlyTarget), ...logs];
  const notes = [...trial.notes];
  const askHuman: string[] = [];

  if (options.aiOsRoot) {
    const stale = await staleChecklistNote(options.aiOsRoot, todayJst);
    if (stale) notes.push(stale);
  }
  if (records.length === 0) {
    notes.push("体験予約・入会管理.md に記録が無いため、体験まわりの判断材料は未確認。");
    askHuman.push("今週、体験予約または体験参加はありましたか？（あれば台帳に記録が要ります）");
  }

  return { signals, askHuman, notes };
}
