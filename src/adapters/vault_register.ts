import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { DraftRecord } from "../types.js";
import { obsidianPath } from "../utils/paths.js";

export type ApprovalAction = "generated" | "approved" | "rejected" | "needs_revision";

interface ApprovalEventOptions {
  approvalReply?: string;
  note?: string;
  savedFiles?: string[];
}

function logDir(): string {
  return obsidianPath("6_システム", "openqlow_logs");
}

function nowIso(): string {
  return new Date().toISOString();
}

async function appendJsonl(fileName: string, payload: Record<string, unknown>): Promise<string> {
  const dir = logDir();
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, fileName);
  await appendFile(file, `${JSON.stringify(payload)}\n`, "utf8");
  return file;
}

async function appendMarkdown(fileName: string, lines: string[]): Promise<string> {
  const dir = logDir();
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, fileName);
  await appendFile(file, `${lines.join("\n")}\n`, "utf8");
  return file;
}

export async function registerApprovalEvent(
  record: DraftRecord,
  action: ApprovalAction,
  options: ApprovalEventOptions = {},
): Promise<string> {
  const payload = {
    ts: nowIso(),
    action,
    recordId: record.id,
    status: record.status,
    date: record.idea.date,
    theme: record.idea.theme,
    angle: record.idea.angle,
    valueConnection: record.idea.valueConnection,
    platforms: record.drafts.map(draft => draft.platform),
    requiredApproval: `OK ${record.id}`,
    approvalReply: options.approvalReply ?? null,
    note: options.note ?? null,
    savedFiles: options.savedFiles ?? [],
    canonReferences: record.idea.canonReferences ?? [],
  };

  await appendJsonl("approval-register.jsonl", payload);
  return appendMarkdown("approval-register.md", [
    `## ${action} ${record.id}`,
    `- ts: ${payload.ts}`,
    `- status: ${record.status}`,
    `- theme: ${record.idea.theme}`,
    `- required_approval: \`OK ${record.id}\``,
    options.approvalReply ? `- approval_reply: \`${options.approvalReply}\`` : "- approval_reply: (none)",
    options.note ? `- note: ${options.note}` : "- note: (none)",
    "- canon_references:",
    ...(record.idea.canonReferences?.length
      ? record.idea.canonReferences.map(ref => `  - ${ref.layer}: ${ref.canonPath} (${ref.description})`)
      : ["  - 未設定"]),
    options.savedFiles?.length ? "- saved_files:" : "- saved_files: []",
    ...(options.savedFiles ?? []).map(file => `  - ${file}`),
    "",
  ]);
}

export async function registerDraftSave(record: DraftRecord, savedFiles: string[]): Promise<string> {
  const payload = {
    ts: nowIso(),
    recordId: record.id,
    date: record.idea.date,
    publicationStatus: "draft_saved_not_posted",
    platforms: record.drafts.map(draft => draft.platform),
    savedFiles,
    note: "Jinさんの承認後に下書き保存のみ実行。外部SNSへの公開実行ではない。",
  };

  await appendJsonl("posting-log.jsonl", payload);
  return appendMarkdown("posting-log.md", [
    `## draft_saved_not_posted ${record.id}`,
    `- ts: ${payload.ts}`,
    `- publication_status: ${payload.publicationStatus}`,
    `- platforms: ${payload.platforms.join(" / ")}`,
    "- saved_files:",
    ...savedFiles.map(file => `  - ${file}`),
    `- note: ${payload.note}`,
    "",
  ]);
}

export async function registerPerformancePlaceholder(record: DraftRecord): Promise<string> {
  const payload = {
    ts: nowIso(),
    recordId: record.id,
    date: record.idea.date,
    metricsStatus: "pending",
    postedAt: null,
    metrics: {
      views: null,
      likes: null,
      comments: null,
      saves: null,
      shares: null,
    },
    improvementQuestion: "この投稿が公開された後、反応を見て次の理念翻訳をどう優しくするか確認する。",
  };

  await appendJsonl("performance-log.jsonl", payload);
  return appendMarkdown("performance-log.md", [
    `## pending ${record.id}`,
    `- ts: ${payload.ts}`,
    `- metrics_status: ${payload.metricsStatus}`,
    "- metrics: 未取得",
    `- improvement_question: ${payload.improvementQuestion}`,
    "",
  ]);
}
