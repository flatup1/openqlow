// 業者への問い合わせ文・交渉文の**下書き**を作る。
//
// このファイルは文字列しか返さない。送信手段を一切持たない。
// 送るのは人間。送信は AGENTS.md の承認ゲート（オーナー承認）を通したときだけ。
// そのため、生成した本文には必ず未送信であることを示す見出しを付ける。

import type { SourcingRequirement } from "./requirement.js";

/** 下書きであることを本文の外側に必ず付ける見出し。 */
export const DRAFT_HEADER = "【下書き・未送信 / 送信はオーナー承認後】";

export type MessageDraft = {
  readonly subject: string;
  readonly body: string;
  /** そのまま貼れる形（見出し付き）。 */
  readonly full: string;
};

function wrap(subject: string, body: string): MessageDraft {
  return { subject, body, full: `${DRAFT_HEADER}\n\nSubject: ${subject}\n\n${body}` };
}

/** YYYY-MM-DD を英語表記にする（業者が読み違えない形にする）。 */
function englishDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  const monthName = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ][Number(month) - 1];
  return `${monthName} ${Number(day)}, ${year}`;
}

/** 到着必着を英語で書く（午前必着なら "by the morning of" と明示する）。 */
function deadlinePhrase(requirement: SourcingRequirement): string {
  const date = englishDate(requirement.arrivalDeadline);
  return requirement.deadlineHalf === "AM" ? `by the morning of ${date}` : `by ${date}`;
}

/**
 * 初回の見積依頼（RFQ）。
 * 一番大事な「日本の届け先に、いつまでに、確実に着くか」を先に書き、
 * 総額の内訳を項目で聞く。ここで内訳を出さない業者は、後で必ず揉める。
 */
export function buildRfq(requirement: SourcingRequirement, itemEnglish: string): MessageDraft {
  const deadline = deadlinePhrase(requirement);
  const place = requirement.destinationEnglish;
  const subject = `URGENT Custom ${itemEnglish} Order - ${requirement.quantity} pcs - Japan Delivery Required ${deadline}`;

  // 任意の行は空文字で表し、最後にまとめて落とす。
  // 段落の区切りに使う空行と混ざらないよう、落とすのは undefined だけにする。
  const lines: ReadonlyArray<string | undefined> = [
    "Hello,",
    "",
    `We are looking for a manufacturer who can produce ${requirement.quantity} custom ${itemEnglish} for an event in Japan.`,
    "",
    `Quantity: ${requirement.quantity} pcs`,
    `Product: custom ${itemEnglish}`,
    requirement.mustHavesEnglish.length > 0 ? "" : undefined,
    requirement.mustHavesEnglish.length > 0 ? "Our requirements:" : undefined,
    ...requirement.mustHavesEnglish.map(spec => `- ${spec}`),
    "",
    "We have attached reference images of the design.",
    "",
    "The most important requirement is delivery time.",
    `The goods MUST arrive in ${place} ${deadline}.`,
    requirement.useDate ? `Our event will be held on ${englishDate(requirement.useDate)}.` : undefined,
    "We are ready to place the order once the price and the delivery date are confirmed.",
    "",
    "Please confirm the following:",
    "1. Total price for the full quantity",
    "2. Unit price",
    "3. Mold / setup fee",
    "4. Accessory cost (ribbon, box, packaging)",
    "5. Shipping cost to Japan",
    "6. Material",
    "7. Size, thickness and weight",
    "8. Production time",
    "9. Fastest shipping method",
    `10. Guaranteed arrival date in ${place}`,
    "",
    "Shipping preference: DHL, FedEx or UPS.",
    "Please quote the TOTAL COST including all production and shipping fees, itemized.",
    "",
    `Most importantly: can you GUARANTEE delivery to ${place} ${deadline}?`,
    "Please also send photos or videos of similar products you have produced.",
    "",
    "Thank you.",
  ];

  return wrap(subject, lines.filter((line): line is string => line !== undefined).join("\n"));
}

/** 交渉ラウンド。値引き幅は 5% → 10% → 15% の順に上げる。 */
export type NegotiationRound = 1 | 2 | 3;

export const DISCOUNT_BY_ROUND: Readonly<Record<NegotiationRound, number>> = { 1: 5, 2: 10, 3: 15 };

/**
 * 値下げ交渉の下書き。
 * 納期を犠牲にする値下げは受けない、と毎回明記する（安くて遅いのは失敗）。
 */
export function buildNegotiation(
  requirement: SourcingRequirement,
  itemEnglish: string,
  round: NegotiationRound,
): MessageDraft {
  const discount = DISCOUNT_BY_ROUND[round];
  const deadline = deadlinePhrase(requirement);
  const subject = `Re: Custom ${itemEnglish} - ${requirement.quantity} pcs - Best final price`;

  const body = [
    "Thank you for your quotation.",
    "",
    "We are comparing several suppliers for this order.",
    `If you can reduce the total price by about ${discount}% while still guaranteeing arrival in ${requirement.destinationEnglish} ${deadline}, we are ready to order immediately.`,
    "",
    "Please give us your best final price for:",
    `- ${requirement.quantity} custom ${itemEnglish}`,
    "- accessories (ribbon / packaging)",
    "- express shipping to Japan",
    "",
    "Please include all costs, itemized.",
    "",
    "Important: we cannot accept a lower price in exchange for a later delivery date.",
    "The guaranteed arrival date must not change.",
    "",
    "Thank you.",
  ].join("\n");

  return wrap(subject, body);
}

/** 納期の再確認だけを短く聞く文。曖昧な回答が返ってきたときに使う。 */
export function buildDeadlineConfirmation(requirement: SourcingRequirement): MessageDraft {
  const deadline = deadlinePhrase(requirement);
  const body = [
    "Thank you for your reply.",
    "",
    "We need one clear answer before we can order.",
    `Can you GUARANTEE that the goods will arrive in ${requirement.destinationEnglish} ${deadline}?`,
    "",
    "Please answer with:",
    "1. Yes or No",
    "2. The exact guaranteed arrival date",
    "3. The courier and the tracking method",
    "4. What happens if the shipment is late",
    "",
    "An estimated date is not enough for this order.",
    "",
    "Thank you.",
  ].join("\n");

  return wrap("Re: Guaranteed arrival date in Japan", body);
}
