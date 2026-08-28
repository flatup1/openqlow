import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { formatName, sanitiseFreeText } from "../privacy/rules.js";
import { formatDateInTimeZone } from "../utils/date.js";

export type AttendanceStatus = "予約" | "参加" | "欠席" | "キャンセル";
export type EnrollmentStatus = "未確認" | "入会" | "検討" | "見送り";
export type AcquisitionSource = "LINE" | "Google" | "SNS" | "紹介" | "その他" | "不明";

export interface TrialRecord {
  id: string;
  displayName: string;
  bookedAt: string;
  trialDate: string;
  attendance: AttendanceStatus;
  enrollment: EnrollmentStatus;
  joinedAt: string;
  updatedAt: string;
  source: "LINE" | "手動";
  acquisitionSource: AcquisitionSource;
}

export interface TrialKpiSummary {
  month: string;
  targetCompleted: number;
  bookings: number;
  completed: number;
  enrolled: number;
  pending: number;
  enrollmentRate: number | null;
  sourceBreakdown: Record<AcquisitionSource, number>;
}

export interface TrialKpiCommandResult {
  ok: boolean;
  message: string;
  summary?: TrialKpiSummary;
}

interface TrialKpiOptions {
  vaultRoot: string;
  now?: Date;
}

const TRACKER_RELATIVE = path.join("01_DAILY_OPERATIONS", "体験予約・入会管理.md");
const TARGET_COMPLETED = 30;
const ACQUISITION_SOURCES: readonly AcquisitionSource[] = ["LINE", "Google", "SNS", "紹介", "その他", "不明"];

function trackerPath(vaultRoot: string): string {
  return path.join(vaultRoot, TRACKER_RELATIVE);
}

function cleanCell(value: string): string {
  return value.replaceAll("|", "／").replace(/\s+/g, " ").trim();
}

function normaliseText(value: string): string {
  return value.normalize("NFKC").replace(/^\s*[/／]\s*/, "").trim();
}

function isIsoDate(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function toIsoDate(raw: string, now: Date): string | undefined {
  const value = raw.normalize("NFKC").trim();
  if (isIsoDate(value)) return value;
  const match = value.match(/^(\d{1,2})(?:\/|月)(\d{1,2})日?$/);
  if (!match) return undefined;
  const year = Number(formatDateInTimeZone(now).slice(0, 4));
  const month = Number(match[1]);
  const day = Number(match[2]);
  const candidate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isIsoDate(candidate) ? candidate : undefined;
}

function parseRecordLine(line: string): TrialRecord | undefined {
  if (!/^\|\s*TRIAL-/.test(line)) return undefined;
  const cells = line.slice(1, -1).split("|").map(cell => cell.trim());
  if (![9, 10].includes(cells.length)) return undefined;
  const [id, displayName, bookedAt, trialDate, attendance, enrollment, joinedAt, updatedAt, source, acquisitionSource = "不明"] = cells;
  if (!/^TRIAL-\d{8}-\d{3}$/.test(id) || !displayName) return undefined;
  if (!isIsoDate(bookedAt) || !isIsoDate(updatedAt)) return undefined;
  if (trialDate !== "未定" && !isIsoDate(trialDate)) return undefined;
  if (joinedAt !== "-" && !isIsoDate(joinedAt)) return undefined;
  if (!["予約", "参加", "欠席", "キャンセル"].includes(attendance)) return undefined;
  if (!["未確認", "入会", "検討", "見送り"].includes(enrollment)) return undefined;
  if (!["LINE", "手動"].includes(source)) return undefined;
  if (!ACQUISITION_SOURCES.includes(acquisitionSource as AcquisitionSource)) return undefined;
  return {
    id,
    displayName,
    bookedAt,
    trialDate: trialDate === "未定" ? "" : trialDate,
    attendance: attendance as AttendanceStatus,
    enrollment: enrollment as EnrollmentStatus,
    joinedAt: joinedAt === "-" ? "" : joinedAt,
    updatedAt,
    source: source === "手動" ? "手動" : "LINE",
    acquisitionSource: acquisitionSource as AcquisitionSource,
  };
}

export async function readTrialRecords(vaultRoot: string): Promise<TrialRecord[]> {
  return loadRecords(vaultRoot);
}

function recordsFromText(text: string): TrialRecord[] {
  const records: TrialRecord[] = [];
  const ids = new Set<string>();
  for (const line of text.split("\n")) {
    if (!/^\|\s*TRIAL-/.test(line)) continue;
    const record = parseRecordLine(line);
    if (!record) throw new Error("体験予約・入会管理.md に不正な記録行があります。上書きせず停止しました。");
    if (ids.has(record.id)) throw new Error(`体験予約・入会管理.md のIDが重複しています: ${record.id}`);
    ids.add(record.id);
    records.push(record);
  }
  return records;
}

async function loadRecords(vaultRoot: string): Promise<TrialRecord[]> {
  try {
    return recordsFromText(await readFile(trackerPath(vaultRoot), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export function summariseTrialRecords(records: TrialRecord[], now: Date = new Date()): TrialKpiSummary {
  const month = formatDateInTimeZone(now).slice(0, 7);
  const bookings = records.filter(record => record.bookedAt.startsWith(month)).length;
  const cohort = records.filter(record => (record.trialDate || record.bookedAt).startsWith(month));
  const completedRecords = cohort.filter(record => record.attendance === "参加");
  const completed = completedRecords.length;
  const enrolled = cohort.filter(record => record.attendance === "参加" && record.enrollment === "入会").length;
  const pending = cohort.filter(record => record.attendance === "予約").length;
  const sourceBreakdown = Object.fromEntries(ACQUISITION_SOURCES.map(source => [source, 0])) as Record<AcquisitionSource, number>;
  for (const record of completedRecords) sourceBreakdown[record.acquisitionSource] += 1;
  return {
    month,
    targetCompleted: TARGET_COMPLETED,
    bookings,
    completed,
    enrolled,
    pending,
    enrollmentRate: completed > 0 ? enrolled / completed : null,
    sourceBreakdown,
  };
}

function summaryLines(summary: TrialKpiSummary): string[] {
  const rate = summary.enrollmentRate === null ? "未集計" : `${(summary.enrollmentRate * 100).toFixed(1)}%`;
  const sources = ACQUISITION_SOURCES.map(source => `${source} ${summary.sourceBreakdown[source]}`).join(" / ");
  return [
    `- 月間体験完了: ${summary.completed}/${summary.targetCompleted}件`,
    `- 入会: ${summary.enrolled}件`,
    `- 入会率: ${rate}（入会者数 ÷ 体験完了数）`,
    `- 流入: ${sources}`,
    `- 予約受付: ${summary.bookings}件`,
    `- 実施確認待ち: ${summary.pending}件`,
  ];
}

function renderTracker(records: TrialRecord[], now: Date): string {
  const summary = summariseTrialRecords(records, now);
  const rows = records
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(record => [
      record.id,
      cleanCell(record.displayName),
      record.bookedAt,
      record.trialDate || "未定",
      record.attendance,
      record.enrollment,
      record.joinedAt || "-",
      record.updatedAt,
      record.source,
      record.acquisitionSource,
    ])
    .map(cells => `| ${cells.join(" | ")} |`);

  return [
    "# 体験予約・入会管理",
    "",
    "> このファイルが体験完了・入会・流入経路の正本です。顧客識別はLINE表示名またはイニシャルに限定します。",
    "> 正式目標: 2026年12月31日までに月間体験完了30件。開始基準は約10件（2026-08-23、JIN自己申告）。",
    "",
    `## ${summary.month} 集計`,
    "",
    ...summaryLines(summary),
    "",
    "## 記録",
    "",
    "| ID | 表示名 | 予約受付日 | 体験実施日 | 参加状況 | 入会状況 | 入会日 | 更新日時 | 記録元 | 流入経路 |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...(rows.length ? rows : ["| - | - | - | - | - | - | - | - | - | - |"]),
    "",
    "## LINE入力例",
    "",
    "- `体験完了 山田 T. 入会 SNS`",
    "- 入会状況: `入会` / `検討` / `見送り` / `未確認`",
    "- 流入経路: `LINE` / `Google` / `SNS` / `紹介` / `その他` / `不明`",
    "- 事前予約も残す場合: `予約 山田 T. 8/20`",
    "- `欠席 山田 T.` / `キャンセル 山田 T.` / `見送り 山田 T.`",
    "- `体験集計`",
    "",
  ].join("\n");
}

async function saveRecords(vaultRoot: string, records: TrialRecord[], now: Date): Promise<void> {
  const file = trackerPath(vaultRoot);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, renderTracker(records, now), "utf8");
}

function nextId(records: TrialRecord[], today: string): string {
  const prefix = `TRIAL-${today.replaceAll("-", "")}-`;
  const max = records
    .filter(record => record.id.startsWith(prefix))
    .map(record => Number(record.id.slice(prefix.length)))
    .filter(Number.isFinite)
    .reduce((value, current) => Math.max(value, current), 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

function normaliseDisplayName(raw: string): string {
  return formatName(sanitiseFreeText(raw).trim());
}

function findLatestRecord(records: TrialRecord[], target: string): TrialRecord | undefined {
  const displayName = normaliseDisplayName(target);
  return records
    .slice()
    .reverse()
    .find(record => record.id === target || record.displayName === displayName);
}

function findLatestPendingRecord(records: TrialRecord[], target: string): TrialRecord | undefined {
  const displayName = normaliseDisplayName(target);
  return records
    .slice()
    .reverse()
    .find(record => (record.id === target || record.displayName === displayName) && record.attendance === "予約");
}

function normaliseEnrollmentStatus(raw: string): EnrollmentStatus | undefined {
  const aliases: Record<string, EnrollmentStatus> = {
    "入会": "入会",
    "入会あり": "入会",
    "あり": "入会",
    "検討": "検討",
    "保留": "検討",
    "見送り": "見送り",
    "入会なし": "見送り",
    "なし": "見送り",
    "未確認": "未確認",
  };
  return aliases[raw.normalize("NFKC").trim()];
}

function normaliseAcquisitionSource(raw: string): AcquisitionSource | undefined {
  const value = raw.normalize("NFKC").trim();
  return ACQUISITION_SOURCES.find(source => source.toLowerCase() === value.toLowerCase());
}

function parseCompletedBody(body: string): { displayName: string; enrollment: EnrollmentStatus; acquisitionSource: AcquisitionSource } | undefined {
  const parts = body.trim().split(/\s+/);
  if (parts.length < 3) return undefined;
  const acquisitionSource = normaliseAcquisitionSource(parts.pop() ?? "");
  const enrollment = normaliseEnrollmentStatus(parts.pop() ?? "");
  const displayName = normaliseDisplayName(parts.join(" "));
  return displayName && enrollment && acquisitionSource
    ? { displayName, enrollment, acquisitionSource }
    : undefined;
}

function parseReservationBody(body: string, now: Date): { displayName: string; trialDate: string } | undefined {
  const parts = body.trim().split(/\s+/);
  if (!parts.length) return undefined;
  const lastPart = parts.at(-1) ?? "";
  const maybeDate = toIsoDate(lastPart, now);
  if (/^(?:\d{4}-\d{2}-\d{2}|\d{1,2}(?:\/|月)\d{1,2}日?)$/.test(lastPart) && !maybeDate) {
    return undefined;
  }
  const nameParts = maybeDate ? parts.slice(0, -1) : parts;
  const displayName = normaliseDisplayName(nameParts.join(" "));
  return displayName ? { displayName, trialDate: maybeDate ?? "" } : undefined;
}

export async function readTrialKpiSummary(vaultRoot: string, now: Date = new Date()): Promise<TrialKpiSummary> {
  return summariseTrialRecords(await loadRecords(vaultRoot), now);
}

export async function executeTrialKpiCommand(text: string, opts: TrialKpiOptions): Promise<TrialKpiCommandResult | undefined> {
  const command = normaliseText(text);
  const now = opts.now ?? new Date();
  const today = formatDateInTimeZone(now);
  const records = await loadRecords(opts.vaultRoot);

  if (/^(?:体験集計|予約集計)$/.test(command)) {
    const summary = summariseTrialRecords(records, now);
    return { ok: true, message: [`【${summary.month} 体験・入会】`, ...summaryLines(summary)].join("\n"), summary };
  }

  const completion = command.match(/^(?:体験完了|完了)\s+(.+)$/);
  if (completion) {
    const parsed = parseCompletedBody(completion[1]);
    if (!parsed) {
      return {
        ok: false,
        message: "入力を確認してください。例：体験完了 山田 T. 入会 SNS",
      };
    }
    let record = findLatestPendingRecord(records, parsed.displayName);
    if (!record) {
      record = {
        id: nextId(records, today),
        displayName: parsed.displayName,
        bookedAt: today,
        trialDate: today,
        attendance: "参加",
        enrollment: parsed.enrollment,
        joinedAt: parsed.enrollment === "入会" ? today : "",
        updatedAt: today,
        source: "LINE",
        acquisitionSource: parsed.acquisitionSource,
      };
      records.push(record);
    } else {
      record.trialDate = today;
      record.attendance = "参加";
      record.enrollment = parsed.enrollment;
      record.joinedAt = parsed.enrollment === "入会" ? today : "";
      record.updatedAt = today;
      record.acquisitionSource = parsed.acquisitionSource;
    }
    await saveRecords(opts.vaultRoot, records, now);
    const summary = summariseTrialRecords(records, now);
    return {
      ok: true,
      message: [
        `${record.displayName}の体験完了を記録しました。`,
        `入会: ${record.enrollment} / 流入: ${record.acquisitionSource}`,
        ...summaryLines(summary).slice(0, 4),
      ].join("\n"),
      summary,
    };
  }

  const reservation = command.match(/^(?:体験予約|予約)\s+(.+)$/);
  if (reservation) {
    const parsed = parseReservationBody(reservation[1], now);
    if (!parsed) return { ok: false, message: "名前または日付を確認してください。入力例：予約 山田 T. 8/20" };
    const duplicate = records.find(record =>
      record.displayName === parsed.displayName
      && record.trialDate === parsed.trialDate
      && record.attendance !== "キャンセル"
    );
    if (duplicate) {
      return { ok: true, message: `同じ予約は登録済みです。\n${duplicate.id} ${duplicate.displayName}` };
    }
    const record: TrialRecord = {
      id: nextId(records, today),
      displayName: parsed.displayName,
      bookedAt: today,
      trialDate: parsed.trialDate,
      attendance: "予約",
      enrollment: "未確認",
      joinedAt: "",
      updatedAt: today,
      source: "LINE",
      acquisitionSource: "不明",
    };
    records.push(record);
    await saveRecords(opts.vaultRoot, records, now);
    const summary = summariseTrialRecords(records, now);
    return {
      ok: true,
      message: [`体験予約を記録しました。`, `${record.id} ${record.displayName} ${record.trialDate || "日程未定"}`, ...summaryLines(summary).slice(0, 1)].join("\n"),
      summary,
    };
  }

  const update = command.match(/^(体験参加|参加|欠席|キャンセル|入会|検討|見送り)\s+(.+)$/);
  if (!update) return undefined;
  const action = update[1];
  const record = findLatestRecord(records, update[2]);
  if (!record) return { ok: false, message: "該当する予約が見つかりません。先に `予約 表示名 日付` で登録してください。" };

  if (action === "体験参加" || action === "参加") {
    record.attendance = "参加";
    record.trialDate = today;
  }
  if (action === "欠席" || action === "キャンセル") {
    record.attendance = action;
    record.enrollment = "未確認";
    record.joinedAt = "";
  }
  if (action === "入会") {
    if (record.attendance !== "参加") {
      return { ok: false, message: "入会率を正しく計算するため、先に `参加 表示名` を記録してください。" };
    }
    record.enrollment = "入会";
    record.joinedAt = today;
  }
  if (action === "検討") record.enrollment = "検討";
  if (action === "見送り") record.enrollment = "見送り";
  record.updatedAt = today;
  await saveRecords(opts.vaultRoot, records, now);
  const summary = summariseTrialRecords(records, now);
  return {
    ok: true,
    message: [`${record.displayName}を「${action}」で更新しました。`, ...summaryLines(summary).slice(0, 3)].join("\n"),
    summary,
  };
}
