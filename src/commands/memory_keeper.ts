// 記憶係コマンド群のハンドラ
// LINE Webhook から呼ばれ、セッションを進めるか、終了させる。

import {
  SessionStore,
  defaultSessionStore,
  type ConversationSession,
} from "../conversation/session_store.js";
import {
  advanceConversation,
  buildYesNoQuestion,
} from "../conversation/interview_flow.js";
import { saveCrmLog } from "../conversation/crm_log_generator.js";

export type MemoryCommand = "/昨日の記録" | "/保存用ログ" | "/中止";

export interface MemoryHandlerResult {
  ok: boolean;
  reply: string;
  /** デバッグ用、対応するメタ情報 */
  meta?: Record<string, unknown>;
}

export interface MemoryHandlerOptions {
  store?: SessionStore;
}

function getStore(opts: MemoryHandlerOptions = {}): SessionStore {
  return opts.store ?? defaultSessionStore();
}

export async function startMemoryInterview(userId: string, opts: MemoryHandlerOptions = {}): Promise<MemoryHandlerResult> {
  const store = getStore(opts);
  const session = await store.start(userId, "/昨日の記録");
  const reply = [
    "OPENQLOW（記憶係）：昨日の記録を始めます。",
    "",
    buildYesNoQuestion(),
    "",
    "（途中でやめたい時は「/中止」、保存したい時は「/保存用ログ」と送ってください）",
  ].join("\n");
  return { ok: true, reply, meta: { sessionStarted: session.startedAt } };
}

export async function continueMemoryInterview(userId: string, answer: string, opts: MemoryHandlerOptions = {}): Promise<MemoryHandlerResult | undefined> {
  const store = getStore(opts);
  const session = await store.load(userId);
  if (!session) return undefined;

  const before = session.step;
  const action = advanceConversation(session, answer);
  await store.save(session);

  return {
    ok: true,
    reply: action.prompt,
    meta: {
      stepBefore: before,
      stepAfter: session.step,
      finished: action.finished === true,
      genresRecorded: session.genres.length,
    },
  };
}

export async function cancelMemorySession(userId: string, opts: MemoryHandlerOptions = {}): Promise<MemoryHandlerResult> {
  const store = getStore(opts);
  const existed = await store.exists(userId);
  await store.destroy(userId);
  return {
    ok: true,
    reply: existed
      ? "OPENQLOW（記憶係）：セッションを中止しました。やり直すなら「/昨日の記録」と送ってください。"
      : "OPENQLOW（記憶係）：進行中のセッションはありません。",
    meta: { hadSession: existed },
  };
}

export async function saveMemorySession(userId: string, opts: MemoryHandlerOptions = {}): Promise<MemoryHandlerResult> {
  const store = getStore(opts);
  const session = await store.load(userId);
  if (!session) {
    return {
      ok: false,
      reply: "OPENQLOW（記憶係）：保存対象のセッションが見つかりません（タイムアウトの可能性）。\n「/昨日の記録」から再開してください。",
    };
  }

  try {
    const result = await saveCrmLog(session);
    await store.destroy(userId);
    const lines = [
      "OPENQLOW（記憶係）：Obsidian に保存しました。",
      `日付: ${result.dateJst}`,
      `ファイル: ${result.filePath}`,
      result.appended ? "（既存ログに追記しました）" : "（新規ファイルを作成しました）",
      `サイズ: ${result.bytes} bytes`,
      "",
      "金曜の振り返りで読み返してください。",
    ];
    return {
      ok: true,
      reply: lines.join("\n"),
      meta: {
        filePath: result.filePath,
        dateJst: result.dateJst,
        appended: result.appended,
        genres: session.genres.length,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reply: [
        "OPENQLOW（記憶係）：保存に失敗しました。",
        `理由: ${message}`,
        "Jin、ログを確認してください。セッションは保持しています。",
      ].join("\n"),
      meta: { error: message },
    };
  }
}

/**
 * セッションが進行中なら、与えられた text を回答として処理する。
 * 進行中でない場合は undefined を返す（呼び出し側で「未知コマンド」扱い）。
 */
export async function tryContinueOngoingSession(userId: string, text: string, opts: MemoryHandlerOptions = {}): Promise<MemoryHandlerResult | undefined> {
  return continueMemoryInterview(userId, text, opts);
}

export function parseMemoryCommand(text: string): MemoryCommand | undefined {
  const trimmed = text.trim();
  if (/^\/?昨日の記録$/.test(trimmed)) return "/昨日の記録";
  if (/^\/?保存用ログ$/.test(trimmed)) return "/保存用ログ";
  if (/^\/?中止$/.test(trimmed)) return "/中止";
  return undefined;
}

export function isMemoryCommandText(text: string): boolean {
  return parseMemoryCommand(text) !== undefined;
}

export async function dispatchMemoryCommand(userId: string, command: MemoryCommand, opts: MemoryHandlerOptions = {}): Promise<MemoryHandlerResult> {
  switch (command) {
    case "/昨日の記録":
      return startMemoryInterview(userId, opts);
    case "/保存用ログ":
      return saveMemorySession(userId, opts);
    case "/中止":
      return cancelMemorySession(userId, opts);
  }
}

export interface RouteResult extends MemoryHandlerResult {
  /** どの経路で処理されたか */
  route: "command" | "ongoing_session" | "no_match";
}

/**
 * テキスト 1 件分のフルディスパッチ。
 * 既存承認フロー (OK FG-...) は呼び出し側で先に処理してから、これに来る前提。
 */
export async function routeMemoryText(userId: string, text: string, opts: MemoryHandlerOptions = {}): Promise<RouteResult> {
  const command = parseMemoryCommand(text);
  if (command) {
    const result = await dispatchMemoryCommand(userId, command, opts);
    return { ...result, route: "command" };
  }

  const ongoing = await tryContinueOngoingSession(userId, text, opts);
  if (ongoing) {
    return { ...ongoing, route: "ongoing_session" };
  }

  return {
    ok: false,
    reply: "",
    route: "no_match",
  };
}
