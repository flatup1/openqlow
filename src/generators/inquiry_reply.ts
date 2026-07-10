// FLATUP集客AI司令塔 v1 — 第1段階「問い合わせ返信AIKA」
//
// LINE/Instagram DMに来た問い合わせ文を入力すると、AIKA口調の返信案（3パターン）と
// 追客文（24時間後／3日後）、そして見込み客管理用の属性分類を生成する。
//
// このモジュールは「コンテンツ層（Claude担当）」の純粋関数として実装する。
//   - 外部送信は一切しない（自動LINE送信禁止）
//   - 料金やルールは下記 FLATUP_INFO の値のみを使う（勝手に変更しない）
//   - 医療的・法律的な断定はしない
//   - 強引な営業文にしない（必ず体験へ「自然に」誘導する）
//   - 返信は基本「AIKA」で締める
//
// 永続化（見込み客の保存・ステータス管理）は state 層（Codex担当）の役割であり、
// ここでは生成のみを行う。

import {
  FLATUP_INFO,
  AIKA_SIGN,
  composeSigned,
  matchesAny,
  type Attribute,
  type Gender,
  type Temperature,
} from "./shared.js";

// 共有の正本値・型を再エクスポート（既存の import 経路を維持）
export { FLATUP_INFO } from "./shared.js";
export type { Attribute, Gender, Temperature } from "./shared.js";

export type AgeGroup = "kids" | "teen" | "adult" | "senior" | "unknown";

/** 見込み客管理表に入れる優先度 */
export type Priority = "A" | "B" | "C";

/** 次に取るべきアクション */
export type NextAction = "propose_schedule" | "await_reply" | "resend" | "trial_done";

export interface InquiryInput {
  /** 問い合わせ本文（必須） */
  message: string;
  /** 性別（任意。未指定なら本文から推定） */
  gender?: Gender;
  /** 年齢層（任意。未指定なら本文から推定） */
  ageGroup?: AgeGroup;
  /** 目的（任意。未指定なら本文から推定） */
  purpose?: string;
  /** 希望時間（任意。例: 平日夜 / 土曜昼） */
  preferredTime?: string;
  /** スタッフメモ（任意） */
  memo?: string;
}

export interface InquiryClassification {
  attribute: Attribute;
  temperature: Temperature;
  purpose: string;
  nextAction: NextAction;
  priority: Priority;
}

export interface InquiryReplies {
  /** 丁寧な返信文 */
  polite: string;
  /** 短めの返信文 */
  short: string;
  /** 予約誘導を強めた返信文 */
  bookingFocused: string;
  /** 24時間後の追客文 */
  followUp24h: string;
  /** 3日後の追客文 */
  followUp3d: string;
  /** 難条件の相談（途中参加など）への返信。該当する問い合わせの時だけ生成 */
  obstacleConsult?: string;
  /** 退会・休会・違約金の相談への返信。該当する問い合わせの時だけ生成 */
  membershipConsult?: string;
}

export interface InquiryReplyResult {
  classification: InquiryClassification;
  replies: InquiryReplies;
  /** 属性に応じた「案内しやすい日時」の説明 */
  bookingGuidance: string;
  /** 運用上の注意（人間確認前提・自動送信禁止など） */
  notes: string[];
}

/** 「60歳」「65才」のような明示年齢が60以上ならシニアとみなす。 */
function isSeniorByAge(text: string): boolean {
  const match = text.match(/(\d{2,3})\s*(?:歳|才)/);
  return match ? Number(match[1]) >= 60 : false;
}

function detectAttribute(input: InquiryInput): Attribute {
  const text = input.message;
  const kidsHit = matchesAny(text, [/子供|子ども|こども|小学生|幼児|キッズ|息子|娘|何歳|未就学|園児/]);
  const parentHit = matchesAny(text, [/親子|一緒に|私も子供|私も子ども/]);
  const womenHit =
    input.gender === "female" || matchesAny(text, [/女性|女子|私(は|も)?女|女です|ママ|主婦/]);
  const menHit = input.gender === "male" || matchesAny(text, [/男性|男子|男です|僕|俺|主人|旦那/]);
  const seniorHit =
    input.ageGroup === "senior" ||
    isSeniorByAge(text) ||
    matchesAny(text, [/シニア|高齢|還暦|定年|60代|70代|80代/]);

  if (kidsHit && (parentHit || womenHit)) return "parent_child";
  if (input.ageGroup === "kids" || kidsHit) return "kids";
  if (seniorHit) return "senior";
  if (womenHit) return "women";
  if (menHit) return "men";
  return "beginner";
}

// 退会・休会・違約金は「既存会員のご相談」で、体験へ誘導する見込み客ではない。
// 「入会して半年ですが違約金は？」のような文（「入会」を含む）を体験誘導へ化けさせないための判定。
function cancellationConcern(text: string): boolean {
  return matchesAny(text, [/退会|解約|辞めたい|やめたい|違約金|ペナルティ/]);
}
function suspensionConcern(text: string): boolean {
  return matchesAny(text, [/休会|休部|一時停止/]);
}
function membershipConcern(text: string): boolean {
  return cancellationConcern(text) || suspensionConcern(text);
}

function detectTemperature(input: InquiryInput): Temperature {
  const text = input.message;
  // 退会・休会・違約金の相談は体験誘導の「高温度」にしない（既存会員のご相談）。
  if (membershipConcern(text)) return "mid";
  const hot = matchesAny(text, [
    /体験(した|を|希望|予約|に行|できま)/,
    /予約/,
    /入会|入りたい|通いたい|始めたい|やってみたい/,
    /いつ(なら|から|空|が)|何時|空いて|空き/,
    /申し込/,
  ]);
  const cool = matchesAny(text, [/検討|また今度|そのうち|まだ迷|とりあえず(料金|値段)?だけ/]);
  if (hot) return "high";
  if (cool) return "low";
  return "mid";
}

function detectPurpose(input: InquiryInput): string {
  if (input.purpose && input.purpose.trim()) return input.purpose.trim();
  const text = input.message;
  if (cancellationConcern(text)) return "退会・違約金のご相談";
  if (suspensionConcern(text)) return "休会のご相談";
  if (matchesAny(text, [/ダイエット|痩せ|やせ|減量|体型/])) return "ダイエット";
  if (matchesAny(text, [/運動不足|体力|健康|なまっ/])) return "運動不足";
  if (matchesAny(text, [/護身|身を守|防犯|危ない目/])) return "護身";
  if (matchesAny(text, [/習い事|礼儀|挨拶|集中力|しつけ/])) return "習い事・教育";
  if (matchesAny(text, [/自信|内気|引っ込み|いじめ|メンタル/])) return "自信をつけたい";
  if (matchesAny(text, [/ストレス|発散|スッキリ/])) return "ストレス発散";
  return "運動・健康づくり";
}

function bookingGuidanceFor(attribute: Attribute): string {
  switch (attribute) {
    case "kids":
      return `キッズクラスは${FLATUP_INFO.scheduleKids}に行っております`;
    case "parent_child":
      return `キッズクラスは${FLATUP_INFO.scheduleKids}、レディースは${FLATUP_INFO.scheduleLadies}にございます`;
    case "women":
      return `女性の方は${FLATUP_INFO.bookingWomen}がご案内しやすいです`;
    case "men":
      return `${FLATUP_INFO.bookingMen}がご案内しやすいです`;
    case "senior":
      return "無理のないペースで、平日の落ち着いた時間帯などをご案内できます";
    case "beginner":
    default:
      return `女性の方は${FLATUP_INFO.bookingWomen}、男性の方は${FLATUP_INFO.bookingMen}がご案内しやすいです`;
  }
}

function empathyLine(attribute: Attribute): string {
  switch (attribute) {
    case "kids":
      return "お子様でも初心者から始められますので、ご安心ください。";
    case "parent_child":
      return "親子そろって初心者から始められますので、ご安心ください。";
    case "women":
      return "女性の方でも安心して通っていただけます。";
    case "men":
      return "初心者の男性の方でも全く問題ありません。";
    case "senior":
      return "年齢に関係なく、無理のないペースで始められます。";
    case "beginner":
    default:
      return "初心者の方でも全く問題ありません。";
  }
}

function strengthLine(attribute: Attribute): string {
  switch (attribute) {
    case "kids":
      return "FLATUP GYMでは、楽しく体を動かしながら、礼儀や自信を育てることを大切にしています。";
    case "parent_child":
      return "FLATUP GYMは、親子・初心者の方が安心して通える雰囲気を大切にしているジムです。";
    case "women":
      return "FLATUP GYMは、女性・初心者の方が通いやすい雰囲気を大切にしていて、女性インストラクターも在籍しています。";
    case "senior":
      return "FLATUP GYMは、ガチスパー禁止で安全を第一に考えていますので、はじめての方も安心です。";
    case "men":
    case "beginner":
    default:
      return "FLATUP GYMは、ガチスパー禁止で安全を第一に、初心者の方が無理なく続けられることを大切にしているジムです。";
  }
}

// 体験への誘い文。料金行を既に出している場合は「初回体験は500円」の重複を避けて短縮する。
function trialInviteLine(priceShown: boolean): string {
  return priceShown
    ? "まずは一度、雰囲気を見にいらしていただけたらと思います。"
    : "初回体験は500円ですので、まずは一度雰囲気を見にいらしていただけたらと思います。";
}

// 「怖い・不安・きつい」等の不安に直接応える安心材料（無ければ空文字）。
function concernReassurance(text: string): string {
  if (matchesAny(text, [/怖|こわ|不安|痛|きつ|ハード|ついていけ|運動神経|苦手/])) {
    return "「怖い・きつそう」と感じる方も多いですが、痛みを伴う激しいスパーリングは行いませんので、ご自分のペースで無理なく進められます。";
  }
  return "";
}

function priceSummary(attribute: Attribute): string {
  const tier =
    attribute === "kids" || attribute === "parent_child"
      ? FLATUP_INFO.priceKids
      : attribute === "women"
        ? FLATUP_INFO.priceWomen
        : attribute === "men"
          ? FLATUP_INFO.priceMen
          : `${FLATUP_INFO.priceWomen}／${FLATUP_INFO.priceMen}`;
  return `料金は${FLATUP_INFO.trialFirst}、月会費が${tier}、別途${FLATUP_INFO.joinFee}です。`;
}

function wantsPrice(text: string): boolean {
  return matchesAny(text, [/料金|値段|月会費|会費|費用|いくら|金額|価格/]);
}

function bookingAsk(guidance: string): string {
  return `${guidance}。ご都合の良い日程はございますか？`;
}

// 体験予約の意思がある方への返信。
// 質問を小分けにせず「名前・種目・希望日時」を一度に確認し、候補枠と記入例を見せ、
// 会話を終わらせない（難しい条件でも代替提案できる前提）。初心者の不安も最後に消す。
//
// ※ 種目・候補枠はジムの正本値。変更時はここを更新する。
//   （現行の属性別スケジュール FLATUP_INFO とは別に、予約返信は統一の固定枠を案内する方針）
const BOOKING = {
  disciplines: "キックボクシング／柔術",
  weekdaySlots: ["午前10:00〜12:00", "夜19:00以降"],
  example: "「松元、キックボクシング、6月16日19:00希望」",
};

// 問い合わせ文で言及された種目を拾う（勝手に別種目へ変えないため）。
const DISCIPLINE_PATTERNS: Array<[RegExp, string]> = [
  [/レスリング/, "レスリング"],
  [/柔術|ブラジリアン|bjj/i, "柔術"],
  [/キック|ボクシング/, "キックボクシング"],
];

function mentionedDiscipline(text: string): string | undefined {
  for (const [re, name] of DISCIPLINE_PATTERNS) if (re.test(text)) return name;
  return undefined;
}

// 「途中参加できるか」「仕事後で間に合うか」等の“難しい条件”の相談かどうか。
function hasAttendanceObstacle(text: string): boolean {
  return matchesAny(text, [
    /途中参加|途中から|間に合わ|間に合う|間に合い|仕事後|仕事の後|遅れて|遅刻|終わってから|時間に合うか/,
  ]);
}

// 難条件の相談への返信：希望種目を変えず、確認に必要な情報を聞き、代替案を出して会話を終わらせない。
function buildObstacleReply(discipline?: string): string {
  const klass = discipline ? `${discipline}クラス` : "ご希望のクラス";
  return [
    "お問い合わせありがとうございます😊",
    "",
    "お仕事後ですと、開始時間に間に合わない場合もありますよね。",
    `${klass}への途中参加が可能か、担当者へ確認いたします。`,
    "",
    "差し支えなければ、",
    "・到着できそうな時間",
    "・ご希望の曜日",
    "を教えていただけますか？",
    "",
    "途中参加が難しい場合も、参加しやすい別の日時をご案内いたします。",
    "初心者の方も安心して始められますので、まずはお気軽にご相談ください😊",
    AIKA_SIGN,
  ].join("\n");
}

function buildBookingReply(): string {
  return [
    "お問い合わせありがとうございます😊",
    "体験は初回500円でご参加いただけます！",
    "",
    "平日は、",
    ...BOOKING.weekdaySlots.map(slot => `・${slot}`),
    "でご案内可能です。",
    "",
    "ご予約のため、次の3点を教えてください。",
    "",
    "①お名前",
    "②体験したい種目",
    `　${BOOKING.disciplines}`,
    "③ご希望の曜日と時間",
    "",
    "例：",
    BOOKING.example,
    "",
    "初めての方にも無理のない内容で進めますので、安心してお越しください😊",
    AIKA_SIGN,
  ].join("\n");
}

// canon の案内文には社内向けの「正本は …」注記が付く。顧客返信では取り除く。
function customerGuide(canonText: string): string {
  return canonText.replace(/。?\s*正本は[^。]*$/u, "").trim();
}

// 退会・休会・違約金の相談への返信。事実は canon（cancellation / suspension）を参照し、
// 該当判定は断定せず担当スタッフへつなぐ。体験（trial）誘導はしない。
function buildMembershipReplies(kind: "cancellation" | "suspension"): InquiryReplies {
  const guide = customerGuide(
    kind === "suspension" ? FLATUP_INFO.suspension : FLATUP_INFO.cancellation,
  );
  const topic = kind === "suspension" ? "休会" : "退会・違約金";
  const opener = `${topic}についてお問い合わせいただきありがとうございます😊`;
  const reassure =
    kind === "suspension"
      ? "ご事情に合わせてご案内できますので、どうぞご安心ください。"
      : "無理に引き止めることはいたしませんので、どうぞご安心ください。";
  const handoff =
    kind === "suspension"
      ? "手続きの詳しいご案内は担当スタッフより改めていたしますね。"
      : "該当するかどうかはお一人おひとりのご契約内容によりますので、最終的なご案内は担当スタッフが確認いたします。";

  const guidanceReply = composeSigned([opener, reassure, `${guide}。`, handoff]);
  const short = composeSigned([opener, `${guide}。`, "詳しくは担当スタッフより丁寧にご案内しますね。"]);
  const followUp24h = composeSigned([
    "先日はお問い合わせありがとうございました😊",
    "その後、ご不明な点はございませんか？",
    "ご不安なことがあれば、いつでもお気軽にお知らせくださいね。",
  ]);
  const followUp3d = composeSigned([
    "その後、いかがでしょうか😊",
    "ご心配なことがあれば担当スタッフが丁寧にご案内しますので、遠慮なくお声がけくださいね。",
  ]);

  return {
    polite: guidanceReply,
    short,
    bookingFocused: guidanceReply, // 退会・休会・違約金の相談に体験誘導はしない
    followUp24h,
    followUp3d,
    membershipConsult: guidanceReply,
  };
}

function buildReplies(
  input: InquiryInput,
  classification: InquiryClassification,
  guidance: string,
): InquiryReplies {
  // 退会・休会・違約金の相談は、体験誘導ではなく canon ベースの案内＋人間確認へ。
  const membershipKind = cancellationConcern(input.message)
    ? "cancellation"
    : suspensionConcern(input.message)
      ? "suspension"
      : null;
  if (membershipKind) return buildMembershipReplies(membershipKind);

  const { attribute } = classification;
  const empathy = empathyLine(attribute);
  const strength = strengthLine(attribute);
  const reassurance = concernReassurance(input.message);
  const showPrice = wantsPrice(input.message);

  const polite = composeSigned([
    "お問い合わせありがとうございます😊",
    empathy,
    reassurance,
    strength,
    showPrice ? priceSummary(attribute) : "",
    trialInviteLine(showPrice),
    bookingAsk(guidance),
  ]);

  const short = composeSigned([
    `お問い合わせありがとうございます😊 ${empathy}`,
    `初回体験は500円です。${bookingAsk(guidance)}`,
  ]);

  const bookingFocused = buildBookingReply();

  const followUp24h = composeSigned([
    "先日はお問い合わせありがとうございました😊",
    `体験についてですが、${guidance}。`,
    "初回は500円で、初心者の方でも無理なく体験できますのでご安心ください。",
    "ご都合いかがでしょうか？",
  ]);

  const followUp3d = composeSigned([
    "その後、いかがでしょうか😊",
    "もしご都合が合わないようでしたら、別の曜日や時間帯でも調整できますので、お気軽にお知らせください。",
    "まずは初回体験500円で、初心者の方も安心して雰囲気だけでも見にいらしていただけたら嬉しいです。",
  ]);

  const obstacleConsult = hasAttendanceObstacle(input.message)
    ? buildObstacleReply(mentionedDiscipline(input.message))
    : undefined;

  return { polite, short, bookingFocused, followUp24h, followUp3d, obstacleConsult };
}

function decideNextAction(temperature: Temperature): NextAction {
  return temperature === "high" ? "propose_schedule" : "await_reply";
}

function decidePriority(attribute: Attribute, temperature: Temperature): Priority {
  if (temperature === "high") return "A";
  if (temperature === "low") return "C";
  // 初心者・女性・キッズは取りこぼしを避けたいので中温度でも一段上げる
  if (attribute === "kids" || attribute === "parent_child" || attribute === "women") return "A";
  return "B";
}

/**
 * 問い合わせ文から、AIKA返信案・追客文・属性分類を生成する。
 * 送信は行わない。必ず人間が確認してから送信すること。
 */
export function generateInquiryReply(input: InquiryInput): InquiryReplyResult {
  if (!input.message || !input.message.trim()) {
    throw new Error("inquiry message is required");
  }

  const attribute = detectAttribute(input);
  const temperature = detectTemperature(input);
  const purpose = detectPurpose(input);
  const nextAction = decideNextAction(temperature);
  const priority = decidePriority(attribute, temperature);

  const classification: InquiryClassification = {
    attribute,
    temperature,
    purpose,
    nextAction,
    priority,
  };

  const bookingGuidance = bookingGuidanceFor(attribute);
  const replies = buildReplies(input, classification, bookingGuidance);

  const notes = [
    "⚠ これは下書きです。自動送信はしません。必ず内容を確認してから送信してください。",
    `日程は ${FLATUP_INFO.noBooking} の点にご注意ください。`,
    "料金・スケジュールは正本（FLATUP_INFO）の値です。変更があれば正本を更新してください。",
  ];
  if (membershipConcern(input.message)) {
    notes.push(
      "⚠ 退会・休会・違約金は断定せず、担当スタッフが契約内容を確認してからご案内してください。",
    );
  }

  return { classification, replies, bookingGuidance, notes };
}
