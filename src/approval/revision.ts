import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { checkDraftSafety } from "../safety/check.js";
import { loadRecord, saveRecord } from "../state/file_store.js";
import type { DraftRecord, PlatformDraft } from "../types.js";
import { formatApprovalMessage } from "./message.js";

export interface LineRevisionCommand {
  id?: string;
  body: string;
}

export interface LineRevisionResult {
  ok: boolean;
  id?: string;
  message: string;
}

const APPROVAL_ID = "FG-\\d{8}-\\d{3}";

export function parseLineRevisionCommand(text: string): LineRevisionCommand | undefined {
  const normalized = text.normalize("NFKC").trim();
  // 「修正」が単独のコマンドとして使われている時だけ拾う（「修正案」等の通常文は無視）。
  if (!/^修正(?:[\s:：]|$)/.test(normalized)) return undefined;

  // [\s\S] で改行を含む複数行の本文（台風休講のお知らせ等）も取りこぼさない。
  const withId = normalized.match(new RegExp(`^修正\\s+(${APPROVAL_ID})\\s*[:：]?\\s*([\\s\\S]*)$`));
  if (withId) return { id: withId[1], body: withId[2].trim() };

  // 「修正 新しい本文」。本文が空（「修正」単独・「修正:」のみ）なら body="" を返し、
  // 呼び出し側で「本文も送ってね」と優しく促す（黙って定型文に落とさない）。
  const body = normalized.replace(/^修正[\s:：]*/, "").trim();
  return { body };
}

async function loadStateRecords(root: string): Promise<DraftRecord[]> {
  const dir = path.join(root, "state");
  const files = await readdir(dir).catch(() => []);
  const records: DraftRecord[] = [];
  for (const file of files) {
    if (!/^FG-\d{8}-\d{3}\.json$/.test(file)) continue;
    const text = await readFile(path.join(dir, file), "utf8").catch(() => "");
    if (!text) continue;
    try {
      records.push(JSON.parse(text) as DraftRecord);
    } catch {
      // Ignore malformed state files; revision must fail closed.
    }
  }
  return records;
}

async function latestPendingRecord(root: string): Promise<DraftRecord | undefined> {
  return (await loadStateRecords(root))
    .filter(record => record.status === "pending_approval")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
}

function draftText(drafts: PlatformDraft[]): string {
  return drafts.map(draft => `${draft.body}\n${draft.cta}\n${draft.hashtags.join(" ")}`).join("\n\n");
}

function applyBodyToDrafts(drafts: PlatformDraft[], body: string): PlatformDraft[] {
  return drafts.map(draft => ({ ...draft, body }));
}

export async function applyLineRevisionCommand(root: string, text: string, now = new Date()): Promise<LineRevisionResult> {
  const command = parseLineRevisionCommand(text);
  if (!command) {
    return { ok: false, message: "修正は `修正 新しい本文` または `修正 FG-YYYYMMDD-NNN: 新しい本文` で送ってください。" };
  }

  // 「修正」だけ送られた時は、黙って定型文に落とさず、優しく本文を促す。
  if (!command.body) {
    return {
      ok: false,
      message: [
        "直したい内容も一緒に送ってくださいね😊",
        "例： 修正 本日は台風のため休講します",
        "（直前の投稿候補の本文を、送っていただいた文に置き換えます）",
      ].join("\n"),
    };
  }

  const target = command.id
    ? await loadRecord(root, command.id)
    : await latestPendingRecord(root);

  if (!target || target.status !== "pending_approval") {
    return {
      ok: false,
      message: [
        "今、修正できる投稿候補が見当たりませんでした🙏",
        "先に「投稿」と送って候補を作ってから、「修正 新しい本文」で直せます。",
      ].join("\n"),
    };
  }

  const revisedDrafts = applyBodyToDrafts(target.drafts, command.body);
  const safety = checkDraftSafety(draftText(revisedDrafts));
  if (!safety.ok) {
    return {
      ok: false,
      id: target.id,
      message: [
        "安全チェックで止めました。投稿・確定はしていません。",
        ...safety.issues.map(issue => `- ${issue.message}`),
        "もう一度 `修正 新しい本文` で送ってください。",
      ].join("\n"),
    };
  }

  const revisedAt = now.toISOString();
  const updated: DraftRecord = {
    ...target,
    drafts: revisedDrafts,
    revisionHistory: [
      ...(target.revisionHistory ?? []),
      {
        revisedAt,
        oldDrafts: target.drafts,
        newBody: command.body,
      },
    ],
    status: "pending_approval",
    approvalMessage: formatApprovalMessage(target.idea, revisedDrafts, safety),
    updatedAt: revisedAt,
  };

  await saveRecord(root, updated);

  return {
    ok: true,
    id: updated.id,
    message: [
      "本文を修正しました。投稿・確定はしていません。",
      `ID: ${updated.id}`,
      "再確認してください。",
      "",
      updated.approvalMessage,
    ].join("\n"),
  };
}
