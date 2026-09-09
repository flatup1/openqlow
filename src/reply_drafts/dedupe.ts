// 同じ問い合わせを二度処理しないための鍵と台帳。
//
// 完全な Exactly Once は狙わない（要件 §17）。狙うのは「何度受けても結果が1件」。
// そのために2つ用意する。
//   (1) 安定した鍵     : 同じイベントなら毎回同じ文字列になる
//   (2) 処理済みの台帳 : 一度通知した鍵は二度通知しない
//
// 抑制の単位は「問い合わせイベント」であって「日」ではない（要件 §20）。
// 同じ日に別の問い合わせが来たら、それは別件として必ず通知する。

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { replyDraftStateDir } from "./config.js";
import { withStateLock } from "./lock.js";

export type InquirySource = "line" | "gmail";

export interface EventKeyInput {
  source: InquirySource;
  /** LINE の webhookEventId / Gmail の messageId。あればこれだけで一意。 */
  eventId?: string;
  /** 送信者の識別子（LINE userId など）。鍵の材料にのみ使い、保存はしない。 */
  sender?: string;
  /** 送信時刻（ms）。無ければ 0 として扱う。 */
  timestamp?: number;
  /** 本文。 */
  text?: string;
}

/** 本文のゆらぎ（全角空白・改行・前後の空白）で別イベント扱いにならないよう整える。 */
function normalizeText(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim();
}

/**
 * イベントの安定鍵。
 * eventId があればそれを使う（要件 §18）。無いときだけ指紋を作る。
 * 指紋は「送信元 + 送信者 + 時刻バケット(1分) + 正規化本文」の SHA-256。
 * 時刻をバケットにするのは、再送でミリ秒だけ違う同一イベントを同じ鍵にするため。
 */
export function eventKey(input: EventKeyInput): string {
  if (input.eventId && input.eventId.trim()) {
    return `${input.source}:${input.eventId.trim()}`;
  }
  const bucket = Math.floor((input.timestamp ?? 0) / 60_000);
  const digest = crypto
    .createHash("sha256")
    .update([input.source, input.sender ?? "", String(bucket), normalizeText(input.text ?? "")].join(" "))
    .digest("hex");
  return `${input.source}:fp_${digest.slice(0, 32)}`;
}

/** 鍵から、保存ファイル名に使える短い ID を作る。同じ鍵なら必ず同じ ID。 */
export function draftIdFor(dateJst: string, key: string): string {
  const digest = crypto.createHash("sha256").update(key).digest("hex").slice(0, 12);
  return `${dateJst}_${digest}`;
}

interface SeenFile {
  version: 1;
  /** 鍵 から 処理した時刻(ISO) への対応表。 */
  entries: Record<string, string>;
}

export function seenStorePath(root: string, source: InquirySource): string {
  return path.join(replyDraftStateDir(root), `${source}_seen.json`);
}

async function readSeen(file: string): Promise<SeenFile> {
  const text = await fs.readFile(file, "utf8").catch(() => "");
  if (!text) return { version: 1, entries: {} };
  try {
    const parsed = JSON.parse(text) as Partial<SeenFile>;
    return { version: 1, entries: parsed.entries ?? {} };
  } catch {
    // 壊れた台帳で処理を止めない。空として作り直す（重複通知は起きうるが、取りこぼしよりまし）。
    return { version: 1, entries: {} };
  }
}

/** 保持期間を過ぎた記録を落とす（要件 §19。ファイルの肥大化を防ぐ）。 */
function prune(entries: Record<string, string>, now: Date, retentionDays: number): Record<string, string> {
  const limit = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  const kept: Record<string, string> = {};
  for (const [key, iso] of Object.entries(entries)) {
    const at = Date.parse(iso);
    if (Number.isNaN(at) || at >= limit) kept[key] = iso;
  }
  return kept;
}

/** その鍵が処理済みか。台帳が無ければ未処理。 */
export async function hasSeen(root: string, source: InquirySource, key: string): Promise<boolean> {
  const seen = await readSeen(seenStorePath(root, source));
  return Object.prototype.hasOwnProperty.call(seen.entries, key);
}

/**
 * 鍵を処理済みとして記録する。書き込みのたびに保持期間で間引く。
 * 既に記録済みなら false を返す（呼び出し側が二重処理に気づける）。
 */
export async function markSeen(
  root: string,
  source: InquirySource,
  key: string,
  now: Date,
  retentionDays: number,
): Promise<boolean> {
  // 「読む→足す→書く」の途中に別の受信が割り込むと、片方の記録が消える。
  // 同じ台帳への更新は順番に行わせる。
  return withStateLock(`seen:${root}:${source}`, async () => {
    const file = seenStorePath(root, source);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const seen = await readSeen(file);
    const already = Object.prototype.hasOwnProperty.call(seen.entries, key);
    const entries = prune(seen.entries, now, retentionDays);
    entries[key] = now.toISOString();
    await writeJsonAtomic(file, { version: 1, entries });
    return !already;
  });
}

/**
 * いったん隣のファイルへ書いてから置き換える。
 * 途中で落ちても、書きかけの壊れたファイルが残らない。
 */
async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  // 一時ファイル名は毎回変える。固定名だと、同時に書いたとき互いの一時ファイルを
  // 奪い合って rename が失敗する（ロックに頼らず、これ単体で正しくしておく）。
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fs.rename(temporary, file);
}
