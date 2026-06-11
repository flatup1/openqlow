// 問い合わせ → 見込み客レコードの自動下書き化（intake）
//
// 受付AI（generators/inquiry_reply）の分類結果を、そのまま CRM の prospect 入力に変換する。
// これにより「問い合わせ文を貼るだけ」で台帳に下書き登録でき、手入力コストを最小化する。
//
// 注意: ここで作るのはあくまで「下書きレコード」と「返信案」。送信や確定はしない。

import {
  generateInquiryReply,
  type InquiryClassification,
  type InquiryInput,
} from "../generators/inquiry_reply.js";
import type { Attribute, Temperature } from "../generators/shared.js";
import type {
  ProspectCategory,
  ProspectInput,
  ProspectTemperature,
} from "./prospect.js";

function categoryFromAttribute(attribute: Attribute): ProspectCategory {
  switch (attribute) {
    case "kids":
      return "kids";
    case "women":
      return "female";
    case "men":
      return "male";
    case "parent_child":
      return "parent_child";
    case "senior":
      return "senior";
    case "beginner":
    default:
      return "unknown";
  }
}

function temperatureToABC(temperature: Temperature): ProspectTemperature {
  switch (temperature) {
    case "high":
      return "A";
    case "low":
      return "C";
    case "mid":
    default:
      return "B";
  }
}

function genderFromAttribute(attribute: Attribute): string {
  if (attribute === "women") return "female";
  if (attribute === "men") return "male";
  return "";
}

const NEXT_ACTION_LABEL: Record<InquiryClassification["nextAction"], string> = {
  propose_schedule: "体験日程を提案する",
  await_reply: "返信して様子を見る",
  resend: "再送する",
  trial_done: "体験後フォローする",
};

export interface InquiryIntake {
  /** store.create に渡せる下書きレコード */
  prospect: ProspectInput;
  /** 受付AIの分類結果（属性・温度感など） */
  classification: InquiryClassification;
  /** 人間が確認して送る返信下書き（丁寧版） */
  replyDraft: string;
}

/**
 * 問い合わせ文から見込み客の下書きレコードを組み立てる。
 * I/O は持たない（保存は呼び出し側で store.create する）。
 */
export function buildProspectFromInquiry(
  input: InquiryInput,
  options: { name?: string; contactSource?: string; now?: () => Date } = {},
): InquiryIntake {
  const result = generateInquiryReply(input);
  const c = result.classification;
  const now = options.now ? options.now() : new Date();

  const prospect: ProspectInput = {
    name: options.name ?? "",
    contactSource: options.contactSource ?? "",
    gender: input.gender ?? genderFromAttribute(c.attribute),
    ageGroup: input.ageGroup ?? "",
    category: categoryFromAttribute(c.attribute),
    purpose: c.purpose,
    temperature: temperatureToABC(c.temperature),
    status: "new_inquiry",
    inquiryText: input.message,
    aiReply: result.replies.polite,
    nextAction: NEXT_ACTION_LABEL[c.nextAction],
    lastContactAt: now.toISOString(),
  };

  return { prospect, classification: c, replyDraft: result.replies.polite };
}
