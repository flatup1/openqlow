// AIKA 移植キット — 退会トラブルゼロ化OS v1（LINE側）
//
// 会員向けLINE（AIKA）にそのままコピーして使える**依存ゼロ**モジュール。外部importなし。
// openQLOW 本体の正本は `src/crm/withdrawal.ts` と `src/crm/withdrawal_store.ts`。
// こちらは「LINEで必要になる分だけ」を1ファイルに畳んだもの。挙動は同等。
//
// AIKAがやること / やらないこと:
//   やる   … 退会・休会の言葉を拾う／手続きを案内する／正式受付の控えを送る
//   やらない… 正式受付にする／退会日を決める／会費ペイを止める／返金や特例を判断する
//
// 最重要:
//   1. LINEで「退会します」と来ても**絶対に正式退会にしない**。相談として記録するだけ。
//   2. 正式受付日 = 退会届の受領日時とカードキーの返却日時の**遅いほう**。
//   3. 退会日は正式受付日の翌月末。**AIに計算させず、この関数の結果だけを使う**。
//   4. 文面に入れる日付は、必ず台帳（DB）の確定値を渡すこと。
//
// 料金・住所・スケジュールの具体値はここに書かない（正本は flatup_canon.ts）。

// --- 状態 ---------------------------------------------------------------------

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

// --- 言葉の検知 ----------------------------------------------------------------

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

const SUSPENSION_KEYWORDS: readonly string[] = ["休会", "休みたい", "お休みしたい", "一時休止"];

export interface WithdrawalIntentResult {
  matched: boolean;
  keywords: string[];
  kind: "withdrawal" | "suspension" | "none";
}

/**
 * 退会・休会の意思表示の「可能性」を拾う。
 *
 * 完全一致には依存しない。ここで確定させるものは何も無いので、
 * 「今日は休みたい」のような誤検知が起きても実害はない（安全側）。
 * 既存のAI分類がある場合は、この結果と併用してよい。AIだけで判断しないこと。
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

const OWNER_REVIEW_SIGNALS: ReadonlyArray<readonly [string, readonly string[]]> = [
  // 規定どおりに進められない要求。ここをAIが独断で飲むとルールが崩れる。
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
  reason: string;
  keywords: string[];
}

/**
 * オーナー確認が要る特殊ケースを拾う。
 * 拾ったらAIは結論を出さず、人へ引き継ぐ（返金・特例・法的対応をAIが判断しない）。
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

// --- 日付（すべて日本時間で判断する） -------------------------------------------

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** ISO日時（または YYYY-MM-DD）を、日本時間の YYYY-MM-DD にする。不正なら空文字。 */
export function toJstDate(iso: string): string {
  const t = (iso ?? "").trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return "";
  const jst = new Date(d.getTime() + JST_OFFSET_MS);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 正式受付日から退会予定日（翌月末）を計算する。
 * 例: 2026-08-01 → 2026-09-30 ／ 2026-12-15 → 2027-01-31 ／ 2028-01-15 → 2028-02-29
 */
export function calcScheduledWithdrawalDate(formalReceived: string): string {
  const date = toJstDate(formalReceived);
  if (!date) return "";
  const [year, month] = date.split("-").map(Number);
  // 「翌々月の0日目 = 翌月の末日」。月末・年跨ぎ・うるう年を場合分けせずに正しく出せる。
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

/** 「2026年09月30日」形式。空なら空文字。 */
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

// --- 正式受付の判定 ------------------------------------------------------------

export interface FormalReceiptInput {
  /** 退会届の受領日時（ISO）。未受領は空 */
  withdrawalFormReceivedAt: string;
  /** カードキーの返却日時（ISO）。未返却は空 */
  cardKeyReturnedAt: string;
}

/**
 * 正式受付が成立しているか。
 * 退会届とカードキー返却の**両方**が揃って初めて成立する。
 * LINE・電話・メールでの意思表示は、ここには一切影響しない。
 */
export function isFormalReceiptComplete(rec: FormalReceiptInput): boolean {
  return Boolean(rec.withdrawalFormReceivedAt) && Boolean(rec.cardKeyReturnedAt);
}

/** 正式受付日時 = 2つが揃った日 = max(退会届, カードキー)。欠けていれば空文字。 */
export function calcFormalReceivedAt(rec: FormalReceiptInput): string {
  if (!isFormalReceiptComplete(rec)) return "";
  const form = Date.parse(rec.withdrawalFormReceivedAt);
  const key = Date.parse(rec.cardKeyReturnedAt);
  if (Number.isNaN(form)) return rec.cardKeyReturnedAt;
  if (Number.isNaN(key)) return rec.withdrawalFormReceivedAt;
  return form >= key ? rec.withdrawalFormReceivedAt : rec.cardKeyReturnedAt;
}

export interface FormalReceiptResult {
  formalReceivedAt: string;
  scheduledWithdrawalDate: string;
  finalMembershipMonth: string;
}

/** 正式受付の3点セット（受付日・退会予定日・最終在籍月）を一度に出す。成立前は全部空。 */
export function resolveFormalReceipt(rec: FormalReceiptInput): FormalReceiptResult {
  const formalReceivedAt = calcFormalReceivedAt(rec);
  if (!formalReceivedAt) {
    return { formalReceivedAt: "", scheduledWithdrawalDate: "", finalMembershipMonth: "" };
  }
  const scheduledWithdrawalDate = calcScheduledWithdrawalDate(formalReceivedAt);
  return {
    formalReceivedAt,
    scheduledWithdrawalDate,
    finalMembershipMonth: calcFinalMembershipMonth(scheduledWithdrawalDate),
  };
}

// --- LINEに送る文面 ------------------------------------------------------------
//
// 文言を不必要に強くしない。「初心者に優しい」「威圧しない」「分かりやすい」を守る。

/** 退会の相談を受けたときの手続き案内。 */
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
 * 3つの日付は台帳の確定値を渡すこと（AIに計算させない）。
 */
export function buildFormalReceiptMessage(rec: FormalReceiptResult): string {
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

// --- LINE受信1件ぶんの判断（AIKA側の配線はこれ1つを呼べばよい） ------------------

export interface WithdrawalTurnState {
  /** 最初の退会意思表示の日時（ISO）。未記録は空 */
  firstWithdrawalInquiryAt: string;
  /** 手続き案内を送った日時（ISO）。未送信は空 */
  procedureGuidedAt: string;
  /** 既に処理した LINE messageId の一覧（webhookの二重配信対策） */
  handledMessageIds?: readonly string[];
}

export interface WithdrawalTurnDecision {
  /** 退会・休会の相談として扱うか */
  isWithdrawalTopic: boolean;
  /** 手続き案内を送るべきか。false のときは絶対に送らない */
  shouldSendGuide: boolean;
  /** 送るべき本文（shouldSendGuide が false なら空） */
  message: string;
  /** 最初の相談日時として記録すべき値。空なら記録不要（＝既に記録済み） */
  recordFirstInquiryAt: string;
  /** 送信後に procedure_guided_at として記録すべき値。空なら記録不要 */
  recordProcedureGuidedAt: string;
  /** オーナー確認へ回す候補となった理由 */
  ownerReviewSignals: OwnerReviewSignal[];
  /** 何もしなかった理由（duplicate_message / already_guided / not_withdrawal） */
  reason: string;
  /** 拾った言葉（監査ログ用。本文そのものは残さない） */
  keywords: string[];
}

/**
 * LINEメッセージ1件を受けて「何をすべきか」を返す。副作用なし。
 *
 * ここでは絶対に正式受付にしない（退会届とカードキーは来館時にしか起きない）。
 * 同じ messageId が2回来ても、案内済みの相手にも、同じ案内を二度送らない。
 *
 * @param text 受信本文
 * @param state その会員の現在の記録
 * @param at 受信日時（ISO）
 * @param messageId LINE の messageId（あれば重複判定に使う）
 */
export function decideWithdrawalTurn(
  text: string,
  state: WithdrawalTurnState,
  at: string,
  messageId?: string,
): WithdrawalTurnDecision {
  const intent = detectWithdrawalIntent(text);
  const ownerReviewSignals = detectOwnerReviewSignals(text);

  const idle: WithdrawalTurnDecision = {
    isWithdrawalTopic: intent.matched,
    shouldSendGuide: false,
    message: "",
    recordFirstInquiryAt: "",
    recordProcedureGuidedAt: "",
    ownerReviewSignals,
    reason: "",
    keywords: intent.keywords,
  };

  if (!intent.matched) return { ...idle, reason: "not_withdrawal" };

  // webhook の再送。同じメッセージで二度処理しない。
  if (messageId && (state.handledMessageIds ?? []).includes(messageId)) {
    return { ...idle, reason: "duplicate_message" };
  }

  const recordFirstInquiryAt = state.firstWithdrawalInquiryAt ? "" : at;

  // 既に案内済みなら、同じ文面を連投しない。
  if (state.procedureGuidedAt) {
    return { ...idle, recordFirstInquiryAt, reason: "already_guided" };
  }

  return {
    isWithdrawalTopic: true,
    shouldSendGuide: true,
    message: buildProcedureGuideMessage(),
    recordFirstInquiryAt,
    recordProcedureGuidedAt: at,
    ownerReviewSignals,
    reason: "",
    keywords: intent.keywords,
  };
}
