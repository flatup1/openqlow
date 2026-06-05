import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { runMorningBriefing } from "./morning_briefing.js";

// 環境変数を共通テストルートに差し替え
async function setRootTmp(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "openqlow-morning-test-"));
  process.env.OPENQLOW_ROOT = root;
  return root;
}

const FIXED_NOW = new Date("2026-06-05T22:00:00Z"); // JST 07:00 of 2026-06-06

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

// 3. 正常パス: push 呼ばれ、セッション事前作成され、メッセージに 1/8 と日付が含まれる
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
  assert.match(pushCalls[0].text, /1\/8: 昨日、体験/, "Q1が含まれる");
  assert.match(pushCalls[0].text, /日報まとめ/, "ヒント含む");

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

console.log("morning briefing tests passed");
