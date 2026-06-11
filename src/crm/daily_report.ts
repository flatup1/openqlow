// openQLOW 日次集客レポート生成（指示書フォーマット準拠）
//
// 見込み客データから「新規問い合わせ／返信漏れ／追客／体験予約／体験後フォロー／
// 口コミ依頼／入会・失注／改善Top3／コメント」の Markdown を生成する。
// 推奨メッセージは既存の AIKA ジェネレータ（inquiry_reply / trial_followup）を再利用する。

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Prospect } from "./prospect.js";
import {
  getFollowupNeeded,
  getNewInquiriesOn,
  getReviewRequestCandidates,
  getTrialFollowupNeeded,
  getTrialScheduled,
} from "./queries.js";
import { generateInquiryReply } from "../generators/inquiry_reply.js";
import { generateTrialFollowup } from "../generators/trial_followup.js";
import type { Gender } from "../generators/shared.js";

function coerceGender(value: string): Gender {
  if (value === "female" || /女/.test(value)) return "female";
  if (value === "male" || /男/.test(value)) return "male";
  return "unknown";
}

function nameOf(p: Prospect): string {
  return p.name?.trim() || `#${p.id}`;
}

function followUpMessageFor(p: Prospect): string {
  const message = p.inquiryText?.trim() || "体験について相談したい";
  return generateInquiryReply({ message, gender: coerceGender(p.gender) }).replies.followUp24h;
}

function trialFollowMessageFor(p: Prospect): string {
  return generateTrialFollowup({
    gender: coerceGender(p.gender),
    ageBand: p.ageGroup,
    concern: p.lostReason || p.memo,
    enrollmentStatus: p.trialStatus,
  }).messages.nextDayFollow;
}

function reviewMessageFor(p: Prospect): string {
  return generateTrialFollowup({ gender: coerceGender(p.gender) }).messages.reviewRequest;
}

function bullet(lines: string[]): string {
  return lines.length ? lines.join("\n") : "- なし";
}

function indentMessage(msg: string): string {
  // 複数行メッセージを箇条書きの下にインデント表示する
  return msg.split("\n").map(line => `    ${line}`).join("\n");
}

export interface DailyReport {
  markdown: string;
  dateIso: string;
}

/** 見込み客一覧から日次レポートの Markdown を生成する（I/Oなし）。 */
export function buildDailyReport(prospects: Prospect[], now: Date = new Date()): DailyReport {
  const dateIso = now.toISOString();
  const date = dateIso.slice(0, 10);

  const newInquiries = getNewInquiriesOn(prospects, dateIso);
  const followupNeeded = getFollowupNeeded(prospects, now);
  const replyMissing = followupNeeded.filter(p => p.status === "waiting_reply");
  const chasing = [
    ...followupNeeded.filter(p => p.status === "replied"),
    ...prospects.filter(p => p.status === "followup_needed" && p.joined === 0),
  ];
  const trialScheduled = getTrialScheduled(prospects);
  const trialFollowups = getTrialFollowupNeeded(prospects);
  const reviewCandidates = getReviewRequestCandidates(prospects);
  const joinedToday = prospects.filter(p => p.joined === 1 && p.updatedAt.slice(0, 10) === date);
  const lost = prospects.filter(p => p.status === "lost");

  // 改善アクション Top3（優先度: 返信漏れ > 追客 > 体験後フォロー > 口コミ）
  const actions: string[] = [];
  if (replyMissing.length) actions.push(`返信漏れ ${replyMissing.length}件を今日中に返信する`);
  if (chasing.length) actions.push(`追客候補 ${chasing.length}件に再提案を送る`);
  if (trialFollowups.length) actions.push(`体験後フォロー ${trialFollowups.length}件に連絡する`);
  if (reviewCandidates.length) actions.push(`入会者 ${reviewCandidates.length}名に口コミを依頼する`);
  if (trialScheduled.length) actions.push(`体験予定 ${trialScheduled.length}件のリマインドを送る`);
  while (actions.length < 3) actions.push("特になし（流入を増やす施策を1つ検討する）");

  const lines: string[] = [];
  lines.push(`# FLATUP集客日報 ${date}`);
  lines.push("");
  lines.push("## 1. 今日の新規問い合わせ");
  lines.push(`- 件数：${newInquiries.length}`);
  lines.push(`- 内容：${newInquiries.map(p => `${nameOf(p)}（${p.category}/${p.purpose || "目的未記録"}）`).join("、") || "なし"}`);
  lines.push("");
  lines.push("## 2. 返信漏れ候補");
  lines.push(bullet(replyMissing.map(p => `- ${nameOf(p)} / 最終連絡：${p.lastContactAt || "未記録"} / 推奨：今日中に一次返信`)));
  lines.push("");
  lines.push("## 3. 追客候補");
  lines.push(
    chasing.length
      ? chasing.map(p => [`- ${nameOf(p)} / 状態：${p.status}`, "  推奨メッセージ：", indentMessage(followUpMessageFor(p))].join("\n")).join("\n")
      : "- なし",
  );
  lines.push("");
  lines.push("## 4. 体験予約済み");
  lines.push(bullet(trialScheduled.map(p => `- ${nameOf(p)} / 体験予定日：${p.trialDate || "未定"}`)));
  lines.push("");
  lines.push("## 5. 体験後フォロー候補");
  lines.push(
    trialFollowups.length
      ? trialFollowups.map(p => [`- ${nameOf(p)} / 体験日：${p.trialDate}`, "  推奨メッセージ：", indentMessage(trialFollowMessageFor(p))].join("\n")).join("\n")
      : "- なし",
  );
  lines.push("");
  lines.push("## 6. 口コミ依頼候補");
  lines.push(
    reviewCandidates.length
      ? reviewCandidates.map(p => [`- ${nameOf(p)} / 状態：入会済み`, "  推奨メッセージ：", indentMessage(reviewMessageFor(p))].join("\n")).join("\n")
      : "- なし",
  );
  lines.push("");
  lines.push("## 7. 入会・失注状況");
  lines.push(`- 入会（本日）：${joinedToday.length}`);
  lines.push(`- 失注：${lost.length}`);
  lines.push(`- 失注理由：${lost.map(p => `${nameOf(p)}：${p.lostReason || "理由未記録"}`).join("、") || "なし"}`);
  lines.push("");
  lines.push("## 8. 今日の改善アクションTop3");
  actions.slice(0, 3).forEach((a, i) => lines.push(`${i + 1}. ${a}`));
  lines.push("");
  lines.push("## 9. openQLOWコメント");
  lines.push(
    `本日の見込み客は計${prospects.length}名。返信漏れ${replyMissing.length}・追客${chasing.length}・体験後フォロー${trialFollowups.length}・口コミ依頼${reviewCandidates.length}が要対応です。` +
      "まずは返信漏れを優先し、人間が内容を確認してから送信してください（自動送信はしません）。",
  );
  lines.push("");

  return { markdown: lines.join("\n"), dateIso };
}

export interface SaveDailyReportResult {
  filePath: string;
  bytes: number;
}

/** 日次レポートを reports/daily/ に保存する。 */
export async function saveDailyReport(
  markdown: string,
  dateIso: string,
  baseDir: string,
): Promise<SaveDailyReportResult> {
  const dir = path.join(baseDir, "reports", "daily");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${dateIso.slice(0, 10)}_FLATUP集客日報.md`);
  const content = markdown.endsWith("\n") ? markdown : markdown + "\n";
  await writeFile(filePath, content, "utf8");
  return { filePath, bytes: Buffer.byteLength(content) };
}
