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
    "（途中でやめたい時は「/中止」。最後に「終わる」と送ると自動保存します）",
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
      ? "OPENQLOW（記憶係）：セッションを中止しました。やり直すなら「/日記」と送ってください。"
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
      reply: "OPENQLOW（記憶係）：保存対象のセッションが見つかりません（タイムアウトの可能性）。\n「/日記」から再開してください。",
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

/**
 * 全角スラッシュ「／」「\」など先頭の区切り文字を半角「/」に揃え、
 * 周辺の空白も削る。Jin のスマホ日本語入力で自動全角化されても通るようにする。
 */
function normaliseCommandText(text: string): string {
  return text.trim().replace(/^[／\/\\]/, "/");
}

/**
 * 「/日記 本文」「/日記\n本文」などワンショット記録の本文を抽出。
 * 本文がなければ undefined を返す（＝対話モード継続）。
 */
export function parseOneShotMemo(text: string): { body: string } | undefined {
  const trimmed = normaliseCommandText(text);
  const match = trimmed.match(/^\/?(?:昨日の記録|昨日の日記|日記|メモ)(?:\s+|\n)([\s\S]+)$/);
  if (!match) return undefined;
  const body = match[1].trim();
  if (!body) return undefined;
  return { body };
}

export function parseMemoryCommand(text: string): MemoryCommand | undefined {
  const trimmed = normaliseCommandText(text);
  // 本文付きはワンショット扱いなので、対話モード起動コマンドとしては検出しない
  if (parseOneShotMemo(text)) return undefined;
  if (/^\/?(?:昨日の記録|昨日の日記|日記)$/.test(trimmed)) return "/昨日の記録";
  if (/^\/?保存用ログ$/.test(trimmed)) return "/保存用ログ";
  // 「やめる」単体は除外（既存承認フローの「やめる FG-XXX」と区別するため）
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
 * 「/日記 本文」ワンショット記録：1 往復で Obsidian に保存。
 */
export async function recordOneShotMemo(userId: string, body: string, opts: MemoryHandlerOptions = {}): Promise<MemoryHandlerResult> {
  const store = getStore(opts);
  // 既存セッションがあれば破棄（ワンショットは独立した記録）
  await store.destroy(userId);
  const session = await store.start(userId, "/昨日の記録");
  session.genres.push({
    type: "other",
    data: { topic: body },
    answers: [{ key: "topic", question: "ワンショット記録", answer: body }],
  });
  session.step = "ready_to_save";
  await store.save(session);

  try {
    const result = await saveCrmLog(session);
    await store.destroy(userId);
    return {
      ok: true,
      reply: [
        "OPENQLOW（記憶係）：保存しました📝",
        `日付: ${result.dateJst}`,
        result.appended ? "（既存ログに追記）" : "（新規ファイル）",
      ].join("\n"),
      meta: { mode: "one_shot", filePath: result.filePath, dateJst: result.dateJst },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reply: `OPENQLOW（記憶係）：保存失敗。\n理由: ${message}`,
      meta: { mode: "one_shot", error: message },
    };
  }
}

/**
 * 対話モード終了時の自動保存。skipSave が true なら保存せず破棄のみ。
 */
async function autoSaveIfFinished(userId: string, session: ConversationSession, opts: MemoryHandlerOptions): Promise<MemoryHandlerResult | undefined> {
  if (session.step !== "ready_to_save") return undefined;

  const store = getStore(opts);
  if (session.skipSave) {
    await store.destroy(userId);
    return undefined; // 上位の reply をそのまま使う
  }

  try {
    const result = await saveCrmLog(session);
    await store.destroy(userId);
    return {
      ok: true,
      reply: [
        "OPENQLOW（記憶係）：保存しました📝",
        `日付: ${result.dateJst}`,
        result.appended ? "（既存ログに追記）" : "（新規ファイル）",
        `件数: ${session.genres.length}`,
      ].join("\n"),
      meta: {
        mode: "auto_save",
        filePath: result.filePath,
        dateJst: result.dateJst,
        genres: session.genres.length,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reply: `OPENQLOW（記憶係）：保存失敗。セッション保持中。\n理由: ${message}`,
      meta: { mode: "auto_save", error: message },
    };
  }
}

/**
 * テキスト 1 件分のフルディスパッチ。
 * 既存承認フロー (OK FG-...) は呼び出し側で先に処理してから、これに来る前提。
 */
export async function routeMemoryText(userId: string, text: string, opts: MemoryHandlerOptions = {}): Promise<RouteResult> {
  // 1) ワンショット「/日記 本文」を最優先で検出
  const oneShot = parseOneShotMemo(text);
  if (oneShot) {
    const result = await recordOneShotMemo(userId, oneShot.body, opts);
    return { ...result, route: "command" };
  }

  // 2) 明示コマンド（/日記 単独、/中止、/保存用ログ）
  const command = parseMemoryCommand(text);
  if (command) {
    const result = await dispatchMemoryCommand(userId, command, opts);
    return { ...result, route: "command" };
  }

  // 3) 進行中セッションへの回答
  const ongoing = await tryContinueOngoingSession(userId, text, opts);
  if (ongoing) {
    // 対話が終了状態に達したら、その場で自動保存（/保存用ログ を待たない）
    const store = getStore(opts);
    const session = await store.load(userId);
    if (session) {
      const autosave = await autoSaveIfFinished(userId, session, opts);
      if (autosave) {
        return { ...autosave, route: "ongoing_session" };
      }
    }
    return { ...ongoing, route: "ongoing_session" };
  }

  return {
    ok: false,
    reply: "",
    route: "no_match",
  };
}
