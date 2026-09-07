import assert from "node:assert/strict";
import { ForbiddenActionError } from "../safety/forbidden_actions.js";
import { pushLineMessage } from "./notifier.js";

const JIN = "U_jin";
const APPROVED = new Set([JIN]);

async function withEnv(name: string, value: string | undefined, fn: () => Promise<void>): Promise<void> {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    await fn();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

async function testLinePushIgnoresOpenqlowDryRunByDefault(): Promise<void> {
  await withEnv("OPENQLOW_DRY_RUN", "true", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response("{}", { status: 200 });
    };

    const result = await pushLineMessage("approval", {
      token: "line-token",
      userId: JIN,
      approvedRecipients: APPROVED,
      fetchImpl: fakeFetch,
    });

    assert.deepEqual(result, { ok: true, mode: "sent" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.line.me/v2/bot/message/push");
  });
}

async function testLinePushCanBeDryRunExplicitly(): Promise<void> {
  const result = await pushLineMessage("approval", {
    dryRun: true,
    token: "line-token",
    userId: JIN,
    approvedRecipients: APPROVED,
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "dry_run");
}

// 承認された相手以外へは送らせない。お客様への直接送信は openQLOW の担当ではない。
async function testLinePushRefusesUnapprovedRecipient(): Promise<void> {
  let fetched = false;
  await assert.rejects(
    pushLineMessage("こんにちは", {
      token: "line-token",
      userId: "U_customer",
      approvedRecipients: APPROVED,
      fetchImpl: async () => {
        fetched = true;
        return new Response("{}", { status: 200 });
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenActionError, "ForbiddenActionError で止まる");
      assert.equal(error.action, "send_to_customer_directly");
      return true;
    },
  );
  assert.equal(fetched, false, "APIを呼ぶ前に止まる");
}

// dry run でも送り先の間違いは止める。本番に切り替えた瞬間に初めて気づく、では遅い。
async function testLinePushRefusesUnapprovedRecipientEvenInDryRun(): Promise<void> {
  await assert.rejects(
    pushLineMessage("こんにちは", {
      dryRun: true,
      token: "line-token",
      userId: "U_customer",
      approvedRecipients: APPROVED,
    }),
    ForbiddenActionError,
  );
}

// 予備の承認者も送り先として認める。
async function testLinePushAllowsBackupApprover(): Promise<void> {
  const result = await pushLineMessage("approval", {
    dryRun: true,
    token: "line-token",
    userId: "U_backup",
    approvedRecipients: new Set([JIN, "U_backup"]),
  });
  assert.equal(result.mode, "dry_run");
}

// 承認された送り先が1つも設定されていないときは、相手を確かめられないので送らない。
async function testLinePushSkipsWhenNoApprovedRecipientConfigured(): Promise<void> {
  await withEnv("JIN_LINE_USER_ID", undefined, async () => {
    await withEnv("BACKUP_APPROVER_LINE_USER_ID", undefined, async () => {
      let fetched = false;
      const result = await pushLineMessage("approval", {
        token: "line-token",
        userId: "U_anyone",
        fetchImpl: async () => {
          fetched = true;
          return new Response("{}", { status: 200 });
        },
      });
      assert.deepEqual(result, { ok: true, mode: "skipped" });
      assert.equal(fetched, false);
    });
  });
}

// 既定の送り先は環境変数から読む。
async function testLinePushReadsApprovedRecipientsFromEnv(): Promise<void> {
  await withEnv("JIN_LINE_USER_ID", JIN, async () => {
    const allowed = await pushLineMessage("approval", {
      dryRun: true,
      token: "line-token",
      userId: JIN,
    });
    assert.equal(allowed.mode, "dry_run");

    await assert.rejects(
      pushLineMessage("approval", { dryRun: true, token: "line-token", userId: "U_other" }),
      ForbiddenActionError,
    );
  });
}

await testLinePushIgnoresOpenqlowDryRunByDefault();
await testLinePushCanBeDryRunExplicitly();
await testLinePushRefusesUnapprovedRecipient();
await testLinePushRefusesUnapprovedRecipientEvenInDryRun();
await testLinePushAllowsBackupApprover();
await testLinePushSkipsWhenNoApprovedRecipientConfigured();
await testLinePushReadsApprovedRecipientsFromEnv();

console.log("line notifier tests passed");
