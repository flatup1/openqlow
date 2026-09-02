// 返信下書きルーティンの入口。
//
// 流れ:
//   1. webhook が置いた受信の待ち行列を読む
//   2. まだ下書きのない受信だけ、下書きを作る
//   3. ローカルと（あれば）Obsidianに残す
//   4. JINのLINEへ1通だけ知らせる
//
// 送信は一切しない。お客様へ返すコードはこのファイルにも、この配下にもない。
//
// 安全装置:
//   - OPENQLOW_REPLY_DRAFT_ENABLED=true でないと何もしない
//   - OPENQLOW_REPLY_DRAFT_DISABLED=true で緊急停止
//   - OPENQLOW_DRY_RUN=false でないと保存も通知もしない（既定は dry run）
//   - 静音時間（既定22時〜7時）は通知せず、翌朝の実行に持ち越す

import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";
import { pushLineMessage } from "../line_bot/notifier.js";
import { formatDateInTimeZone } from "../utils/date.js";
import { openqlowPath } from "../utils/paths.js";
import { isQuietHour, loadReplyDraftConfig, type ReplyDraftConfig } from "./config.js";
import { buildReplyDraft, draftIdFor, type ReplyDraft } from "./draft.js";
import { buildDraftLog, buildDraftNotification } from "./notify.js";
import {
  claimInbox,
  hasDraft,
  loadUnnotifiedDrafts,
  markNotified,
  readInbox,
  releaseInbox,
  saveDraft,
} from "./store.js";

export type ReplyDraftMode = "disabled" | "not_enabled" | "no_inbound" | "drafted";

export interface ReplyDraftRunResult {
  ok: boolean;
  mode: ReplyDraftMode;
  reason?: string;
  /** 新しく作った下書きの数 */
  created: number;
  /** すでに下書き済みで飛ばした数 */
  skipped: number;
  /** 上限を超えて次回にまわした数 */
  deferred: number;
  notified: "sent" | "dry_run" | "skipped" | "quiet_hours" | "none";
  message?: string;
  logPath?: string;
  vaultPath?: string;
  drafts: ReplyDraft[];
}

export interface ReplyDraftRunOptions {
  config?: ReplyDraftConfig;
  now?: Date;
  /** 受信の待ち行列と下書きの置き場 */
  stateDir?: string;
  /** ローカルログの置き場 */
  logDir?: string;
  /** Obsidian Vault のルート。無ければ書かない。 */
  vaultRoot?: string;
  /** Vault内の保存先（相対） */
  vaultRelativeDir?: string;
  pushFn?: typeof pushLineMessage;
  /** テスト用に下書きの組み立てを差し替え */
  draftBuilder?: typeof buildReplyDraft;
}

export const DEFAULT_VAULT_RELATIVE_DIR = "30_INBOX/openqlow/reply_drafts";

/** JSTの「時」を取り出す。静音時間の判定に使う。 */
export function hourInJst(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  return Number(parts.find(part => part.type === "hour")?.value ?? "0");
}

function timeInJst(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
}

async function directoryExists(dir: string): Promise<boolean> {
  try {
    return (await stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

export async function runReplyDraft(opts: ReplyDraftRunOptions = {}): Promise<ReplyDraftRunResult> {
  const config = opts.config ?? loadReplyDraftConfig();
  const empty = { created: 0, skipped: 0, deferred: 0, notified: "none" as const, drafts: [] };

  if (config.disabled) {
    return { ok: true, mode: "disabled", reason: "OPENQLOW_REPLY_DRAFT_DISABLED=true", ...empty };
  }
  if (!config.enabled) {
    return { ok: true, mode: "not_enabled", reason: "OPENQLOW_REPLY_DRAFT_ENABLED が true ではない", ...empty };
  }

  const now = opts.now ?? new Date();
  const dateJst = formatDateInTimeZone(now, "Asia/Tokyo");
  const stateDir = opts.stateDir ?? openqlowPath("state", "reply_drafts");

  // 1. 受信を受け取る。
  //    本番実行では待ち行列から切り離す（実行中に届いた分を取りこぼさないため）。
  //    お試し実行では読むだけ。何度でも同じ結果を確かめられる。
  const inbox = config.dryRun ? await readInbox(stateDir) : await claimInbox(stateDir);
  const mine = inbox.filter(item => config.sources.includes(item.source));
  const others = inbox.filter(item => !config.sources.includes(item.source));

  // 2. 下書きを作る。すでに作ってある受信は飛ばす（二重に作らない）。
  //    1回に作るのは上限まで。あふれた分は待ち行列に残し、次の実行で作る。
  let created = 0;
  let skipped = 0;
  const newDrafts: ReplyDraft[] = [];
  const deferred: typeof mine = [];
  for (const inbound of mine) {
    if (await hasDraft(stateDir, draftIdFor(inbound.source, inbound.externalId))) {
      skipped += 1;
      continue;
    }
    if (created >= config.maxPerRun) {
      deferred.push(inbound);
      continue;
    }
    // 1件の失敗で実行全体を止めない。止めると、その受信が待ち行列に残り続けて
    // 次の実行も同じ場所で落ちる（詰まったまま新しい問い合わせが処理されない）。
    let draft: ReplyDraft;
    try {
      draft = (opts.draftBuilder ?? buildReplyDraft)(inbound, now);
    } catch (error) {
      draft = {
        id: draftIdFor(inbound.source, inbound.externalId),
        source: inbound.source,
        externalId: inbound.externalId,
        maskedSender: "",
        receivedAt: inbound.receivedAt,
        createdAt: now.toISOString(),
        inboundText: "",
        triage: { route: "human_only", reason: "下書きを作れなかった" },
        needsHuman: true,
        humanReason: `下書きの作成に失敗（${(error as Error).message}）`,
        status: "draft_only",
      };
    }
    newDrafts.push(draft);
    if (!config.dryRun) await saveDraft(stateDir, draft);
    created += 1;
  }

  // 3. 処理しなかった分だけ待ち行列へ戻す。
  if (!config.dryRun) await releaseInbox(stateDir, [...others, ...deferred]);

  // まだ知らせていない下書き（静音時間に作った前夜のぶんを含む）。
  const pending = config.dryRun ? newDrafts : await loadUnnotifiedDrafts(stateDir);

  if (pending.length === 0) {
    return {
      ok: true,
      mode: "no_inbound",
      reason: skipped > 0 ? `新しい受信なし（${skipped}件は作成済み）` : "新しい受信なし",
      created,
      skipped,
      deferred: deferred.length,
      notified: "none",
      drafts: [],
    };
  }

  // 4. 記録を残す。ローカルは必ず、Obsidianはあれば。
  const logDir = opts.logDir ?? openqlowPath("logs", "reply_drafts");
  const logBody = buildDraftLog(pending, dateJst);
  let logPath: string | undefined;
  if (!config.dryRun) {
    try {
      await mkdir(logDir, { recursive: true });
      logPath = path.join(logDir, `${dateJst}.md`);
      await writeFile(logPath, logBody, "utf8");
    } catch {
      logPath = undefined;
    }
  }

  const vaultRoot = opts.vaultRoot ?? loadConfig().obsidianVaultRoot;
  const vaultRelativeDir = opts.vaultRelativeDir ?? DEFAULT_VAULT_RELATIVE_DIR;
  let vaultPath: string | undefined;
  if (!config.dryRun && (await directoryExists(vaultRoot))) {
    try {
      const dir = path.join(vaultRoot, vaultRelativeDir);
      await mkdir(dir, { recursive: true });
      vaultPath = path.join(dir, `${dateJst}.md`);
      await writeFile(vaultPath, logBody, "utf8");
    } catch {
      // Vaultが書けなくても、ローカルには残っている。通知は続ける。
      vaultPath = undefined;
    }
  }

  // 5. LINEでJINへ。静音時間なら送らず、翌朝の実行に持ち越す。
  const message = buildDraftNotification(pending, {
    maxPerRun: config.maxPerRun,
    detailPath: vaultPath ?? logPath ?? `${logDir}/${dateJst}.md`,
    dateJst,
    timeJst: timeInJst(now),
  });

  if (isQuietHour(hourInJst(now), config.quietHours)) {
    return {
      ok: true,
      mode: "drafted",
      reason: `静音時間のため通知は持ち越し（${config.quietHours.start}時〜${config.quietHours.end}時）`,
      created,
      skipped,
      deferred: deferred.length,
      notified: "quiet_hours",
      message,
      logPath,
      vaultPath,
      drafts: pending,
    };
  }

  if (config.dryRun) {
    return {
      ok: true,
      mode: "drafted",
      created,
      skipped,
      deferred: deferred.length,
      notified: "dry_run",
      message,
      drafts: pending,
    };
  }

  const pushFn = opts.pushFn ?? pushLineMessage;
  const pushResult = await pushFn(message);
  if (pushResult.ok && pushResult.mode === "sent") {
    const iso = now.toISOString();
    for (const draft of pending) await markNotified(stateDir, draft, iso);
  }

  return {
    ok: pushResult.ok,
    mode: "drafted",
    created,
    skipped,
    deferred: deferred.length,
    notified: pushResult.mode,
    message,
    logPath,
    vaultPath,
    drafts: pending,
    ...(pushResult.error ? { reason: pushResult.error } : {}),
  };
}

export function isReplyDraftCliEntry(importMetaUrl: string, argv1: string | undefined): boolean {
  if (!argv1) return false;
  return /\/reply_draft\/run\.(?:ts|js)$/.test(importMetaUrl)
    && /(?:^|\/)run\.(?:ts|js)$/.test(argv1);
}

// CLI 実行（launchd / systemd から呼ばれる）
if (isReplyDraftCliEntry(import.meta.url, process.argv[1])) {
  const result = await runReplyDraft();
  console.log(
    `[reply-draft] mode=${result.mode} created=${result.created} skipped=${result.skipped}` +
      ` deferred=${result.deferred} notified=${result.notified}` +
      `${result.reason ? ` reason=${result.reason}` : ""}`,
  );
  if (result.message) console.log(`\n${result.message}\n`);
  if (!result.ok) process.exit(1);
}
