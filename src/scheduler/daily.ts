import { pathToFileURL } from "node:url";
import { loadConfig } from "../config.js";
import type { DraftRecord, PlatformDraft, SafetyResult } from "../types.js";
import { generateDailyThree } from "../generators/daily_three.js";
import { expandIdea } from "../distribution/expand.js";
import { checkDraftSafety } from "../safety/check.js";
import { assertNoPublishRuntimeEnabled, assertPhase1DraftOnly } from "../safety/publication_lock.js";
import { formatApprovalMessage } from "../approval/message.js";
import { parseApprovalCommand } from "../approval/command.js";
import { saveRecord, loadRecord } from "../state/file_store.js";
import { saveXDraftOnly } from "../adapters/x_typefully.js";
import { saveInstagramDraft } from "../adapters/instagram_draft.js";
import { saveThreadsDraft } from "../adapters/threads_draft.js";
import { mirrorDraftToVault } from "../adapters/vault_mirror.js";
import { logApproval, logGeneration, logRejection, logRevision } from "../adapters/vault_log.js";
import {
  registerApprovalEvent,
  registerDraftSave,
  registerPerformancePlaceholder,
} from "../adapters/vault_register.js";
import { pushApprovalNotification } from "../line_bot/notifier.js";
import { createPublishQueueEntry } from "../publish/queue.js";
import type { PublishDestination } from "../publish/publisher_types.js";

function approvalIdFor(date: string, index: number): string {
  return `FG-${date.replaceAll("-", "")}-${String(index + 1).padStart(3, "0")}`;
}

function allDraftText(drafts: PlatformDraft[]): string {
  return drafts.map(draft => `${draft.body}\n${draft.cta}\n${draft.hashtags.join(" ")}`).join("\n\n");
}

export async function runDaily(): Promise<DraftRecord[]> {
  const config = loadConfig();
  assertNoPublishRuntimeEnabled();
  const ideas = await generateDailyThree();
  const records: DraftRecord[] = [];
  const safetyByRecord = new Map<string, SafetyResult>();

  for (const [index, idea] of ideas.entries()) {
    const approvalId = approvalIdFor(idea.date, index);
    const drafts = expandIdea({ ...idea, id: approvalId });
    const safety = checkDraftSafety(allDraftText(drafts));
    const approvalMessage = formatApprovalMessage(idea, drafts, safety);
    const now = new Date().toISOString();
    const record: DraftRecord = {
      id: approvalId,
      idea: { ...idea, id: approvalId },
      drafts,
      status: "pending_approval",
      approvalMessage,
      createdAt: now,
      updatedAt: now,
    };
    await saveRecord(config.root, record);
    records.push(record);
    safetyByRecord.set(record.id, safety);
  }

  try {
    await logGeneration(records, safetyByRecord);
  } catch (err) {
    console.error("vault log (generation) failed:", err);
  }

  for (const record of records) {
    try {
      await registerApprovalEvent(record, "generated");
    } catch (err) {
      console.error(`approval register (generation) failed for ${record.id}:`, err);
    }
  }

  for (const record of records) {
    try {
      const result = await pushApprovalNotification(record);
      if (!result.ok) {
        console.error(`LINE push failed for ${record.id}:`, result.error);
      }
    } catch (err) {
      console.error(`LINE push exception for ${record.id}:`, err);
    }
  }

  return records;
}

export async function approveRecord(id: string, approvalReply: string): Promise<string[]> {
  const config = loadConfig();
  assertNoPublishRuntimeEnabled();
  const record = await loadRecord(config.root, id);
  if (!record) throw new Error(`Record not found: ${id}`);

  const approval = parseApprovalCommand(approvalReply);
  if (!approval || approval.response !== "OK" || approval.id !== id) {
    throw new Error(`Invalid approval. Required reply: OK ${id}`);
  }

  const safety = checkDraftSafety(allDraftText(record.drafts));
  if (!safety.ok) {
    throw new Error(`Safety check failed: ${safety.issues.map(issue => issue.message).join(" / ")}`);
  }
  assertPhase1DraftOnly(record.drafts);

  const saved: string[] = [];
  for (const draft of record.drafts) {
    if (draft.platform === "x") saved.push(await saveXDraftOnly(config.root, draft));
    if (draft.platform === "instagram") saved.push(await saveInstagramDraft(config.root, draft));
    if (draft.platform === "threads") saved.push(await saveThreadsDraft(config.root, draft));
    try {
      const mirrored = await mirrorDraftToVault(draft);
      if (mirrored) saved.push(mirrored);
    } catch (err) {
      console.error(`vault mirror failed for ${draft.id}:`, err);
    }
  }

  const publishDestinations = approval.targets.filter(
    (target): target is PublishDestination => target !== "drafts_only"
  );
  if (publishDestinations.length > 0) {
    saved.push(await createPublishQueueEntry(config.root, record, publishDestinations, new Date(), {
      mediaFiles: record.mediaFiles,
    }));
  }

  const updatedRecord: DraftRecord = {
    ...record,
    status: "saved",
    updatedAt: new Date().toISOString(),
  };
  await saveRecord(config.root, updatedRecord);

  try {
    await logApproval(record.id, approvalReply.trim(), saved, record.idea.date);
  } catch (err) {
    console.error("vault log (approval) failed:", err);
  }

  try {
    await registerApprovalEvent(updatedRecord, "approved", {
      approvalReply: approvalReply.trim(),
      savedFiles: saved,
    });
    await registerDraftSave(updatedRecord, saved);
    await registerPerformancePlaceholder(updatedRecord);
  } catch (err) {
    console.error("vault register (approval) failed:", err);
  }

  return saved;
}

export async function rejectRecord(id: string, reason?: string): Promise<DraftRecord> {
  const config = loadConfig();
  const record = await loadRecord(config.root, id);
  if (!record) throw new Error(`Record not found: ${id}`);

  const updatedRecord: DraftRecord = {
    ...record,
    status: "rejected",
    updatedAt: new Date().toISOString(),
  };
  await saveRecord(config.root, updatedRecord);

  try {
    await logRejection(id, record.idea.date, reason);
    await registerApprovalEvent(updatedRecord, "rejected", { note: reason });
  } catch (err) {
    console.error("vault log/register (rejection) failed:", err);
  }

  return updatedRecord;
}

export async function requestRevision(id: string, note: string): Promise<DraftRecord> {
  const config = loadConfig();
  const record = await loadRecord(config.root, id);
  if (!record) throw new Error(`Record not found: ${id}`);
  if (!note.trim()) throw new Error("Revision note is required.");

  const updatedRecord: DraftRecord = {
    ...record,
    status: "needs_revision",
    updatedAt: new Date().toISOString(),
  };
  await saveRecord(config.root, updatedRecord);

  try {
    await logRevision(id, record.idea.date, note.trim());
    await registerApprovalEvent(updatedRecord, "needs_revision", { note: note.trim() });
  } catch (err) {
    console.error("vault log/register (revision) failed:", err);
  }

  return updatedRecord;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const records = await runDaily();
  for (const record of records) {
    console.log("\n==============================");
    console.log(record.approvalMessage);
    console.log("==============================");
    console.log(`Record ID: ${record.id}`);
  }
}
