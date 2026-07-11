// LLM障害フォールバック — 沈黙しない安全返信。
//
// LLM(OpenRouter等)が落ちた/タイムアウトした時でも、正本(FLATUP_CANON)だけを使った
// 「世界一優しい」ルールベース返信を返す。ログで多発した 401 / fetch failed の時に
// お客様を待たせて黙る事故を防ぐ。返信は必ず response_quality ゲートを通る品質にする。
//
// 事実は FLATUP_CANON のみを参照（直書きしない）。送信はしない（生成のみ）。

import { FLATUP_CANON as C } from "./canon.js";

export type Intent =
  | "price"
  | "access"
  | "classes"
  | "hours"
  | "trial"
  | "greeting"
  | "cancellation"
  | "suspension"
  | "unknown";

// canon の案内文には社内向けの「正本は …」注記が付く。顧客返信では取り除く。
function customerGuide(canonText: string): string {
  return canonText.replace(/。?\s*正本は[^。]*$/u, "").trim();
}

/** 問い合わせ文からおおまかな意図を判定する（優先度順）。 */
export function detectIntent(message: string): Intent {
  const t = message.normalize("NFKC");
  // 退会・休会・違約金は最優先で拾う。「入会して半年ですが違約金は？」のように
  // 「入会」を含む文が trial（体験）へ化けるのを防ぐため、trial 判定より前に置く。
  if (/退会|解約|辞めたい|やめたい|違約金|ペナルティ/.test(t)) return "cancellation";
  if (/休会|休部|一時停止/.test(t)) return "suspension";
  if (/料金|値段|月会費|会費|費用|いくら|金額|価格/.test(t)) return "price";
  if (/場所|住所|どこ|アクセス|駅|行き方|道順|駐車/.test(t)) return "access";
  if (/クラス|種目|メニュー|ボクシング|キック|柔術|ムエタイ|レスリング|何ができ/.test(t)) return "classes";
  if (/営業時間|何時|やってる|やってますか|開いて|定休|休み|何曜/.test(t)) return "hours";
  if (/体験|予約|やってみたい|始めたい|入会|通いたい|見学/.test(t)) return "trial";
  if (/こんにち|こんばん|はじめまして|よろしく|どうも|おはよう/.test(t)) return "greeting";
  return "unknown";
}

/** 意図に応じた、正本ベースの優しいフォールバック返信。 */
export function fallbackReply(message: string): string {
  switch (detectIntent(message)) {
    case "price":
      return (
        "ご質問ありがとうございます😊 FLATUP GYMは初心者の方も安心の、世界一優しい格闘技ジムです。" +
        `料金は${C.trialFirst}、月会費は${C.priceKids}・${C.priceWomen}・${C.priceMen}ですよ。` +
        "気になるクラスはありますか？"
      );
    case "access":
      return (
        "お問い合わせありがとうございます😊 初めての方も安心してお越しください。" +
        `場所は${C.address}、最寄りは${C.nearestStation}です。${C.access}。` +
        "お車でのお越しですか？"
      );
    case "classes":
      return (
        "ありがとうございます😊 初心者の方も自分のペースで安心して始められます。" +
        `クラスは${C.classes}があります。` +
        "気になる種目はありますか？"
      );
    case "hours":
      return (
        "お問い合わせありがとうございます😊 初心者の方も安心して通える太陽のジムです。" +
        `営業は${C.businessHours}です。` +
        "ご都合の良い曜日はありますか？"
      );
    case "trial":
      return (
        "体験のお問い合わせありがとうございます😊 初心者の方も安心の、世界一優しい格闘技ジムです。" +
        `${C.trialFirst}でお試しいただけますよ。` +
        "ご希望の曜日だけ教えていただけますか？"
      );
    case "cancellation":
      return (
        "ご連絡ありがとうございます😊 退会・違約金についてのご質問ですね。無理に引き止めることはいたしませんので、どうぞご安心ください。" +
        `${customerGuide(C.cancellation)}。` +
        "該当するかどうかはお一人おひとりのご契約内容によりますので、正確なところは担当スタッフが確認してご案内いたしますね。"
      );
    case "suspension":
      return (
        "ご連絡ありがとうございます😊 休会についてのご質問ですね。" +
        `${customerGuide(C.suspension)}。` +
        "ご事情に合わせてご案内できますので、詳しくは担当スタッフにおつなぎしますね。安心してくださいね😊"
      );
    case "greeting":
      return (
        "こんにちは😊 FLATUP GYM受付のAIKAです。初心者の方も安心して通える、世界一優しい格闘技ジムです。" +
        "体験・料金・アクセスなど、何でも気軽に聞いてくださいね。"
      );
    case "unknown":
    default:
      return (
        "ありがとうございます😊 初心者の方も安心してくださいね。順番にご案内します。" +
        "体験・料金・アクセスのどれについて知りたいか、教えていただけますか？"
      );
  }
}

export interface SafeReplyResult {
  reply: string;
  usedFallback: boolean;
}

/**
 * 返信生成を試み、失敗（例外・空）したら沈黙せずフォールバック返信を返す。
 * LLM呼び出しなど落ちうる処理を generate に渡して使う。
 */
export function safeReply(message: string, generate: () => string): SafeReplyResult {
  try {
    const r = generate();
    if (r && r.trim()) return { reply: r, usedFallback: false };
  } catch {
    // fallthrough
  }
  return { reply: fallbackReply(message), usedFallback: true };
}
