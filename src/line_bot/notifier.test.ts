import assert from "node:assert/strict";
import { pushLineMessage } from "./notifier.js";

async function testLinePushIgnoresOpenqlowDryRunByDefault(): Promise<void> {
  const previous = process.env.OPENQLOW_DRY_RUN;
  process.env.OPENQLOW_DRY_RUN = "true";
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response("{}", { status: 200 });
  };

  try {
    const result = await pushLineMessage("approval", {
      token: "line-token",
      userId: "Utest",
      fetchImpl: fakeFetch,
    });

    assert.deepEqual(result, { ok: true, mode: "sent" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.line.me/v2/bot/message/push");
  } finally {
    if (previous === undefined) {
      delete process.env.OPENQLOW_DRY_RUN;
    } else {
      process.env.OPENQLOW_DRY_RUN = previous;
    }
  }
}

async function testLinePushCanBeDryRunExplicitly(): Promise<void> {
  const result = await pushLineMessage("approval", {
    dryRun: true,
    token: "line-token",
    userId: "Utest",
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "dry_run");
}

await testLinePushIgnoresOpenqlowDryRunByDefault();
await testLinePushCanBeDryRunExplicitly();

console.log("line notifier tests passed");
