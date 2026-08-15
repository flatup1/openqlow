// AIKA 移植キット（退会）のテスト。
//
// 本体（src/crm/withdrawal.ts）とズレたらここが落ちるようにしてある。
// AIKA側にコピーして使うファイルなので、依存ゼロのまま単体で走ることも保証する。

import {
  buildFormalReceiptMessage,
  buildProcedureGuideMessage,
  buildWithdrawalClosedMessage,
  calcFinalMembershipMonth,
  calcFormalReceivedAt,
  calcScheduledWithdrawalDate,
  decideWithdrawalTurn,
  detectOwnerReviewSignals,
  detectWithdrawalIntent,
  formatJapaneseDate,
  formatJapaneseMonth,
  isFormalReceiptComplete,
  resolveFormalReceipt,
  toJstDate,
  WITHDRAWAL_STATUS_LABELS,
} from "./withdrawal.js";
import {
  buildFormalReceiptMessage as coreFormalMessage,
  buildProcedureGuideMessage as coreGuideMessage,
  buildWithdrawalClosedMessage as coreClosedMessage,
  calcScheduledWithdrawalDate as coreScheduled,
  detectOwnerReviewSignals as coreOwnerSignals,
  detectWithdrawalIntent as coreIntent,
  WITHDRAWAL_STATUS_LABELS as CORE_LABELS,
} from "../../src/crm/withdrawal.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function jst(dateTime: string): string {
  return new Date(`${dateTime}+09:00`).toISOString();
}

// --- 本体との同期（ズレたら落ちる） ---------------------------------------------
assert(buildProcedureGuideMessage() === coreGuideMessage(), "手続き案内の文面が本体と同一");
assert(
  buildWithdrawalClosedMessage({ scheduledWithdrawalDate: "2026-09-30" }) ===
    coreClosedMessage({ scheduledWithdrawalDate: "2026-09-30" }),
  "退会完了の文面が本体と同一",
);
{
  const rec = {
    formalReceivedAt: jst("2026-08-18T11:05:00"),
    scheduledWithdrawalDate: "2026-09-30",
    finalMembershipMonth: "2026-09",
  };
  assert(buildFormalReceiptMessage(rec) === coreFormalMessage(rec), "正式受付の文面が本体と同一");
}
assert(JSON.stringify(WITHDRAWAL_STATUS_LABELS) === JSON.stringify(CORE_LABELS), "状態の日本語表示が本体と同一");
for (const date of ["2026-08-01", "2026-08-31", "2026-12-15", "2028-01-15", "2027-01-10"]) {
  assert(calcScheduledWithdrawalDate(date) === coreScheduled(date), `退会日計算が本体と同一: ${date}`);
}
for (const text of ["退会したいです", "休みたい", "体験を予約したい", "返金してください"]) {
  assert(
    JSON.stringify(detectWithdrawalIntent(text)) === JSON.stringify(coreIntent(text)),
    `意思検知が本体と同一: ${text}`,
  );
  assert(
    JSON.stringify(detectOwnerReviewSignals(text)) === JSON.stringify(coreOwnerSignals(text)),
    `特殊ケース検知が本体と同一: ${text}`,
  );
}

// --- 日付 -----------------------------------------------------------------------
assert(calcScheduledWithdrawalDate("2026-08-01") === "2026-09-30", "8/1 → 9/30");
assert(calcScheduledWithdrawalDate("2026-08-31") === "2026-09-30", "8/31 → 9/30");
assert(calcScheduledWithdrawalDate("2026-12-15") === "2027-01-31", "12/15 → 翌年1/31");
assert(calcScheduledWithdrawalDate("2028-01-15") === "2028-02-29", "うるう年の2月末");
assert(calcFinalMembershipMonth("2026-09-30") === "2026-09", "最終在籍月");
assert(toJstDate("2026-08-31T15:30:00.000Z") === "2026-09-01", "UTC深夜はJSTで翌日");
assert(formatJapaneseDate("2026-09-30") === "2026年09月30日", "日本語日付");
assert(formatJapaneseMonth("2026-09") === "2026年09月", "日本語年月");

// --- 正式受付 ---------------------------------------------------------------------
assert(
  !isFormalReceiptComplete({ withdrawalFormReceivedAt: jst("2026-08-10T11:00:00"), cardKeyReturnedAt: "" }),
  "退会届だけでは成立しない",
);
assert(
  !isFormalReceiptComplete({ withdrawalFormReceivedAt: "", cardKeyReturnedAt: jst("2026-08-10T11:00:00") }),
  "カードキーだけでは成立しない",
);
{
  const both = {
    withdrawalFormReceivedAt: jst("2026-08-10T11:00:00"),
    cardKeyReturnedAt: jst("2026-08-20T11:00:00"),
  };
  assert(isFormalReceiptComplete(both), "両方揃えば成立");
  assert(toJstDate(calcFormalReceivedAt(both)) === "2026-08-20", "遅いほうが正式受付日");
  const resolved = resolveFormalReceipt(both);
  assert(resolved.scheduledWithdrawalDate === "2026-09-30", "退会予定日");
  assert(resolved.finalMembershipMonth === "2026-09", "最終在籍月");
}
{
  const empty = resolveFormalReceipt({ withdrawalFormReceivedAt: jst("2026-08-10T11:00:00"), cardKeyReturnedAt: "" });
  assert(empty.formalReceivedAt === "" && empty.scheduledWithdrawalDate === "", "未成立なら3点とも空");
}

// --- LINE1件ぶんの判断 -------------------------------------------------------------
const fresh = { firstWithdrawalInquiryAt: "", procedureGuidedAt: "", handledMessageIds: [] as string[] };
const at = jst("2026-08-09T11:31:00");

{
  // 退会と言われた初回 → 案内を送り、相談日時と案内日時を記録する。正式受付にはしない。
  const d = decideWithdrawalTurn("退会したいです", fresh, at, "msg-1");
  assert(d.isWithdrawalTopic && d.shouldSendGuide, "初回は案内を送る");
  assert(d.message.includes("正式なお手続きをいただいた日の翌月末"), "案内文が入る");
  assert(d.recordFirstInquiryAt === at, "最初の相談日時を記録する");
  assert(d.recordProcedureGuidedAt === at, "案内日時を記録する");
  assert(!("formalReceivedAt" in d), "LINEの判断は正式受付を作らない");
}
{
  // 同じ webhook が再送された
  const d = decideWithdrawalTurn("退会したいです", { ...fresh, handledMessageIds: ["msg-1"] }, at, "msg-1");
  assert(!d.shouldSendGuide && d.reason === "duplicate_message", "同じmessageIdなら何もしない");
  assert(d.message === "", "重複時は文面を作らない");
}
{
  // 案内済みの相手からの再連絡 → 連投しない。相談日時は既にあるので記録しない。
  const d = decideWithdrawalTurn(
    "やっぱり退会します",
    { firstWithdrawalInquiryAt: jst("2026-08-09T11:30:00"), procedureGuidedAt: jst("2026-08-09T11:32:00") },
    jst("2026-08-10T09:00:00"),
  );
  assert(!d.shouldSendGuide && d.reason === "already_guided", "案内済みなら連投しない");
  assert(d.recordFirstInquiryAt === "", "最初の相談日時は上書きしない");
}
{
  // 相談日時は残っているが案内はまだ（電話で相談された等）
  const d = decideWithdrawalTurn(
    "退会したいです",
    { firstWithdrawalInquiryAt: jst("2026-08-09T11:30:00"), procedureGuidedAt: "" },
    at,
  );
  assert(d.shouldSendGuide, "未案内なら案内する");
  assert(d.recordFirstInquiryAt === "", "既にある相談日時は上書きしない");
}
{
  const d = decideWithdrawalTurn("体験の予約をお願いします", fresh, at);
  assert(!d.isWithdrawalTopic && d.reason === "not_withdrawal", "関係ない話は退会扱いしない");
}
{
  // 特殊ケースは案内を出しつつ、オーナー確認の候補として理由を返す（AIは結論を出さない）
  const d = decideWithdrawalTurn("退会して返金してほしいです", fresh, at);
  assert(d.shouldSendGuide, "特殊ケースでも手続き案内自体は出す");
  assert(d.ownerReviewSignals.some(s => s.reason === "返金要求"), "返金要求をオーナー確認候補として返す");
}
{
  const d = decideWithdrawalTurn("休会したいです", fresh, at);
  assert(d.isWithdrawalTopic && d.shouldSendGuide, "休会も同じ案内フローに乗せる");
}

console.log("aika withdrawal port tests passed");
