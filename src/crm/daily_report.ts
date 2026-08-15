// openQLOW 日次集客レポート生成（指示書フォーマット準拠・短く読みやすい版）
//
// 見込み客データから「新規問い合わせ／返信漏れ／追客／体験予約／体験後フォロー／
// 口コミ依頼／入会・失注／改善Top3／コメント」の Markdown を生成する。
// 日報は「誰に何を」だけに絞り、長い返信下書きは載せない（`crm draft <id>` で個別に出す）。

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
import {
  getConfirmationNotSent,
  getOwnerReviewRequired,
  getPaymentStopPending,
  getReadyToClose,
  withdrawalStatusLabel,
  type WithdrawalCase,
} from "./withdrawal.js";

function nameOf(p: Prospect): string {
  return p.name?.trim() || `#${p.id}`;
}

function bullet(lines: string[]): string {
  return lines.length ? lines.join("\n") : "- なし";
}

export interface DailyReport {
  markdown: string;
  dateIso: string;
}

export interface DailyReportOptions {
  /** 追客対象とみなす経過時間（既定24h） */
  followupHours?: number;
  /**
   * 退会ケース（任意）。渡すと会費ペイ未処理などの「要処理」を日報に載せる。
   * 省略時の出力は従来と完全に同じ（既存の呼び出しを壊さない）。
   */
  withdrawals?: WithdrawalCase[];
}

/** 見込み客一覧から日次レポートの Markdown を生成する（I/Oなし）。 */
export function buildDailyReport(
  prospects: Prospect[],
  now: Date = new Date(),
  options: DailyReportOptions = {},
): DailyReport {
  const followupHours = options.followupHours ?? 24;
  const dateIso = now.toISOString();
  const date = dateIso.slice(0, 10);

  const newInquiries = getNewInquiriesOn(prospects, dateIso);
  const followupNeeded = getFollowupNeeded(prospects, now, followupHours);
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

  // 退会まわりの「処理漏れ」。人の記憶ではなくシステム上の未完了として毎日出す。
  const withdrawals = options.withdrawals ?? [];
  const paymentPending = getPaymentStopPending(withdrawals);
  const confirmationPending = getConfirmationNotSent(withdrawals);
  const ownerReview = getOwnerReviewRequired(withdrawals);
  const readyToClose = getReadyToClose(withdrawals, now);

  // 改善アクション Top3（優先度: 会費ペイ > 返信漏れ > 追客 > 体験後フォロー > 口コミ）
  const actions: string[] = [];
  // 会費ペイの止め忘れは金銭トラブルに直結するので、集客系より先に出す。
  if (paymentPending.length) actions.push(`会費ペイ未処理 ${paymentPending.length}件を今日中に処理する`);
  if (replyMissing.length) actions.push(`返信漏れ ${replyMissing.length}件を今日中に返信する`);
  if (chasing.length) actions.push(`追客候補 ${chasing.length}件に再提案を送る`);
  if (trialFollowups.length) actions.push(`体験後フォロー ${trialFollowups.length}件に連絡する`);
  if (reviewCandidates.length) actions.push(`入会者 ${reviewCandidates.length}名に口コミを依頼する`);
  if (trialScheduled.length) actions.push(`体験予定 ${trialScheduled.length}件のリマインドを送る`);
  while (actions.length < 3) actions.push("特になし（流入を増やす施策を1つ検討する）");

  const lines: string[] = [];
  lines.push(`# FLATUP集客日報 ${date}`);
  lines.push("");
  // 見落とすと事故になるものだけ、先頭に短く出す。
  if (paymentPending.length > 0) {
    lines.push(`> ⚠ 会費ペイ未処理 ${paymentPending.length}件（詳細は「退会手続きの要処理」）`);
    lines.push("");
  }
  lines.push("## 1. 今日の新規問い合わせ");
  lines.push(`- 件数：${newInquiries.length}`);
  lines.push(`- 内容：${newInquiries.map(p => `${nameOf(p)}（${p.category}/${p.purpose || "目的未記録"}）`).join("、") || "なし"}`);
  lines.push("");
  lines.push("## 2. 返信漏れ候補");
  lines.push(bullet(replyMissing.map(p => `- ${nameOf(p)} / 最終連絡：${p.lastContactAt?.slice(0, 16) || "未記録"} → 今日中に返信`)));
  lines.push("");
  lines.push("## 3. 追客候補");
  lines.push(bullet(chasing.map(p => `- ${nameOf(p)} / 状態：${p.status} → 返信案: crm draft ${p.id}`)));
  lines.push("");
  lines.push("## 4. 体験予約済み");
  lines.push(bullet(trialScheduled.map(p => `- ${nameOf(p)} / 体験予定日：${p.trialDate || "未定"}`)));
  lines.push("");
  lines.push("## 5. 体験後フォロー候補");
  lines.push(bullet(trialFollowups.map(p => `- ${nameOf(p)} / 体験日：${p.trialDate} → フォロー案: crm draft ${p.id}`)));
  lines.push("");
  lines.push("## 6. 口コミ依頼候補");
  lines.push(bullet(reviewCandidates.map(p => `- ${nameOf(p)} / 入会済み → 依頼文: crm draft ${p.id}`)));
  lines.push("");
  lines.push("## 7. 入会・失注状況");
  lines.push(`- 入会（本日）：${joinedToday.length}`);
  lines.push(`- 失注：${lost.length}`);
  lines.push(`- 失注理由：${lost.map(p => `${nameOf(p)}：${p.lostReason || "理由未記録"}`).join("、") || "なし"}`);
  lines.push("");
  if (withdrawals.length > 0) {
    lines.push("## 7-2. 退会手続きの要処理");
    lines.push(`- 会費ペイ未処理：${paymentPending.length}件`);
    lines.push(
      bullet(
        paymentPending.map(
          c =>
            `  - ${c.memberName || c.memberId || `#${c.id}`} / 正式受付：${c.formalReceivedAt.slice(0, 10)} / ` +
            `退会予定：${c.scheduledWithdrawalDate} → 会費ペイ側の処理後に \`crm withdrawal payment-done ${c.id}\``,
        ),
      ),
    );
    lines.push(
      `- 正式受付LINE未送信：${confirmationPending.length}件` +
        (confirmationPending.length
          ? `（${confirmationPending.map(c => c.memberName || `#${c.id}`).join("、")}）`
          : ""),
    );
    lines.push(
      `- オーナー確認：${ownerReview.length}件` +
        (ownerReview.length
          ? `（${ownerReview.map(c => `${c.memberName || `#${c.id}`}：${c.ownerReviewReason || "理由未記録"}`).join("、")}）`
          : ""),
    );
    lines.push(
      `- 退会完了にできる：${readyToClose.length}件` +
        (readyToClose.length
          ? `（${readyToClose.map(c => `${c.memberName || `#${c.id}`}：${withdrawalStatusLabel(c.currentWithdrawalStatus)}`).join("、")}）`
          : ""),
    );
    lines.push("");
  }
  lines.push("## 8. 今日の改善アクションTop3");
  actions.slice(0, 3).forEach((a, i) => lines.push(`${i + 1}. ${a}`));
  lines.push("");
  lines.push("## 9. openQLOWコメント");
  lines.push(
    `見込み客 計${prospects.length}名。返信漏れ${replyMissing.length}・追客${chasing.length}・体験後フォロー${trialFollowups.length}・口コミ依頼${reviewCandidates.length}が要対応。` +
      "返信案は `crm draft <番号>` で出せます。送信は必ず人間が確認してから（自動送信はしません）。",
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
