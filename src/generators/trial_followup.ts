// FLATUP集客AI司令塔 — 体験後フォロー＋口コミ依頼の文生成（スペック ③・④）
//
// 体験に来た方の「属性・体験中の様子・不安点・入会温度感」を入力すると、
// AIKA 口調で 当日お礼／翌日フォロー／入会案内／Google口コミ依頼 の4文を生成する。
//
// 既存の朝インタビュー（src/conversation/interview_flow.ts）の trial ジャンルで
// 捕捉する項目（gender / age_band / reaction / enrollment_status / hesitation_reason）を
// そのまま入力に流し込めるよう設計している。新しい状態管理（DB）は持たない。
//
// 安全方針は inquiry_reply と同じ:
//   - 生成のみ。自動送信は一切しない。
//   - 料金・スケジュールは FLATUP_INFO（正本値）のみを使用し、勝手に変更しない。
//   - 医療的・法律的な断定をしない／強引な営業文にしない。
//   - 返信は基本「AIKA」で締める。

import {
  FLATUP_INFO,
  type Attribute,
  type Gender,
  type Temperature,
} from "./inquiry_reply.js";

// 正本値・共通型は inquiry_reply を単一ソースとして再エクスポートする（二重管理しない）。
export { FLATUP_INFO } from "./inquiry_reply.js";
export type { Attribute, Gender, Temperature } from "./inquiry_reply.js";

const SIGN = "AIKA";

export interface TrialFollowupInput {
  /** 性別（任意。interview trial の gender に対応） */
  gender?: Gender;
  /** 年齢層の自由記述（例: "30代" "キッズ"。interview trial の age_band に対応） */
  ageBand?: string;
  /** 属性（任意。未指定なら gender / ageBand から推定） */
  attribute?: Attribute;
  /** 体験中の様子（interview trial の reaction に対応） */
  reaction?: string;
  /** 特に良かった点（任意。reaction と別で強調したい場合） */
  goodPoint?: string;
  /** 不安点（interview trial の hesitation_reason に対応） */
  concern?: string;
  /** 入会状況（はい / 保留 / 検討中 / いいえ。interview trial の enrollment_status に対応） */
  enrollmentStatus?: string;
  /** 入会温度感（任意。未指定なら enrollmentStatus から推定） */
  temperature?: Temperature;
}

export interface TrialFollowupMessages {
  /** 当日お礼文 */
  sameDayThanks: string;
  /** 翌日フォロー文 */
  nextDayFollow: string;
  /** 入会案内文 */
  enrollmentInfo: string;
  /** Google口コミ依頼文 */
  reviewRequest: string;
}

export interface TrialFollowupResult {
  attribute: Attribute;
  temperature: Temperature;
  messages: TrialFollowupMessages;
  notes: string[];
}

function deriveAttribute(input: TrialFollowupInput): Attribute {
  if (input.attribute) return input.attribute;
  const age = input.ageBand ?? "";
  if (/キッズ|小学|幼児|園児|子供|子ども|こども/.test(age)) return "kids";
  if (/シニア|高齢|60|70/.test(age)) return "senior";
  if (input.gender === "female") return "women";
  if (input.gender === "male") return "men";
  return "beginner";
}

function deriveTemperature(input: TrialFollowupInput): Temperature {
  if (input.temperature) return input.temperature;
  const status = (input.enrollmentStatus ?? "").trim();
  if (/^(はい|入会|済|した|yes)/i.test(status)) return "high";
  if (/(いいえ|見送|やめ|no)/i.test(status)) return "low";
  // 保留 / 検討中 / 不明 など
  return "mid";
}

function priceTier(attribute: Attribute): string {
  switch (attribute) {
    case "kids":
    case "parent_child":
      return FLATUP_INFO.priceKids;
    case "women":
      return FLATUP_INFO.priceWomen;
    case "men":
      return FLATUP_INFO.priceMen;
    default:
      return `${FLATUP_INFO.priceWomen}／${FLATUP_INFO.priceMen}`;
  }
}

// 体験中の様子（緊張・不安寄りの語）。これらは生文を断定せず、別の受けにする。
const TENSION_RE = /緊張|不安|硬|おとなし|戸惑|泣|怖|ぎこちな/;

/** 体験中の様子から、当日お礼に添える一言を作る（無ければ汎用文）。 */
function reactionLine(input: TrialFollowupInput): string {
  const note = (input.goodPoint || input.reaction || "").trim();
  if (!note) {
    return "初めての環境の中、最後までよく頑張っていらっしゃいました。";
  }
  // 緊張・不安寄りの様子に「良い時間でした」と断定すると噛み合わないため、別表現にする。
  if (TENSION_RE.test(note)) {
    return "最初は少し緊張されていたかもしれませんが、最後までよく取り組んでいらっしゃいました。";
  }
  // ポジティブ／中立の様子は引用形で自然につなぐ。
  return `体験中の「${note}」というご様子、しっかり拝見していました。`;
}

/** 不安点に応じた、翌日フォローでの安心材料。 */
function reassuranceLine(concern?: string): string {
  const c = (concern ?? "").trim();
  if (!c || c === "なし" || c === "不明") {
    return "最初は誰でも少し緊張しますが、ご自分のペースで無理なく続けられます。";
  }
  if (/料金|月会費|費用|お金|値段/.test(c)) {
    return "料金面が気になる場合も、まずは無理のない範囲から始められますので、気軽にご相談ください。";
  }
  if (/時間|忙し|曜日|スケジュール|通え/.test(c)) {
    return "お時間が合うか不安な場合も、複数の曜日・時間帯がありますので、続けやすい形をご相談できます。";
  }
  if (/家族|主人|旦那|奥さん|相談/.test(c)) {
    return "ご家族とご相談のうえで大丈夫ですので、どうぞごゆっくりご検討ください。";
  }
  if (/不安|怖|緊張|続け|きつ|ついて/.test(c)) {
    return "FLATUP GYMはガチスパー禁止で安全第一なので、初めての方も安心して続けていただけます。";
  }
  return "気になる点は遠慮なくお聞きください。安心して通っていただけるようサポートします。";
}

function compose(lines: string[]): string {
  return [...lines.filter(Boolean), SIGN].join("\n");
}

function buildSameDayThanks(input: TrialFollowupInput, temperature: Temperature): string {
  const enrolled = temperature === "high" && /^(はい|入会|済|した)/.test((input.enrollmentStatus ?? "").trim());
  if (enrolled) {
    return compose([
      "本日は体験とご入会、ありがとうございました😊",
      reactionLine(input),
      "これから一緒に、無理なく続けていきましょう。",
      "通い方やペースなど、気になる点があればいつでもお声がけください。",
    ]);
  }
  return compose([
    "本日は体験にお越しいただきありがとうございました😊",
    reactionLine(input),
    "最初は不安もあると思いますが、FLATUP GYMは初心者の方が無理なく続けられるようサポートしています。",
    "また気になる点があれば、いつでもご連絡ください。",
  ]);
}

function buildNextDayFollow(input: TrialFollowupInput): string {
  return compose([
    "昨日は体験お疲れさまでした😊",
    "体を動かしてみて、いかがでしたか？",
    reassuranceLine(input.concern),
    "もしご興味があれば、続けやすいプランもご案内できますので、お気軽にお声がけください。",
  ]);
}

function buildEnrollmentInfo(input: TrialFollowupInput, attribute: Attribute, temperature: Temperature): string {
  if (temperature === "low") {
    // 見送り気味の方には押し込まない
    return compose([
      "本日はありがとうございました😊",
      "今回はタイミングが合わなくても、まったく問題ありません。",
      `もしまた気が向かれた際は、${FLATUP_INFO.trialFirst}でいつでも体験いただけます。`,
      "またお会いできるのを楽しみにしています。",
    ]);
  }
  return compose([
    "FLATUP GYMにご興味をお持ちいただきありがとうございます😊",
    `ご入会いただく場合は、月会費${priceTier(attribute)}と、別途${FLATUP_INFO.joinFee}でご案内しております。`,
    "次回ご来館時にそのままお手続きできます。",
    `お持ちいただくのは${FLATUP_INFO.bring}だけで大丈夫です。`,
    "ご不明な点があれば、何でもお聞きください。",
  ]);
}

function buildReviewRequest(): string {
  return compose([
    "本日はありがとうございました😊",
    "もしよろしければ、今後FLATUP GYMを検討される方の参考になるよう、Google口コミにご協力いただけますと嬉しいです。",
    "一言だけでも大丈夫です。",
  ]);
}

/**
 * 体験後フォロー（当日お礼／翌日フォロー／入会案内／口コミ依頼）の4文を生成する。
 * 送信は行わない。必ず人間が確認してから送信すること。
 */
export function generateTrialFollowup(input: TrialFollowupInput = {}): TrialFollowupResult {
  const attribute = deriveAttribute(input);
  const temperature = deriveTemperature(input);

  const messages: TrialFollowupMessages = {
    sameDayThanks: buildSameDayThanks(input, temperature),
    nextDayFollow: buildNextDayFollow(input),
    enrollmentInfo: buildEnrollmentInfo(input, attribute, temperature),
    reviewRequest: buildReviewRequest(),
  };

  const notes = [
    "⚠ これは下書きです。自動送信はしません。必ず内容を確認してから送信してください。",
    temperature === "low"
      ? "温度感が低めのため、入会案内は押し込まない表現にしています。"
      : "入会案内には正本の料金（FLATUP_INFO）を使用しています。",
    "口コミ依頼は体験・入会・大会参加など、良い体験の直後に送るのがおすすめです。",
  ];

  return { attribute, temperature, messages, notes };
}
