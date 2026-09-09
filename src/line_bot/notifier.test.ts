import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ForbiddenActionError } from "../safety/forbidden_actions.js";
import { pushApprovalNotification, pushLineMessage } from "./notifier.js";
import { expandApprovalShortcut, rememberApprovalCandidate } from "../approval/shortcut.js";
import { saveRecord } from "../state/file_store.js";
import type { DraftRecord } from "../types.js";

function draftRecord(id: string): DraftRecord {
  return {
    id,
    idea: {
      id,
      date: "2026-06-08",
      theme: "test",
      angle: "test",
      audience: "local_narita",
      source: "obsidian_inbox",
      valueConnection: "test",
    },
    drafts: [],
    status: "pending_approval",
    approvalMessage: `${id} の投稿候補です。`,
    createdAt: "2026-06-08T00:00:00.000Z",
    updatedAt: "2026-06-08T00:00:00.000Z",
  };
}

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

// ---- 目印は、届いたときだけ動かす ----
//
// 「JINへ最後に見せたもの」の目印を、送る前に動かしていた。
// 通知が届かなくても目印だけが進むので、JINの画面には前の下書きが
// 出たまま、「OK」は見ていない方を指した:
//
//   いま "OK" が指すもの → OK FG-20260101-001 all
//   Bの通知 → {"ok":false,"error":"LINE push 500"}
//   そのあと "OK" が指すもの → OK FG-20260101-002 all  ← 見ていない B
//
// 承認・修正・添付がこの目印を見るので、ここがずれると全部ずれる。
async function testApprovalMarkerMovesOnlyWhenDelivered(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "openqlow-notifier-marker-"));
  const shown = draftRecord("FG-20260608-301");
  const notShown = draftRecord("FG-20260608-302");
  await saveRecord(root, shown);
  await saveRecord(root, notShown);
  await rememberApprovalCandidate(root, shown.id);

  await withEnv("OPENQLOW_ROOT", root, async () => {
    await withEnv("LINE_CHANNEL_ACCESS_TOKEN", "dummy", async () => {
      await withEnv("JIN_LINE_USER_ID", JIN, async () => {
        await withEnv("OPENQLOW_DRY_RUN", "false", async () => {
          const failing = async () => ({ ok: false, status: 500 }) as unknown as Response;
          const failed = await pushApprovalNotification(notShown, {
            fetchImpl: failing,
            approvedRecipients: APPROVED,
          } as never);
          assert.equal(failed.ok, false, "前提: 通知は届いていない");
          assert.equal(
            await expandApprovalShortcut("ok", root),
            `OK ${shown.id} all`,
            "届いていないなら目印を動かさない（見ていない下書きを指さない）",
          );

          const sending = async () => ({ ok: true, status: 200 }) as unknown as Response;
          const sent = await pushApprovalNotification(notShown, {
            fetchImpl: sending,
            approvedRecipients: APPROVED,
          } as never);
          assert.equal(sent.ok, true);
          assert.equal(
            await expandApprovalShortcut("ok", root),
            `OK ${notShown.id} all`,
            "届いたら目印は動く",
          );
        });
      });
    });
  });

  // dry run は届いていないので、目印は動かない。
  await withEnv("OPENQLOW_ROOT", root, async () => {
    await withEnv("LINE_CHANNEL_ACCESS_TOKEN", "dummy", async () => {
      await withEnv("JIN_LINE_USER_ID", JIN, async () => {
        const dry = await pushApprovalNotification(shown, {
          dryRun: true,
          approvedRecipients: APPROVED,
        } as never);
        assert.equal(dry.mode, "dry_run");
        assert.equal(
          await expandApprovalShortcut("ok", root),
          `OK ${notShown.id} all`,
          "お試し実行で目印を動かさない",
        );
      });
    });
  });

  await rm(root, { recursive: true, force: true });
}

await testApprovalMarkerMovesOnlyWhenDelivered();

console.log("line notifier tests passed");
