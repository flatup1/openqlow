// 会員からのLINE受信 → 退会相談の記録と手続き案内のテスト。
//
// 最重要の検査:
//   1. LINEの発言だけでは正式受付にならない
//   2. 会員へ送るのは固定テンプレートのみ（AI生成文を送らない）
//   3. 送れていないのに「案内済み」にしない
//   4. 特殊ケース（返金・弁護士など）では自動返信せず、必ず人へ上げる
//   5. 自動返信は既定で無効
//   6. 同じ webhook が2回来ても会員へ二度送らない

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildOwnerWithdrawalNotification,
  executeLineWithdrawalIntake,
  isWithdrawalAutoReplyEnabled,
} from "./withdrawal_intake.js";
import { buildProcedureGuideMessage } from "../crm/withdrawal.js";
import { openWithdrawalService } from "../crm/withdrawal_store.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

type Sent = { text: string; userId: string };
type PushMode = "sent" | "dry_run" | "skipped";

/** 送信の記録だけ取るスタブ。実際のLINE APIは呼ばない。 */
function recorder(mode: PushMode = "sent") {
  const toMember: Sent[] = [];
  const toOwner: string[] = [];
  return {
    toMember,
    toOwner,
    sendToMember: async (text: string, userId: string) => {
      toMember.push({ text, userId });
      return { ok: true as const, mode };
    },
    notifyOwner: async (text: string) => {
      toOwner.push(text);
      return { ok: true as const, mode: "sent" as const };
    },
  };
}

const MEMBER = "line-member-0001";
const dir = await mkdtemp(path.join(tmpdir(), "flatup-wd-intake-"));

try {
  // --- 自動返信の既定は無効 -------------------------------------------------------
  assert(isWithdrawalAutoReplyEnabled({}) === false, "環境変数が無ければ自動返信しない");
  assert(
    isWithdrawalAutoReplyEnabled({ OPENQLOW_WITHDRAWAL_AUTO_REPLY: "true" }) === false,
    "DRY_RUN が既定（true相当）の間は送らない",
  );
  assert(
    isWithdrawalAutoReplyEnabled({ OPENQLOW_WITHDRAWAL_AUTO_REPLY: "true", OPENQLOW_DRY_RUN: "false" }) === true,
    "明示的に有効化＋DRY_RUN解除で初めて送る",
  );
  assert(
    isWithdrawalAutoReplyEnabled({ OPENQLOW_DRY_RUN: "false" }) === false,
    "DRY_RUN 解除だけでは送らない",
  );

  // --- 退会の話でなければ何もしない -----------------------------------------------
  {
    const r = recorder();
    const result = await executeLineWithdrawalIntake({
      text: "体験の予約をお願いします",
      lineUserId: MEMBER,
      dataDir: path.join(dir, "nope"),
      ...r,
    });
    assert(result.handled === false, "退会の話でなければ handled=false");
    assert(r.toMember.length === 0 && r.toOwner.length === 0, "何も送らない");
  }

  // --- 自動返信が無効なとき：記録はするが会員へは送らない ---------------------------
  {
    const dataDir = path.join(dir, "no-auto");
    const r = recorder();
    const result = await executeLineWithdrawalIntake({
      text: "退会したいです",
      lineUserId: MEMBER,
      messageId: "m-1",
      dataDir,
      autoReply: false,
      ...r,
    });
    assert(result.handled && result.ok, "処理される");
    assert(r.toMember.length === 0, "自動返信が無効なら会員へ送らない");
    assert(r.toOwner.length === 1, "オーナーには必ず通知する");
    assert(r.toOwner[0].includes("自動返信は無効"), "送っていないことがオーナーに分かる");

    const cases = await openWithdrawalService({ dataDir }).cases.getAll();
    assert(cases.length === 1, "台帳に1件記録される");
    assert(cases[0].currentWithdrawalStatus === "WITHDRAWAL_INQUIRY", "LINEでは退会相談どまり");
    assert(cases[0].formalReceivedAt === "", "LINEの発言だけでは正式受付にならない");
    assert(cases[0].scheduledWithdrawalDate === "", "退会予定日も決まらない");
    assert(cases[0].procedureGuidedAt === "", "送っていないので案内済みにしない");
    assert(cases[0].firstWithdrawalInquiryAt !== "", "最初の相談日時は残る");
  }

  // --- 自動返信が有効なとき：固定テンプレートだけを送る -----------------------------
  {
    const dataDir = path.join(dir, "auto");
    const r = recorder("sent");
    const result = await executeLineWithdrawalIntake({
      text: "来月で退会したいと思っています",
      lineUserId: MEMBER,
      messageId: "m-1",
      dataDir,
      autoReply: true,
      ...r,
    });
    assert(result.ok && result.meta?.guideSent === true, "案内を送った");
    assert(r.toMember.length === 1, "会員へ1通だけ");
    assert(r.toMember[0].userId === MEMBER, "本人へ送る");
    assert(r.toMember[0].text === buildProcedureGuideMessage(), "固定テンプレートそのもの（AI生成文ではない）");
    assert(r.toMember[0].text.includes("LINE・電話・メールでのご連絡のみでは正式な退会受付とはならず"), "重要事項が入る");

    const cases = await openWithdrawalService({ dataDir }).cases.getAll();
    assert(cases[0].procedureGuidedAt !== "", "送れたので案内済みになる");
    assert(cases[0].currentWithdrawalStatus === "PROCEDURE_GUIDED", "状態は手続き案内済");
    assert(cases[0].formalReceivedAt === "", "それでも正式受付にはならない");

    // 同じ webhook がもう一度届いても、会員へは二度送らない
    const again = await executeLineWithdrawalIntake({
      text: "来月で退会したいと思っています",
      lineUserId: MEMBER,
      messageId: "m-1",
      dataDir,
      autoReply: true,
      ...r,
    });
    assert(again.meta?.duplicate === true, "重複として弾く");
    assert(r.toMember.length === 1, "会員への送信は1通のまま");

    // 別メッセージで再び退会と言われても、案内は連投しない
    const third = await executeLineWithdrawalIntake({
      text: "やっぱり退会します",
      lineUserId: MEMBER,
      messageId: "m-2",
      dataDir,
      autoReply: true,
      ...r,
    });
    assert(third.ok && r.toMember.length === 1, "案内済みの相手へ連投しない");
  }

  // --- 送れなかったときは「案内済み」にしない ---------------------------------------
  {
    const dataDir = path.join(dir, "dryrun");
    const r = recorder("dry_run");
    await executeLineWithdrawalIntake({
      text: "退会したいです",
      lineUserId: MEMBER,
      messageId: "m-1",
      dataDir,
      autoReply: true,
      ...r,
    });
    const cases = await openWithdrawalService({ dataDir }).cases.getAll();
    assert(cases[0].procedureGuidedAt === "", "dry-run では案内済みにしない（送れていないので）");
    assert(cases[0].currentWithdrawalStatus === "WITHDRAWAL_INQUIRY", "状態も進めない");
  }

  // --- 特殊ケースは自動返信を止めてオーナーへ ---------------------------------------
  {
    const dataDir = path.join(dir, "escalate");
    const r = recorder("sent");
    const result = await executeLineWithdrawalIntake({
      text: "退会して返金してほしいです。弁護士にも相談しています",
      lineUserId: MEMBER,
      messageId: "m-1",
      dataDir,
      autoReply: true,
      ...r,
    });
    assert(r.toMember.length === 0, "特殊ケースでは会員へ自動返信しない");
    assert(r.toOwner.length === 1, "オーナーへ上げる");
    assert(r.toOwner[0].includes("オーナー確認が必要かもしれません"), "理由が伝わる");
    assert(r.toOwner[0].includes("返金要求"), "返金要求を検知");
    assert(r.toOwner[0].includes("弁護士・法的対応"), "法的対応を検知");
    const reasons = result.meta?.ownerReviewReasons as string[];
    assert(reasons.length >= 2, "複数の理由を返す");

    const cases = await openWithdrawalService({ dataDir }).cases.getAll();
    assert(cases[0].firstWithdrawalInquiryAt !== "", "相談日時は残す（握りつぶさない）");
    assert(cases[0].procedureGuidedAt === "", "案内は送っていない");
  }

  // --- 送信者が特定できないときも握りつぶさない -------------------------------------
  {
    const r = recorder();
    const result = await executeLineWithdrawalIntake({
      text: "退会したいです",
      lineUserId: undefined,
      dataDir: path.join(dir, "nouser"),
      ...r,
    });
    assert(result.handled && !result.ok, "処理はするが失敗として返す");
    assert(r.toOwner.length === 1, "オーナーへ通知する");
    assert(r.toOwner[0].includes("送信者を特定できませんでした"), "理由が伝わる");
    assert(r.toMember.length === 0, "誰にも送らない");
  }

  // --- オーナー通知に個人情報を載せない ---------------------------------------------
  {
    const dataDir = path.join(dir, "privacy");
    const r = recorder();
    await executeLineWithdrawalIntake({
      text: "退会したいです。電話は 090-1234-5678 です",
      lineUserId: MEMBER,
      messageId: "m-1",
      dataDir,
      autoReply: false,
      ...r,
    });
    const notification = r.toOwner[0];
    assert(!notification.includes(MEMBER), "LINE userId を通知に載せない");
    assert(!notification.includes("090-1234-5678"), "会員の発言そのものを通知に載せない");
    assert(notification.includes("退会"), "拾った言葉は載せる（判断材料として必要）");
    assert(notification.includes("FG-WD-"), "管理番号で追える");
  }

  // --- オーナー通知の文面 -------------------------------------------------------------
  {
    const escalated = buildOwnerWithdrawalNotification({
      caseId: 1,
      caseNumber: "FG-WD-2026.08.09.0001",
      keywords: ["退会"],
      ownerReviewReasons: ["返金要求"],
      guideSent: false,
      autoReplyEnabled: true,
    });
    assert(escalated.includes("自動返信は止めました"), "止めたことを明示する");
    assert(escalated.includes("withdrawal owner-review 1"), "次の操作が書いてある");

    const sent = buildOwnerWithdrawalNotification({
      caseId: 2,
      caseNumber: "FG-WD-2026.08.09.0002",
      keywords: ["休会"],
      ownerReviewReasons: [],
      guideSent: true,
      autoReplyEnabled: true,
    });
    assert(sent.includes("手続き案内を送信済み"), "送ったことが分かる");
    assert(sent.includes("正式受付になりません"), "正式受付でないことを毎回伝える");
  }

  console.log("line withdrawal intake tests passed");
} finally {
  await rm(dir, { recursive: true, force: true });
}
