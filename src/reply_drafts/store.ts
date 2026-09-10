// 下書きの保存。
//
// 保存の優先順位は「ローカル本体 → 集計用JSONL → 実行ログ」（要件 §30-32）。
// ローカル本体に書けなかったら成功扱いにしない。通知が失敗しても下書きは消えない。
//
// Obsidian への書き出し（要件 §27-29 の閲覧用ノート）は Phase 2。
// Phase 1 は state/ 配下のローカル保存だけを持ち、外部依存を1つも増やさない。

import crypto from "node:crypto";
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
  // いったん隣へ書いてから置き換える。途中で落ちても、読めない書きかけの
  // ファイルが残らない（読めないと通知の保留から黙って外れてしまう）。
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await fs.rename(temporary, file);
  return file;
}

/**
 * 下書きを読んだ結果。「無い」と「読めなかった」を必ず区別する。
 *
 * この2つを同じ扱いにすると、一度読めなかっただけの下書きが
 * 「もう存在しない」とみなされ、保留リストから外れて永久に通知されなくなる。
 */
export type DraftReadResult =
  | { status: "ok"; record: ReplyDraftRecord }
  | { status: "missing" }
  | { status: "unreadable"; reason: string };

/** 下書きを読む。読めなかった理由まで返す（保存されているのに消える、を無くす）。 */
export async function readDraft(root: string, dateJst: string, id: string): Promise<DraftReadResult> {
  const file = path.join(draftDir(root, dateJst), `${id}.json`);
  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // ファイルが無い・親フォルダが無い＝本当に無い。それ以外は「読めなかった」。
    if (code === "ENOENT" || code === "ENOTDIR") return { status: "missing" };
    return { status: "unreadable", reason: code ?? String(error) };
  }
  try {
    return { status: "ok", record: JSON.parse(text) as ReplyDraftRecord };
  } catch {
    // 中身が壊れている。中身が無いのとは違う。
    return { status: "unreadable", reason: "JSONとして読めない" };
  }
}

export async function loadDraft(
  root: string,
  dateJst: string,
  id: string,
): Promise<ReplyDraftRecord | undefined> {
  const result = await readDraft(root, dateJst, id);
  return result.status === "ok" ? result.record : undefined;
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
