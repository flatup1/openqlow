// 下書きの保存。
//
// 保存の優先順位は「ローカル本体 → 集計用JSONL → 実行ログ」（要件 §30-32）。
// ローカル本体に書けなかったら成功扱いにしない。通知が失敗しても下書きは消えない。
//
// Obsidian への書き出し（要件 §27-29 の閲覧用ノート）は Phase 2。
// Phase 1 は state/ 配下のローカル保存だけを持ち、外部依存を1つも増やさない。

import fs from "node:fs/promises";
import path from "node:path";
import { replyDraftStateDir } from "./config.js";
import type { InquirySource } from "./dedupe.js";
import type { EscalationReason, InquiryCategory, InquiryPriority } from "./triage.js";

export interface ReplyDraftRecord {
  /** 鍵から決まる決定的なID。同じイベントを再処理しても同じIDになる。 */
  id: string;
  source: InquirySource;
  /** 重複判定に使った鍵。 */
  eventKey: string;
  /** 受信日（JST, YYYY-MM-DD）。 */
  dateJst: string;
  /** 受信時刻（ISO）。 */
  receivedAt: string;
  /** 送信者の仮名（元に戻せないハッシュ）。生のIDは保存しない。 */
  senderPseudonym: string;
  /** 伏字済みの問い合わせ本文。 */
  maskedMessage: string;
  category: InquiryCategory;
  priority: InquiryPriority;
  escalate: boolean;
  reasons: EscalationReason[];
  aboutMinor: boolean;
  /** JINが送る下書き。escalate のときは無い。 */
  body?: string;
  qualityTotal?: number;
  needsRevision?: boolean;
  notes: string[];
  /** JINへ通知済みか。静音時間の間は false のまま保留される。 */
  notifiedAt?: string;
}

export function draftDir(root: string, dateJst: string): string {
  return path.join(replyDraftStateDir(root), dateJst);
}

export function draftPath(root: string, record: Pick<ReplyDraftRecord, "id" | "dateJst">): string {
  return path.join(draftDir(root, record.dateJst), `${record.id}.json`);
}

export function jsonlPath(root: string): string {
  return path.join(replyDraftStateDir(root), "reply-drafts.jsonl");
}

export function runLogPath(root: string, dateJst: string): string {
  return path.join(root, "logs", "reply_drafts", `${dateJst}.md`);
}

/**
 * ローカル本体を保存する。ここが失敗したら、その1件は成功扱いにしてはいけない。
 * 同じIDへの再保存は上書き。何度処理しても記録は1件のまま（要件 §17）。
 */
export async function saveDraft(root: string, record: ReplyDraftRecord): Promise<string> {
  const file = draftPath(root, record);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return file;
}

export async function loadDraft(
  root: string,
  dateJst: string,
  id: string,
): Promise<ReplyDraftRecord | undefined> {
  const text = await fs.readFile(path.join(draftDir(root, dateJst), `${id}.json`), "utf8").catch(() => "");
  if (!text) return undefined;
  try {
    return JSON.parse(text) as ReplyDraftRecord;
  } catch {
    return undefined;
  }
}

/** 将来の集計用に1行追記する。ここが失敗しても下書き本体は残っている。 */
export async function appendJsonl(root: string, record: ReplyDraftRecord): Promise<void> {
  const file = jsonlPath(root);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, `${JSON.stringify(record)}\n`, "utf8");
}

export interface RunLogEntry {
  at: string;
  /** 何が起きたか（1行で読める短い日本語）。 */
  message: string;
}

/** 実行ログ（要件 §31）。件数・スキップ・エラーを人が読める形で残す。 */
export async function appendRunLog(root: string, dateJst: string, entry: RunLogEntry): Promise<void> {
  const file = runLogPath(root, dateJst);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const exists = await fs
    .access(file)
    .then(() => true)
    .catch(() => false);
  const header = exists ? "" : `# 返信下書きルーティン 実行ログ ${dateJst}\n\n`;
  await fs.appendFile(file, `${header}- ${entry.at} ${entry.message}\n`, "utf8");
}
