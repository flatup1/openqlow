import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { isMorningBriefingCliEntry, runMorningBriefing } from "./morning_briefing.js";

// 環境変数を共通テストルートに差し替え
async function setRootTmp(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "openqlow-morning-test-"));
  process.env.OPENQLOW_ROOT = root;
  return root;
}

const FIXED_NOW = new Date("2026-06-05T22:00:00Z"); // JST 07:00 of 2026-06-06

// 0. tsx 実行時の CLI エントリポイント判定
{
  assert.equal(isMorningBriefingCliEntry("file:///repo/src/scheduler/morning_briefing.ts", "/repo/src/scheduler/morning_briefing.ts"), true);
  assert.equal(isMorningBriefingCliEntry("file:///repo/src/scheduler/other.ts", "/repo/src/scheduler/morning_briefing.ts"), false);
}

// 1. JIN_LINE_USER_ID 未設定 → no_user
{
  delete process.env.JIN_LINE_USER_ID;
  delete process.env.OPENQLOW_MORNING_PUSH_DISABLED;
  const result = await runMorningBriefing({ now: FIXED_NOW });
  assert.equal(result.mode, "no_user");
  assert.equal(result.ok, true, "no_user は正常終了");
}

// 2. OPENQLOW_MORNING_PUSH_DISABLED=true → 即 disabled
{
  process.env.OPENQLOW_MORNING_PUSH_DISABLED = "true";
  const result = await runMorningBriefing({ now: FIXED_NOW, userId: "U123" });
  assert.equal(result.mode, "disabled");
  assert.equal(result.ok, true);
  delete process.env.OPENQLOW_MORNING_PUSH_DISABLED;
}

// 3. 正常パス: push 呼ばれ、かんたん日報セッションが事前作成される
{
  await setRootTmp();
  const pushCalls: Array<{ text: string; opts: unknown }> = [];
  const result = await runMorningBriefing({
    now: FIXED_NOW,
    userId: "U_TEST_JIN",
    pushFn: async (text, opts) => {
      pushCalls.push({ text, opts });
      return { ok: true, mode: "sent" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "sent");
  assert.equal(pushCalls.length, 1, "push が1回呼ばれる");
  assert.match(pushCalls[0].text, /おはようございます/);
  assert.match(pushCalls[0].text, /2026-06-06/, "JST 日付が入る");
  assert.match(pushCalls[0].text, /昨日のFLATUPを1通で送ってください/);
  assert.match(pushCalls[0].text, /体験 ひかりちゃん1名/);
  assert.doesNotMatch(pushCalls[0].text, /1\/8: 昨日、体験/);
  assert.doesNotMatch(pushCalls[0].text, /1問ずつ/);

  // セッションファイルが事前作成されている
  const conversationsDir = path.join(process.env.OPENQLOW_ROOT!, "state", "conversations");
  const files = await readdir(conversationsDir);
  const sessionFile = files.find((f) => f.includes("U_TEST_JIN"));
  assert.ok(sessionFile, "Jin の会話セッションが作られる");

  await rm(process.env.OPENQLOW_ROOT!, { recursive: true, force: true });
}

// 4. push 失敗時は ok:false で返る
{
  await setRootTmp();
  const result = await runMorningBriefing({
    now: FIXED_NOW,
    userId: "U_FAIL",
    pushFn: async () => ({ ok: false, mode: "sent", error: "rate_limit_exceeded" }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "rate_limit_exceeded");
  await rm(process.env.OPENQLOW_ROOT!, { recursive: true, force: true });
}

// 5. dry_run モードは送信せず stdout 想定
{
  await setRootTmp();
  const result = await runMorningBriefing({
    now: FIXED_NOW,
    userId: "U_DRY",
    pushFn: async () => ({ ok: true, mode: "dry_run" }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, "dry_run");
  await rm(process.env.OPENQLOW_ROOT!, { recursive: true, force: true });
}

// 6. Vault連携: 明示指定時だけ DAILY-BRIEF.md を更新する
{
  await setRootTmp();
  const vault = await mkdtemp(path.join(tmpdir(), "openqlow-morning-vault-"));
  const result = await runMorningBriefing({
    now: FIXED_NOW,
    userId: "U_VAULT",
    writeDailyBrief: true,
    obsidianVaultRoot: vault,
    pushFn: async () => ({ ok: true, mode: "dry_run" }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "dry_run");

  const brief = await readFile(path.join(vault, "DAILY-BRIEF.md"), "utf8");
  assert.match(brief, /# DAILY-BRIEF — 2026-06-06/);
  assert.match(brief, /FOLLOW-UP QUEUE/);
  assert.match(brief, /HUMAN CHECK REQUIRED/);
  assert.match(brief, /OPENQLOW_LINE_DRY_RUN/);

  await rm(process.env.OPENQLOW_ROOT!, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
}

// 7. 同じ日に2回目の呼び出しは duplicate_today で即returnし、pushFn は呼ばれない
{
  await setRootTmp();
  const pushCalls: Array<{ text: string; opts: unknown }> = [];
  const pushFn = async (text: string, opts: unknown): Promise<{ ok: boolean; mode: "sent" }> => {
    pushCalls.push({ text, opts });
    return { ok: true, mode: "sent" };
  };

  const first = await runMorningBriefing({ now: FIXED_NOW, userId: "U_DUP", pushFn });
  assert.equal(first.mode, "sent");

  const second = await runMorningBriefing({ now: FIXED_NOW, userId: "U_DUP", pushFn });
  assert.equal(second.ok, true);
  assert.equal(second.mode, "duplicate_today");
  assert.equal(pushCalls.length, 1, "2回目は push されない");

  await rm(process.env.OPENQLOW_ROOT!, { recursive: true, force: true });
}

console.log("morning briefing tests passed");
