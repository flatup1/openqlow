// 退会トラブルゼロ化OS v1 — ストア・監査ログ・スタッフ操作のテスト
//
// 指示書のケース7（会費ペイ未処理の警告）・ケース8（同じLINE webhookが2回来ても重複送信しない）と、
// 「誰が・いつ・何をしたか」が append-only で残ること、正式受付が自動確定することを検証する。

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildWithdrawalTimeline,
  CORRECTABLE_FIELDS,
  openWithdrawalAuditLog,
  openWithdrawalCaseStore,
  openWithdrawalService,
  WITHDRAWAL_EVENT_LABELS,
} from "./withdrawal_store.js";
import { getPaymentStopPending, toJstDate } from "./withdrawal.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function jst(dateTime: string): string {
  return new Date(`${dateTime}+09:00`).toISOString();
}

/** 時計を差し替えられるようにして、日付をテストで固定する。 */
function fixedClock(start: string): { now: () => Date; set: (iso: string) => void } {
  let current = start;
  return { now: () => new Date(current), set: iso => (current = iso) };
}

const dir = await mkdtemp(path.join(tmpdir(), "flatup-withdrawal-"));

try {
  // --- 監査ログは追記のみ ------------------------------------------------------
  {
    const logFile = path.join(dir, "audit_only.jsonl");
    const clock = fixedClock(jst("2026-08-09T11:30:00"));
    const audit = openWithdrawalAuditLog(logFile, clock.now);

    const first = await audit.append({
      caseId: 1,
      memberId: "M-001",
      eventType: "WITHDRAWAL_INQUIRY_RECEIVED",
      oldStatus: "ACTIVE",
      newStatus: "WITHDRAWAL_INQUIRY",
      actorType: "member",
      actorId: "",
      source: "LINE",
      metadata: { keywords: ["退会"] },
    });
    clock.set(jst("2026-08-09T11:32:00"));
    await audit.append({
      caseId: 1,
      memberId: "M-001",
      eventType: "PROCEDURE_GUIDE_SENT",
      oldStatus: "WITHDRAWAL_INQUIRY",
      newStatus: "PROCEDURE_GUIDED",
      actorType: "staff",
      actorId: "スタッフA",
      source: "CLI",
      metadata: {},
    });

    assert(first.id === 1, "監査ログのidは1から");
    const all = await audit.getAll();
    assert(all.length === 2, "2件とも残る");
    assert(all[0].id === 1 && all[1].id === 2, "idが連番で増える");
    assert(all[0].createdAt === jst("2026-08-09T11:30:00"), "1件目の時刻は後から変わらない");
    assert((await audit.getByCase(1)).length === 2, "ケース単位で引ける");
    assert((await audit.getByCase(99)).length === 0, "別ケースは混ざらない");

    // ファイルはJSONL（1行1件）で、既存行が書き換わっていない
    const raw = await readFile(logFile, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    assert(lines.length === 2, "JSONLとして2行");
    assert(JSON.parse(lines[0]).eventType === "WITHDRAWAL_INQUIRY_RECEIVED", "1行目は最初のイベントのまま");
    // 更新・削除のAPIが存在しないこと（過去ログを書き換える経路を作らない）
    assert(!("update" in audit), "監査ログに update は存在しない");
    assert(!("remove" in audit), "監査ログに remove は存在しない");
  }

  // --- ストアの基本 -------------------------------------------------------------
  {
    const clock = fixedClock(jst("2026-08-09T11:30:00"));
    const store = openWithdrawalCaseStore(path.join(dir, "cases_basic.json"), clock.now);
    const created = await store.create({ memberId: "M-100", lineUserId: "line-100", memberName: "テスト花子" });
    assert(created.id === 1, "idは1から");
    assert(created.caseNumber === "FG-WD-2026.08.09.0001", "管理番号が自動採番される");
    assert(created.currentWithdrawalStatus === "ACTIVE", "初期状態は在籍中");
    assert((await store.findByMemberId("M-100"))?.id === 1, "会員番号で引ける");
    assert((await store.findByLineUserId("line-100"))?.id === 1, "LINE userId で引ける");
    assert((await store.findByCaseNumber(created.caseNumber))?.id === 1, "管理番号で引ける");
    assert((await store.findByMemberId("M-999")) === undefined, "無い会員は undefined");
    // 削除APIは用意しない（退会の証跡を消せてしまうため）
    assert(!("remove" in store), "退会ケースに remove は存在しない");
  }

  // --- ケース8: 同じLINE webhookが2回来ても重複処理・重複送信しない ---------------
  {
    const clock = fixedClock(jst("2026-08-09T11:30:00"));
    const service = openWithdrawalService({ dataDir: path.join(dir, "case8"), now: clock.now });

    const first = await service.recordInquiry({
      memberId: "M-200",
      lineUserId: "line-200",
      memberName: "重複太郎",
      channel: "LINE",
      messageId: "msg-0001",
      keywords: ["退会"],
    });
    assert(first.ok && first.case, "1回目は記録される");
    assert(first.case!.currentWithdrawalStatus === "WITHDRAWAL_INQUIRY", "LINEでは退会相談どまり");
    assert(first.case!.formalReceivedAt === "", "ケース8: LINEでは正式受付にならない");

    // 同じ webhook がもう一度届く
    clock.set(jst("2026-08-09T11:30:05"));
    const second = await service.recordInquiry({
      memberId: "M-200",
      lineUserId: "line-200",
      channel: "LINE",
      messageId: "msg-0001",
      keywords: ["退会"],
    });
    assert(second.reason === "duplicate_message", "ケース8: 同じmessageIdは重複として弾く");
    assert(
      second.case!.firstWithdrawalInquiryAt === jst("2026-08-09T11:30:00"),
      "ケース8: 最初の相談日時が上書きされない",
    );
    assert((await service.cases.getAll()).length === 1, "ケース8: レコードは増えない");

    // 手続き案内も同じ messageId では二度送らない
    clock.set(jst("2026-08-09T11:32:00"));
    const guide1 = await service.markProcedureGuided({
      caseId: first.case!.id,
      messageId: "msg-0002",
      actor: { type: "system" },
    });
    assert(guide1.ok && !guide1.reason, "1回目の案内は記録される");
    assert(guide1.case!.currentWithdrawalStatus === "PROCEDURE_GUIDED", "状態が手続き案内済へ進む");

    clock.set(jst("2026-08-09T11:32:03"));
    const guide2 = await service.markProcedureGuided({
      caseId: first.case!.id,
      messageId: "msg-0002",
      actor: { type: "system" },
    });
    assert(guide2.reason === "duplicate_message", "ケース8: 同じmessageIdの案内は重複として弾く");

    // messageId が違っても、案内済みなら連投しない
    const guide3 = await service.markProcedureGuided({ caseId: first.case!.id, messageId: "msg-0003" });
    assert(guide3.reason === "already_guided", "ケース8: 案内済みの相手へ同じ文面を連投しない");
    assert(
      guide3.case!.procedureGuidedAt === jst("2026-08-09T11:32:00"),
      "ケース8: 案内日時は最初のまま",
    );

    const sentLogs = (await service.audit.getByCase(first.case!.id)).filter(
      e => e.eventType === "PROCEDURE_GUIDE_SENT",
    );
    assert(sentLogs.length === 1, "ケース8: 案内送信の監査ログは1件だけ");

    // 別のメッセージで再び退会と言われても、最初の相談日時は保持される
    clock.set(jst("2026-08-11T09:00:00"));
    const again = await service.recordInquiry({ memberId: "M-200", messageId: "msg-0009", keywords: ["退会"] });
    assert(again.reason === "already_inquired", "2度目の相談は既記録として扱う");
    assert(
      again.case!.firstWithdrawalInquiryAt === jst("2026-08-09T11:30:00"),
      "最初の意思表示日時は上書きしない",
    );
  }

  // --- 正式受付の自動確定と監査ログ ---------------------------------------------
  {
    const clock = fixedClock(jst("2026-08-09T11:30:00"));
    const service = openWithdrawalService({ dataDir: path.join(dir, "formal"), now: clock.now });
    const opened = await service.recordInquiry({
      memberId: "M-300",
      memberName: "手続太郎",
      channel: "LINE",
      keywords: ["退会"],
    });
    const caseId = opened.case!.id;

    clock.set(jst("2026-08-09T11:32:00"));
    await service.markProcedureGuided({ caseId, actor: { type: "staff", id: "スタッフA" } });

    // 退会届だけ → まだ正式受付にならない
    clock.set(jst("2026-08-18T11:00:00"));
    const form = await service.receiveWithdrawalForm({ caseId, actor: { type: "staff", id: "スタッフA" } });
    assert(form.case!.currentWithdrawalStatus === "FORM_RECEIVED", "退会届だけなら退会届受領");
    assert(form.case!.scheduledWithdrawalDate === "", "退会届だけでは退会予定日を決めない");

    // カードキーも返却 → その瞬間に正式受付が自動確定
    clock.set(jst("2026-08-18T11:05:00"));
    const key = await service.returnCardKey({ caseId, actor: { type: "staff", id: "スタッフA" } });
    assert(toJstDate(key.case!.formalReceivedAt) === "2026-08-18", "正式受付日が自動確定");
    assert(key.case!.scheduledWithdrawalDate === "2026-09-30", "退会予定日が自動計算される");
    assert(key.case!.finalMembershipMonth === "2026-09", "最終在籍月が自動設定される");
    assert(key.case!.paymentStopStatus === "pending", "会費ペイが未処理として立つ");
    assert(key.case!.currentWithdrawalStatus === "PAYMENT_STOP_PENDING", "状態は会費処理待ち");
    assert(key.case!.handledBy === "スタッフA", "担当スタッフが記録される");

    const logs = await service.audit.getByCase(caseId);
    const types = logs.map(l => l.eventType);
    for (const expected of [
      "WITHDRAWAL_INQUIRY_RECEIVED",
      "PROCEDURE_GUIDE_SENT",
      "FORM_RECEIVED",
      "CARD_KEY_RETURNED",
      "FORMAL_RECEIPT_COMPLETED",
    ]) {
      assert(types.includes(expected as never), `監査ログに ${expected} が残る`);
    }
    const formalLog = logs.find(l => l.eventType === "FORMAL_RECEIPT_COMPLETED")!;
    assert(formalLog.actorType === "system", "正式受付の確定はシステムが記録する");
    assert(formalLog.metadata.scheduledWithdrawalDate === "2026-09-30", "確定した退会予定日が根拠として残る");

    // 会費ペイ処理済みの前に退会完了はできない
    const tooEarly = await service.closeWithdrawal({ caseId });
    assert(!tooEarly.ok && tooEarly.reason === "incomplete", "条件未達では退会完了にできない");
    assert(tooEarly.message.includes("会費ペイの処理"), "未了の内容が分かる");

    // 正式受付LINEの送信を記録
    clock.set(jst("2026-08-18T11:10:00"));
    const notice = await service.markConfirmationSent({ caseId, actor: { type: "staff", id: "スタッフA" } });
    assert(notice.ok && notice.case!.withdrawalConfirmationSentAt, "正式受付LINEの送信が記録される");
    const noticeAgain = await service.markConfirmationSent({ caseId });
    assert(noticeAgain.reason === "already_sent", "正式受付LINEも重複送信しない");

    // 会費ペイ処理済み
    clock.set(jst("2026-08-18T18:00:00"));
    const paid = await service.completePaymentStop({ caseId, actor: { type: "staff", id: "スタッフB" } });
    assert(paid.ok && paid.case!.paymentStopStatus === "completed", "会費ペイが処理済になる");
    assert(paid.case!.paymentStopCompletedAt === jst("2026-08-18T18:00:00"), "処理日時が残る");
    assert(paid.case!.handledBy === "スタッフB", "押した人が残る");
    assert(paid.case!.currentWithdrawalStatus === "WITHDRAWAL_CONFIRMED", "4条件が揃い退会確定へ");

    // 退会予定日の前は完了にできない
    clock.set(jst("2026-09-01T10:00:00"));
    const notDue = await service.closeWithdrawal({ caseId });
    assert(!notDue.ok && notDue.reason === "not_due", "退会予定日の前は完了にできない");

    // 退会予定日を過ぎたら完了できる
    clock.set(jst("2026-09-30T20:00:00"));
    const closed = await service.closeWithdrawal({ caseId, actor: { type: "staff", id: "スタッフA" } });
    assert(closed.ok && closed.case!.currentWithdrawalStatus === "CLOSED", "退会完了へ");
    const closedAgain = await service.closeWithdrawal({ caseId });
    assert(closedAgain.reason === "already_closed", "二重に完了させない");

    // 時系列（オーナー確認画面）
    const timeline = buildWithdrawalTimeline(await service.audit.getByCase(caseId), {
      joinedAt: jst("2026-04-03T10:00:00"),
      sentAt: jst("2026-04-03T13:03:00"),
      confirmedAt: jst("2026-04-03T13:05:00"),
      termsVersion: "2026-08-06",
    });
    assert(timeline[0].label === "入会", "時系列の先頭は入会");
    assert(timeline[1].label === "重要事項LINE送信", "入会時の重要事項が並ぶ");
    assert(timeline[2].label === "重要事項確認", "重要事項の確認も並ぶ");
    assert(timeline[timeline.length - 1].label === "退会完了", "時系列の最後は退会完了");
    assert(timeline[0].at === "2026-04-03 10:00", "表示はJSTの読みやすい形式");
    for (let i = 1; i < timeline.length; i++) {
      assert(timeline[i - 1].atIso <= timeline[i].atIso, "時系列が昇順に並ぶ");
    }
    assert(
      timeline.some(e => e.label === "正式受付" && e.detail.includes("退会予定日 2026-09-30 確定")),
      "正式受付の行に退会予定日の確定が出る",
    );
    assert(timeline.some(e => e.detail.includes("担当: スタッフB")), "誰が操作したかが出る");
  }

  // --- ケース7: 正式受付済 × 会費ペイ未処理 → 警告 -------------------------------
  {
    const clock = fixedClock(jst("2026-08-18T11:00:00"));
    const service = openWithdrawalService({ dataDir: path.join(dir, "case7"), now: clock.now });

    // 警告に出る人: 正式受付済だが会費ペイ未処理
    const warn = await service.recordInquiry({ memberId: "M-401", memberName: "未処理さん", keywords: ["退会"] });
    await service.receiveWithdrawalForm({ caseId: warn.case!.id, actor: { type: "staff", id: "スタッフA" } });
    clock.set(jst("2026-08-18T11:05:00"));
    await service.returnCardKey({ caseId: warn.case!.id, actor: { type: "staff", id: "スタッフA" } });

    // 警告に出ない人1: まだ正式受付前
    const notFormal = await service.recordInquiry({ memberId: "M-402", memberName: "相談中さん", keywords: ["退会"] });
    await service.receiveWithdrawalForm({ caseId: notFormal.case!.id });

    // 警告に出ない人2: 会費ペイ処理済
    const done = await service.recordInquiry({ memberId: "M-403", memberName: "処理済さん", keywords: ["退会"] });
    await service.receiveWithdrawalForm({ caseId: done.case!.id });
    await service.returnCardKey({ caseId: done.case!.id });
    await service.completePaymentStop({ caseId: done.case!.id, actor: { type: "staff", id: "スタッフB" } });

    const pending = getPaymentStopPending(await service.cases.getAll());
    assert(pending.length === 1, "ケース7: 警告は1件だけ");
    assert(pending[0].memberName === "未処理さん", "ケース7: 正式受付済かつ会費ペイ未処理の人だけ出る");
    assert(pending[0].formalReceivedAt !== "", "ケース7: 正式受付日が表示できる");
    assert(pending[0].scheduledWithdrawalDate === "2026-09-30", "ケース7: 退会予定日が表示できる");

    // 正式受付の前に会費ペイ処理済みにはできない（順序を守らせる）
    const early = await service.completePaymentStop({ caseId: notFormal.case!.id });
    assert(!early.ok && early.reason === "not_formal", "正式受付前に会費ペイを処理済みにできない");
    // 正式受付の前に正式受付LINEも送れない
    const earlyNotice = await service.markConfirmationSent({ caseId: notFormal.case!.id });
    assert(!earlyNotice.ok && earlyNotice.reason === "not_formal", "正式受付前に受付LINEは送れない");
  }

  // --- オーナー確認 ---------------------------------------------------------------
  {
    const clock = fixedClock(jst("2026-08-18T11:00:00"));
    const service = openWithdrawalService({ dataDir: path.join(dir, "owner"), now: clock.now });
    const opened = await service.recordInquiry({ memberId: "M-500", memberName: "特殊さん", keywords: ["退会"] });
    const caseId = opened.case!.id;

    const noReason = await service.requestOwnerReview({ caseId, reason: "  " });
    assert(!noReason.ok && noReason.reason === "no_reason", "理由なしではオーナー確認へ回せない");

    const escalated = await service.requestOwnerReview({
      caseId,
      reason: "返金要求あり",
      actor: { type: "staff", id: "スタッフA" },
    });
    assert(escalated.ok, "オーナー確認へ回せる");
    assert(escalated.case!.currentWithdrawalStatus === "OWNER_REVIEW_REQUIRED", "状態がオーナー確認になる");
    assert(escalated.case!.ownerReviewReason === "返金要求あり", "理由が残る");

    // 解除はオーナーだけ
    const byStaff = await service.resolveOwnerReview({
      caseId,
      note: "確認しました",
      actor: { type: "staff", id: "スタッフA" },
    });
    assert(!byStaff.ok && byStaff.reason === "forbidden", "スタッフはオーナー確認を解除できない");

    const resolved = await service.resolveOwnerReview({
      caseId,
      note: "規定どおり対応と判断",
      actor: { type: "owner", id: "JIN" },
    });
    assert(resolved.ok && resolved.case!.ownerReviewRequired === 0, "オーナーは解除できる");
    const resolveLog = (await service.audit.getByCase(caseId)).find(l => l.eventType === "OWNER_REVIEW_RESOLVED")!;
    assert(resolveLog.metadata.previousReason === "返金要求あり", "解除前の理由も証跡に残る");
  }

  // --- 管理者修正（権限＋理由＋監査ログ） -----------------------------------------
  {
    const clock = fixedClock(jst("2026-08-18T11:00:00"));
    const service = openWithdrawalService({ dataDir: path.join(dir, "correct"), now: clock.now });
    const opened = await service.recordInquiry({ memberId: "M-600", memberName: "修正さん", keywords: ["退会"] });
    const caseId = opened.case!.id;
    await service.receiveWithdrawalForm({ caseId, at: jst("2026-08-18T11:00:00") });
    await service.returnCardKey({ caseId, at: jst("2026-08-18T11:00:00") });

    const byStaff = await service.adminCorrect({
      caseId,
      field: "cardKeyReturnedAt",
      value: jst("2026-09-01T10:00:00"),
      reason: "実際は9/1",
      actor: { type: "staff", id: "スタッフA" },
    });
    assert(!byStaff.ok && byStaff.reason === "forbidden", "スタッフは修正できない");

    const noReason = await service.adminCorrect({
      caseId,
      field: "cardKeyReturnedAt",
      value: jst("2026-09-01T10:00:00"),
      reason: "",
      actor: { type: "owner", id: "JIN" },
    });
    assert(!noReason.ok && noReason.reason === "no_reason", "理由なしでは修正できない");

    // 退会予定日そのものは修正対象にできない（自動計算の結果だから）
    assert(!CORRECTABLE_FIELDS.includes("scheduledWithdrawalDate" as never), "退会予定日は修正対象外");
    assert(!CORRECTABLE_FIELDS.includes("formalReceivedAt" as never), "正式受付日は修正対象外");
    const badField = await service.adminCorrect({
      caseId,
      field: "scheduledWithdrawalDate" as never,
      value: "2027-01-31",
      reason: "手で直したい",
      actor: { type: "owner", id: "JIN" },
    });
    assert(!badField.ok && badField.reason === "not_correctable", "退会予定日の直接入力は拒否される");

    // 元の日付を直すと、退会予定日が正しく再計算される
    const fixed = await service.adminCorrect({
      caseId,
      field: "cardKeyReturnedAt",
      value: jst("2026-09-01T10:00:00"),
      reason: "返却日の記録間違い（実際は9/1）",
      actor: { type: "owner", id: "JIN" },
    });
    assert(fixed.ok, "オーナー＋理由ありなら修正できる");
    assert(toJstDate(fixed.case!.formalReceivedAt) === "2026-09-01", "正式受付日が再計算される");
    assert(fixed.case!.scheduledWithdrawalDate === "2026-10-31", "退会予定日が再計算される");
    assert(fixed.case!.finalMembershipMonth === "2026-10", "最終在籍月も再計算される");

    const log = (await service.audit.getByCase(caseId)).find(l => l.eventType === "ADMIN_CORRECTION")!;
    assert(log.actorType === "owner" && log.actorId === "JIN", "誰が修正したか残る");
    assert(log.metadata.reason === "返却日の記録間違い（実際は9/1）", "変更理由が残る");
    assert(log.metadata.before === jst("2026-08-18T11:00:00"), "変更前の値が残る");
    assert(log.metadata.after === jst("2026-09-01T10:00:00"), "変更後の値が残る");
  }

  // --- 個人情報を監査ログへ書きすぎない -------------------------------------------
  {
    const clock = fixedClock(jst("2026-08-18T11:00:00"));
    const service = openWithdrawalService({ dataDir: path.join(dir, "privacy"), now: clock.now });
    await service.recordInquiry({
      memberId: "M-700",
      lineUserId: "line-700",
      channel: "LINE",
      messageId: "msg-700",
      keywords: ["退会"],
    });
    const logs = await service.audit.getAll();
    const dumped = JSON.stringify(logs);
    assert(!dumped.includes("line-700"), "LINE userId は監査ログへ書かない");
    assert(dumped.includes("退会"), "拾った言葉だけは残す（判断根拠として必要）");
  }

  // --- イベント表示名 -------------------------------------------------------------
  assert(WITHDRAWAL_EVENT_LABELS.FORMAL_RECEIPT_COMPLETED === "正式受付", "イベントの日本語表示");
  assert(WITHDRAWAL_EVENT_LABELS.PAYMENT_STOP_COMPLETED === "会費ペイ処理済", "会費ペイの日本語表示");

  console.log("withdrawal store tests passed");
} finally {
  await rm(dir, { recursive: true, force: true });
}
