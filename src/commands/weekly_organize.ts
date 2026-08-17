// /整理 週次メモ整理コマンド
//
// daily_logs の直近7日分を読み、週次レビューの「下書き」を Vault に書き出す。
//
// 方針:
//  - AIによる要約はしない。原文をそのまま日付順に並べる（記録の改変・捏造を避ける）。
//  - 判断が必要なものだけを拾い上げる（記録のない日 / 体験・入会 / 決定メモ / 長文メモ）。
//  - 正本（00_CORE など）には一切書かない。書くのは weekly_reviews の下書きのみ。
//    正本への反映は JIN が承認してから人間が行う。

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalLineCommand, normalizeLineText } from "../line_bot/normalize_command.js";
import { sanitiseFreeText } from "../privacy/rules.js";
import { formatDateInTimeZone } from "../utils/date.js";

export const DAILY_LOG_DIRECTORY = "01_DAILY_OPERATIONS/daily_logs";
export const WEEKLY_REVIEW_DIRECTORY = "01_DAILY_OPERATIONS/weekly_reviews";

/** これ以上長いメモは原文を貼らず、件名だけ出して「要確認」に回す。 */
const LONG_MEMO_CHARS = 1500;
/** LINE 返信の安全上限（LINE は 5000 字）。 */
const LINE_SAFE_CHARS = 4800;

/** メモとして扱う見出し。日次チェックなどの自動生成セクションは対象外。 */
// 日本語では \b が効かないため、後続が空白か行末であることを明示する。
const MEMO_HEADING = /^##\s+(?:LINE追記|LINE自動メモ|追記)(?=\s|$)/;
/** 見出し直下の `- source:` `- status:` などのメタ行。 */
const META_LINE = /^-\s*(?:source|status|capture)\s*:/i;

export interface WeeklyRange {
  /** 対象開始日 YYYY-MM-DD（含む） */
  start: string;
  /** 対象終了日 YYYY-MM-DD（含む） */
  end: string;
}

export interface WeeklyMemo {
  /** 記録日（ファイル名の日付） YYYY-MM-DD */
  date: string;
  /** 見出し行そのもの */
  heading: string;
  /** メタ行を除いた本文 */
  body: string;
}

export interface WeeklyOrganizeResult {
  handled: boolean;
  ok: boolean;
  message: string;
  meta?: Record<string, unknown>;
}

/**
 * "整理" / "整理 先週" 形式から対象期間を取り出す。
 * 認識できない引数のときは undefined を返し、通常のメモとして扱わせる。
 */
export function parseWeeklyOrganizeCommand(
  text: string,
  now: Date = new Date(),
  timeZone = "Asia/Tokyo",
): WeeklyRange | undefined {
  if (canonicalLineCommand(text) !== "/整理") return undefined;

  const normalized = normalizeLineText(text);
  const arg = normalized.replace(/^\/?(?:整理|せいり|週次整理|organize)\s*/, "").trim();

  const today = formatDateInTimeZone(now, timeZone);
  if (!arg || arg === "今週" || arg === "this") {
    return { start: shiftDate(today, -6), end: today };
  }
  if (arg === "先週" || arg === "last") {
    return { start: shiftDate(today, -13), end: shiftDate(today, -7) };
  }
  return undefined;
}

/** YYYY-MM-DD を days 日ずらす（UTC基準で日付だけ動かす）。 */
function shiftDate(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** 期間内の日付を古い順に並べる。 */
export function datesInRange(range: WeeklyRange): string[] {
  const out: string[] = [];
  let cursor = range.start;
  // 無限ループ防止に上限を置く（週次なので通常は7日）
  for (let i = 0; i < 366 && cursor <= range.end; i += 1) {
    out.push(cursor);
    cursor = shiftDate(cursor, 1);
  }
  return out;
}

/** 1日分の daily log からメモ見出しの塊を切り出す。 */
export function parseDailyLog(date: string, content: string): WeeklyMemo[] {
  const lines = content.split(/\r?\n/);
  const memos: WeeklyMemo[] = [];
  let current: { heading: string; body: string[] } | undefined;

  const flush = () => {
    if (!current) return;
    const body = current.body.join("\n").trim();
    memos.push({ date, heading: current.heading.trim(), body });
    current = undefined;
  };

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush();
      current = MEMO_HEADING.test(line) ? { heading: line, body: [] } : undefined;
      continue;
    }
    if (!current) continue;
    if (META_LINE.test(line)) continue;
    current.body.push(line);
  }
  flush();

  return memos.filter(memo => memo.body.length > 0);
}

/** 期間内の daily log を読み込む。ファイルが無い日は静かに飛ばす。 */
export async function collectWeeklyMemos(
  vaultRoot: string,
  range: WeeklyRange,
): Promise<WeeklyMemo[]> {
  const memos: WeeklyMemo[] = [];
  for (const date of datesInRange(range)) {
    const file = path.join(vaultRoot, DAILY_LOG_DIRECTORY, `${date}.md`);
    let content: string;
    try {
      content = await readFile(file, "utf8");
    } catch {
      continue;
    }
    memos.push(...parseDailyLog(date, content));
  }
  return memos;
}

/** 決定メモ（正本へ昇格する候補）かどうか。 */
export function isDecisionMemo(body: string): boolean {
  return /^(?:正式決定|決定)\s*[:：]/.test(body.trim());
}

/** 体験・入会に触れている行だけを取り出す。 */
export function extractTrialLines(body: string): string[] {
  return body
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && /体験|入会/.test(line));
}

export interface WeeklyReviewSummary {
  range: WeeklyRange;
  totalMemos: number;
  daysWithMemos: string[];
  missingDays: string[];
  trialLines: { date: string; line: string }[];
  decisions: WeeklyMemo[];
  longMemos: WeeklyMemo[];
}

export function summariseWeek(range: WeeklyRange, memos: WeeklyMemo[]): WeeklyReviewSummary {
  const dates = datesInRange(range);
  const withMemos = new Set(memos.map(memo => memo.date));

  const trialLines: { date: string; line: string }[] = [];
  for (const memo of memos) {
    // 決定メモは「3. 正本へ昇格する候補」に載るので、ここでは二重に数えない。
    if (isDecisionMemo(memo.body)) continue;
    for (const line of extractTrialLines(memo.body)) {
      trialLines.push({ date: memo.date, line });
    }
  }

  return {
    range,
    totalMemos: memos.length,
    daysWithMemos: dates.filter(date => withMemos.has(date)),
    missingDays: dates.filter(date => !withMemos.has(date)),
    trialLines,
    decisions: memos.filter(memo => isDecisionMemo(memo.body)),
    longMemos: memos.filter(memo => memo.body.length >= LONG_MEMO_CHARS),
  };
}

/** 週次レビューの下書き Markdown を組み立てる。 */
export function buildWeeklyReview(summary: WeeklyReviewSummary, memos: WeeklyMemo[]): string {
  const { range } = summary;
  const lines: string[] = [
    `# 週次整理 ${range.start} 〜 ${range.end}`,
    "",
    "- 状態: **未承認ドラフト**（openQLOWが作成。正本への反映はJIN承認後）",
    `- 元データ: \`${DAILY_LOG_DIRECTORY}/\``,
    "- 原文はそのまま。要約や書き換えはしていない。",
    "",
    "## 1. 記録の状況",
    "",
    `- メモがあった日: ${summary.daysWithMemos.length}日 / ${datesInRange(range).length}日（メモ ${summary.totalMemos}件）`,
  ];

  if (summary.missingDays.length > 0) {
    lines.push(`- 記録がなかった日: ${summary.missingDays.join(", ")}`);
  } else {
    lines.push("- 記録がなかった日: なし（毎日記録できている）");
  }

  lines.push("", "## 2. 体験・入会の記載", "");
  if (summary.trialLines.length === 0) {
    lines.push("- 今週は体験・入会の記載なし");
  } else {
    for (const item of summary.trialLines) {
      lines.push(`- ${item.date}: ${item.line}`);
    }
  }

  lines.push("", "## 3. 正本へ昇格する候補（決定メモ）", "");
  if (summary.decisions.length === 0) {
    lines.push("- なし");
  } else {
    for (const memo of summary.decisions) {
      lines.push(`- ${memo.date}: ${memo.body.split(/\r?\n/)[0]}`);
    }
    lines.push("", "※ 反映するかはJINが決める。決めたら該当の正本ファイルを人間が更新する。");
  }

  lines.push("", "## 4. 要確認（長文メモ）", "");
  if (summary.longMemos.length === 0) {
    lines.push("- なし");
  } else {
    for (const memo of summary.longMemos) {
      lines.push(`- ${memo.date}: ${memo.heading.replace(/^##\s+/, "")}（約${memo.body.length}字）→ 別途確認`);
    }
  }

  lines.push("", "## 5. 今週の記録（原文）", "");
  if (memos.length === 0) {
    lines.push("- 今週はメモがありません。");
  } else {
    let currentDate = "";
    for (const memo of memos) {
      if (memo.date !== currentDate) {
        currentDate = memo.date;
        lines.push(`### ${currentDate}`, "");
      }
      if (memo.body.length >= LONG_MEMO_CHARS) {
        lines.push(`（長文のため省略。約${memo.body.length}字。原本は ${DAILY_LOG_DIRECTORY}/${memo.date}.md）`, "");
        continue;
      }
      lines.push(memo.body, "");
    }
  }

  lines.push(
    "## 6. JIN記入欄",
    "",
    "- 正本に反映すること:",
    "- 来週やること:",
    "- 気づいたこと:",
    "",
  );

  return sanitiseFreeText(lines.join("\n"));
}

/** 下書きの保存先（Vault ルートからの相対パス）。 */
export function weeklyReviewRelativePath(range: WeeklyRange): string {
  return `${WEEKLY_REVIEW_DIRECTORY}/${range.end}_週次整理.md`;
}

export interface WeeklyOrganizeOptions {
  now?: Date;
  vaultRoot: string;
  timeZone?: string;
}

/** LINE 返信用の短い要約。 */
export function buildLineReply(summary: WeeklyReviewSummary, relativePath: string): string {
  const lines = [
    `週次整理の下書きを作りました。（${summary.range.start}〜${summary.range.end}）`,
    "",
    `メモ ${summary.totalMemos}件 / 記録できた日 ${summary.daysWithMemos.length}日`,
  ];

  if (summary.missingDays.length > 0) {
    lines.push(`記録がなかった日: ${summary.missingDays.length}日`);
  }
  if (summary.trialLines.length > 0) {
    lines.push(`体験・入会の記載: ${summary.trialLines.length}件`);
  }
  if (summary.decisions.length > 0) {
    lines.push(`正本の候補（決定メモ）: ${summary.decisions.length}件`);
  }

  lines.push(
    "",
    relativePath,
    "",
    "iPhoneで確認するなら次に `/push` と送ってください。",
  );

  const reply = lines.join("\n");
  return reply.length > LINE_SAFE_CHARS ? `${reply.slice(0, LINE_SAFE_CHARS)}…` : reply;
}

/**
 * /整理 を実行し、週次レビューの下書きを Vault に書き出す。
 * 書き込むのは weekly_reviews のみ。GitHub への push はしない（JINが /push する）。
 */
export async function executeWeeklyOrganizeCommand(
  text: string,
  opts: WeeklyOrganizeOptions,
): Promise<WeeklyOrganizeResult> {
  const now = opts.now ?? new Date();
  const timeZone = opts.timeZone ?? "Asia/Tokyo";
  const range = parseWeeklyOrganizeCommand(text, now, timeZone);
  if (!range) return { handled: false, ok: false, message: "" };

  const memos = await collectWeeklyMemos(opts.vaultRoot, range);
  const summary = summariseWeek(range, memos);
  const relativePath = weeklyReviewRelativePath(range);
  const file = path.join(opts.vaultRoot, relativePath);

  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, buildWeeklyReview(summary, memos), "utf8");

  return {
    handled: true,
    ok: true,
    message: buildLineReply(summary, relativePath),
    meta: {
      range,
      totalMemos: summary.totalMemos,
      missingDays: summary.missingDays.length,
      decisions: summary.decisions.length,
      file: relativePath,
    },
  };
}
