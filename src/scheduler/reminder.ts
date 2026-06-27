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

import fs from "node:fs/promises";
import path from "node:path";
import { defaultSessionStore, type ConversationSession, type SessionStore } from "../conversation/session_store.js";
import { __interviewInternals } from "../conversation/interview_flow.js";
import { pushLineMessage } from "../line_bot/notifier.js";
import { formatDateInTimeZone } from "../utils/date.js";
import { openqlowPath } from "../utils/paths.js";

const STALE_HOURS = 12;

export type ReminderMode =
  | "sent"
  | "dry_run"
  | "skipped"
  | "disabled"
  | "no_user"
  | "no_session"
  | "already_done"
  | "stale"
  | "duplicate_today";

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
}

function reminderStampPath(stateDir: string, dateJst: string): string {
  return path.join(stateDir, `reminder_sent_${dateJst}.txt`);
}

async function alreadyRemindedToday(stateDir: string, dateJst: string): Promise<boolean> {
  try {
    await fs.stat(reminderStampPath(stateDir, dateJst));
    return true;
  } catch {
    return false;
  }
}

async function markReminded(stateDir: string, dateJst: string, isoNow: string): Promise<void> {
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(reminderStampPath(stateDir, dateJst), isoNow);
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
    "🌙 今日の日報、まだ途中でした。",
    "",
    "最後の質問はこれでした：",
    question,
    "",
    "「中止」と送れば破棄、答えを送れば続きから再開できます。",
    "明日の朝にまた届きますので、無理せず大丈夫です。",
  ].join("\n");
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

  if (await alreadyRemindedToday(stateDir, dateJst)) {
    return { ok: true, mode: "duplicate_today", reason: `already reminded on ${dateJst}` };
  }

  const store = opts.store ?? defaultSessionStore();
  const session = await store.load(userId);

  if (!session) {
    return {
      ok: true,
      mode: "no_session",
      reason: "no active session — morning push may not have fired or session expired",
    };
  }
  if (session.step === "ready_to_save") {
    return { ok: true, mode: "already_done", reason: "session already completed" };
  }

  const lastInteraction = new Date(session.lastInteractionAt ?? session.startedAt);
  const ageHours = (now.getTime() - lastInteraction.getTime()) / (1000 * 60 * 60);
  if (ageHours > STALE_HOURS) {
    return { ok: true, mode: "stale", reason: `session ${ageHours.toFixed(1)}h old, skipping` };
  }

  const message = buildMessage(session);
  const pushFn = opts.pushFn ?? pushLineMessage;
  const pushResult = await pushFn(message, { userId });

  if (pushResult.mode === "dry_run") {
    return { ok: true, mode: "dry_run" };
  }
  if (pushResult.mode === "skipped") {
    return { ok: true, mode: "skipped", reason: "credentials missing for push" };
  }
  if (!pushResult.ok) {
    return { ok: false, mode: "sent", reason: pushResult.error };
  }
  // sent
  await markReminded(stateDir, dateJst, now.toISOString());
  return { ok: true, mode: "sent" };
}

// CLI 実行（systemd oneshot 用）
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const r = await runReminder();
  console.log(`[reminder] mode=${r.mode} ok=${r.ok}${r.reason ? ` reason=${r.reason}` : ""}`);
  if (!r.ok) process.exit(1);
}
