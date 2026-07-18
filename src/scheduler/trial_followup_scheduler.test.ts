import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  runTrialFollowup,
  selectSameDay,
  selectNextDay,
} from "./trial_followup_scheduler.js";
import { openProspectStore } from "../crm/store.js";
import type { ProspectInput } from "../crm/prospect.js";

const FIXED_NOW = new Date("2026-07-13T10:00:00Z"); // JST 2026-07-13 19:00
const TODAY = "2026-07-13";
const YESTERDAY = "2026-07-12";

async function freshStore(seed: ProspectInput[]): Promise<{ storeFile: string; stateDir: string; store: ReturnType<typeof openProspectStore> }> {
  const root = await mkdtemp(path.join(tmpdir(), "openqlow-trialfollow-"));
  const storeFile = path.join(root, "prospects.json");
  const stateDir = path.join(root, "state");
  const store = openProspectStore(storeFile, () => FIXED_NOW);
  for (const s of seed) await store.create(s);
  return { storeFile, stateDir, store };
}

function collectPush() {
  const calls: Array<{ text: string; userId?: string }> = [];
  const pushFn = async (text: string, opts: { userId?: string } = {}) => {
    calls.push({ text, userId: opts.userId });
    return { ok: true as const, mode: "sent" as const };
  };
  return { calls, pushFn };
}

// 1. 抽出ロジック（純関数） ------------------------------------------------
{
  const base = { id: 0, createdAt: "", updatedAt: "" };
  const rows = [
    { ...base, id: 1, name: "今日体験", trialDate: TODAY, joined: 0, status: "trial_done" },
    { ...base, id: 2, name: "昨日体験", trialDate: YESTERDAY, joined: 0, status: "trial_done" },
    { ...base, id: 3, name: "入会済み", trialDate: TODAY, joined: 1, status: "joined" },
    { ...base, id: 4, name: "失注", trialDate: TODAY, joined: 0, status: "lost" },
    { ...base, id: 5, name: "別日", trialDate: "2026-01-01", joined: 0, status: "trial_done" },
  ] as unknown as import("../crm/prospect.js").Prospect[];

  const sd = selectSameDay(rows, TODAY).map(p => p.id);
  assert.deepEqual(sd, [1], `same-day = [1]; got ${sd}`);
  const nd = selectNextDay(rows, YESTERDAY).map(p => p.id);
  assert.deepEqual(nd, [2], `next-day = [2]; got ${nd}`);
}

// 2. DISABLED で即停止 ------------------------------------------------------
{
  const prev = process.env.OPENQLOW_TRIAL_FOLLOWUP_DISABLED;
  process.env.OPENQLOW_TRIAL_FOLLOWUP_DISABLED = "true";
  const { stateDir, store } = await freshStore([]);
  const { calls, pushFn } = collectPush();
  const r = await runTrialFollowup({ now: FIXED_NOW, store, stateDir, pushFn });
  assert.equal(r.disabled, true, "disabled short-circuits");
  assert.equal(calls.length, 0, "no push when disabled");
  process.env.OPENQLOW_TRIAL_FOLLOWUP_DISABLED = prev;
}

// 3. 既定=Jinへドラフト送信（顧客へは自動送信しない） ----------------------
{
  const { stateDir, store } = await freshStore([
    { name: "花子", trialDate: TODAY, joined: 0, status: "trial_done", externalId: "Ucustomer123", gender: "female", ageGroup: "30代" },
  ]);
  const { calls, pushFn } = collectPush();
  const r = await runTrialFollowup({ now: FIXED_NOW, store, stateDir, pushFn, autoSend: false, reviewUrl: "https://g.page/r/REVIEW" });
  const sameDay = r.actions.find(a => a.stage === "same_day");
  assert.equal(sameDay?.outcome, "sent", "same-day sent");
  assert.equal(sameDay?.target, "jin", "default target is Jin (approval gate)");
  assert.equal(calls.length, 1, "one push");
  assert.equal(calls[0].userId, undefined, "Jin push has no explicit customer userId");
  assert.ok(calls[0].text.includes("確認して送って"), "wrapped as draft for Jin");
  assert.ok(calls[0].text.includes("https://g.page/r/REVIEW"), "review link included");
  assert.ok(!/星|★|良い口コミ/.test(calls[0].text), "never asks for stars / good reviews");
}

// 4. AUTO_SEND=true で顧客の LINE へ直接送信 -------------------------------
{
  const { stateDir, store } = await freshStore([
    { name: "太郎", trialDate: TODAY, joined: 0, status: "trial_done", externalId: "Ucustomer999", gender: "male" },
  ]);
  const { calls, pushFn } = collectPush();
  const r = await runTrialFollowup({ now: FIXED_NOW, store, stateDir, pushFn, autoSend: true });
  const sameDay = r.actions.find(a => a.stage === "same_day");
  assert.equal(sameDay?.target, "customer", "auto-send targets customer");
  assert.equal(calls[0].userId, "Ucustomer999", "pushed to customer userId");
  assert.ok(!calls[0].text.includes("確認して送って"), "customer message is not the draft wrapper");
}

// 5. AUTO_SEND でも externalId 無しなら Jin へフォールバック ----------------
{
  const { stateDir, store } = await freshStore([
    { name: "IDなし", trialDate: TODAY, joined: 0, status: "trial_done", externalId: "" },
  ]);
  const { calls, pushFn } = collectPush();
  const r = await runTrialFollowup({ now: FIXED_NOW, store, stateDir, pushFn, autoSend: true });
  assert.equal(r.actions[0].target, "jin", "no customer id → fallback to Jin");
  assert.equal(calls[0].userId, undefined, "fallback push goes to Jin");
}

// 6. 多重送信防止（2回目は already_done） ---------------------------------
{
  const { stateDir, store } = await freshStore([
    { name: "二重防止", trialDate: TODAY, joined: 0, status: "trial_done", externalId: "Ux" },
  ]);
  const { calls, pushFn } = collectPush();
  await runTrialFollowup({ now: FIXED_NOW, store, stateDir, pushFn });
  const second = await runTrialFollowup({ now: FIXED_NOW, store, stateDir, pushFn });
  assert.equal(second.actions[0].outcome, "already_done", "second run is idempotent");
  assert.equal(calls.length, 1, "no duplicate push on second run");
  // スタンプが存在する
  await stat(path.join(stateDir, "trial_followup_1_same_day_2026-07-13.txt"));
}

// 7. skip（push未設定）ならスタンプを刻まない＝リトライ余地を残す ----------
{
  const { stateDir, store } = await freshStore([
    { name: "skip検証", trialDate: TODAY, joined: 0, status: "trial_done", externalId: "Uy" },
  ]);
  const skipPush = async () => ({ ok: true as const, mode: "skipped" as const });
  const r = await runTrialFollowup({ now: FIXED_NOW, store, stateDir, pushFn: skipPush });
  assert.equal(r.actions[0].outcome, "skipped", "skipped when push not configured");
  let stampExists = true;
  try { await stat(path.join(stateDir, "trial_followup_1_same_day_2026-07-13.txt")); }
  catch { stampExists = false; }
  assert.equal(stampExists, false, "no stamp on skip (retryable next run)");
}

console.log("trial_followup_scheduler tests passed");
