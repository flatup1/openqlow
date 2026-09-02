import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildReplyDraft, type InboundMessage } from "./draft.js";
import {
  appendInbound,
  hasDraft,
  loadDraft,
  loadUnnotifiedDrafts,
  markNotified,
  readInbox,
  replaceInbox,
  saveDraft,
} from "./store.js";

const NOW = new Date("2026-09-02T09:12:00+09:00");

async function freshStateDir(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openqlow-reply-draft-"));
  return path.join(root, "reply_drafts");
}

function inbound(externalId: string, text = "体験に興味があります。土曜は空いていますか？"): InboundMessage {
  return {
    source: "line",
    externalId,
    text,
    senderId: `U-${externalId}`,
    receivedAt: `2026-09-02T00:${externalId.slice(-2)}:00.000Z`,
  };
}

// 待ち行列は足せて、読めて、消せる。
{
  const stateDir = await freshStateDir();
  assert.deepEqual(await readInbox(stateDir), [], "ファイルが無くても落ちない");

  await appendInbound(stateDir, inbound("msg-01"));
  await appendInbound(stateDir, inbound("msg-02"));
  const items = await readInbox(stateDir);
  assert.deepEqual(items.map(item => item.externalId), ["msg-01", "msg-02"]);

  await replaceInbox(stateDir, []);
  assert.deepEqual(await readInbox(stateDir), []);
}

// 壊れた行があっても、残りは読める。
{
  const stateDir = await freshStateDir();
  await appendInbound(stateDir, inbound("msg-01"));
  await fs.appendFile(path.join(stateDir, "inbox.jsonl"), "{壊れた行\n", "utf8");
  await appendInbound(stateDir, inbound("msg-02"));

  const items = await readInbox(stateDir);
  assert.deepEqual(items.map(item => item.externalId), ["msg-01", "msg-02"]);
}

// 同じ受信からは下書きが1つだけできる。
{
  const stateDir = await freshStateDir();
  const draft = buildReplyDraft(inbound("msg-01"), NOW);

  assert.equal(await hasDraft(stateDir, draft.id), false);
  await saveDraft(stateDir, draft);
  assert.equal(await hasDraft(stateDir, draft.id), true);

  const again = buildReplyDraft(inbound("msg-01"), NOW);
  assert.equal(again.id, draft.id, "IDが同じなので、上書きされるだけで増えない");
  await saveDraft(stateDir, again);

  const files = await fs.readdir(path.join(stateDir, "records"));
  assert.equal(files.length, 1);
}

// 保存した下書きは読み戻せる。
{
  const stateDir = await freshStateDir();
  const draft = buildReplyDraft(inbound("msg-01"), NOW);
  await saveDraft(stateDir, draft);
  const loaded = await loadDraft(stateDir, draft.id);
  assert.equal(loaded?.id, draft.id);
  assert.equal(loaded?.draftText, draft.draftText);
  assert.equal(await loadDraft(stateDir, "存在しないID"), undefined);
}

// 未通知だけを、受信の古い順に取り出す。
{
  const stateDir = await freshStateDir();
  const first = buildReplyDraft(inbound("msg-01"), NOW);
  const second = buildReplyDraft(inbound("msg-02"), NOW);
  await saveDraft(stateDir, second);
  await saveDraft(stateDir, first);

  const pending = await loadUnnotifiedDrafts(stateDir);
  assert.deepEqual(pending.map(item => item.externalId), ["msg-01", "msg-02"], "古い順");

  await markNotified(stateDir, first, NOW.toISOString());
  const rest = await loadUnnotifiedDrafts(stateDir);
  assert.deepEqual(rest.map(item => item.externalId), ["msg-02"]);
  assert.equal((await loadDraft(stateDir, first.id))?.notifiedAt, NOW.toISOString());
}

console.log("reply draft store tests passed");
