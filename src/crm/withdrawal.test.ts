// 退会トラブルゼロ化OS v1 — ドメインのテスト
//
// 指示書のケース1〜6・9・10（日付計算・正式受付判定・状態導出・検知・文面）を検証する。
// ケース7（会費ペイ未処理の警告）・8（LINE重複）は withdrawal_store.test.ts。

import {
  applyFormalReceipt,
  buildFormalReceiptMessage,
  buildProcedureGuideMessage,
  buildWithdrawalClosedMessage,
  calcFinalMembershipMonth,
  calcFormalReceivedAt,
  calcScheduledWithdrawalDate,
  canTransition,
  detectOwnerReviewSignals,
  detectWithdrawalIntent,
  deriveWithdrawalStatus,
  formatCaseNumber,
  formatJapaneseDate,
  formatJapaneseMonth,
  getConfirmationNotSent,
  getOwnerReviewRequired,
  getPaymentStopPending,
  getReadyToClose,
  isFormalReceiptComplete,
  isScheduledDateReached,
  isWithdrawalConfirmed,
  missingForClose,
  normalizeWithdrawalCaseInput,
  toJstDate,
  WITHDRAWAL_STATUSES,
  WITHDRAWAL_STATUS_LABELS,
  withdrawalStatusLabel,
  type WithdrawalCase,
  type WithdrawalCaseInput,
} from "./withdrawal.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

/** テスト用の退会ケースを作る（既定値はすべて未記録＝在籍中）。 */
function makeCase(input: WithdrawalCaseInput & { id?: number } = {}): WithdrawalCase {
  const base = {
    id: input.id ?? 1,
    ...normalizeWithdrawalCaseInput(input),
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
  return { ...base, currentWithdrawalStatus: deriveWithdrawalStatus(base) };
}

/** JSTの日時をISOで書くための小道具（+09:00 を明示して読みやすくする）。 */
function jst(dateTime: string): string {
  return new Date(`${dateTime}+09:00`).toISOString();
}

// --- 状態の定義 ---------------------------------------------------------------
assert(WITHDRAWAL_STATUSES.length === 11, "状態は11種類");
assert(WITHDRAWAL_STATUS_LABELS.ACTIVE === "在籍中", "ACTIVE = 在籍中");
assert(WITHDRAWAL_STATUS_LABELS.FORM_AND_KEY_RECEIVED === "正式受付", "FORM_AND_KEY_RECEIVED = 正式受付");
assert(WITHDRAWAL_STATUS_LABELS.PAYMENT_STOP_PENDING === "会費処理待ち", "PAYMENT_STOP_PENDING = 会費処理待ち");
assert(WITHDRAWAL_STATUS_LABELS.OWNER_REVIEW_REQUIRED === "オーナー確認", "OWNER_REVIEW_REQUIRED = オーナー確認");
assert(withdrawalStatusLabel("CLOSED") === "退会完了", "CLOSED = 退会完了");
assert(withdrawalStatusLabel("UNKNOWN_CODE") === "UNKNOWN_CODE", "未知コードは消さずそのまま出す");

// --- 状態遷移のガード ---------------------------------------------------------
assert(canTransition("ACTIVE", "WITHDRAWAL_INQUIRY"), "在籍中 → 退会相談 は許可");
assert(!canTransition("ACTIVE", "FORM_AND_KEY_RECEIVED"), "在籍中から正式受付への飛び越しは禁止");
assert(!canTransition("WITHDRAWAL_INQUIRY", "CLOSED"), "退会相談から退会完了への飛び越しは禁止");
assert(!canTransition("FORM_RECEIVED", "PAYMENT_STOPPED"), "退会届だけで会費処理済へは進めない");
assert(canTransition("FORM_RECEIVED", "FORM_AND_KEY_RECEIVED"), "退会届 → 正式受付 は許可");
assert(canTransition("KEY_RETURNED", "FORM_AND_KEY_RECEIVED"), "カードキー → 正式受付 は許可");
assert(canTransition("PROCEDURE_GUIDED", "OWNER_REVIEW_REQUIRED"), "どこからでもオーナー確認へは退避できる");
assert(canTransition("OWNER_REVIEW_REQUIRED", "FORM_RECEIVED"), "オーナー確認からは復帰できる");
assert(!canTransition("OWNER_REVIEW_REQUIRED", "CLOSED"), "オーナー確認から直接退会完了にはしない");
assert(!canTransition("CLOSED", "ACTIVE"), "退会完了は後から書き換えない");
assert(canTransition("FORM_RECEIVED", "FORM_RECEIVED"), "同じ状態への再操作は許す");

// --- 退会日の計算（ケース9・10を含む） -----------------------------------------
assert(calcScheduledWithdrawalDate("2026-08-01") === "2026-09-30", "8/1 → 9/30");
assert(calcScheduledWithdrawalDate("2026-08-15") === "2026-09-30", "8/15 → 9/30");
assert(calcScheduledWithdrawalDate("2026-08-31") === "2026-09-30", "8/31 → 9/30（月末でも翌月末）");
assert(calcScheduledWithdrawalDate("2026-09-01") === "2026-10-31", "9/1 → 10/31");
// ケース9: 12月正式受付 → 翌年1月末
assert(calcScheduledWithdrawalDate("2026-12-15") === "2027-01-31", "ケース9: 12/15 → 翌年1/31");
assert(calcScheduledWithdrawalDate("2026-12-31") === "2027-01-31", "12/31 → 翌年1/31");
assert(calcScheduledWithdrawalDate("2026-11-30") === "2026-12-31", "11/30 → 12/31");
// ケース10: 2月・うるう年
assert(calcScheduledWithdrawalDate("2027-01-10") === "2027-02-28", "ケース10: 平年の2月は28日");
assert(calcScheduledWithdrawalDate("2028-01-15") === "2028-02-29", "ケース10: うるう年の2月は29日");
assert(calcScheduledWithdrawalDate("2028-01-31") === "2028-02-29", "うるう年・月末起算");
assert(calcScheduledWithdrawalDate("2100-01-05") === "2100-02-28", "2100年は うるう年ではない");
assert(calcScheduledWithdrawalDate("2000-01-05") === "2000-02-29", "2000年は うるう年");
assert(calcScheduledWithdrawalDate("2026-04-10") === "2026-05-31", "30日月起算 → 31日月末");
assert(calcScheduledWithdrawalDate("") === "", "空入力は空を返す（勝手に日付を作らない）");
assert(calcScheduledWithdrawalDate("ぴよぴよ") === "", "不正入力は空を返す");

// 日時（ISO）でも同じ結果になり、JSTで判断される
assert(calcScheduledWithdrawalDate(jst("2026-08-31T23:30:00")) === "2026-09-30", "JST 8/31 深夜も 9/30");
// UTCだと 9/1 になる瞬間でも、JSTでは 9/1 なので 10/31（TZで1か月ずれない）
assert(toJstDate("2026-08-31T15:30:00.000Z") === "2026-09-01", "UTC 8/31 15:30 は JST 9/1");
assert(calcScheduledWithdrawalDate("2026-08-31T15:30:00.000Z") === "2026-10-31", "JST基準で 9/1 起算 → 10/31");

// --- 最終在籍月 ---------------------------------------------------------------
assert(calcFinalMembershipMonth("2026-09-30") === "2026-09", "退会予定日 9/30 → 最終在籍月 2026-09");
assert(calcFinalMembershipMonth("2027-01-31") === "2027-01", "年跨ぎの最終在籍月");
assert(calcFinalMembershipMonth("") === "", "空入力は空");

// --- 表示フォーマット ---------------------------------------------------------
assert(formatJapaneseDate("2026-09-30") === "2026年09月30日", "日本語日付");
assert(formatJapaneseMonth("2026-09") === "2026年09月", "日本語年月");
assert(formatJapaneseDate("") === "", "空は空");
assert(formatCaseNumber(1, new Date(jst("2026-08-18T10:00:00"))) === "FG-WD-2026.08.18.0001", "管理番号の形式");
// 電話番号と誤検出されないよう、ハイフンで数字を繋がない形にしている
assert(!/\d{8}-\d{4}/.test(formatCaseNumber(1, new Date(jst("2026-08-18T10:00:00")))), "管理番号は電話番号形にしない");

// --- 正式受付の判定 -----------------------------------------------------------

// ケース1: 退会届 8/10 / キー返却 8/10 → 正式受付 8/10 → 退会日 9/30
{
  const rec = applyFormalReceipt(
    makeCase({
      withdrawalFormReceivedAt: jst("2026-08-10T11:00:00"),
      cardKeyReturnedAt: jst("2026-08-10T15:00:00"),
    }),
  );
  assert(toJstDate(rec.formalReceivedAt) === "2026-08-10", "ケース1: 正式受付日は 8/10");
  assert(rec.scheduledWithdrawalDate === "2026-09-30", "ケース1: 退会日は 9/30");
  assert(rec.finalMembershipMonth === "2026-09", "ケース1: 最終在籍月は 2026-09");
  assert(rec.paymentStopStatus === "pending", "ケース1: 正式受付と同時に会費ペイが未処理になる");
  assert(deriveWithdrawalStatus(rec) === "PAYMENT_STOP_PENDING", "ケース1: 状態は会費処理待ち");
}

// ケース2: 退会届 8/10 / キー返却 8/20 → 正式受付 8/20（遅いほう）→ 退会日 9/30
{
  const rec = applyFormalReceipt(
    makeCase({
      withdrawalFormReceivedAt: jst("2026-08-10T11:00:00"),
      cardKeyReturnedAt: jst("2026-08-20T11:00:00"),
    }),
  );
  assert(toJstDate(rec.formalReceivedAt) === "2026-08-20", "ケース2: 正式受付日は遅いほうの 8/20");
  assert(rec.scheduledWithdrawalDate === "2026-09-30", "ケース2: 退会日は 9/30");
}

// ケース3: 退会届 8/31 / キー返却 9/1 → 正式受付 9/1 → 退会日 10/31
{
  const rec = applyFormalReceipt(
    makeCase({
      withdrawalFormReceivedAt: jst("2026-08-31T20:00:00"),
      cardKeyReturnedAt: jst("2026-09-01T10:00:00"),
    }),
  );
  assert(toJstDate(rec.formalReceivedAt) === "2026-09-01", "ケース3: 正式受付日は 9/1");
  assert(rec.scheduledWithdrawalDate === "2026-10-31", "ケース3: 退会日は 10/31（月をまたぐ）");
  assert(rec.finalMembershipMonth === "2026-10", "ケース3: 最終在籍月は 2026-10");
}

// 逆順（カードキーが先・退会届が後）でも「遅いほう」になる
{
  const rec = applyFormalReceipt(
    makeCase({
      withdrawalFormReceivedAt: jst("2026-09-01T10:00:00"),
      cardKeyReturnedAt: jst("2026-08-31T20:00:00"),
    }),
  );
  assert(toJstDate(rec.formalReceivedAt) === "2026-09-01", "順序が逆でも遅いほうが正式受付日");
}

// ケース4: LINEで退会と言っただけ → 正式受付にならない
{
  const rec = makeCase({
    firstWithdrawalInquiryAt: jst("2026-08-09T11:30:00"),
    withdrawalInquiryChannel: "LINE",
  });
  assert(!isFormalReceiptComplete(rec), "ケース4: LINEだけでは正式受付にならない");
  assert(calcFormalReceivedAt(rec) === "", "ケース4: 正式受付日は付かない");
  assert(deriveWithdrawalStatus(rec) === "WITHDRAWAL_INQUIRY", "ケース4: 状態は退会相談どまり");
  const after = applyFormalReceipt(rec);
  assert(after.scheduledWithdrawalDate === "", "ケース4: 退会予定日は決まらない");
}

// ケース5: 退会届のみ → 正式受付にならない
{
  const rec = makeCase({
    procedureGuidedAt: jst("2026-08-09T11:32:00"),
    withdrawalFormReceivedAt: jst("2026-08-18T11:00:00"),
  });
  assert(!isFormalReceiptComplete(rec), "ケース5: 退会届だけでは正式受付にならない");
  assert(deriveWithdrawalStatus(rec) === "FORM_RECEIVED", "ケース5: 状態は退会届受領");
  assert(applyFormalReceipt(rec).formalReceivedAt === "", "ケース5: 正式受付日は空のまま");
}

// ケース6: カードキーのみ → 正式受付にならない
{
  const rec = makeCase({ cardKeyReturnedAt: jst("2026-08-18T11:00:00") });
  assert(!isFormalReceiptComplete(rec), "ケース6: カードキーだけでは正式受付にならない");
  assert(deriveWithdrawalStatus(rec) === "KEY_RETURNED", "ケース6: 状態はカードキー返却済");
  assert(applyFormalReceipt(rec).formalReceivedAt === "", "ケース6: 正式受付日は空のまま");
}

// --- 状態の導出 ---------------------------------------------------------------
assert(deriveWithdrawalStatus(makeCase()) === "ACTIVE", "何も無ければ在籍中");
assert(
  deriveWithdrawalStatus(makeCase({ procedureGuidedAt: jst("2026-08-09T11:32:00") })) === "PROCEDURE_GUIDED",
  "案内済みなら手続き案内済",
);
{
  const formal = applyFormalReceipt(
    makeCase({
      withdrawalFormReceivedAt: jst("2026-08-18T11:00:00"),
      cardKeyReturnedAt: jst("2026-08-18T11:05:00"),
    }),
  );
  assert(deriveWithdrawalStatus({ ...formal, paymentStopStatus: "" }) === "FORM_AND_KEY_RECEIVED", "正式受付");
  const paid = { ...formal, paymentStopStatus: "completed" as const, paymentStopCompletedAt: jst("2026-08-18T18:00:00") };
  assert(deriveWithdrawalStatus(paid) === "PAYMENT_STOPPED", "会費処理済");
  const confirmed = { ...paid, withdrawalConfirmationSentAt: jst("2026-08-18T18:05:00") };
  assert(deriveWithdrawalStatus(confirmed) === "WITHDRAWAL_CONFIRMED", "4条件が揃えば退会確定");
  assert(isWithdrawalConfirmed(confirmed), "退会確定の判定");
  assert(missingForClose(confirmed).length === 0, "未了なし");
  assert(deriveWithdrawalStatus({ ...confirmed, closedAt: jst("2026-09-30T20:00:00") }) === "CLOSED", "退会完了");
  // オーナー確認は完了以外のすべてに優先する
  assert(deriveWithdrawalStatus({ ...confirmed, ownerReviewRequired: 1 }) === "OWNER_REVIEW_REQUIRED", "オーナー確認が優先");
  assert(
    deriveWithdrawalStatus({ ...confirmed, ownerReviewRequired: 1, closedAt: jst("2026-09-30T20:00:00") }) === "CLOSED",
    "完了はオーナー確認より優先",
  );
  // 退会予定日の到来判定
  assert(!isScheduledDateReached(confirmed, new Date(jst("2026-09-29T23:00:00"))), "前日はまだ到来していない");
  assert(isScheduledDateReached(confirmed, new Date(jst("2026-09-30T00:30:00"))), "当日は到来");
  assert(isScheduledDateReached(confirmed, new Date(jst("2026-10-01T09:00:00"))), "翌日も到来");
}

// 未了リスト（スタッフ画面にそのまま出す文言）
{
  const rec = makeCase({ firstWithdrawalInquiryAt: jst("2026-08-09T11:30:00") });
  const missing = missingForClose(rec);
  assert(missing.includes("正式受付（退会届＋カードキー）"), "未了に正式受付が出る");
  assert(missing.includes("会費ペイの処理"), "未了に会費ペイが出る");
  assert(missing.includes("正式受付のLINE送信"), "未了に正式受付LINEが出る");
}

// --- 処理漏れの抽出（ケース7の判定部分） ---------------------------------------
{
  const formal = applyFormalReceipt(
    makeCase({
      memberName: "テスト太郎",
      withdrawalFormReceivedAt: jst("2026-08-18T11:00:00"),
      cardKeyReturnedAt: jst("2026-08-18T11:05:00"),
    }),
  );
  const done = {
    ...formal,
    id: 2,
    paymentStopStatus: "completed" as const,
    paymentStopCompletedAt: jst("2026-08-18T18:00:00"),
    withdrawalConfirmationSentAt: jst("2026-08-18T18:05:00"),
  };
  const notFormal = makeCase({ id: 3, firstWithdrawalInquiryAt: jst("2026-08-09T11:30:00") });

  const pending = getPaymentStopPending([formal, done, notFormal]);
  assert(pending.length === 1 && pending[0].id === formal.id, "ケース7: 正式受付済で会費ペイ未処理だけが警告対象");

  const notSent = getConfirmationNotSent([formal, done, notFormal]);
  assert(notSent.length === 1 && notSent[0].id === formal.id, "正式受付LINE未送信を検知");

  // 退会完了済みは警告に出さない（いつまでも消えないと警告が意味を失う）
  const closed = { ...formal, id: 4, closedAt: jst("2026-09-30T20:00:00") };
  assert(getPaymentStopPending([closed]).length === 0, "退会完了済みは会費ペイ警告に出さない");
  // 対象外（会費ペイを使っていない会員）も出さない
  assert(getPaymentStopPending([{ ...formal, paymentStopStatus: "not_applicable" }]).length === 0, "対象外は警告外");

  assert(getOwnerReviewRequired([{ ...formal, ownerReviewRequired: 1 }]).length === 1, "オーナー確認の抽出");
  assert(getReadyToClose([done], new Date(jst("2026-09-30T10:00:00"))).length === 1, "退会予定日到来で完了候補");
  assert(getReadyToClose([done], new Date(jst("2026-09-01T10:00:00"))).length === 0, "到来前は完了候補に出さない");
  assert(getReadyToClose([formal], new Date(jst("2026-10-30T10:00:00"))).length === 0, "条件未達は完了候補に出さない");
}

// --- 退会・休会の言葉の検知 -----------------------------------------------------
for (const word of ["退会", "辞めたい", "やめたい", "辞めます", "解約", "退会したい"]) {
  assert(detectWithdrawalIntent(word).matched, `「${word}」を拾える`);
  assert(detectWithdrawalIntent(word).kind === "withdrawal", `「${word}」は退会寄り`);
}
for (const word of ["休会", "休みたい"]) {
  assert(detectWithdrawalIntent(word).matched, `「${word}」を拾える`);
  assert(detectWithdrawalIntent(word).kind === "suspension", `「${word}」は休会寄り`);
}
// 完全一致に依存しない（文の一部でも拾う）
assert(detectWithdrawalIntent("すみません、来月で退会したいと思っています").matched, "文中でも拾う");
assert(detectWithdrawalIntent("仕事が忙しくてやめようと考えています").matched, "言い回しが違っても拾う");
assert(detectWithdrawalIntent("退会したいのですが休会もできますか").kind === "withdrawal", "両方あれば退会優先");
assert(detectWithdrawalIntent("").matched === false, "空文字は拾わない");
assert(detectWithdrawalIntent("体験の予約をお願いします").matched === false, "関係ない文は拾わない");
assert(detectWithdrawalIntent("料金を教えてください").matched === false, "料金の質問は拾わない");
assert(detectWithdrawalIntent("退会").keywords.includes("退会"), "拾った言葉を返す");

// --- オーナー確認が必要な特殊ケースの検知 ---------------------------------------
{
  const cases: Array<[string, string]> = [
    ["返金してほしいです", "返金要求"],
    ["聞いていません", "説明を受けていない主張"],
    ["消費生活センターに相談します", "消費生活センター"],
    ["弁護士に相談しました", "弁護士・法的対応"],
    ["口コミに書きます", "SNS・レビュー投稿"],
    ["入院することになりました", "入院・長期療養"],
    ["海外へ転居します", "海外転居・遠方転居"],
    ["カードキーをなくしてしまいました", "カードキー紛失"],
    ["母の代理で連絡しています", "本人死亡・代理人"],
  ];
  for (const [text, expected] of cases) {
    const signals = detectOwnerReviewSignals(text);
    assert(signals.some(s => s.reason === expected), `「${text}」→ ${expected} を検知`);
  }
  assert(detectOwnerReviewSignals("退会したいです").length === 0, "普通の退会相談は特殊ケースにしない");
  assert(detectOwnerReviewSignals("").length === 0, "空文字は検知しない");
}

// --- LINE文面 -------------------------------------------------------------------
{
  const guide = buildProcedureGuideMessage();
  assert(guide.includes("ありがとうございます"), "案内文は感謝から始まる");
  assert(guide.includes("正式なお手続きをいただいた日の翌月末"), "翌月末退会を明記");
  assert(guide.includes("LINE・電話・メールでのご連絡のみでは正式な退会受付とはならず"), "LINEだけでは受付不可を明記");
  assert(guide.includes("・退会届へのご記入"), "退会届を明記");
  assert(guide.includes("・カードキーのご返却"), "カードキー返却を明記");
  assert(guide.includes("遠慮なくお尋ねください"), "威圧しない締め");
  // 引き止め・脅し文句が入っていないこと（FLATUPらしさを壊さない）
  for (const ng of ["できません", "認められません", "違約", "ペナルティ"]) {
    assert(!guide.includes(ng), `案内文に強い言葉「${ng}」を入れない`);
  }
}
{
  const notice = buildFormalReceiptMessage({
    formalReceivedAt: jst("2026-08-18T11:05:00"),
    scheduledWithdrawalDate: "2026-09-30",
    finalMembershipMonth: "2026-09",
  });
  assert(notice.includes("2026年08月18日"), "正式受付日をDB値から差し込む");
  assert(notice.includes("2026年09月30日"), "退会予定日をDB値から差し込む");
  assert(notice.includes("2026年09月"), "最終在籍月をDB値から差し込む");
  assert(notice.includes("退会予定日までは通常どおりジムをご利用いただけます"), "利用可能期間を明示");
  assert(notice.includes("本当にありがとうございます"), "感謝を伝える");
}
{
  const closed = buildWithdrawalClosedMessage({ scheduledWithdrawalDate: "2026-09-30" });
  assert(closed.includes("【退会日】"), "退会完了文に退会日");
  assert(closed.includes("2026年09月30日"), "退会日をDB値から差し込む");
  assert(closed.includes("いつでもお気軽にご連絡ください"), "再訪を歓迎する締め");
}

// --- 入力の正規化 ---------------------------------------------------------------
{
  const normalized = normalizeWithdrawalCaseInput({
    memberId: "M-001",
    prospectId: "12" as unknown as number,
    ownerReviewRequired: true as unknown as 0 | 1,
    currentWithdrawalStatus: "デタラメ" as never,
    paymentStopStatus: "デタラメ" as never,
    // 未知キーは無視される
    ...({ unknownField: "x" } as Record<string, unknown>),
  });
  assert(normalized.prospectId === 12, "数値へ正規化");
  assert(normalized.ownerReviewRequired === 1, "0/1 へ正規化");
  assert(normalized.currentWithdrawalStatus === "ACTIVE", "不正な状態は ACTIVE に落とす（自由入力を通さない）");
  assert(normalized.paymentStopStatus === "", "不正な会費ペイ状態は空に落とす");
  assert(!("unknownField" in normalized), "未知キーは取り込まない");
}

console.log("withdrawal domain tests passed");
