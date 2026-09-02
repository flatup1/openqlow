// 受信の待ち行列と、作った下書きの保存。
//
// 保存先は state/reply_drafts/ の下だけ。顧客情報を新しい場所へ増やさない。
// 下書きIDは受信元＋外部IDから決まるので、同じ受信を2回処理しても
// ファイルが1つできるだけで、下書きが二重にできることはない。

import fs from "node:fs/promises";
import path from "node:path";
import type { InboundMessage, ReplyDraft } from "./draft.js";

export function inboxPath(stateDir: string): string {
  return path.join(stateDir, "inbox.jsonl");
}

export function recordPath(stateDir: string, id: string): string {
  return path.join(stateDir, "records", `${id}.json`);
}

/** webhook が受け取った1件を待ち行列へ足す。ここでは下書きを作らない（返信を遅らせない）。 */
export async function appendInbound(stateDir: string, inbound: InboundMessage): Promise<void> {
  await fs.mkdir(stateDir, { recursive: true });
  await fs.appendFile(inboxPath(stateDir), `${JSON.stringify(inbound)}\n`, "utf8");
}

/** 待ち行列を読む。壊れた行は黙って飛ばす（1行のせいで全部を落とさない）。 */
export async function readInbox(stateDir: string): Promise<InboundMessage[]> {
  let raw: string;
  try {
    raw = await fs.readFile(inboxPath(stateDir), "utf8");
  } catch {
    return [];
  }

  const out: InboundMessage[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as InboundMessage;
      if (parsed && typeof parsed.text === "string" && typeof parsed.externalId === "string") {
        out.push(parsed);
      }
    } catch {
      continue;
    }
  }
  return out;
}

/** 処理し終えた行を取り除く。残す分だけ書き戻す。 */
export async function replaceInbox(stateDir: string, remaining: InboundMessage[]): Promise<void> {
  await fs.mkdir(stateDir, { recursive: true });
  const body = remaining.map(item => JSON.stringify(item)).join("\n");
  await fs.writeFile(inboxPath(stateDir), body ? `${body}\n` : "", "utf8");
}

/** すでに下書きを作った受信か。 */
export async function hasDraft(stateDir: string, id: string): Promise<boolean> {
  try {
    await fs.stat(recordPath(stateDir, id));
    return true;
  } catch {
    return false;
  }
}

export async function saveDraft(stateDir: string, draft: ReplyDraft): Promise<string> {
  const file = recordPath(stateDir, draft.id);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
  return file;
}

export async function loadDraft(stateDir: string, id: string): Promise<ReplyDraft | undefined> {
  try {
    return JSON.parse(await fs.readFile(recordPath(stateDir, id), "utf8")) as ReplyDraft;
  } catch {
    return undefined;
  }
}

/** まだJINへ知らせていない下書き。静音時間に作ったぶんは、ここに残って翌朝出る。 */
export async function loadUnnotifiedDrafts(stateDir: string): Promise<ReplyDraft[]> {
  let names: string[];
  try {
    names = await fs.readdir(path.join(stateDir, "records"));
  } catch {
    return [];
  }

  const drafts: ReplyDraft[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const draft = await loadDraft(stateDir, name.replace(/\.json$/, ""));
    if (draft && !draft.notifiedAt) drafts.push(draft);
  }
  // 受信が古いものから順に出す。
  return drafts.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
}

export async function markNotified(stateDir: string, draft: ReplyDraft, iso: string): Promise<void> {
  await saveDraft(stateDir, { ...draft, notifiedAt: iso });
}
