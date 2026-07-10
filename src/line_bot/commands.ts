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
import { SessionStore } from "../conversation/session_store.js";
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
  | "monthly_report";

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
    "朝はこれだけ:",
    "日報 → 投稿 → 画像 1 → ok",
  ].join("\n");
}

async function appendLineMemo(body: string, opts: ExecuteLineCommandOptions): Promise<string> {
  const now = opts.now ?? new Date();
  const vaultRoot = opts.vaultRoot ?? defaultVaultRoot();
  const date = formatDateInTimeZone(now);
  const file = path.join(vaultRoot, "01_DAILY_OPERATIONS", "daily_logs", `${date}.md`);
  const block = [
    `## LINE追記 ${now.toISOString()}`,
    "- source: LINE",
    "",
    body,
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
  "6_システム/openqlow_logs",
];

function isAllowlistedPath(p: string): boolean {
  return PUSH_ALLOWLIST.some(prefix => p === prefix || p.startsWith(`${prefix}/`));
}

interface VaultChanges {
  allowed: string[];
  others: string[];
}

function partitionVaultStatus(statusOutput: string): VaultChanges {
  const allowed: string[] = [];
  const others: string[] = [];
  for (const line of statusOutput.split("\n")) {
    if (!line.trim()) continue;
    // porcelain形式: `XY <path>`（リネームは `XY <old> -> <new>`）
    const rawPath = line.slice(3).trim();
    const paths = rawPath.split(" -> ").map(p => p.replace(/^"|"$/g, ""));
    const displayPath = paths[paths.length - 1]!;
    if (paths.every(isAllowlistedPath)) {
      allowed.push(displayPath);
    } else {
      others.push(displayPath);
    }
  }
  return { allowed, others };
}

async function pushVault(opts: ExecuteLineCommandOptions): Promise<LineCommandResult> {
  const vaultRoot = opts.vaultRoot ?? defaultVaultRoot();
  const runGit = opts.runGit ?? defaultRunGit;
  const now = opts.now ?? new Date();

  const status = await runGit([
    "-C", vaultRoot, "-c", "core.quotepath=false", "status", "--porcelain",
  ]);
  const { allowed, others } = partitionVaultStatus(status);
  const warning = others.length > 0
    ? `⚠️ メモ以外の変更が${others.length}件あります。これらはpushしていません。`
    : "";

  if (allowed.length > 0) {
    await runGit(["-C", vaultRoot, "add", "-A", "--", ...PUSH_ALLOWLIST]);
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
  const memoryOptions = { store: opts.memorySessionStore };
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

  // 3) 記憶係: /昨日の記録 /保存用ログ /中止 と、進行中セッションへの回答
  const memory = await executeMemoryKeeper(text, opts);
  if (memory) return memory;

  return {
    handled: false,
    ok: false,
    message: "line command not found",
  };
}
