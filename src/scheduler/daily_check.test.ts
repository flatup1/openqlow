import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { formatDailyCheckPrompt, runDailyCheck } from "./daily_check.js";

const prompt = formatDailyCheckPrompt();

assert.match(prompt, /OPENQLOW Daily Check/);
assert.match(prompt, /昨日のFLATUPを1通で送ってください/);
assert.doesNotMatch(prompt, /そのあと、OPENQLOWが1つずつ聞きます/);
assert.match(prompt, /体験 ひかりちゃん1名/);
assert.match(prompt, /入会予定あり/);
assert.match(prompt, /今日やること 広告を打つ/);
assert.match(prompt, /「なし」だけでもOK/);
assert.doesNotMatch(prompt, /1\. 昨日の体験/);

const FIXED_NOW = new Date("2026-06-06T00:00:00+09:00");

async function freshStateDir(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openqlow-daily-check-"));
  return path.join(root, "state");
}

// 1回目は送る。
{
  const stateDir = await freshStateDir();
  let calls = 0;
  const result = await runDailyCheck({
    now: FIXED_NOW,
    stateDir,
    pushFn: async () => {
      calls += 1;
      return { ok: true, mode: "sent" };
    },
  });
  assert.equal(result.mode, "sent");
  assert.equal(calls, 1);
}

// 同じ日の2回目は送らない。timer の二重発火でJinに同じ通知が2通届くのを防ぐ。
{
  const stateDir = await freshStateDir();
  let calls = 0;
  const pushFn = async (): Promise<{ ok: true; mode: "sent" }> => {
    calls += 1;
    return { ok: true, mode: "sent" };
  };

  await runDailyCheck({ now: FIXED_NOW, stateDir, pushFn });
  const second = await runDailyCheck({ now: FIXED_NOW, stateDir, pushFn });

  assert.equal(second.mode, "duplicate_today");
  assert.equal(calls, 1, "2回目は push を呼ばない");
}

// 送信に失敗した日は、やり直せる。
{
  const stateDir = await freshStateDir();
  const failed = await runDailyCheck({
    now: FIXED_NOW,
    stateDir,
    pushFn: async () => ({ ok: false, mode: "sent", error: "rate_limit_exceeded" }),
  });
  assert.equal(failed.ok, false);

  let retried = 0;
  const retry = await runDailyCheck({
    now: FIXED_NOW,
    stateDir,
    pushFn: async () => {
      retried += 1;
      return { ok: true, mode: "sent" };
    },
  });
  assert.equal(retry.mode, "sent");
  assert.equal(retried, 1, "失敗した日はやり直せる");
}

// dry run と資格情報なしはロックを残さない（本番の送信がまだ済んでいないため）。
for (const mode of ["dry_run", "skipped"] as const) {
  const stateDir = await freshStateDir();
  await runDailyCheck({ now: FIXED_NOW, stateDir, pushFn: async () => ({ ok: true, mode }) });

  let sent = 0;
  const real = await runDailyCheck({
    now: FIXED_NOW,
    stateDir,
    pushFn: async () => {
      sent += 1;
      return { ok: true, mode: "sent" };
    },
  });
  assert.equal(real.mode, "sent", `${mode} の後は送れる`);
  assert.equal(sent, 1);
}

// 日付が変われば、また送る。
{
  const stateDir = await freshStateDir();
  const pushFn = async (): Promise<{ ok: true; mode: "sent" }> => ({ ok: true, mode: "sent" });
  await runDailyCheck({ now: FIXED_NOW, stateDir, pushFn });
  const nextDay = await runDailyCheck({
    now: new Date("2026-06-07T00:00:00+09:00"),
    stateDir,
    pushFn,
  });
  assert.equal(nextDay.mode, "sent");
}

console.log("daily check tests passed");
