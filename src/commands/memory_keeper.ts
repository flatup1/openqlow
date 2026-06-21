// 記憶係コマンド群のハンドラ
// LINE Webhook から呼ばれ、セッションを進めるか、終了させる。

import {
  SessionStore,
  defaultSessionStore,
  type ConversationSession,
} from "../conversation/session_store.js";
import {
  __interviewInternals,
  advanceConversation,
  buildYesNoQuestion,
} from "../conversation/interview_flow.js";
import { saveCrmLog } from "../conversation/crm_log_generator.js";
import { canonicalLineCommand, matchMorningConcatenated, normalizeLineText } from "../line_bot/normalize_command.js";
import { createMorningPublishCandidate } from "../publish/morning_candidate.js";
import { formatMediaCandidatesForLine, listMediaCandidates, mediaDirectoryForEnv } from "../publish/media_library.js";
import { rememberApprovalCandidate } from "../approval/shortcut.js";
import { approveQuickReplies } from "../publish/finalize.js";
import type { QuickReplyItem } from "../line_bot/reply.js";
import { loadConfig } from "../config.js";
import { buildTodoReplyLines } from "./daily_report_todo.js";
import { normalizeEmptyAnswer } from "./answer_normalize.js";
import { formatDateInTimeZone } from "../utils/date.js";

export type MemoryCommand = "/昨日の記録" | "/保存用ログ" | "/中止" | "/おはよう";

export interface MemoryHandlerResult {
  ok: boolean;
  reply: string;
  /** デバッグ用、対応するメタ情報 */
  meta?: Record<string, unknown>;
  /** LINEのタップ式ボタン（クイックリプライ）。 */
  quickReplies?: QuickReplyItem[];
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

function buildBulkMorningPrompt(): string {
  return [
    "おはようございます。",
    "昨日のFLATUPを1通で送ってください。",
    "",
    "例：",
    "体験 ひかりちゃん1名",
    "入会予定あり",
    "気になる会員 森田さん",
    "口コミ レディースと全会員",
    "今日やること 広告を打つ",
    "",
    "「なし」だけでもOKです。",
  ].join("\n");
}

/**
 * /おはよう /日報 まとめ — 朝の 8 問を「テンプレ一括返信」モードで開始。
 * 旧来の挙動。1メッセージで全部送りたい時に使う。
 */
export async function startMorningInterview(userId: string, opts: MemoryHandlerOptions = {}): Promise<MemoryHandlerResult> {
  const store = getStore(opts);
  await store.destroy(userId);
  const session = await store.start(userId, "/おはよう");
  session.step = "awaiting_bulk_morning";
  await store.save(session);

  const reply = buildBulkMorningPrompt();
  return { ok: true, reply, meta: { sessionStarted: session.startedAt, mode: "morning_interview" } };
}

/**
 * /日報 /おはよう（デフォルト）— 1通自由文で保存するかんたん日報モードを開始。
 */
export async function startMorningDialog(userId: string, opts: MemoryHandlerOptions = {}): Promise<MemoryHandlerResult> {
  const store = getStore(opts);
  await store.destroy(userId);
  const session = await store.start(userId, "/日報");
  session.step = "awaiting_bulk_morning";
  await store.save(session);
  return {
    ok: true,
    reply: buildBulkMorningPrompt(),
    meta: { sessionStarted: session.startedAt, mode: "simple_daily_prompt" },
  };
}

/**
 * /日報 や /おはよう の後ろに付くサフィックスから動作モードを決定する。
 * - "日報 まとめ" / "日報　まとめ"（分離形）→ bulk
 * - "日報まとめ" / "おはようbulk"（連結形）→ bulk
 * - "まとめ" / "bulk" / "テンプレ" / "template" → bulk
 * - それ以外 → dialog 対話モード（デフォルト）
 */
export function getMorningMode(text: string): "dialog" | "bulk" {
  const normalized = normalizeLineText(text);
  const parts = normalized.split(/\s+/);
  const sub = (parts[1] || "").toLowerCase();
  if (sub === "まとめ" || sub === "bulk" || sub === "テンプレ" || sub === "template") return "bulk";
  // 連結形（スペース無し）: "日報まとめ" 等
  const head = (parts[0] ?? "").toLowerCase();
  if (matchMorningConcatenated(head)) return "bulk";
  return "dialog";
}

function isSimplePostCommand(text: string): boolean {
  const normalized = normalizeLineText(text).trim();
  return /^\/?投稿$/.test(normalized);
}

// 各 morning フィールドに対する「ラベル語」候補。
// bulk 回答で「8. 今日の最優先タスク：システム構築」のように
// ラベル付きで送られた時、値からラベル部分を剥がすために使う。
// 長い語を先に試すため後でソートする。
const BULK_LABEL_KEYWORDS: Record<string, string[]> = {
  trial_yesterday: ["昨日の体験", "体験"],
  enrollment_yesterday: ["入会した人", "入会"],
  enrollment_considering: [
    "入会迷ってる人", "入会迷い", "入会検討中の人", "入会検討中", "入会検討", "入会しそうな人", "入会しそう",
    "迷ってる人", "迷い", "検討中",
  ],
  followup_needed: [
    "返信・フォローが必要な人", "返信・フォロー", "フォローが必要な人",
    "返信が必要な人", "返信", "フォロー",
  ],
  review_request_candidate: ["口コミ頼めそうな人", "口コミ依頼候補", "口コミ", "レビュー"],
  retention_risk: [
    "休みがち・退会しそうな人", "退会しそうな人", "休みがちな人", "休みがち", "退会リスク", "退会",
  ],
  concerning_member: ["気になる会員", "気になる人", "気になる"],
  today_top_task: [
    "今日の最優先タスク", "今日のタスク", "今日のToDo", "最優先タスク", "最優先", "今日",
  ],
};

/**
 * captured value から先頭のラベル語＋区切り記号を剥がす。
 * 例: "今日の最優先タスク：システム構築" → "システム構築"
 *     "体験 山田さん"                   → "山田さん"
 *     "なし"（ラベルなし）              → "なし"（そのまま）
 */
function stripLabelPrefix(value: string, keywords: string[]): string {
  let s = value.trim();
  // 長い語から試す（"今日の最優先タスク" を "今日" より先に剥がす）
  const sorted = [...keywords].sort((a, b) => b.length - a.length);
  for (const kw of sorted) {
    // ラベル後ろに必ず 1 文字以上の区切り（コロン/空白/ハイフン等）が来る場合のみ剥がす
    // → "なし" がラベルとぶつかって誤剥がしされないように
    const re = new RegExp(`^${escapeRegExp(kw)}\\s*[:：、\\s-]+`);
    if (re.test(s)) {
      s = s.replace(re, "").trim();
      return s;
    }
    // 末尾がラベルだけ（"今日の最優先タスク" 単独）→ 値は空扱い
    const reExact = new RegExp(`^${escapeRegExp(kw)}\\s*$`);
    if (reExact.test(s)) {
      return "";
    }
  }
  return s;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseBulkMorningAnswer(text: string): Record<string, string> | undefined {
  const normalized = normalizeLineText(text).replace(/([^\n])\s+((?:[1-8]|[①-⑧])[\.:：])/g, "$1\n$2");
  // 順序固定: 1)体験 2)入会 3)迷い 4)返信 5)口コミ 6)退会 7)気になる 8)タスク
  // 後方互換: 旧6問フォーマット（3)返信 4)気になる 5)退会 6)タスク）も拾える
  const fields: Array<[string, RegExp]> = [
    ["trial_yesterday", /(?:^|\n)\s*(?:1|1\.|1:|①|昨日の体験|体験)\s*[.:：、\s-]*(.*?)(?=\n\s*(?:2|2\.|2:|②|入会)\s*[.:：、\s-]*|\n?$)/s],
    ["enrollment_yesterday", /(?:^|\n)\s*(?:2|2\.|2:|②|入会(?:した人)?(?!検討|迷|しそう))\s*[.:：、\s-]*(.*?)(?=\n\s*(?:3|3\.|3:|③|入会迷|入会検討|入会しそう|返信|フォロー)\s*[.:：、\s-]*|\n?$)/s],
    ["enrollment_considering", /(?:^|\n)\s*(?:3|3\.|3:|③|入会迷ってる人|入会迷い|入会迷|入会検討中|入会検討|入会しそう|迷ってる人|迷って|迷)\s*[.:：、\s-]*(.*?)(?=\n\s*(?:4|4\.|4:|④|返信|フォロー|気になる|休みがち|退会|今日)\s*[.:：、\s-]*|\n?$)/s],
    ["followup_needed", /(?:^|\n)\s*(?:4|4\.|4:|④|返信・フォローが必要な人|返信|フォロー)\s*[.:：、\s-]*(.*?)(?=\n\s*(?:5|5\.|5:|⑤|口コミ|気になる|休みがち|退会)\s*[.:：、\s-]*|\n?$)/s],
    ["review_request_candidate", /(?:^|\n)\s*(?:5|5\.|5:|⑤|口コミ|レビュー)\s*[.:：、\s-]*(.*?)(?=\n\s*(?:6|6\.|6:|⑥|休みがち|退会|気になる)\s*[.:：、\s-]*|\n?$)/s],
    ["retention_risk", /(?:^|\n)\s*(?:6|6\.|6:|⑥|休みがち・退会しそうな人|休みがち|退会)\s*[.:：、\s-]*(.*?)(?=\n\s*(?:7|7\.|7:|⑦|気になる会員|気になる|今日|最優先)\s*[.:：、\s-]*|\n?$)/s],
    ["concerning_member", /(?:^|\n)\s*(?:7|7\.|7:|⑦|気になる会員|気になる)\s*[.:：、\s-]*(.*?)(?=\n\s*(?:8|8\.|8:|⑧|今日|最優先|タスク)\s*[.:：、\s-]*|\n?$)/s],
    ["today_top_task", /(?:^|\n)\s*(?:8|8\.|8:|⑧|今日やること|今日の最優先タスク|今日のタスク|最優先タスク|最優先|タスク|今日)\s*[.:：、\s-]*(.*)$/s],
  ];

  const result: Record<string, string> = {};
  let matched = 0;
  for (const [key, pattern] of fields) {
    const match = normalized.match(pattern);
    const rawValue = match?.[1]?.trim();
    if (rawValue !== undefined) {
      // 先頭にラベル語があれば剥がす（"今日の最優先タスク：xxx" → "xxx"）
      const stripped = stripLabelPrefix(rawValue, BULK_LABEL_KEYWORDS[key] ?? []);
      const sanitised = sanitiseBulkAnswer(cleanLooseValue(stripped));
      // 「なし」相当しか残らない場合でも matched カウントには入れる（存在は確認できた）
      result[key] = sanitised;
      if (rawValue.length > 0) matched += 1;
    }
  }

  return matched >= 2 ? result : undefined;
}

function sanitiseBulkAnswer(input: string): string {
  const normalized = normalizeEmptyAnswer(input.trim());
  return normalized || "なし";
}

function cleanLooseValue(input: string): string {
  let value = input.trim();
  value = value.replace(/^(?:やること|の最優先タスク|のタスク)\s*[:：、\s-]*/, "").trim();
  const stop = value.search(/(?:\n|^|\s)(?:体験|入会|入会迷|入会検討|返信|フォロー|口コミ|レビュー|休みがち|退会|気になる会員|気になる|今日やること|今日の最優先タスク|最優先タスク|タスク)(?:[:：、\s-]|$)/);
  if (stop > 0) value = value.slice(0, stop).trim();
  return value;
}

function stripOkPrefixForDaily(input: string): string {
  const trimmed = input.trim();
  if (/^ok(?:\s+|\n)/i.test(trimmed) && looksLikeDailyReport(trimmed.replace(/^ok(?:\s+|\n)/i, ""))) {
    return trimmed.replace(/^ok(?:\s+|\n)/i, "").trim();
  }
  return trimmed;
}

function looksLikeDailyReport(input: string): boolean {
  const text = normalizeLineText(input).toLowerCase();
  if (!text) return false;
  if (/^(?:ok|no|やめる|中止)$/i.test(text)) return false;
  if (/^(?:ok|no|修正|やめる)\s+fg-\d{8}-\d{3}/i.test(text)) return false;
  if (/^(?:なし|無し|なひ|0|０)$/.test(text)) return true;
  return /体験|入会|迷って|返信|フォロー|口コミ|休みがち|退会|気になる|会員|今日|最優先|タスク|広告|システム|日報/.test(text);
}

function parseLooseDailyReport(text: string): Record<string, string> | undefined {
  const stripped = stripOkPrefixForDaily(text);
  const normalized = normalizeLineText(stripped).trim();
  if (!looksLikeDailyReport(normalized)) return undefined;

  const numbered = parseBulkMorningAnswer(normalized);
  if (numbered) return numbered;

  const allNone = /^(?:なし|無し|なひ|0|０)$/.test(normalized);
  const result: Record<string, string> = {
    trial_yesterday: allNone ? "なし" : "",
    enrollment_yesterday: "なし",
    enrollment_considering: "なし",
    followup_needed: "なし",
    review_request_candidate: "なし",
    retention_risk: "なし",
    concerning_member: "なし",
    today_top_task: "なし",
  };
  if (allNone) return result;

  const labels: Array<{ key: string; re: RegExp; labelRe: RegExp }> = [
    { key: "trial_yesterday", re: /体験/g, labelRe: /^(?:体験|昨日の体験)\s*[:：、\s-]*/ },
    { key: "enrollment_yesterday", re: /入会(?!迷|検討|しそう)/g, labelRe: /^(?:入会|入会した人)\s*[:：、\s-]*/ },
    { key: "enrollment_considering", re: /入会迷|入会検討|入会しそう|迷って/g, labelRe: /^(?:入会迷ってる人|入会迷い|入会検討中|入会しそう|迷ってる人|迷って)\s*[:：、\s-]*/ },
    { key: "followup_needed", re: /返信|フォロー/g, labelRe: /^(?:返信・フォローが必要な人|返信・フォロー|返信|フォロー)\s*[:：、\s-]*/ },
    { key: "review_request_candidate", re: /口コミ|レビュー/g, labelRe: /^(?:口コミ頼めそうな人|口コミ|レビュー)\s*[:：、\s-]*/ },
    { key: "retention_risk", re: /休みがち|退会/g, labelRe: /^(?:休みがち・退会しそうな人|休みがち|退会しそうな人|退会)\s*[:：、\s-]*/ },
    { key: "concerning_member", re: /気になる会員|気になる/g, labelRe: /^(?:気になる会員|気になる人|気になる)\s*[:：、\s-]*/ },
    { key: "today_top_task", re: /今日やること|今日の最優先タスク|最優先タスク|最優先|タスク|今日/g, labelRe: /^(?:今日やること|今日の最優先タスク|今日のタスク|最優先タスク|最優先|タスク|今日)\s*[:：、\s-]*/ },
  ];

  const hits: Array<{ index: number; key: string; labelRe: RegExp }> = [];
  for (const label of labels) {
    for (const match of normalized.matchAll(label.re)) {
      hits.push({ index: match.index ?? 0, key: label.key, labelRe: label.labelRe });
    }
  }
  hits.sort((a, b) => a.index - b.index);
  const firstByKey = new Map<string, { index: number; key: string; labelRe: RegExp }>();
  for (const hit of hits) {
    if (!firstByKey.has(hit.key)) firstByKey.set(hit.key, hit);
  }
  const uniqueHits = Array.from(firstByKey.values()).sort((a, b) => a.index - b.index);

  for (let i = 0; i < uniqueHits.length; i += 1) {
    const hit = uniqueHits[i];
    const next = uniqueHits[i + 1]?.index ?? normalized.length;
    const segment = normalized.slice(hit.index, next).trim();
    const value = sanitiseBulkAnswer(cleanLooseValue(segment.replace(hit.labelRe, "").trim()));
    result[hit.key] = value;
  }

  return uniqueHits.length > 0 ? result : undefined;
}

function hasMorningGenre(session: ConversationSession): boolean {
  return session.genres.some((genre) => genre.type === "morning");
}

async function morningPublishCandidateMessage(session: ConversationSession, dateJst: string): Promise<string[]> {
  if (!hasMorningGenre(session)) return [];
  try {
    const record = await createMorningPublishCandidate({ dateJst });
    await rememberApprovalCandidate(loadConfig().root, record.id);
    return [
      "",
      "SNS投稿候補も作りました。",
      record.approvalMessage,
    ];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [
      "",
      "SNS投稿候補の作成だけ失敗しました。",
      `理由: ${message}`,
    ];
  }
}

async function recordBulkMorningAnswer(userId: string, text: string, opts: MemoryHandlerOptions = {}): Promise<MemoryHandlerResult | undefined> {
  const store = getStore(opts);
  const session = await store.load(userId);
  if (!session || session.step !== "awaiting_bulk_morning") return undefined;

  const parsed = parseLooseDailyReport(text);
  if (!parsed) {
    return {
      ok: false,
      reply: [
        "OPENQLOW（記憶係）：日報として読み取れませんでした。",
        "体験・入会・口コミ・今日やることなどを、分かる範囲で1通で送ってください。",
        "",
        buildBulkMorningPrompt(),
      ].join("\n"),
      meta: { mode: "simple_daily", parseFailed: true },
    };
  }

  const questions = __interviewInternals.GENRE_QUESTIONS.morning;
  session.genres = [{
    type: "morning",
    data: parsed,
    answers: questions.map((question) => ({
      key: question.key,
      question: question.question,
      answer: parsed[question.key] ?? "なし",
    })),
  }];
  session.step = "ready_to_save";
  await store.save(session);

  try {
    const result = await saveCrmLog(session);
    const todoLines = buildTodoReplyLines(parsed);
    await store.destroy(userId);
    return {
      ok: true,
      reply: [
        "保存しました。",
        "",
        result.appended ? "（既存ログに追記）" : "（新規ファイル）",
        ...todoLines,
        "",
        "投稿候補を作るなら「投稿」",
        "修正するなら「修正: 内容」",
      ].join("\n"),
      meta: { mode: "simple_daily", filePath: result.filePath, dateJst: result.dateJst, todos: todoLines.length > 0 },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reply: `OPENQLOW（記憶係）：保存失敗。\n理由: ${message}`,
      meta: { mode: "bulk_morning", error: message },
    };
  }
}

async function recordLooseDailyReport(userId: string, text: string, opts: MemoryHandlerOptions = {}): Promise<MemoryHandlerResult | undefined> {
  const parsed = parseLooseDailyReport(text);
  if (!parsed) return undefined;

  const store = getStore(opts);
  await store.destroy(userId);
  const session = await store.start(userId, "/日報");
  const questions = __interviewInternals.GENRE_QUESTIONS.morning;
  session.genres = [{
    type: "morning",
    data: parsed,
    answers: questions.map((question) => ({
      key: question.key,
      question: question.question,
      answer: parsed[question.key] ?? "なし",
    })),
  }];
  session.step = "ready_to_save";
  await store.save(session);

  try {
    const result = await saveCrmLog(session);
    const todoLines = buildTodoReplyLines(parsed);
    await store.destroy(userId);
    return {
      ok: true,
      reply: [
        "保存しました。",
        "",
        result.appended ? "（既存ログに追記）" : "（新規ファイル）",
        ...todoLines,
        "",
        "投稿候補を作るなら「投稿」",
        "修正するなら「修正: 内容」",
      ].join("\n"),
      meta: { mode: "simple_daily", filePath: result.filePath, dateJst: result.dateJst, todos: todoLines.length > 0 },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reply: `OPENQLOW（記憶係）：保存失敗。\n理由: ${message}`,
      meta: { mode: "simple_daily", error: message },
    };
  }
}

async function createSimplePostCandidate(): Promise<MemoryHandlerResult> {
  try {
    const dateJst = formatDateInTimeZone(new Date(), "Asia/Tokyo");
    const record = await createMorningPublishCandidate({ dateJst });
    await rememberApprovalCandidate(loadConfig().root, record.id);
    const mediaCandidates = await listMediaCandidates(mediaDirectoryForEnv());
    const threads = record.drafts.find((draft) => draft.platform === "threads");
    const body = [
      threads?.body ?? "",
      threads?.hashtags?.length ? threads.hashtags.map((tag) => `#${tag}`).join(" ") : "",
    ].filter(Boolean).join("\n");
    return {
      ok: true,
      reply: [
        "📝 今日の投稿案です（Threads / X / Googleビジネス / LINE VOOM）",
        "",
        body,
        "",
        "下のボタンで操作できます👇",
        "・このまま出す → これで投稿",
        "・直したい → 修正（例：修正 もっとやさしく）",
      ].join("\n"),
      quickReplies: approveQuickReplies(),
      meta: { mode: "simple_post", id: record.id, mediaCandidateCount: mediaCandidates.length },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reply: `OPENQLOW（記憶係）：投稿候補の作成に失敗しました。\n理由: ${message}`,
      meta: { mode: "simple_post", error: message },
    };
  }
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
  return normalizeLineText(text);
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
  const canonical = canonicalLineCommand(text);
  // 本文付きはワンショット扱いなので、対話モード起動コマンドとしては検出しない
  if (parseOneShotMemo(text)) return undefined;
  if (canonical === "/おはよう") return "/おはよう";
  if (canonical === "/昨日の記録") return "/昨日の記録";
  if (canonical === "/保存用ログ") return "/保存用ログ";
  // 「やめる」単体は除外（既存承認フローの「やめる FG-XXX」と区別するため）
  if (canonical === "/中止") return "/中止";
  return undefined;
}

export function isMemoryCommandText(text: string): boolean {
  return parseMemoryCommand(text) !== undefined;
}

export async function dispatchMemoryCommand(userId: string, command: MemoryCommand, opts: MemoryHandlerOptions = {}): Promise<MemoryHandlerResult> {
  switch (command) {
    case "/おはよう":
      return startMorningInterview(userId, opts);
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
    const publishLines = await morningPublishCandidateMessage(session, result.dateJst);
    // 8問インタビュー完了時は ToDo3つを抽出して返信に追記
    const morningEntry = session.genres.find((g) => g.type === "morning");
    const todoLines = morningEntry ? buildTodoReplyLines(morningEntry.data) : [];
    await store.destroy(userId);
    return {
      ok: true,
      reply: [
        "OPENQLOW（記憶係）：保存しました📝",
        `日付: ${result.dateJst}`,
        result.appended ? "（既存ログに追記）" : "（新規ファイル）",
        `件数: ${session.genres.length}`,
        ...todoLines,
        ...publishLines,
      ].join("\n"),
      meta: {
        mode: "auto_save",
        filePath: result.filePath,
        dateJst: result.dateJst,
        genres: session.genres.length,
        todos: todoLines.length > 0,
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
  // 0) 「投稿」だけで直近日報ベースの投稿候補を1件作る
  if (isSimplePostCommand(text)) {
    const result = await createSimplePostCandidate();
    return { ...result, route: "command" };
  }

  // 1) ワンショット「/日記 本文」を最優先で検出
  const oneShot = parseOneShotMemo(text);
  if (oneShot) {
    const result = await recordOneShotMemo(userId, oneShot.body, opts);
    return { ...result, route: "command" };
  }

  // 2) 明示コマンド（/日記 単独、/中止、/保存用ログ）
  const command = parseMemoryCommand(text);
  if (command) {
    // /おはよう /日報: サフィックス「まとめ」で旧テンプレ送信、それ以外は対話モード
    if (command === "/おはよう") {
      const mode = getMorningMode(text);
      const result = mode === "bulk"
        ? await startMorningInterview(userId, opts)
        : await startMorningDialog(userId, opts);
      return { ...result, route: "command" };
    }
    const result = await dispatchMemoryCommand(userId, command, opts);
    return { ...result, route: "command" };
  }

  // 3) /おはよう の包括回答
  const bulkMorning = await recordBulkMorningAnswer(userId, text, opts);
  if (bulkMorning) {
    return { ...bulkMorning, route: "ongoing_session" };
  }

  // 4) 進行中セッションへの回答
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

  // 5) セッション無しでも日報っぽい自由文は保存する
  const looseDaily = await recordLooseDailyReport(userId, text, opts);
  if (looseDaily) {
    return { ...looseDaily, route: "command" };
  }

  return {
    ok: false,
    reply: "",
    route: "no_match",
  };
}
