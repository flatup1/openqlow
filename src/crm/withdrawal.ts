// FLATUP 退会トラブルゼロ化OS v1 — 純粋ドメイン（状態・日付・判定・文面）
//
// 目的は「退会を難しくすること」ではない。正しく退会でき、退会日を勘違いされず、
// スタッフごとに対応が変わらず、処理漏れが残らず、証拠が残る状態を作る。
//
// このファイルは I/O を一切持たない（保存は withdrawal_store.ts）。
// prospect.ts / store.ts / guardian_consent.ts は変更していない（既存の名簿と同意履歴を壊さないため）。
//
// 設計上の要:
//   1. formal_received_at = max(退会届の受領日時, カードキーの返却日時)。片方だけでは絶対に成立しない。
//   2. 退会日は「正式受付日の翌月末」。スタッフもAIも手入力しない（calcScheduledWithdrawalDate が唯一の出所）。
//   3. 状態はスタッフが選ぶのではなく、事実（日時）から導出する（deriveWithdrawalStatus）。
//      「退会届が無いのに正式受付」という状態は、そもそも表現できない。
//
// 料金・住所・スケジュールなどの具体値はここに書かない（正本は src/shared/canon.ts）。

// --- 状態 ---------------------------------------------------------------------

/** 退会の内部状態。自由入力は禁止（この11種のみ）。 */
export type WithdrawalStatus =
  | "ACTIVE"
  | "WITHDRAWAL_INQUIRY"
  | "PROCEDURE_GUIDED"
  | "FORM_RECEIVED"
  | "KEY_RETURNED"
  | "FORM_AND_KEY_RECEIVED"
  | "PAYMENT_STOP_PENDING"
  | "PAYMENT_STOPPED"
  | "WITHDRAWAL_CONFIRMED"
  | "CLOSED"
  | "OWNER_REVIEW_REQUIRED";

export const WITHDRAWAL_STATUSES: WithdrawalStatus[] = [
  "ACTIVE",
  "WITHDRAWAL_INQUIRY",
  "PROCEDURE_GUIDED",
  "FORM_RECEIVED",
  "KEY_RETURNED",
  "FORM_AND_KEY_RECEIVED",
  "PAYMENT_STOP_PENDING",
  "PAYMENT_STOPPED",
  "WITHDRAWAL_CONFIRMED",
  "CLOSED",
  "OWNER_REVIEW_REQUIRED",
];

/** 画面・帳票に出す日本語表示。内部コードと1対1で対応させる。 */
export const WITHDRAWAL_STATUS_LABELS: Readonly<Record<WithdrawalStatus, string>> = {
  ACTIVE: "在籍中",
  WITHDRAWAL_INQUIRY: "退会相談",
  PROCEDURE_GUIDED: "手続き案内済",
  FORM_RECEIVED: "退会届受領",
  KEY_RETURNED: "カードキー返却済",
  FORM_AND_KEY_RECEIVED: "正式受付",
  PAYMENT_STOP_PENDING: "会費処理待ち",
  PAYMENT_STOPPED: "会費処理済",
  WITHDRAWAL_CONFIRMED: "退会確定",
  CLOSED: "退会完了",
  OWNER_REVIEW_REQUIRED: "オーナー確認",
};

/** 内部コードを日本語表示にする。未知コードはそのまま返す（表示が消えるほうが危険なため）。 */
export function withdrawalStatusLabel(status: string): string {
  return WITHDRAWAL_STATUS_LABELS[status as WithdrawalStatus] ?? status;
}

/**
 * 正規の遷移先。ここに無い遷移は「飛び越し」として拒否する。
 * OWNER_REVIEW_REQUIRED への退避と復帰は canTransition() で別途扱う。
 */
const ALLOWED_TRANSITIONS: Readonly<Record<WithdrawalStatus, readonly WithdrawalStatus[]>> = {
  ACTIVE: ["WITHDRAWAL_INQUIRY"],
  // 案内前に来館して退会届を出す会員は実在するので、案内を飛ばす経路も正規とする。
  WITHDRAWAL_INQUIRY: ["PROCEDURE_GUIDED", "FORM_RECEIVED", "KEY_RETURNED", "FORM_AND_KEY_RECEIVED", "PAYMENT_STOP_PENDING"],
  PROCEDURE_GUIDED: ["FORM_RECEIVED", "KEY_RETURNED", "FORM_AND_KEY_RECEIVED", "PAYMENT_STOP_PENDING"],
  // 2つ目が揃うと「正式受付」と「会費ペイ待ち」が同時に立つため、PAYMENT_STOP_PENDING へ直接進む。
  // FORM_AND_KEY_RECEIVED で止まるのは会費ペイ対象外（not_applicable）の会員だけ。
  FORM_RECEIVED: ["FORM_AND_KEY_RECEIVED", "PAYMENT_STOP_PENDING"],
  KEY_RETURNED: ["FORM_AND_KEY_RECEIVED", "PAYMENT_STOP_PENDING"],
  FORM_AND_KEY_RECEIVED: ["PAYMENT_STOP_PENDING", "PAYMENT_STOPPED", "WITHDRAWAL_CONFIRMED"],
  // 正式受付LINEを先に送っておくと、会費ペイ処理済の瞬間に4条件が揃って退会確定になる。
  PAYMENT_STOP_PENDING: ["PAYMENT_STOPPED", "WITHDRAWAL_CONFIRMED"],
  PAYMENT_STOPPED: ["WITHDRAWAL_CONFIRMED"],
  WITHDRAWAL_CONFIRMED: ["CLOSED"],
  CLOSED: [],
  // 復帰先は canTransition() 側で判定する（オーナーが状況を見て戻すため、ここでは列挙しない）
  OWNER_REVIEW_REQUIRED: [],
};

/**
 * その遷移を許すか。
 *
 * - 同じ状態への遷移は常に許す（再操作を弾いても事故が減らないため）。
 * - どの状態からでも OWNER_REVIEW_REQUIRED へは退避できる（CLOSED を除く）。
 *   特殊ケースを「行き場が無いから握りつぶす」ほうがトラブルになる。
 * - OWNER_REVIEW_REQUIRED からは CLOSED 以外へ復帰できる（オーナー判断＋理由必須は呼び出し側で担保）。
 * - CLOSED からは動かさない（完了を後から書き換えない）。
 *
 * 注意: 状態は事実から導出される（deriveWithdrawalStatus）ため、この表は「実際に起きうる遷移」と
 * 一致していなければならない。ズレていると、後からこの表で検査を掛けたときに正常な業務が止まる。
 * 一致は withdrawal_store.test.ts が全操作の監査ログを走査して機械的に検査している。
 * 管理者修正（ADMIN_CORRECTION）だけは元の日付を直すため後戻りしうるので、その検査の対象外。
 */
export function canTransition(from: WithdrawalStatus, to: WithdrawalStatus): boolean {
  if (from === to) return true;
  if (from === "CLOSED") return false;
  if (to === "OWNER_REVIEW_REQUIRED") return true;
  if (from === "OWNER_REVIEW_REQUIRED") return to !== "CLOSED";
  return ALLOWED_TRANSITIONS[from].includes(to);
}

// --- 会費ペイの処理状態 --------------------------------------------------------

/**
 * 会費ペイ（決済）の停止処理の状態。
 *
 * 会費ペイのAPIはこのリポジトリに存在しない（正本も未確定）。したがって
 * システムは「停止できたか」を推測しない。人が実際に操作して押したときだけ completed になる。
 */
export type PaymentStopStatus = "" | "pending" | "completed" | "not_applicable";

export const PAYMENT_STOP_LABELS: Readonly<Record<PaymentStopStatus, string>> = {
  "": "未設定",
  pending: "未処理",
  completed: "処理済",
  not_applicable: "対象外",
};

// --- 退会ケースのデータ形 ------------------------------------------------------

export interface WithdrawalCase {
  id: number;
  /** 管理番号 FG-WD-YYYY.MM.DD.NNNN。紙の退会届に転記して突き合わせる */
  caseNumber: string;
  /** 会員番号（会員台帳の鍵） */
  memberId: string;
  /** 既存 prospects.json との紐付け。無ければ 0 */
  prospectId: number;
  /** LINE userId（名寄せキー） */
  lineUserId: string;
  memberName: string;

  /**
   * 入会時の重要事項。正本は既存の guardian_consents.json 側にある。
   * そちらに記録がある会員はここを空のままにし、二重保存しない（時系列生成時に参照する）。
   * 同意記録が存在しない会員（成人など）についてだけ、ここへ補記する。
   */
  onboardingTermsVersion: string;
  onboardingTermsSentAt: string;
  onboardingTermsConfirmedAt: string;

  /** 最初に退会の意思が示された日時。一度入ったら上書きしない */
  firstWithdrawalInquiryAt: string;
  /** LINE / 電話 / メール / 来館 など */
  withdrawalInquiryChannel: string;
  /** 手続き案内を送った日時 */
  procedureGuidedAt: string;

  /** 退会届の受領日時 */
  withdrawalFormReceivedAt: string;
  /** カードキーの返却日時 */
  cardKeyReturnedAt: string;
  /** 正式受付日時 = max(上記2つ)。自動確定・手入力不可 */
  formalReceivedAt: string;
  /** 退会予定日 YYYY-MM-DD（正式受付日の翌月末）。自動計算 */
  scheduledWithdrawalDate: string;
  /** 最終在籍月 YYYY-MM。自動 */
  finalMembershipMonth: string;

  paymentStopStatus: PaymentStopStatus;
  paymentStopCompletedAt: string;

  /** 正式受付LINEを送った日時 */
  withdrawalConfirmationSentAt: string;
  /** 退会完了にした日時 */
  closedAt: string;

  currentWithdrawalStatus: WithdrawalStatus;
  /** 最後に操作したスタッフ */
  handledBy: string;
  ownerReviewRequired: 0 | 1;
  ownerReviewReason: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
}

export type WithdrawalCaseInput = Partial<Omit<WithdrawalCase, "id" | "createdAt" | "updatedAt">>;

const DEFAULTS: Omit<WithdrawalCase, "id" | "createdAt" | "updatedAt"> = {
  caseNumber: "",
  memberId: "",
  prospectId: 0,
  lineUserId: "",
  memberName: "",
  onboardingTermsVersion: "",
  onboardingTermsSentAt: "",
  onboardingTermsConfirmedAt: "",
  firstWithdrawalInquiryAt: "",
  withdrawalInquiryChannel: "",
  procedureGuidedAt: "",
  withdrawalFormReceivedAt: "",
  cardKeyReturnedAt: "",
  formalReceivedAt: "",
  scheduledWithdrawalDate: "",
  finalMembershipMonth: "",
  paymentStopStatus: "",
  paymentStopCompletedAt: "",
  withdrawalConfirmationSentAt: "",
  closedAt: "",
  currentWithdrawalStatus: "ACTIVE",
  handledBy: "",
  ownerReviewRequired: 0,
  ownerReviewReason: "",
  memo: "",
};

function toFlag(value: unknown): 0 | 1 {
  return value === 1 || value === "1" || value === true ? 1 : 0;
}

/** 部分入力を既定値で埋め、既知フィールドだけを取り込む（未知キーは無視）。 */
export function normalizeWithdrawalCaseInput(
  input: WithdrawalCaseInput,
): Omit<WithdrawalCase, "id" | "createdAt" | "updatedAt"> {
  const out = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS) as Array<keyof typeof DEFAULTS>) {
    const value = (input as Record<string, unknown>)[key];
    if (value === undefined || value === null) continue;
    if (key === "ownerReviewRequired") {
      out.ownerReviewRequired = toFlag(value);
    } else if (key === "prospectId") {
      const n = Number(value);
      out.prospectId = Number.isFinite(n) ? n : 0;
    } else if (key === "currentWithdrawalStatus") {
      const s = String(value) as WithdrawalStatus;
      out.currentWithdrawalStatus = WITHDRAWAL_STATUSES.includes(s) ? s : "ACTIVE";
    } else if (key === "paymentStopStatus") {
      const s = String(value) as PaymentStopStatus;
      out.paymentStopStatus = s in PAYMENT_STOP_LABELS ? s : "";
    } else {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

// --- 日付（すべて日本時間で判断する） -------------------------------------------

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 日本時間での年月日を取り出す。
 * サーバー（VPS）がUTCだと深夜帯に日付が1日ずれ、退会日が1か月ずれる事故になる。
 * FLATUPは日本で営業しているので、日付の判断は常にJSTで行う。
 */
function jstYmd(at: Date): { year: number; month: number; day: number } {
  const jst = new Date(at.getTime() + JST_OFFSET_MS);
  return { year: jst.getUTCFullYear(), month: jst.getUTCMonth() + 1, day: jst.getUTCDate() };
}

/** ISO日時（または YYYY-MM-DD）を、日本時間の YYYY-MM-DD にする。不正なら空文字。 */
export function toJstDate(iso: string): string {
  const t = (iso ?? "").trim();
  if (!t) return "";
  // 日付だけ（YYYY-MM-DD）はそのまま日本時間の日付として扱う
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return "";
  const { year, month, day } = jstYmd(d);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * 正式受付日から退会予定日（翌月末）を計算する。
 *
 * 例: 2026-08-01 → 2026-09-30 ／ 2026-08-31 → 2026-09-30 ／ 2026-12-15 → 2027-01-31
 *     2027-01-31 → 2027-02-28 ／ 2028-01-15 → 2028-02-29（うるう年）
 *
 * 「翌々月の0日目 = 翌月の末日」を使う。月末・年跨ぎ・うるう年を場合分けせずに正しく出せる。
 * @param formalReceived 正式受付の日時（ISO）または日付（YYYY-MM-DD）
 * @returns YYYY-MM-DD。入力が不正なら空文字
 */
export function calcScheduledWithdrawalDate(formalReceived: string): string {
  const date = toJstDate(formalReceived);
  if (!date) return "";
  const [year, month] = date.split("-").map(Number);
  const lastDayOfNextMonth = new Date(Date.UTC(year, month + 1, 0));
  const y = lastDayOfNextMonth.getUTCFullYear();
  const m = String(lastDayOfNextMonth.getUTCMonth() + 1).padStart(2, "0");
  const d = String(lastDayOfNextMonth.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 退会予定日（YYYY-MM-DD）から最終在籍月（YYYY-MM）を取り出す。 */
export function calcFinalMembershipMonth(scheduledWithdrawalDate: string): string {
  const t = (scheduledWithdrawalDate ?? "").trim();
  return /^\d{4}-\d{2}/.test(t) ? t.slice(0, 7) : "";
}

/** 「2026年09月30日」形式。空なら空文字。日付はDBの確定値からしか作らない。 */
export function formatJapaneseDate(date: string): string {
  const d = toJstDate(date);
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${y}年${m}月${day}日`;
}

/** 「2026年09月」形式。空なら空文字。 */
export function formatJapaneseMonth(yearMonth: string): string {
  const t = (yearMonth ?? "").trim();
  if (!/^\d{4}-\d{2}/.test(t)) return "";
  const [y, m] = t.slice(0, 7).split("-");
  return `${y}年${m}月`;
}

/** ISO文字列を「2026-08-18 14:30」（JST）にする。空なら空文字。 */
export function formatJstStamp(iso: string): string {
  const t = (iso ?? "").trim();
  if (!t) return "";
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  const jst = new Date(d.getTime() + JST_OFFSET_MS);
  const y = jst.getUTCFullYear();
  const mo = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const da = String(jst.getUTCDate()).padStart(2, "0");
  const hh = String(jst.getUTCHours()).padStart(2, "0");
  const mi = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${y}-${mo}-${da} ${hh}:${mi}`;
}

// --- 正式受付の判定 ------------------------------------------------------------

/**
 * 正式受付が成立しているか。
 * 退会届とカードキー返却の**両方**が揃って初めて成立する。片方だけでは成立させない。
 * LINE・電話・メールでの意思表示は、ここには一切影響しない。
 */
export function isFormalReceiptComplete(
  rec: Pick<WithdrawalCase, "withdrawalFormReceivedAt" | "cardKeyReturnedAt">,
): boolean {
  return Boolean(rec.withdrawalFormReceivedAt) && Boolean(rec.cardKeyReturnedAt);
}

/**
 * 正式受付日時 = 2つが揃った日 = max(退会届の受領日時, カードキーの返却日時)。
 * どちらか欠けていれば空文字（成立しない）。
 */
export function calcFormalReceivedAt(
  rec: Pick<WithdrawalCase, "withdrawalFormReceivedAt" | "cardKeyReturnedAt">,
): string {
  if (!isFormalReceiptComplete(rec)) return "";
  const form = Date.parse(rec.withdrawalFormReceivedAt);
  const key = Date.parse(rec.cardKeyReturnedAt);
  if (Number.isNaN(form)) return rec.cardKeyReturnedAt;
  if (Number.isNaN(key)) return rec.withdrawalFormReceivedAt;
  return form >= key ? rec.withdrawalFormReceivedAt : rec.cardKeyReturnedAt;
}

/**
 * 正式受付が成立していれば、受付日時・退会予定日・最終在籍月・会費ペイ待ちを埋めた新しいレコードを返す。
 * 成立していなければ元のまま返す（スタッフが日付を手入力する余地を作らない）。
 */
export function applyFormalReceipt<T extends WithdrawalCase>(rec: T): T {
  if (!isFormalReceiptComplete(rec)) return rec;
  const formalReceivedAt = rec.formalReceivedAt || calcFormalReceivedAt(rec);
  const scheduledWithdrawalDate = calcScheduledWithdrawalDate(formalReceivedAt);
  return {
    ...rec,
    formalReceivedAt,
    scheduledWithdrawalDate,
    finalMembershipMonth: calcFinalMembershipMonth(scheduledWithdrawalDate),
    // 正式受付が成立した瞬間に会費ペイを「未処理」として立てる。
    // 押されるまで消えないので、スタッフの記憶に依存しなくなる。
    paymentStopStatus: rec.paymentStopStatus === "" ? "pending" : rec.paymentStopStatus,
  };
}

// --- 状態の導出 ----------------------------------------------------------------

/**
 * 記録された事実（日時）から現在状態を決める。
 *
 * 状態をスタッフに選ばせない。事実が無いのに先の状態へ進むことが構造的にできないので、
 * 「担当者によって状態の付け方が違う」が起きない。
 */
export function deriveWithdrawalStatus(rec: WithdrawalCase): WithdrawalStatus {
  if (rec.closedAt) return "CLOSED";
  if (rec.ownerReviewRequired === 1) return "OWNER_REVIEW_REQUIRED";
  if (isWithdrawalConfirmed(rec)) return "WITHDRAWAL_CONFIRMED";
  if (rec.paymentStopCompletedAt) return "PAYMENT_STOPPED";
  if (rec.formalReceivedAt && rec.paymentStopStatus === "pending") return "PAYMENT_STOP_PENDING";
  if (rec.formalReceivedAt) return "FORM_AND_KEY_RECEIVED";
  if (rec.withdrawalFormReceivedAt) return "FORM_RECEIVED";
  if (rec.cardKeyReturnedAt) return "KEY_RETURNED";
  if (rec.procedureGuidedAt) return "PROCEDURE_GUIDED";
  if (rec.firstWithdrawalInquiryAt) return "WITHDRAWAL_INQUIRY";
  return "ACTIVE";
}

/**
 * 退会確定（＝完了に進める）条件を満たしているか。
 * 正式受付・退会予定日・会費ペイ処理済・正式受付LINE送信済の4点すべてが必要。
 */
export function isWithdrawalConfirmed(rec: WithdrawalCase): boolean {
  return Boolean(
    rec.formalReceivedAt &&
      rec.scheduledWithdrawalDate &&
      rec.paymentStopCompletedAt &&
      rec.withdrawalConfirmationSentAt,
  );
}

/** 退会確定に足りていないものを日本語で並べる（スタッフ画面にそのまま出せる）。 */
export function missingForClose(rec: WithdrawalCase): string[] {
  const missing: string[] = [];
  if (!rec.formalReceivedAt) missing.push("正式受付（退会届＋カードキー）");
  if (!rec.scheduledWithdrawalDate) missing.push("退会予定日");
  if (!rec.paymentStopCompletedAt) missing.push("会費ペイの処理");
  if (!rec.withdrawalConfirmationSentAt) missing.push("正式受付のLINE送信");
  return missing;
}

/** 退会予定日が到来しているか（JST基準の日付比較）。 */
export function isScheduledDateReached(rec: WithdrawalCase, now: Date = new Date()): boolean {
  if (!rec.scheduledWithdrawalDate) return false;
  const today = toJstDate(now.toISOString());
  return today >= rec.scheduledWithdrawalDate;
}

// --- 処理漏れの検知 ------------------------------------------------------------

/**
 * 会費ペイ未処理の警告対象。
 * 正式受付が済んでいるのに会費ペイが completed でないケースを全部拾う。
 */
export function getPaymentStopPending(cases: WithdrawalCase[]): WithdrawalCase[] {
  return cases.filter(
    c =>
      Boolean(c.formalReceivedAt) &&
      !c.closedAt &&
      c.paymentStopStatus !== "completed" &&
      c.paymentStopStatus !== "not_applicable",
  );
}

/** 正式受付済みなのに、正式受付LINEをまだ送っていないケース。 */
export function getConfirmationNotSent(cases: WithdrawalCase[]): WithdrawalCase[] {
  return cases.filter(c => Boolean(c.formalReceivedAt) && !c.closedAt && !c.withdrawalConfirmationSentAt);
}

/** オーナー確認が必要なケース。 */
export function getOwnerReviewRequired(cases: WithdrawalCase[]): WithdrawalCase[] {
  return cases.filter(c => c.ownerReviewRequired === 1 && !c.closedAt);
}

/** 退会予定日が到来していて、退会完了にできるケース（完了条件も満たすもの）。 */
export function getReadyToClose(cases: WithdrawalCase[], now: Date = new Date()): WithdrawalCase[] {
  return cases.filter(c => !c.closedAt && isWithdrawalConfirmed(c) && isScheduledDateReached(c, now));
}

/** 対応中（在籍中でも完了でもない）のケース。 */
export function getActiveWithdrawals(cases: WithdrawalCase[]): WithdrawalCase[] {
  return cases.filter(c => !c.closedAt && c.currentWithdrawalStatus !== "ACTIVE");
}

// --- 管理番号 ------------------------------------------------------------------

/**
 * 管理番号 FG-WD-YYYY.MM.DD.NNNN（WD = WithDrawal）。
 *
 * 区切りにハイフンを使わないのは、AIKAの返信前ゲートが `20260818-0001` のような並びを
 * 電話番号と誤検出して送信を止めてしまうため。guardian_consent の FG-MC-… と形式を揃えている。
 */
export function formatCaseNumber(id: number, at: Date = new Date()): string {
  const { year, month, day } = jstYmd(at);
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `FG-WD-${year}.${m}.${d}.${String(id).padStart(4, "0")}`;
}

// --- LINEの言葉から退会の可能性を拾う -------------------------------------------

/** 退会・休会の意思表示に使われる言葉。完全一致には依存せず、部分一致で拾う。 */
const WITHDRAWAL_KEYWORDS: readonly string[] = [
  "退会",
  "辞めたい",
  "やめたい",
  "辞めます",
  "やめます",
  "辞めようと",
  "やめようと",
  "解約",
  "退部",
];

/** 休会側の言葉。退会とは扱いが違うので分けて持つ。 */
const SUSPENSION_KEYWORDS: readonly string[] = ["休会", "休みたい", "お休みしたい", "一時休止"];

export interface WithdrawalIntentResult {
  /** 退会・休会の相談の可能性があるか */
  matched: boolean;
  /** 拾った言葉（監査ログに残す。本文そのものは残さない） */
  keywords: string[];
  /** withdrawal = 退会寄り / suspension = 休会寄り / none */
  kind: "withdrawal" | "suspension" | "none";
}

/**
 * 退会・休会の意思表示の「可能性」を拾う。
 *
 * ここで確定させることは何もない。拾えたら相談日時を記録して案内へ進むだけなので、
 * 「今日は休みたい」のような誤検知が起きても実害はない（安全側に倒している）。
 * 逆に見落とすと最初の相談日時が残らないため、拾いすぎる側に寄せてある。
 *
 * AIだけで判断しない。既存のAI分類がある場合は、この結果と併用する。
 */
export function detectWithdrawalIntent(text: string): WithdrawalIntentResult {
  const t = (text ?? "").trim();
  if (!t) return { matched: false, keywords: [], kind: "none" };

  const withdrawalHits = WITHDRAWAL_KEYWORDS.filter(k => t.includes(k));
  const suspensionHits = SUSPENSION_KEYWORDS.filter(k => t.includes(k));
  const keywords = [...withdrawalHits, ...suspensionHits];

  if (withdrawalHits.length > 0) return { matched: true, keywords, kind: "withdrawal" };
  if (suspensionHits.length > 0) return { matched: true, keywords, kind: "suspension" };
  return { matched: false, keywords: [], kind: "none" };
}

/**
 * オーナー確認が要る特殊ケースの言葉。
 * これらはAIもスタッフも自動判断しない。検知したらオーナーへ上げる候補として出すだけ。
 */
const OWNER_REVIEW_SIGNALS: ReadonlyArray<readonly [string, readonly string[]]> = [
  // 規定どおりに進められない要求。ここをAIやスタッフが独断で飲むとルールが崩れる。
  ["規約外・特例の要求", ["即日", "日割り", "特例", "例外", "特別に", "違約金", "無料に", "今月末で退会"]],
  ["返金要求", ["返金", "返してほしい", "払い戻し"]],
  ["クレーム", ["クレーム", "納得できない", "おかしい", "ひどい"]],
  ["説明を受けていない主張", ["聞いてない", "聞いていない", "聞いてません", "聞いていません", "説明されて", "知らされて"]],
  ["消費生活センター", ["消費生活センター", "消費者センター", "国民生活センター"]],
  ["弁護士・法的対応", ["弁護士", "法的", "訴え", "内容証明"]],
  ["SNS・レビュー投稿", ["SNS", "ツイート", "口コミ", "レビュー", "投稿します"]],
  ["入院・長期療養", ["入院", "療養", "手術", "大きな怪我", "診断"]],
  ["海外転居・遠方転居", ["海外", "転勤", "引っ越し", "引越", "転居"]],
  ["カードキー紛失", ["カードキー紛失", "キーをなくし", "鍵をなくし", "カードキーをなくし", "紛失"]],
  ["本人死亡・代理人", ["死亡", "亡くなり", "他界", "代理", "後見"]],
];

export interface OwnerReviewSignal {
  /** 監査ログ・画面に出す理由名 */
  reason: string;
  /** 拾った言葉 */
  keywords: string[];
}

/**
 * 特殊ケースの可能性を拾う。自動でオーナー確認へ「する」のではなく、
 * スタッフが［オーナー確認へ］を押す判断材料として提示するためのもの。
 */
export function detectOwnerReviewSignals(text: string): OwnerReviewSignal[] {
  const t = (text ?? "").trim();
  if (!t) return [];
  const found: OwnerReviewSignal[] = [];
  for (const [reason, keywords] of OWNER_REVIEW_SIGNALS) {
    const hits = keywords.filter(k => t.includes(k));
    if (hits.length > 0) found.push({ reason, keywords: hits });
  }
  return found;
}

// --- LINEに送る文面 ------------------------------------------------------------
//
// 文言を不必要に強くしない。「初心者に優しい」「威圧しない」「分かりやすい」を守る。
// 日付は必ずDBの確定値を差し込む。AIに計算させない。

/**
 * 退会の相談を受けたときの手続き案内。
 * LINE・電話・メールだけでは正式受付にならないことを、責めない言い方で明示する。
 */
export function buildProcedureGuideMessage(): string {
  return [
    "退会についてご連絡いただきありがとうございます。",
    "",
    "お手続きについてご案内いたします。",
    "",
    "当ジムでは、退会・休会は「正式なお手続きをいただいた日の翌月末」となります。",
    "",
    "LINE・電話・メールでのご連絡のみでは正式な退会受付とはならず、",
    "",
    "・退会届へのご記入",
    "・カードキーのご返却",
    "",
    "の2点が完了した日を正式受付日としております。",
    "",
    "お手続きがスムーズに進むようご案内いたしますので、ご来館可能な日時をお知らせください。",
    "",
    "ご不明な点がございましたら遠慮なくお尋ねください。",
  ].join("\n");
}

/**
 * 正式受付が成立したときの控え。
 * 日付は3つとも引数（＝DBの確定値）からしか入らない。
 */
export function buildFormalReceiptMessage(rec: {
  formalReceivedAt: string;
  scheduledWithdrawalDate: string;
  finalMembershipMonth: string;
}): string {
  return [
    "本日、退会のお手続きを正式に受け付けいたしました。",
    "",
    "【正式受付日】",
    formatJapaneseDate(rec.formalReceivedAt),
    "",
    "【退会予定日】",
    formatJapaneseDate(rec.scheduledWithdrawalDate),
    "",
    "【最終在籍月】",
    formatJapaneseMonth(rec.finalMembershipMonth),
    "",
    "退会予定日までは通常どおりジムをご利用いただけます。",
    "",
    "これまでFLAT UP GYMをご利用いただき、本当にありがとうございます。",
    "",
    "残りの期間も気持ちよくご利用いただけるよう対応いたしますので、ご不明な点がございましたらいつでもお声がけください。",
  ].join("\n");
}

/** 退会完了の控え（必要に応じて送る）。 */
export function buildWithdrawalClosedMessage(rec: { scheduledWithdrawalDate: string }): string {
  return [
    "退会のお手続きが完了いたしました。",
    "",
    "【退会日】",
    formatJapaneseDate(rec.scheduledWithdrawalDate),
    "",
    "以上をもちまして退会のお手続きは完了となります。",
    "",
    "これまでFLAT UP GYMをご利用いただき、本当にありがとうございました。",
    "",
    "また運動を始めたいと思った時や、何かお力になれることがありましたら、いつでもお気軽にご連絡ください。",
    "",
    "今後ともよろしくお願いいたします。",
  ].join("\n");
}
