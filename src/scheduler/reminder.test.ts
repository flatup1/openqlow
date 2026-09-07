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


/** 指定日のメモが1件入った Vault を作る。 */
async function freshVaultWithMemo(dateJst: string): Promise<string> {
  const vaultRoot = await mkdtemp(path.join(tmpdir(), "openqlow-reminder-vault-"));
  const dir = path.join(vaultRoot, "01_DAILY_OPERATIONS", "daily_logs");
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, `${dateJst}.md`),
    "## LINE追記 2026-06-06T10:00:00.000Z\n- source: LINE\n\n寝技 マサキ\n",
    "utf8",
  );
  return vaultRoot;
}

/** メモが1件も無い空の Vault を作る。 */
async function freshEmptyVault(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "openqlow-reminder-vault-empty-"));
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

// 3. セッション無し + 今日のメモあり → 何も送らない（memo_exists）
{
  const { stateDir, store } = await freshDirs();
  const vaultRoot = await freshVaultWithMemo("2026-06-06");
  let pushCalled = false;
  const r = await runReminder({
    now: FIXED_NOW,
    userId: USER,
    stateDir,
    store,
    vaultRoot,
    pushFn: async () => {
      pushCalled = true;
      return { ok: true, mode: "sent" };
    },
  });
  assert.equal(r.mode, "memo_exists");
  assert.match(r.reason ?? "", /no_session/, "日報を送らなかった理由が残る");
  assert.equal(pushCalled, false, "メモがある日は何も送らない");
}

// 4. セッション ready_to_save → already_done、push しない
{
  const { stateDir, store } = await freshDirs();
  const session = await store.start(USER, "/日報");
  session.step = "ready_to_save";
  await store.save(session);
  const vaultRoot = await freshVaultWithMemo("2026-06-06");
  let pushCalled = false;
  const r = await runReminder({
    now: FIXED_NOW,
    userId: USER,
    stateDir,
    store,
    vaultRoot,
    pushFn: async () => {
      pushCalled = true;
      return { ok: true, mode: "sent" };
    },
  });
  assert.equal(r.mode, "memo_exists");
  assert.match(r.reason ?? "", /already_done/);
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

  const vaultRoot = await freshVaultWithMemo("2026-06-06");
  let pushCalled = false;
  const r = await runReminder({
    now: FIXED_NOW,
    userId: USER,
    stateDir,
    store,
    vaultRoot,
    pushFn: async () => {
      pushCalled = true;
      return { ok: true, mode: "sent" };
    },
  });
  assert.equal(r.mode, "memo_exists", `expected memo_exists but got ${r.mode}: ${r.reason}`);
  assert.match(r.reason ?? "", /stale 13\.0h/, "古いセッションだった理由が残る");
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

// --- 夜のメモ促し（記録が続くように支える） -------------------------------

// 9. セッション無し + 今日のメモ無し → 「3行で残しませんか」を送る
{
  const { stateDir, store } = await freshDirs();
  const vaultRoot = await freshEmptyVault();
  const pushMessages: string[] = [];
  const r = await runReminder({
    now: FIXED_NOW,
    userId: USER,
    stateDir,
    store,
    vaultRoot,
    pushFn: async (text) => {
      pushMessages.push(text);
      return { ok: true, mode: "sent" };
    },
  });
  assert.equal(r.mode, "memo_nudge_sent", `got ${r.mode}: ${r.reason}`);
  assert.equal(pushMessages.length, 1);
  assert.match(pushMessages[0], /3行/);
  assert.match(pushMessages[0], /整理/, "週末の整理コマンドを案内する");
  assert.doesNotMatch(pushMessages[0], /日報、まだ途中/, "日報リマインダーとは別の文面");
}

// 10. 同じ日に2回発火しても届くのは1通だけ
{
  const { stateDir, store } = await freshDirs();
  const vaultRoot = await freshEmptyVault();
  const first = await runReminder({
    now: FIXED_NOW, userId: USER, stateDir, store, vaultRoot,
    pushFn: async () => ({ ok: true, mode: "sent" }),
  });
  assert.equal(first.mode, "memo_nudge_sent");

  let pushCalled = false;
  const second = await runReminder({
    now: FIXED_NOW, userId: USER, stateDir, store, vaultRoot,
    pushFn: async () => {
      pushCalled = true;
      return { ok: true, mode: "sent" };
    },
  });
  assert.equal(second.mode, "memo_nudge_duplicate");
  assert.equal(pushCalled, false, "2通目は送らない");
}

// 11. 送れなかった日はロックを戻し、翌回にやり直せる
{
  const { stateDir, store } = await freshDirs();
  const vaultRoot = await freshEmptyVault();
  const failed = await runReminder({
    now: FIXED_NOW, userId: USER, stateDir, store, vaultRoot,
    pushFn: async () => ({ ok: false, mode: "sent", error: "rate_limit" }),
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.mode, "memo_nudge_sent");

  const retried = await runReminder({
    now: FIXED_NOW, userId: USER, stateDir, store, vaultRoot,
    pushFn: async () => ({ ok: true, mode: "sent" }),
  });
  assert.equal(retried.mode, "memo_nudge_sent", "失敗した日はやり直せる");
}

// 12. 停止スイッチはメモ促しにも効く
{
  process.env.OPENQLOW_REMINDER_PUSH_DISABLED = "true";
  const { stateDir, store } = await freshDirs();
  const vaultRoot = await freshEmptyVault();
  let pushCalled = false;
  const r = await runReminder({
    now: FIXED_NOW, userId: USER, stateDir, store, vaultRoot,
    pushFn: async () => {
      pushCalled = true;
      return { ok: true, mode: "sent" };
    },
  });
  assert.equal(r.mode, "disabled");
  assert.equal(pushCalled, false);
  delete process.env.OPENQLOW_REMINDER_PUSH_DISABLED;
}

// 13. 進行中セッションがある日は日報リマインダーだけ（2通送らない）
{
  const { stateDir, store } = await freshDirs();
  const session = await store.start(USER, "/日報");
  session.activeGenre = "morning";
  session.activeGenreQuestionIndex = 2;
  session.step = "awaiting_genre_detail";
  session.lastInteractionAt = new Date(FIXED_NOW.getTime() - 30 * 60 * 1000).toISOString();
  await store.save(session);

  const vaultRoot = await freshEmptyVault(); // メモは無いが、促しは送らない
  const pushMessages: string[] = [];
  const r = await runReminder({
    now: FIXED_NOW, userId: USER, stateDir, store, vaultRoot,
    pushFn: async (text) => {
      pushMessages.push(text);
      return { ok: true, mode: "sent" };
    },
  });
  assert.equal(r.mode, "sent");
  assert.equal(pushMessages.length, 1, "1通だけ");
  assert.match(pushMessages[0], /日報、まだ途中/);
}

console.log("reminder memo-nudge tests passed");
