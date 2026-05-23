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
import { SessionStore } from "../conversation/session_store.js";

const execFileAsync = promisify(execFile);

export type LineCommandAction =
  | "append_obsidian"
  | "git_push"
  | "memory_keeper";

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
  return text.replace(/\r\n/g, "\n").trim();
}

function parseAppendCommand(text: string): string | undefined {
  const match = text.match(/^\/追記(?:\s+|\n)?([\s\S]*)$/);
  if (!match) return undefined;
  return normaliseBody(match[1] ?? "");
}

function isPushCommand(text: string): boolean {
  return /^\/?(?:push|PUSH|プッシュ)$/.test(text.trim());
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

async function pushVault(opts: ExecuteLineCommandOptions): Promise<LineCommandResult> {
  const vaultRoot = opts.vaultRoot ?? defaultVaultRoot();
  const runGit = opts.runGit ?? defaultRunGit;
  const status = await runGit(["-C", vaultRoot, "status", "--porcelain"]);

  if (status.trim() === "") {
    return {
      handled: true,
      ok: true,
      action: "git_push",
      message: "GitHubへpushする変更はありません。",
    };
  }

  await runGit(["-C", vaultRoot, "add", "-A"]);
  await runGit(["-C", vaultRoot, "commit", "-m", "chore: update vault from LINE"]);
  await runGit(["-C", vaultRoot, "push"]);

  return {
    handled: true,
    ok: true,
    action: "git_push",
    message: "GitHubへpushしました。",
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

export async function executeLineCommand(text: string, opts: ExecuteLineCommandOptions = {}): Promise<LineCommandResult> {
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

  // 3) 記憶係: /昨日の記録 /保存用ログ /中止 と、進行中セッションへの回答
  const memory = await executeMemoryKeeper(text, opts);
  if (memory) return memory;

  return {
    handled: false,
    ok: false,
    message: "line command not found",
  };
}
