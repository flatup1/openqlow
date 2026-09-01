// Brand Growth Phase 4: 費用と実測値を人が記録する最小CLI。
//
// 外部API、LINE、publish、課金には接続しない。
// 日時・ID・repository root は呼び出し側が明示し、このmoduleは時計も環境も読まない。
// ファイルI/Oそのものは承認済み境界の storage/event_store.ts だけが行う。

import type {
  AssessedBy,
  Usability,
} from "./contracts/quality.js";
import type {
  AttemptCostRecord,
  MetricFieldName,
  MetricWindow,
} from "./contracts/growth.js";
import { METRIC_FIELD_NAMES } from "./contracts/growth.js";
import { importMetricSnapshot } from "./growth/metrics.js";
import { summarizeCost } from "./growth/cost.js";
import { resolveStoreRoot } from "./storage/config.js";
import { appendEvent, makeEvent, type StoredEvent } from "./storage/event_store.js";

const ATTEMPT_STATUSES = Object.freeze(["succeeded", "failed", "cancelled"] as const);
const USABILITIES = Object.freeze(["unknown", "usable", "rejected"] as const);
const ASSESSORS = Object.freeze(["human", "automated", "hybrid"] as const);
const WINDOWS = Object.freeze(["24h", "72h", "7d", "28d", "custom"] as const);

const METRIC_FLAGS: Readonly<Record<MetricFieldName, string>> = Object.freeze({
  impressions: "impressions",
  views: "views",
  three_second_views: "three-second-views",
  average_watch_seconds: "average-watch-seconds",
  completion_rate: "completion-rate",
  saves: "saves",
  shares: "shares",
  comments: "comments",
  profile_visits: "profile-visits",
  web_visits: "web-visits",
  line_adds: "line-adds",
  trial_inquiries: "trial-inquiries",
  trial_bookings: "trial-bookings",
  trial_attendance: "trial-attendance",
  enrollments: "enrollments",
});

const COMMON_FLAGS = Object.freeze([
  "repository-root",
  "data-root",
  "event-id",
  "created-at",
  "created-by",
] as const);

export const RECORD_CLI_HELP = `Brand Growth 記録CLI（送信・公開はしません）

生成1回の費用と品質:
  npm run brand-growth:record -- attempt \\
    --repository-root /absolute/repo \\
    --event-id evt_attempt_001 --attempt-id attempt_001 \\
    --created-at 2026-08-29T01:00:00Z --created-by owner \\
    --status succeeded --cost-jpy 120 --usability usable --assessed-by human

投稿後の数字:
  npm run brand-growth:record -- metric \\
    --repository-root /absolute/repo \\
    --event-id evt_metric_001 --snapshot-id metric_001 --publication-id publication_001 \\
    --captured-at 2026-08-30T01:00:00Z --entered-at 2026-08-30T01:01:00Z \\
    --entered-by owner --evidence instagram_insights_24h --window 24h \\
    --views 800 --line-adds 4 --trial-inquiries 2

約束:
  - 分からない費用・数字は書かない（0として扱いません）
  - repository-root は絶対パス必須です
  - 日時は UTC ISO 8601（末尾Z）です
  - 個人名、電話番号、メール、秘密情報は記録しません`;

export interface RecordCliResult {
  readonly exit_code: 0 | 2;
  readonly message: string;
  readonly error_code: string | null;
  readonly stream: string | null;
  readonly file: string | null;
}

export interface RecordCliDependencies {
  readonly append?: (
    root: string,
    stream: string,
    event: StoredEvent<unknown>,
  ) => Promise<string>;
}

class CliInputError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CliInputError";
    this.code = code;
  }
}

function parseFlags(args: readonly string[]): Readonly<Record<string, string>> {
  const flags: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index] ?? "";
    if (!token.startsWith("--")) {
      throw new CliInputError("unexpected_argument", `unexpected argument: ${token}`);
    }
    const name = token.slice(2);
    if (name === "" || flags[name] !== undefined) {
      throw new CliInputError("invalid_flag", `invalid or repeated flag: ${token}`);
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new CliInputError("missing_flag_value", `${token} requires a value`);
    }
    flags[name] = value;
    index += 1;
  }
  return Object.freeze(flags);
}

function required(flags: Readonly<Record<string, string>>, name: string): string {
  const value = flags[name];
  if (value === undefined || value.trim() === "") {
    throw new CliInputError("missing_flag", `--${name} is required`);
  }
  return value;
}

function rejectUnknownFlags(flags: Readonly<Record<string, string>>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  for (const name of Object.keys(flags)) {
    if (!allowedSet.has(name)) throw new CliInputError("unknown_flag", `unknown flag: --${name}`);
  }
}

function oneOf<T extends string>(value: string, allowed: readonly T[], flag: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new CliInputError("invalid_choice", `--${flag} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

function nonNegativeNumber(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new CliInputError("invalid_number", `--${flag} must be a number of 0 or more`);
  }
  return parsed;
}

function nonNegativeInteger(value: string, flag: string): number {
  const parsed = nonNegativeNumber(value, flag);
  if (!Number.isInteger(parsed)) {
    throw new CliInputError("invalid_number", `--${flag} must be a whole number of 0 or more`);
  }
  return parsed;
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value);
}

function storeRoot(flags: Readonly<Record<string, string>>): string {
  const repositoryRoot = required(flags, "repository-root");
  if (!isAbsolutePath(repositoryRoot)) {
    throw new CliInputError("relative_repository_root", "--repository-root must be an absolute path");
  }
  return resolveStoreRoot({
    root: flags["data-root"] ?? null,
    cwd: repositoryRoot,
    env: {},
  });
}

function eventBase(flags: Readonly<Record<string, string>>): {
  readonly event_id: string;
  readonly created_at: string;
  readonly created_by: string;
} {
  return {
    event_id: required(flags, "event-id"),
    created_at: required(flags, "created-at"),
    created_by: required(flags, "created-by"),
  };
}

function makeAttemptEvent(flags: Readonly<Record<string, string>>): StoredEvent<unknown> {
  rejectUnknownFlags(flags, [
    ...COMMON_FLAGS,
    "attempt-id",
    "status",
    "cost-jpy",
    "usability",
    "assessed-by",
  ]);

  const status = oneOf(required(flags, "status"), ATTEMPT_STATUSES, "status");
  const usability = oneOf(required(flags, "usability"), USABILITIES, "usability") as Usability;
  const assessedRaw = flags["assessed-by"];
  if (usability !== "unknown" && assessedRaw === undefined) {
    throw new CliInputError(
      "missing_flag",
      "--assessed-by is required when --usability is usable or rejected",
    );
  }
  const assessedBy = assessedRaw === undefined ? null : oneOf(assessedRaw, ASSESSORS, "assessed-by") as AssessedBy;
  const costRaw = flags["cost-jpy"];

  const attempt: AttemptCostRecord = Object.freeze({
    attempt_id: required(flags, "attempt-id"),
    status,
    provider_cost: costRaw === undefined ? null : Object.freeze({
      currency: "JPY",
      amount_minor: nonNegativeInteger(costRaw, "cost-jpy"),
    }),
    usability,
    assessed_by: assessedBy,
  });

  // 既存のPhase 4集計器を通し、金額契約も同じ正本で検査する。
  const costSummary = summarizeCost({ attempts: [attempt], fallback_currency: "JPY" });
  return makeEvent({
    ...eventBase(flags),
    event_type: "generation_attempt_cost_recorded",
    payload: Object.freeze({ ...attempt, cost_summary_for_this_attempt: costSummary }),
  });
}

function metricValues(flags: Readonly<Record<string, string>>): Readonly<Partial<Record<MetricFieldName, number>>> {
  const values: Partial<Record<MetricFieldName, number>> = {};
  for (const name of METRIC_FIELD_NAMES) {
    const flag = METRIC_FLAGS[name];
    const raw = flags[flag];
    if (raw === undefined) continue;
    values[name] = name === "completion_rate" || name === "average_watch_seconds"
      ? nonNegativeNumber(raw, flag)
      : nonNegativeInteger(raw, flag);
  }
  return Object.freeze(values);
}

function makeMetricEvent(flags: Readonly<Record<string, string>>): StoredEvent<unknown> {
  rejectUnknownFlags(flags, [
    ...COMMON_FLAGS,
    "snapshot-id",
    "publication-id",
    "captured-at",
    "entered-by",
    "entered-at",
    "evidence",
    "evidence-note",
    "window",
    "custom-window-note",
    ...Object.values(METRIC_FLAGS),
  ]);

  const createdAt = flags["created-at"] ?? required(flags, "captured-at");
  const createdBy = flags["created-by"] ?? required(flags, "entered-by");
  const snapshot = importMetricSnapshot({
    metric_snapshot_id: required(flags, "snapshot-id"),
    publication_id: required(flags, "publication-id"),
    captured_at: required(flags, "captured-at"),
    window: oneOf(required(flags, "window"), WINDOWS, "window") as MetricWindow,
    custom_window_note: flags["custom-window-note"] ?? null,
    source: "manual",
    source_reference: flags["evidence"] ?? null,
    manual_entry: {
      entered_by: required(flags, "entered-by"),
      entered_at: required(flags, "entered-at"),
      evidence_reference: required(flags, "evidence"),
      evidence_note: flags["evidence-note"] ?? null,
    },
    values: metricValues(flags),
  });

  return makeEvent({
    event_id: required(flags, "event-id"),
    event_type: "metric_snapshot_recorded",
    created_at: createdAt,
    created_by: createdBy,
    payload: snapshot,
  });
}

function failure(error: unknown): RecordCliResult {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "record_failed";
  const message = error instanceof Error ? error.message : "record failed";
  return Object.freeze({ exit_code: 2, message, error_code: code, stream: null, file: null });
}

/**
 * CLIを実行する。テストではappendだけを差し替えられる。
 * 同じ明示入力と同じ依存なら、同じ論理イベントになる。
 */
export async function runRecordCli(
  args: readonly string[],
  dependencies: RecordCliDependencies = {},
): Promise<RecordCliResult> {
  const [command, ...rest] = args;
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    return Object.freeze({ exit_code: 0, message: RECORD_CLI_HELP, error_code: null, stream: null, file: null });
  }

  try {
    const flags = parseFlags(rest);
    const root = storeRoot(flags);
    const append = dependencies.append ?? appendEvent;
    const stream = command === "attempt"
      ? "generation_attempts"
      : command === "metric"
        ? "metric_snapshots"
        : null;
    if (stream === null) throw new CliInputError("unknown_command", `unknown command: ${command}`);

    const event = command === "attempt" ? makeAttemptEvent(flags) : makeMetricEvent(flags);
    const file = await append(root, stream, event);
    return Object.freeze({
      exit_code: 0,
      message: command === "attempt" ? "生成費用を1件記録しました" : "投稿後の数字を1件記録しました",
      error_code: null,
      stream,
      file,
    });
  } catch (error) {
    return failure(error);
  }
}
