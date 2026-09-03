// JINへの通知。お客様には何も送らない。
//
// 送り先はJINだけ。ここは既存の pushLineMessage を使う。あの関数は
// JIN_LINE_USER_ID / BACKUP_APPROVER_LINE_USER_ID 以外へ送ろうとすると
// forbidden_actions で throw する。だからこのファイルは宛先を一切指定しない。
// 「宛先を渡さない」ことが、顧客へ誤送信できないという保証になる。
//
// 静音時間（既定 22:00〜翌7:00）は即時通知しない。ただし受信・下書き・保存は行い、
// 通知は保留リストへ積む。7:00以降の最初の実行でまとめて1回だけ届く（要件 §37-38）。

import fs from "node:fs/promises";
import path from "node:path";
import { pushLineMessage } from "../line_bot/notifier.js";
import { replyDraftStateDir, type ReplyDraftConfig } from "./config.js";
import { stampInJst, isQuietHours } from "./time.js";
import { CATEGORY_LABEL, ESCALATION_LABEL } from "./triage.js";
import { draftDir, loadDraft, saveDraft, type ReplyDraftRecord } from "./store.js";

/** LINEへ本文を送る関数。テストではここを差し替える。宛先は渡さない。 */
export type PushImpl = (text: string) => Promise<{ ok: boolean; mode: string; error?: string }>;

const defaultPush: PushImpl = text => pushLineMessage(text);

/**
 * 送信を試みる。例外は失敗として扱う。
 *
 * ネットワークが切れているときの fetch は「false を返す」のではなく「例外を投げる」。
 * ここで例外を通すと、下書きは保存済み・処理済みなのに保留へも積まれず、
 * JINへの通知が二度と届かなくなる（実際にそうなることを確認済み）。
 * 失敗はすべて同じ扱いにして、保留へ戻す。
 */
async function tryPush(push: PushImpl, text: string): Promise<{ ok: boolean; error?: string }> {
  try {
    return await push(text);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const BODY_PREVIEW_CHARS = 300;
const MESSAGE_PREVIEW_CHARS = 120;

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

function preview(text: string, limit: number): string {
  const flat = text.trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit)}…`;
}

function sourceLabel(source: ReplyDraftRecord["source"]): string {
  return source === "gmail" ? "Gmail" : "LINE";
}

function renderItem(record: ReplyDraftRecord, index: number): string[] {
  const mark = CIRCLED[index] ?? `(${index + 1})`;
  const lines = [`${mark} ${sourceLabel(record.source)}`];

  if (record.escalate) {
    const reasons = record.reasons.map(reason => ESCALATION_LABEL[reason]).join("・");
    lines.push("JIN確認");
    if (reasons) lines.push(`理由: ${reasons}`);
  } else {
    lines.push(`${CATEGORY_LABEL[record.category]}問い合わせ`);
    lines.push(`優先度 ${record.priority}`);
  }

  lines.push("");
  lines.push(`「${preview(record.maskedMessage, MESSAGE_PREVIEW_CHARS)}」`);
  lines.push("");

  if (record.escalate) {
    lines.push("AIは返信案を作っていません。JINが判断してください。");
  } else {
    lines.push("下書き:");
    lines.push("");
    lines.push(preview(record.body ?? "", BODY_PREVIEW_CHARS));
    if (record.needsRevision) lines.push("（採点で手直し推奨が出ています）");
  }

  return lines;
}

/** JINのLINEへ出す本文を組み立てる。最大件数を超えた分は「ほか◯件」にする（要件 §36）。 */
export function renderNotification(
  records: ReplyDraftRecord[],
  now: Date,
  maxItems: number,
  root: string,
): string {
  const shown = records.slice(0, maxItems);
  const hidden = records.length - shown.length;
  const bySource = new Map<string, number>();
  for (const record of records) {
    const label = sourceLabel(record.source);
    bySource.set(label, (bySource.get(label) ?? 0) + 1);
  }

  const lines = [
    "openQLOW",
    "【返信の下書き】",
    "",
    stampInJst(now),
    "",
    `新着 ${records.length}件`,
    "",
    ...Array.from(bySource.entries()).map(([label, count]) => `${label} ${count}`),
  ];

  for (const [index, record] of shown.entries()) {
    lines.push("");
    lines.push(...renderItem(record, index));
  }

  if (hidden > 0) {
    lines.push("");
    lines.push(`ほか${hidden}件（すべて保存済みです）`);
  }

  const dates = Array.from(new Set(records.map(record => record.dateJst)));
  lines.push("");
  lines.push("全文:");
  for (const date of dates) lines.push(draftDir(root, date));
  lines.push("");
  lines.push("※AIはお客様へ送信していません。");
  lines.push("※最終確認・送信はJINが行います。");

  return lines.join("\n");
}

// ---- 保留リスト（静音時間ぶんの通知） ----

interface PendingRef {
  id: string;
  dateJst: string;
}

interface PendingFile {
  version: 1;
  items: PendingRef[];
}

export function pendingPath(root: string): string {
  return path.join(replyDraftStateDir(root), "pending_notify.json");
}

async function readPending(root: string): Promise<PendingRef[]> {
  const text = await fs.readFile(pendingPath(root), "utf8").catch(() => "");
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as Partial<PendingFile>;
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

async function writePending(root: string, items: PendingRef[]): Promise<void> {
  const file = pendingPath(root);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify({ version: 1, items }, null, 2)}\n`, "utf8");
}

/** 保留へ積む。同じIDは1つだけ（何度保留しても通知は1回）。 */
export async function queuePending(root: string, refs: PendingRef[]): Promise<void> {
  const current = await readPending(root);
  const seen = new Set(current.map(ref => ref.id));
  const merged = [...current];
  for (const ref of refs) {
    if (!seen.has(ref.id)) {
      merged.push(ref);
      seen.add(ref.id);
    }
  }
  await writePending(root, merged);
}

export interface DeliveryResult {
  /** 通知を送ったか。 */
  notified: boolean;
  /** 通知した件数。 */
  notifiedCount: number;
  /** 静音時間や失敗で保留へ回した件数。 */
  queuedCount: number;
  reason?: "quiet_hours" | "push_failed" | "nothing_to_send" | "dry_run";
}

export interface NotifyDeps {
  push?: PushImpl;
}

async function markNotified(root: string, records: ReplyDraftRecord[], now: Date): Promise<void> {
  // 通知はもう届いている。ここで落ちても届いた事実は変わらないので、失敗させない。
  // 特に保留を空にする前に落ちると、同じ通知がもう一度届いてしまう。
  for (const record of records) {
    await saveDraft(root, { ...record, notifiedAt: now.toISOString() }).catch(() => {});
  }
}

/**
 * 下書きをJINへ届ける。静音時間なら送らずに保留へ積む。
 * 送信に失敗した場合も保留へ戻すので、下書きが通知されないまま消えることはない。
 */
export async function deliverDrafts(
  root: string,
  records: ReplyDraftRecord[],
  now: Date,
  config: ReplyDraftConfig,
  deps: NotifyDeps = {},
): Promise<DeliveryResult> {
  if (records.length === 0) return { notified: false, notifiedCount: 0, queuedCount: 0, reason: "nothing_to_send" };

  if (isQuietHours(now, config.quietStartHour, config.quietEndHour)) {
    await queuePending(root, records.map(record => ({ id: record.id, dateJst: record.dateJst })));
    return { notified: false, notifiedCount: 0, queuedCount: records.length, reason: "quiet_hours" };
  }

  const push = deps.push ?? defaultPush;
  const result = await tryPush(push, renderNotification(records, now, config.notifyMaxItems, root));
  if (!result.ok) {
    await queuePending(root, records.map(record => ({ id: record.id, dateJst: record.dateJst })));
    return { notified: false, notifiedCount: 0, queuedCount: records.length, reason: "push_failed" };
  }

  await markNotified(root, records, now);
  return { notified: true, notifiedCount: records.length, queuedCount: 0 };
}

/**
 * 保留ぶんをまとめて1回だけ通知する（要件 §38）。
 * 静音時間中は何もしない。送信できたときだけ保留を空にするので、二重には届かない。
 */
export async function flushPendingNotifications(
  root: string,
  now: Date,
  config: ReplyDraftConfig,
  deps: NotifyDeps = {},
): Promise<DeliveryResult> {
  if (isQuietHours(now, config.quietStartHour, config.quietEndHour)) {
    return { notified: false, notifiedCount: 0, queuedCount: 0, reason: "quiet_hours" };
  }

  const refs = await readPending(root);
  if (refs.length === 0) return { notified: false, notifiedCount: 0, queuedCount: 0, reason: "nothing_to_send" };

  const records: ReplyDraftRecord[] = [];
  for (const ref of refs) {
    const record = await loadDraft(root, ref.dateJst, ref.id);
    if (record) records.push(record);
  }

  if (records.length === 0) {
    // 参照先が消えている（保持期間切れなど）。保留を空にして次へ進む。
    await writePending(root, []);
    return { notified: false, notifiedCount: 0, queuedCount: 0, reason: "nothing_to_send" };
  }

  const push = deps.push ?? defaultPush;
  const result = await tryPush(push, renderNotification(records, now, config.notifyMaxItems, root));
  if (!result.ok) {
    return { notified: false, notifiedCount: 0, queuedCount: records.length, reason: "push_failed" };
  }

  await markNotified(root, records, now);
  await writePending(root, []);
  return { notified: true, notifiedCount: records.length, queuedCount: 0 };
}
