import { execFile } from "node:child_process";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { loadConfig } from "../config.js";
import { formatDateInTimeZone } from "../utils/date.js";
import {
  isMemoryCommandText,
  routeMemoryText,
} from "../commands/memory_keeper.js";
import { getOwnerInfoReply, isOwnerInfoCommand } from "../commands/owner_info.js";
import { buildMonthlyReport, parseMonthlyReportCommand } from "../commands/monthly_report.js";
import { executeTrialKpiCommand } from "../commands/trial_kpi.js";
import {
  WEEKLY_REVIEW_DIRECTORY,
  executeWeeklyOrganizeCommand,
  parseWeeklyOrganizeCommand,
} from "../commands/weekly_organize.js";
import { SessionStore, defaultSessionStore } from "../conversation/session_store.js";
import { sanitiseFreeText } from "../privacy/rules.js";
import { rememberApprovalCandidate } from "../approval/shortcut.js";
import { applyLineRevisionCommand, parseLineRevisionCommand } from "../approval/revision.js";
import { createMediaPublishCandidate } from "../publish/media_candidate.js";
import { parseMediaCommand } from "../publish/media_command.js";
import { applyImageChoiceCommand, attachMediaSelectionCommand, parseImageChoiceCommand, parseInsertMediaCommand } from "../publish/media_library.js";
import { validateMediaPlan } from "../publish/media_rules.js";
import { canonicalLineCommand, normalizeLineText } from "./normalize_command.js";

const execFileAsync = promisify(execFile);

export type LineCommandAction =
  | "append_obsidian"
  | "git_push"
  | "memory_keeper"
  | "owner_info"
  | "help"
  | "revision"
  | "media_insert"
  | "image_choice"
  | "media_post_candidate"
  | "monthly_report"
  | "weekly_organize"
  | "trial_kpi"
  | "auto_memory";

export interface LineCommandResult {
  handled: boolean;
  ok: boolean;
  message: string;
  action?: LineCommandAction;
  /** メモリキーパー応答のメタ情報（デバッグ・ロギング用） */
  meta?: Record<string, unknown>;
}

export interface ExecuteLineCommandOptions {
  now?: Date;
  vaultRoot?: string;
  runGit?: (args: string[]) => Promise<string>;
  /** LINE userId。記憶係セッションの識別に使う。 */
  userId?: string;
  /** メモリキーパー用の SessionStore。テスト時に差し替え可能。 */
  memorySessionStore?: SessionStore;
  /** 自動メモを許可する主オーナーID。省略時はJIN_LINE_USER_ID。 */
  primaryOwnerUserId?: string;
}

function defaultVaultRoot(): string {
  return loadConfig().obsidianVaultRoot;
}

function normaliseBody(text: string): string {
  return normalizeLineText(text);
}

function parseAppendCommand(text: string): string | undefined {
  if (canonicalLineCommand(text) !== "/追記") return undefined;
  const normalized = normalizeLineText(text);
  const body = normalized.replace(/^\/?追記(?:\s+|\n)?/, "");
  return normaliseBody(body);
}

function isPushCommand(text: string): boolean {
  return canonicalLineCommand(text) === "/push";
}

function isHelpCommand(text: string): boolean {
  const normalized = normalizeLineText(text).toLowerCase();
  return ["ヘルプ", "help", "?", "？", "使い方"].includes(normalized);
}

function helpMessage(): string {
  return [
    "今できる返信",
    "",
    "ok → 進める",
    "修正 文 → 文を直す",
    "画像 1 → 画像を選ぶ",
    "画像なし → 画像なし",
    "やめる → 中止",
    "",
    "メモはこれだけ:",
    "普通に送る → 経営メモとして自動保存",
    "決定: 内容 → 正式決定候補として保存",
    "/追記 内容 → 手動でObsidianに保存",
    "/push → GitHubへ送る（iPhoneに届く）",
    "整理 → 今週のメモを1枚にまとめる",
    "※1メッセージに1コマンド",
    "",
    "体験・入会はこれだけ:",
    "予約 山田 T. 8/20",
    "参加 山田 T. → 入会 山田 T.",
    "体験集計 → 今月の件数と入会率",
    "",
    "朝はこれだけ:",
    "6時の要約を確認 → 必要な判断だけ返信",
  ].join("\n");
}

type MemoStatus = "IDEA" | "CONSIDERING" | "DECIDED" | "IMPLEMENTING" | "ACTIVE" | "REJECTED" | "ARCHIVED";

function inferMemoStatus(body: string): MemoStatus {
  const value = normaliseBody(body);
  if (/^(?:正式決定|決定)\s*[:：]/.test(value)) return "DECIDED";
  if (/^(?:検討|保留)\s*[:：]/.test(value)) return "CONSIDERING";
  if (/^(?:実装中|作業中)\s*[:：]/.test(value)) return "IMPLEMENTING";
  if (/^(?:運用中|有効)\s*[:：]/.test(value)) return "ACTIVE";
  if (/^(?:不採用|却下)\s*[:：]/.test(value)) return "REJECTED";
  if (/^(?:アーカイブ|過去情報)\s*[:：]/.test(value)) return "ARCHIVED";
  return "IDEA";
}

function isPrimaryOwner(opts: ExecuteLineCommandOptions): boolean {
  const ownerId = opts.primaryOwnerUserId ?? process.env.JIN_LINE_USER_ID ?? "";
  return Boolean(ownerId && opts.userId === ownerId);
}

function hasConfiguredPrimaryOwner(opts: ExecuteLineCommandOptions): boolean {
  return Boolean(opts.primaryOwnerUserId ?? process.env.JIN_LINE_USER_ID ?? "");
}

function shouldAutoCapture(text: string): boolean {
  const value = normaliseBody(text);
  if (!value || /^[\/／]/.test(value)) return false;
  if (/^(?:ok|おk|okk|y|yes|go|no|なし|ありがとう|ありがとうございます)$/i.test(value)) return false;
  if (/^(?:ok|no|修正)\s+FG-\d{8}-\d{3}/i.test(value)) return false;
  return true;
}

async function appendLineMemo(
  body: string,
  opts: ExecuteLineCommandOptions,
  capture: "manual" | "automatic" = "manual",
): Promise<string> {
  const now = opts.now ?? new Date();
  const vaultRoot = opts.vaultRoot ?? defaultVaultRoot();
  const date = formatDateInTimeZone(now);
  const file = path.join(vaultRoot, "01_DAILY_OPERATIONS", "daily_logs", `${date}.md`);
  const cleanBody = sanitiseFreeText(body.trim());
  const block = [
    `## ${capture === "automatic" ? "LINE自動メモ" : "LINE追記"} ${now.toISOString()}`,
    "- source: LINE",
    `- status: ${inferMemoStatus(cleanBody)}`,
    `- capture: ${capture}`,
    "",
    cleanBody,
    "",
  ].join("\n");

  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, block, "utf8");
  return file;
}

async function defaultRunGit(args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync("git", args, { encoding: "utf8" });
  return `${stdout}${stderr}`;
}

function parseAheadCount(output: string): number {
  const [, ahead = "0"] = output.trim().split(/\s+/);
  return Number.parseInt(ahead, 10) || 0;
}

/** /push がコミットしてよいVault内パス。正本（00_COREなど）は絶対に含めない。 */
const PUSH_ALLOWLIST = [
  "01_DAILY_OPERATIONS/daily_logs",
  "01_DAILY_OPERATIONS/体験予約・入会管理.md",
  WEEKLY_REVIEW_DIRECTORY,
  "DAILY-BRIEF.md",
  "6_システム/openqlow_logs",
];

function isAllowlistedPath(p: string): boolean {
  return PUSH_ALLOWLIST.some(prefix => p === prefix || p.startsWith(`${prefix}/`));
}

interface VaultChanges {
  allowed: string[];
  others: string[];
  /**
   * git add に渡す実パス。許可リストの定義そのものではなく「実際に変更のあったパス」を渡す。
   * 許可リストをそのまま渡すと、まだ存在しないファイル（例: 体験予約・入会管理.md）で
   * `fatal: pathspec ... did not match any files` になり push 全体が失敗するため。
   * リネームは新旧どちらも渡さないと削除側が staged されない。
   */
  pathspecs: string[];
}

function partitionVaultStatus(statusOutput: string): VaultChanges {
  const allowed: string[] = [];
  const others: string[] = [];
  const pathspecs: string[] = [];
  for (const line of statusOutput.split("\n")) {
    if (!line.trim()) continue;
    // porcelain形式: `XY <path>`（リネームは `XY <old> -> <new>`）
    const rawPath = line.slice(3).trim();
    const paths = rawPath.split(" -> ").map(p => p.replace(/^"|"$/g, ""));
    const displayPath = paths[paths.length - 1]!;
    if (paths.every(isAllowlistedPath)) {
      allowed.push(displayPath);
      for (const p of paths) {
        if (!pathspecs.includes(p)) pathspecs.push(p);
      }
    } else {
      others.push(displayPath);
    }
  }
  return { allowed, others, pathspecs };
}

async function pushVault(opts: ExecuteLineCommandOptions): Promise<LineCommandResult> {
  const vaultRoot = opts.vaultRoot ?? defaultVaultRoot();
  const runGit = opts.runGit ?? defaultRunGit;
  const now = opts.now ?? new Date();

  const status = await runGit([
    "-C", vaultRoot, "-c", "core.quotepath=false", "status", "--porcelain",
  ]);
  const { allowed, others, pathspecs } = partitionVaultStatus(status);
  const warning = others.length > 0
    ? `⚠️ メモ以外の変更が${others.length}件あります。これらはpushしていません。`
    : "";

  if (allowed.length > 0) {
    await runGit(["-C", vaultRoot, "add", "-A", "--", ...pathspecs]);
    await runGit([
      "-C", vaultRoot, "commit", "-m",
      `memo: LINE追記 ${formatDateInTimeZone(now)} (${allowed.length}件)`,
    ]);
  }

  const ahead = parseAheadCount(
    await runGit(["-C", vaultRoot, "rev-list", "--left-right", "--count", "@{u}...HEAD"]),
  );

  if (ahead === 0 && allowed.length === 0) {
    return {
      handled: true,
      ok: true,
      action: "git_push",
      message: ["GitHubへpushする変更はありません。", warning].filter(Boolean).join("\n"),
    };
  }

  try {
    // メモ以外の未コミット変更は --autostash で退避し、コミットせずに元へ戻す
    await runGit(["-C", vaultRoot, "pull", "--rebase", "--autostash", "origin", "main"]);
  } catch (error) {
    try {
      await runGit(["-C", vaultRoot, "rebase", "--abort"]);
    } catch {
      // rebaseが始まっていなければabortは失敗するが、その場合は何もしなくてよい
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      handled: true,
      ok: false,
      action: "git_push",
      message: `⚠️ 同期が衝突しました。Macで解決してください。\n${message}`,
    };
  }

  await runGit(["-C", vaultRoot, "push", "origin", "HEAD"]);

  const lines = allowed.length > 0
    ? [
        `GitHubへpushしました。（メモ${allowed.length}件）`,
        ...allowed.map(f => `- ${f}`),
        warning,
      ]
    : [`未pushのコミット${ahead}件をGitHubへpushしました。`, warning];

  return {
    handled: true,
    ok: true,
    action: "git_push",
    message: lines.filter(Boolean).join("\n"),
  };
}

async function executeMemoryKeeper(text: string, opts: ExecuteLineCommandOptions): Promise<LineCommandResult | undefined> {
  const userId = opts.userId;
  if (!userId) return undefined;

  // 明示コマンド or 進行中セッションへの回答を判定
  const willHandle = isMemoryCommandText(text);
  const store = opts.memorySessionStore ?? defaultSessionStore();
  // 新しい自動メモ運用では、セッションのない自由文を旧日報判定に流さない。
  // これによりJINの発言を加工せずLINE自動メモへ残し、二重保存も防ぐ。
  if (isPrimaryOwner(opts) && !willHandle && !(await store.exists(userId))) {
    return undefined;
  }
  const memoryOptions = { store };
  const route = await routeMemoryText(userId, text, memoryOptions);

  if (route.route === "no_match" && !willHandle) {
    return undefined;
  }

  return {
    handled: true,
    ok: route.ok,
    action: "memory_keeper",
    message: route.reply,
    meta: { route: route.route, ...(route.meta ?? {}) },
  };
}

async function executeMediaPostCommand(text: string, opts: ExecuteLineCommandOptions): Promise<LineCommandResult | undefined> {
  const parsed = parseMediaCommand(text);
  if (!parsed) return undefined;

  const config = loadConfig();
  const validation = validateMediaPlan({
    body: parsed.body,
    mediaFiles: parsed.mediaFiles,
    destinations: parsed.targets,
  });

  const record = await createMediaPublishCandidate({
    root: config.root,
    body: parsed.body,
    mediaFiles: parsed.mediaFiles,
    destinations: parsed.targets,
    now: opts.now,
  });
  await rememberApprovalCandidate(config.root, record.id);

  const warnings = validation.issues.map(issue => `- ${issue.destination ?? "media"}: ${issue.message}`);
  return {
    handled: true,
    ok: true,
    action: "media_post_candidate",
    message: [
      "OPENQLOW: 画像/動画つき投稿候補を作りました。",
      `ID: ${record.id}`,
      `投稿先: ${parsed.targets.join(", ")}`,
      `ファイル: ${parsed.mediaFiles.join(", ")}`,
      warnings.length ? "確認ポイント:" : "",
      ...warnings,
      "",
      "この内容で投稿するなら: ok",
      `下書き保存だけ: OK ${record.id}`,
      `投稿準備まで: OK ${record.id} all`,
      "",
      record.approvalMessage,
    ].filter(Boolean).join("\n"),
    meta: { id: record.id, mediaFiles: parsed.mediaFiles, validationOk: validation.ok },
  };
}

async function executeRevisionCommand(text: string): Promise<LineCommandResult | undefined> {
  if (!parseLineRevisionCommand(text)) return undefined;
  const config = loadConfig();
  const result = await applyLineRevisionCommand(config.root, text);
  return {
    handled: true,
    ok: result.ok,
    action: "revision",
    message: result.message,
    meta: { id: result.id },
  };
}

async function executeInsertMediaCommand(text: string): Promise<LineCommandResult | undefined> {
  if (!parseInsertMediaCommand(text)) return undefined;
  const config = loadConfig();
  const result = await attachMediaSelectionCommand(config.root, text);
  return {
    handled: true,
    ok: result.ok,
    action: "media_insert",
    message: result.message,
    meta: { id: result.id },
  };
}

async function executeImageChoiceCommand(text: string): Promise<LineCommandResult | undefined> {
  if (!parseImageChoiceCommand(text)) return undefined;
  const config = loadConfig();
  const result = await applyImageChoiceCommand(config.root, text);
  return {
    handled: true,
    ok: result.ok,
    action: "image_choice",
    message: result.message,
    meta: { id: result.id },
  };
}

async function executeMonthlyReport(text: string, opts: ExecuteLineCommandOptions): Promise<LineCommandResult | undefined> {
  const req = parseMonthlyReportCommand(text, opts.now ?? new Date());
  if (!req) return undefined;

  try {
    const result = await buildMonthlyReport(req);
    return {
      handled: true,
      ok: true,
      action: "monthly_report",
      message: result.message,
      meta: { yearMonth: result.yearMonth, fileCount: result.fileCount, truncated: result.truncated },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      handled: true,
      ok: false,
      action: "monthly_report",
      message: `OPENQLOW: 月報の生成に失敗しました。\n理由: ${message}`,
      meta: { yearMonth: req.yearMonth, error: message },
    };
  }
}

async function executeWeeklyOrganize(text: string, opts: ExecuteLineCommandOptions): Promise<LineCommandResult | undefined> {
  const now = opts.now ?? new Date();
  if (!parseWeeklyOrganizeCommand(text, now)) return undefined;

  const vaultRoot = opts.vaultRoot ?? defaultVaultRoot();
  try {
    const result = await executeWeeklyOrganizeCommand(text, { now, vaultRoot });
    if (!result.handled) return undefined;
    return {
      handled: true,
      ok: result.ok,
      action: "weekly_organize",
      message: result.message,
      meta: result.meta,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      handled: true,
      ok: false,
      action: "weekly_organize",
      message: `OPENQLOW: 週次整理の下書き作成に失敗しました。\n理由: ${message}`,
      meta: { error: message },
    };
  }
}

export async function executeLineCommand(text: string, opts: ExecuteLineCommandOptions = {}): Promise<LineCommandResult> {
  // 0) オーナー情報: 「今何してる」「妻向け」等 → 家族向け説明を返す
  //    （誰でも聞ける情報なので allowlist チェック前に処理して OK）
  if (isOwnerInfoCommand(text)) {
    return {
      handled: true,
      ok: true,
      action: "owner_info",
      message: getOwnerInfoReply(),
    };
  }

  if (isHelpCommand(text)) {
    return {
      handled: true,
      ok: true,
      action: "help",
      message: helpMessage(),
    };
  }

  // 1) /追記: 旧仕様の Obsidian 追記
  const appendBody = parseAppendCommand(text);
  if (appendBody !== undefined) {
    if (!appendBody) {
      return {
        handled: true,
        ok: false,
        action: "append_obsidian",
        message: "追記する本文を `/追記 本文` の形で送ってください。",
      };
    }

    const file = await appendLineMemo(appendBody, opts);
    return {
      handled: true,
      ok: true,
      action: "append_obsidian",
      message: `Obsidianに追記しました。\n${file}`,
    };
  }

  if (isPushCommand(text)) {
    try {
      return await pushVault(opts);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        handled: true,
        ok: false,
        action: "git_push",
        message: `GitHubへのpushに失敗しました。\n${message}`,
      };
    }
  }

  const revision = await executeRevisionCommand(text);
  if (revision) return revision;

  const insertedMedia = await executeInsertMediaCommand(text);
  if (insertedMedia) return insertedMedia;

  const imageChoice = await executeImageChoiceCommand(text);
  if (imageChoice) return imageChoice;

  const mediaPost = await executeMediaPostCommand(text, opts);
  if (mediaPost) return mediaPost;

  // 2.5) /月報: その月の日報を日付順にまとめて返信（記憶係より前で確定させる）
  const monthly = await executeMonthlyReport(text, opts);
  if (monthly) return monthly;

  // 2.55) /整理: 直近7日のメモから週次レビューの下書きを作る（正本には書かない）
  const organize = await executeWeeklyOrganize(text, opts);
  if (organize) return organize;

  // 2.6) JIN本人だけが体験予約・参加・入会の正本を更新できる。
  if (isPrimaryOwner(opts)) {
    const trialKpi = await executeTrialKpiCommand(text, {
      vaultRoot: opts.vaultRoot ?? defaultVaultRoot(),
      now: opts.now,
    });
    if (trialKpi) {
      return {
        handled: true,
        ok: trialKpi.ok,
        action: "trial_kpi",
        message: trialKpi.message,
        meta: trialKpi.summary ? { summary: trialKpi.summary } : undefined,
      };
    }
  }

  // 3) 記憶係: /昨日の記録 /保存用ログ /中止 と、進行中セッションへの回答
  if (!hasConfiguredPrimaryOwner(opts) || isPrimaryOwner(opts)) {
    const memory = await executeMemoryKeeper(text, opts);
    if (memory) return memory;
  }

  // 4) JIN本人の未処理メッセージだけを自動メモ化。承認・投稿・日報回答は上で処理済み。
  if (isPrimaryOwner(opts) && shouldAutoCapture(text)) {
    const file = await appendLineMemo(text, opts, "automatic");
    return {
      handled: true,
      ok: true,
      action: "auto_memory",
      message: `経営メモとして保存しました。\nstatus: ${inferMemoStatus(text)}\n${file}`,
    };
  }

  return {
    handled: false,
    ok: false,
    message: "line command not found",
  };
}
