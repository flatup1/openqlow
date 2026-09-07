// 夕方リマインダー push（systemd timer 20:00 JST から呼ばれる oneshot）。
//
// 動作:
//   1. 朝の morning_briefing で事前作成された会話セッションを読む
//   2. 既に保存済み（step=ready_to_save）→ skip
//   3. セッション存在しない（Jin が朝の push を完全スルー or 既に TTL 切れ）→ skip
//   4. 進行中で 12 時間以内に最後の応答 → 「まだ途中です」リマインダー push
//   5. 同じ日に2回目の発火は state ファイルで防止（多重通知防止）
//
// 安全装置:
//   - OPENQLOW_REMINDER_PUSH_DISABLED=true で完全停止
//   - JIN_LINE_USER_ID / LINE_CHANNEL_ACCESS_TOKEN 未設定で no-op
//   - OPENQLOW_LINE_DRY_RUN=true で送信せず stdout

import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";
import { defaultSessionStore, type ConversationSession, type SessionStore } from "../conversation/session_store.js";
import { __interviewInternals } from "../conversation/interview_flow.js";
import { pushLineMessage } from "../line_bot/notifier.js";
import { formatDateInTimeZone } from "../utils/date.js";
import { openqlowPath } from "../utils/paths.js";
import { acquireRunLock } from "./run_lock.js";

const STALE_HOURS = 12;
// ロックファイル名は既存の reminder_sent_<日付>.txt のまま。
const RUN_LOCK_KEY = "reminder_sent";
// メモ促しは別枠でロックする（日報リマインダーと独立に1日1通）。
const MEMO_NUDGE_LOCK_KEY = "memo_nudge_sent";
// daily_logs 内のメモ見出し。日本語では \b が効かないため後続を明示する。
const MEMO_HEADING = /^##\s+(?:LINE追記|LINE自動メモ|追記)(?=\s|$)/m;

export type ReminderMode =
  | "sent"
  | "dry_run"
  | "skipped"
  | "disabled"
  | "no_user"
  | "no_session"
  | "already_done"
  | "stale"
  | "duplicate_today"
  /** 今日のメモが無いので「3行で残しませんか」を送った */
  | "memo_nudge_sent"
  /** メモ促しをドライラン表示した */
  | "memo_nudge_dry_run"
  /** 今日すでにメモがある、または今日すでに促した → 送らない */
  | "memo_exists"
  | "memo_nudge_duplicate";

export interface ReminderResult {
  ok: boolean;
  mode: ReminderMode;
  reason?: string;
}

export interface ReminderOptions {
  /** テスト用に Jin の userId を差し替え */
  userId?: string;
  /** テスト用 push 関数 */
  pushFn?: typeof pushLineMessage;
  /** 現在時刻（テスト用） */
  now?: Date;
  /** テスト用 SessionStore 差し替え */
  store?: SessionStore;
  /** テスト用に state ディレクトリ差し替え */
  stateDir?: string;
  /** テスト用に Obsidian Vault のルートを差し替え */
  vaultRoot?: string;
}

function currentQuestionText(session: ConversationSession): string {
  if (session.activeGenre !== "morning") return "（質問情報なし）";
  const questions = __interviewInternals.GENRE_QUESTIONS.morning;
  const q = questions[session.activeGenreQuestionIndex];
  return q?.question ?? "（質問情報なし）";
}

function buildMessage(session: ConversationSession): string {
  const question = currentQuestionText(session);
  return [
    "🌙 OPENQLOW（記憶係）：今日の日報、まだ途中でした。",
    "",
    "最後の質問はこれでした：",
    question,
    "",
    "「中止」と送れば破棄、答えを送れば続きから再開できます。",
    "明日の朝にまた届きますので、無理せず大丈夫です。",
  ].join("\n");
}

/** 今日の daily_logs にメモが1件でもあるか。ファイルが無ければ「無い」。 */
async function hasMemoToday(vaultRoot: string, dateJst: string): Promise<boolean> {
  const file = path.join(vaultRoot, "01_DAILY_OPERATIONS", "daily_logs", `${dateJst}.md`);
  try {
    return MEMO_HEADING.test(await readFile(file, "utf8"));
  } catch {
    return false;
  }
}

function buildMemoNudge(): string {
  return [
    "🌙 今日の練習、3行で残しませんか？",
    "",
    "そのまま返信すればメモになります。例:",
    "",
    "寝技 マサキ アンディ",
    "キッズ 双子 ゆいろ",
    "体験なし 入会なし",
    "",
    "週末に「整理」と送れば1枚にまとまります。",
  ].join("\n");
}

/**
 * 日報リマインダーを送らなかった日に、メモが無ければ「3行で残しませんか」を送る。
 * 記録が続かないと週次整理が空回りするため、入口をここで支える。
 */
async function runMemoNudge(
  opts: ReminderOptions,
  userId: string,
  now: Date,
  dateJst: string,
  stateDir: string,
  /** 日報リマインダーを送らなかった理由。ログ追跡用に結果へ引き継ぐ。 */
  skipReason: string,
): Promise<ReminderResult> {
  const vaultRoot = opts.vaultRoot ?? loadConfig().obsidianVaultRoot;
  if (await hasMemoToday(vaultRoot, dateJst)) {
    return {
      ok: true,
      mode: "memo_exists",
      reason: `${skipReason}; memo already recorded on ${dateJst}`,
    };
  }

  // 送信直前にロックを取る。同じ日に2回発火しても届くのは1通だけ。
  const lock = await acquireRunLock(stateDir, MEMO_NUDGE_LOCK_KEY, dateJst, now.toISOString());
  if (!lock.acquired) {
    return {
      ok: true,
      mode: "memo_nudge_duplicate",
      reason: `${skipReason}; already nudged on ${dateJst}`,
    };
  }

  const pushFn = opts.pushFn ?? pushLineMessage;
  const pushResult = await pushFn(buildMemoNudge(), { userId });

  // 届かなかった日はやり直せるようにロックを戻す。
  if (pushResult.mode !== "sent" || !pushResult.ok) {
    await lock.release();
  }

  if (pushResult.mode === "dry_run") return { ok: true, mode: "memo_nudge_dry_run" };
  if (pushResult.mode === "skipped") {
    return { ok: true, mode: "skipped", reason: "credentials missing for push" };
  }
  if (!pushResult.ok) {
    return { ok: false, mode: "memo_nudge_sent", reason: pushResult.error };
  }
  return { ok: true, mode: "memo_nudge_sent" };
}

export async function runReminder(opts: ReminderOptions = {}): Promise<ReminderResult> {
  if (process.env.OPENQLOW_REMINDER_PUSH_DISABLED === "true") {
    return { ok: true, mode: "disabled", reason: "OPENQLOW_REMINDER_PUSH_DISABLED=true" };
  }

  const userId = opts.userId ?? process.env.JIN_LINE_USER_ID ?? "";
  if (!userId) {
    return { ok: true, mode: "no_user", reason: "JIN_LINE_USER_ID not configured" };
  }

  const now = opts.now ?? new Date();
  const dateJst = formatDateInTimeZone(now, "Asia/Tokyo");
  const stateDir = opts.stateDir ?? openqlowPath("state");

  const store = opts.store ?? defaultSessionStore();
  const session = await store.load(userId);

  // 日報リマインダーを送らない日は、代わりにメモ促しを検討する。
  // 「日報の途中」を送る日に重ねて2通送ることはしない。
  if (!session) {
    return runMemoNudge(opts, userId, now, dateJst, stateDir, "no_session");
  }
  if (session.step === "ready_to_save") {
    return runMemoNudge(opts, userId, now, dateJst, stateDir, "already_done");
  }

  const lastInteraction = new Date(session.lastInteractionAt ?? session.startedAt);
  const ageHours = (now.getTime() - lastInteraction.getTime()) / (1000 * 60 * 60);
  if (ageHours > STALE_HOURS) {
    return runMemoNudge(opts, userId, now, dateJst, stateDir, `stale ${ageHours.toFixed(1)}h`);
  }

  // 送信の直前にロックを取る。timer が同じ日に2回発火しても、届くのは1通だけ。
  // 「見てから書く」方式と違い、同時に走った2つが両方とも通ることがない。
  const lock = await acquireRunLock(stateDir, RUN_LOCK_KEY, dateJst, now.toISOString());
  if (!lock.acquired) {
    return { ok: true, mode: "duplicate_today", reason: `already reminded on ${dateJst}` };
  }

  const message = buildMessage(session);
  const pushFn = opts.pushFn ?? pushLineMessage;
  const pushResult = await pushFn(message, { userId });

  // 実際に届いたときだけロックを残す。送れなかった日はやり直せるようにする。
  if (pushResult.mode !== "sent" || !pushResult.ok) {
    await lock.release();
  }

  if (pushResult.mode === "dry_run") {
    return { ok: true, mode: "dry_run" };
  }
  if (pushResult.mode === "skipped") {
    return { ok: true, mode: "skipped", reason: "credentials missing for push" };
  }
  if (!pushResult.ok) {
    return { ok: false, mode: "sent", reason: pushResult.error };
  }
  return { ok: true, mode: "sent" };
}

// CLI 実行（systemd oneshot 用）
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const r = await runReminder();
  console.log(`[reminder] mode=${r.mode} ok=${r.ok}${r.reason ? ` reason=${r.reason}` : ""}`);
  if (!r.ok) process.exit(1);
}
