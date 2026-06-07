import assert from "node:assert/strict";
import { mkdtemp, rm, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { runReminder } from "./reminder.js";
import { SessionStore, type ConversationSession } from "../conversation/session_store.js";

/**
 * SessionStore.save() は lastInteractionAt と expiresAt を必ず now() で上書きする。
 * テストで古いタイムスタンプを設定したい場合は、fs に直書きする。
 */
async function writeSessionDirect(baseDir: string, session: ConversationSession): Promise<void> {
  await mkdir(baseDir, { recursive: true });
  const safe = session.userId.replace(/[^A-Za-z0-9_-]/g, "_");
  await writeFile(path.join(baseDir, `${safe}.json`), JSON.stringify(session));
}

const FIXED_NOW = new Date("2026-06-06T11:00:00Z"); // JST 20:00 of 2026-06-06
const USER = "Uaa10d8962ee00789c2a52cfa01a94cff"; // 形式は LINE userId に揃える

async function freshDirs(): Promise<{ stateDir: string; store: SessionStore }> {
  const root = await mkdtemp(path.join(tmpdir(), "openqlow-reminder-"));
  process.env.OPENQLOW_ROOT = root;
  const stateDir = path.join(root, "state");
  const store = new SessionStore({ baseDir: path.join(stateDir, "conversations"), now: () => FIXED_NOW });
  return { stateDir, store };
}

// 1. OPENQLOW_REMINDER_PUSH_DISABLED=true → 即 disabled
{
  process.env.OPENQLOW_REMINDER_PUSH_DISABLED = "true";
  const r = await runReminder({ now: FIXED_NOW, userId: USER });
  assert.equal(r.mode, "disabled");
  assert.equal(r.ok, true);
  delete process.env.OPENQLOW_REMINDER_PUSH_DISABLED;
}

// 2. JIN_LINE_USER_ID 未設定 → no_user
{
  delete process.env.JIN_LINE_USER_ID;
  const r = await runReminder({ now: FIXED_NOW });
  assert.equal(r.mode, "no_user");
  assert.equal(r.ok, true);
}

// 3. セッション無し（朝の push が届かなかった想定）→ no_session、push 呼ばれない
{
  const { stateDir, store } = await freshDirs();
  let pushCalled = false;
  const r = await runReminder({
    now: FIXED_NOW,
    userId: USER,
    stateDir,
    store,
    pushFn: async () => {
      pushCalled = true;
      return { ok: true, mode: "sent" };
    },
  });
  assert.equal(r.mode, "no_session");
  assert.equal(pushCalled, false, "no session のときは push しない");
}

// 4. セッション ready_to_save → already_done、push しない
{
  const { stateDir, store } = await freshDirs();
  const session = await store.start(USER, "/日報");
  session.step = "ready_to_save";
  await store.save(session);
  let pushCalled = false;
  const r = await runReminder({
    now: FIXED_NOW,
    userId: USER,
    stateDir,
    store,
    pushFn: async () => {
      pushCalled = true;
      return { ok: true, mode: "sent" };
    },
  });
  assert.equal(r.mode, "already_done");
  assert.equal(pushCalled, false);
}

// 5. 進行中セッション + 最近の応答 → 実 push されてスタンプが残る
{
  const { stateDir, store } = await freshDirs();
  const session = await store.start(USER, "/日報");
  session.activeGenre = "morning";
  session.activeGenreQuestionIndex = 2; // Q3 まで進行
  session.step = "awaiting_genre_detail";
  session.lastInteractionAt = new Date(FIXED_NOW.getTime() - 30 * 60 * 1000).toISOString(); // 30分前
  await store.save(session);

  const pushMessages: string[] = [];
  const r = await runReminder({
    now: FIXED_NOW,
    userId: USER,
    stateDir,
    store,
    pushFn: async (text) => {
      pushMessages.push(text);
      return { ok: true, mode: "sent" };
    },
  });
  assert.equal(r.mode, "sent");
  assert.equal(pushMessages.length, 1);
  assert.match(pushMessages[0], /日報、まだ途中/);
  assert.match(pushMessages[0], /3\/8|入会しそうだけど迷っている/, "最後の質問が含まれる");
  assert.match(pushMessages[0], /中止/);

  // スタンプファイルが作成される
  const stamp = path.join(stateDir, "reminder_sent_2026-06-06.txt");
  await stat(stamp); // throws if not exists
}

// 6. 既に同じ日に reminder 送信済み → duplicate_today、push しない
{
  const { stateDir, store } = await freshDirs();
  const session = await store.start(USER, "/日報");
  session.activeGenre = "morning";
  session.activeGenreQuestionIndex = 1;
  session.step = "awaiting_genre_detail";
  await store.save(session);

  // 1回目
  await runReminder({
    now: FIXED_NOW,
    userId: USER,
    stateDir,
    store,
    pushFn: async () => ({ ok: true, mode: "sent" }),
  });

  // 2回目
  let pushCalled = false;
  const r2 = await runReminder({
    now: FIXED_NOW,
    userId: USER,
    stateDir,
    store,
    pushFn: async () => {
      pushCalled = true;
      return { ok: true, mode: "sent" };
    },
  });
  assert.equal(r2.mode, "duplicate_today");
  assert.equal(pushCalled, false, "2回目は push しない");
}

// 7. 12時間以上経過した古いセッション → stale、push しない
{
  const { stateDir, store } = await freshDirs();
  const baseDir = path.join(stateDir, "conversations");
  // fs 直書き（store.save は lastInteractionAt を now() で上書きするため）
  const session: ConversationSession = {
    userId: USER,
    command: "/日報",
    step: "awaiting_genre_detail",
    activeGenre: "morning",
    activeGenreQuestionIndex: 1,
    genres: [],
    startedAt: new Date(FIXED_NOW.getTime() - 13 * 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(FIXED_NOW.getTime() + 60 * 1000).toISOString(), // まだ有効
    lastInteractionAt: new Date(FIXED_NOW.getTime() - 13 * 60 * 60 * 1000).toISOString(),
  };
  await writeSessionDirect(baseDir, session);

  let pushCalled = false;
  const r = await runReminder({
    now: FIXED_NOW,
    userId: USER,
    stateDir,
    store,
    pushFn: async () => {
      pushCalled = true;
      return { ok: true, mode: "sent" };
    },
  });
  assert.equal(r.mode, "stale", `expected stale but got ${r.mode}: ${r.reason}`);
  assert.equal(pushCalled, false);
}

// 8. dry_run モード
{
  const { stateDir, store } = await freshDirs();
  const session = await store.start(USER, "/日報");
  session.activeGenre = "morning";
  session.activeGenreQuestionIndex = 0;
  session.step = "awaiting_genre_detail";
  await store.save(session);

  const r = await runReminder({
    now: FIXED_NOW,
    userId: USER,
    stateDir,
    store,
    pushFn: async () => ({ ok: true, mode: "dry_run" }),
  });
  assert.equal(r.mode, "dry_run");
  // dry_run のときはスタンプを残さない（後で本番 push に切替えても通る）
  try {
    await stat(path.join(stateDir, "reminder_sent_2026-06-06.txt"));
    assert.fail("dry_run でスタンプが作られてはいけない");
  } catch (err) {
    assert.equal((err as NodeJS.ErrnoException).code, "ENOENT");
  }
}

// 9. push 失敗時は ok:false で返る
{
  const { stateDir, store } = await freshDirs();
  const session = await store.start(USER, "/日報");
  session.activeGenre = "morning";
  session.activeGenreQuestionIndex = 0;
  session.step = "awaiting_genre_detail";
  await store.save(session);

  const r = await runReminder({
    now: FIXED_NOW,
    userId: USER,
    stateDir,
    store,
    pushFn: async () => ({ ok: false, mode: "sent", error: "rate_limit" }),
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "rate_limit");
}

console.log("reminder tests passed");
