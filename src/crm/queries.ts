// 追客漏れ・体験後フォロー・口コミ依頼の候補抽出（純粋関数）
//
// すべて Prospect[] と現在時刻を受け取り、条件に合う見込み客を返すだけ。
// I/O を持たないのでテストが容易。指示書の get_followup_needed 等に対応。

import type { Prospect } from "./prospect.js";

const HOUR_MS = 60 * 60 * 1000;

function hoursSince(iso: string, now: Date): number {
  if (!iso) return Infinity; // 連絡記録が無い＝放置とみなす
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Infinity;
  return (now.getTime() - t) / HOUR_MS;
}

/**
 * 追客漏れ候補。
 * 条件: status が waiting_reply または replied / 最終連絡から24時間以上 /
 *       未入会 / lost・archived ではない。
 */
export function getFollowupNeeded(prospects: Prospect[], now: Date = new Date()): Prospect[] {
  // status を waiting_reply/replied に限定している時点で lost・archived は除外済み。
  return prospects.filter(p =>
    (p.status === "waiting_reply" || p.status === "replied") &&
    p.joined === 0 &&
    hoursSince(p.lastContactAt, now) >= 24,
  );
}

/**
 * 体験後フォロー候補。
 * 条件: status が trial_done / 未入会 / trial_date が存在する。
 */
export function getTrialFollowupNeeded(prospects: Prospect[]): Prospect[] {
  return prospects.filter(p =>
    p.status === "trial_done" &&
    p.joined === 0 &&
    Boolean(p.trialDate),
  );
}

/**
 * 口コミ依頼候補。
 * 条件: status が joined かつ joined === 1。
 */
export function getReviewRequestCandidates(prospects: Prospect[]): Prospect[] {
  return prospects.filter(p => p.status === "joined" && p.joined === 1);
}

/** 当日（JST基準の日付一致）の新規問い合わせ。 */
export function getNewInquiriesOn(prospects: Prospect[], dateIso: string): Prospect[] {
  const day = dateIso.slice(0, 10);
  return prospects.filter(p => p.status === "new_inquiry" && p.createdAt.slice(0, 10) === day);
}

/** 体験予約済み（これから体験）。 */
export function getTrialScheduled(prospects: Prospect[]): Prospect[] {
  return prospects.filter(p => p.status === "trial_scheduled");
}
