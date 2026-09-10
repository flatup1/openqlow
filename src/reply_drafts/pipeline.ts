// 返信下書きルーティンの入口。受信1件ぶんの流れをここでまとめる。
//
//   受信 → 正規化 → 伏字 → 重複判定 → 分類 → 危険判定 → 下書き
//        → 保存（ローカル本体が最優先）→ JINへ通知
//
// 顧客への送信処理はこの流れに存在しない。作らない。
//
// 止める順番（要件 §46）:
//   REPLY_DRAFT_DISABLED  … 何もしない（非常停止）
//   REPLY_DRAFT_ENABLED   … true でなければ何もしない
//   OPENQLOW_DRY_RUN      … 判定だけ行い、保存も通知も状態変更もしない

import { pseudonymize } from "../line_bot/pseudonymize.js";
import { loadReplyDraftConfig, type ReplyDraftConfig } from "./config.js";
import { buildReplyDraft } from "./draft.js";
import { draftIdFor, eventKey, hasSeen, markSeen, type InquirySource } from "./dedupe.js";
import {
  deliverDrafts,
  flushPendingNotifications,
  type DeliveryResult,
  type NotifyDeps,
  type PushImpl,
} from "./notify.js";
import { appendJsonl, appendRunLog, saveDraft, type ReplyDraftRecord } from "./store.js";
import { dateInJst } from "./time.js";

export interface InquiryEvent {
  source: InquirySource;
  /** 問い合わせ本文。 */
  text: string;
  /** 送信者の識別子。仮名化してからしか保存しない。 */
  senderId?: string;
  /** LINE の webhookEventId / Gmail の messageId。 */
  eventId?: string;
  /** 送信時刻（ms）。 */
  timestamp?: number;
}

export type ProcessOutcome =
  | "disabled"
  | "off"
  | "dry_run"
  | "duplicate"
  | "saved"
  | "save_failed";

export interface ProcessResult {
  ok: boolean;
  outcome: ProcessOutcome;
  draftId?: string;
  escalated?: boolean;
  notified?: boolean;
  queued?: boolean;
  error?: string;
}

export interface PipelineDeps {
  now?: Date;
  env?: NodeJS.ProcessEnv;
  config?: ReplyDraftConfig;
  push?: PushImpl;
}

async function safeRunLog(root: string, dateJst: string, message: string, at: string): Promise<void> {
  // 実行ログが書けないことで本処理を落とさない。
  await appendRunLog(root, dateJst, { at, message }).catch(() => {});
}

/**
 * 問い合わせ1件を下書きにしてJINへ届ける。
 * お客様へは何も送らない。返り値は運用ログ用の要約だけ。
 */
export async function processInquiryEvent(
  event: InquiryEvent,
  deps: PipelineDeps = {},
): Promise<ProcessResult> {
  const config = deps.config ?? loadReplyDraftConfig(deps.env);

  // 非常停止と未有効化は、ここで完全に止まる。ファイルも触らない。
  if (config.mode === "disabled") return { ok: true, outcome: "disabled" };
  if (config.mode === "off") return { ok: true, outcome: "off" };

  const now = deps.now ?? new Date();
  const dateJst = dateInJst(now);
  const key = eventKey({
    source: event.source,
    eventId: event.eventId,
    sender: event.senderId,
    timestamp: event.timestamp,
    text: event.text,
  });
  const id = draftIdFor(dateJst, key);
  const build = buildReplyDraft(event.text);

  // お試し実行では、判定まで行って結果を返すだけ。保存も通知も状態変更もしない。
  if (config.mode === "dry_run") {
    return { ok: true, outcome: "dry_run", draftId: id, escalated: build.escalate };
  }

  if (await hasSeen(config.root, event.source, key)) {
    await safeRunLog(config.root, dateJst, `重複スキップ ${id}`, now.toISOString());
    return { ok: true, outcome: "duplicate", draftId: id, escalated: build.escalate };
  }

  const record: ReplyDraftRecord = {
    id,
    source: event.source,
    eventKey: key,
    dateJst,
    receivedAt: now.toISOString(),
    senderPseudonym: pseudonymize(event.senderId),
    maskedMessage: build.maskedMessage,
    category: build.category,
    priority: build.priority,
    escalate: build.escalate,
    reasons: build.reasons,
    aboutMinor: build.aboutMinor,
    body: build.body,
    qualityTotal: build.qualityTotal,
    needsRevision: build.needsRevision,
    notes: build.notes,
  };

  // ① ローカル本体。ここが書けなければ成功扱いにしない（要件 §32）。
  try {
    await saveDraft(config.root, record);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await safeRunLog(config.root, dateJst, `保存エラー ${id}: ${message}`, now.toISOString());
    return { ok: false, outcome: "save_failed", draftId: id, error: message };
  }

  // ② 集計用の1行。失敗しても本体は残っているので処理は続ける。
  await appendJsonl(config.root, record).catch(async error => {
    const message = error instanceof Error ? error.message : String(error);
    await safeRunLog(config.root, dateJst, `JSONL追記エラー ${id}: ${message}`, now.toISOString());
  });

  // ③ 処理済みとして記録。ここまで来た件は、二度目の受信で下書きも通知も増えない。
  await markSeen(config.root, event.source, key, now, config.seenRetentionDays);

  // ④ JINへ通知。ここから先で何が起きても、下書きは保存済み・処理済みで動かない。
  //
  // 通知の段の失敗を外へ投げてはいけない。投げると受け口は失敗を返すが、
  // すでに「処理済み」なのでLINEが再送してきても duplicate で終わる。
  // 保存できているのに、JINには何も残らない。
  // 失敗はここで受け止めて、実行ログに残す。拾い直しは flush が行う。
  let delivery: DeliveryResult = { notified: false, notifiedCount: 0, queuedCount: 0 };
  try {
    // 静音時間の間にたまった通知を先に流す。静音時間中も保留が空のときも何もしない。
    // これが無いと、夜中に届いた分は「翌朝たまたま次の問い合わせが来たとき」しか届かない。
    const flushed = await flushPendingNotifications(config.root, now, config, { push: deps.push } as NotifyDeps);
    if (flushed.notified) {
      await safeRunLog(config.root, dateJst, `保留分を通知 ${flushed.notifiedCount}件`, now.toISOString());
    }

    delivery = await deliverDrafts(config.root, [record], now, config, { push: deps.push } as NotifyDeps);
    if (delivery.reason === "push_failed") {
      await safeRunLog(config.root, dateJst, `通知エラー ${id}（保留へ）`, now.toISOString());
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await safeRunLog(config.root, dateJst, `通知処理エラー ${id}: ${message}（下書きは保存済み）`, now.toISOString());
  }

  await safeRunLog(
    config.root,
    dateJst,
    `下書き ${build.escalate ? "JIN確認" : build.category} ${id} 通知=${delivery.notified ? "済" : "保留"}`,
    now.toISOString(),
  );

  return {
    ok: true,
    outcome: "saved",
    draftId: id,
    escalated: build.escalate,
    notified: delivery.notified,
    queued: delivery.queuedCount > 0,
  };
}
