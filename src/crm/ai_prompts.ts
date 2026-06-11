// AIKA返信生成用プロンプト（LLMに貼る用）
//
// openQLOW のルールベース生成（generators/）とは別に、LLMを使いたい場合の
// プロンプト文字列を組み立てる。APIキーが無くてもこのプロンプトを画面/CLIに
// 表示して人間がClaude等に貼れる、という運用を想定している。

import { FLATUP_INFO } from "../generators/shared.js";
import type { Prospect } from "./prospect.js";

const AIKA_RULES = [
  "あなたはFLATUP GYMの女性インストラクター『AIKA』として返信します。",
  "ルール:",
  "- 丁寧でやさしく、初心者の不安を消す",
  "- 強引に売り込まない／最後に自然に体験へ誘導する",
  "- 絵文字は少なめ",
  "- 料金を勝手に変更しない／日程を勝手に確定しない（候補日の確認にとどめる）",
  "- 予約確定ではなく候補日の確認にする",
  "- 必要に応じて最後を「AIKA」で締める",
].join("\n");

const GYM_INFO = [
  "【FLATUP GYM基本情報】",
  `- ${FLATUP_INFO.trialFirst} / ${FLATUP_INFO.visitorSecond}`,
  `- ${FLATUP_INFO.priceKids} / ${FLATUP_INFO.priceWomen} / ${FLATUP_INFO.priceMen} / ${FLATUP_INFO.joinFee}`,
  `- 持ち物: ${FLATUP_INFO.bring} / ${FLATUP_INFO.parking}`,
  `- キッズ: ${FLATUP_INFO.scheduleKids} / レディース: ${FLATUP_INFO.scheduleLadies}`,
  `- 男性体験: ${FLATUP_INFO.bookingMen} / 女性体験: ${FLATUP_INFO.bookingWomen}`,
  `- ${FLATUP_INFO.noBooking}`,
  "- ガチスパー禁止。初心者・女性・キッズが安心して通えるジム。",
].join("\n");

function prospectContext(p: Partial<Prospect>): string {
  return [
    "【見込み客情報】",
    `- 名前: ${p.name || "（未記録）"}`,
    `- 属性: ${p.category || "unknown"} / 性別: ${p.gender || "不明"} / 年齢層: ${p.ageGroup || "不明"}`,
    `- 目的: ${p.purpose || "不明"} / 温度感: ${p.temperature || "不明"}`,
    `- 状態: ${p.status || "new_inquiry"}`,
  ].join("\n");
}

/** 新規問い合わせへの返信案を生成させるプロンプト。 */
export function buildAikaReplyPrompt(inquiryText: string, prospect: Partial<Prospect> = {}): string {
  return [
    AIKA_RULES,
    "",
    GYM_INFO,
    "",
    prospectContext(prospect),
    "",
    `【問い合わせ本文】\n${inquiryText}`,
    "",
    "【出力してほしいもの】",
    "1. 丁寧な返信文",
    "2. 短めの返信文",
    "3. 体験誘導を強めた返信文",
    "4. 24時間後の追客文",
    "5. 属性分類（female/male/kids/parent_child/senior/unknown）",
    "6. 温度感（A=体験予約に近い / B=興味あり / C=情報収集中）",
    "7. 次アクション（1行）",
  ].join("\n");
}

/** 追客（再提案）文を生成させるプロンプト。 */
export function buildFollowupPrompt(prospect: Partial<Prospect>): string {
  return [
    AIKA_RULES,
    "",
    GYM_INFO,
    "",
    prospectContext(prospect),
    "",
    `直近のやり取り: ${prospect.inquiryText || "（記録なし）"}`,
    "",
    "返信が止まっている見込み客への、しつこくない追客メッセージを1案作成してください。候補日を添えて、押し付けずに体験へ誘導します。",
  ].join("\n");
}

/** 体験後フォロー文を生成させるプロンプト。 */
export function buildTrialFollowupPrompt(prospect: Partial<Prospect>): string {
  return [
    AIKA_RULES,
    "",
    GYM_INFO,
    "",
    prospectContext(prospect),
    "",
    `体験日: ${prospect.trialDate || "（未記録）"} / 体験の様子: ${prospect.memo || "（未記録）"}`,
    "",
    "体験に来たが未入会の方へ、当日お礼・翌日フォロー・入会案内の3案を作成してください。押し込まず、安心感を優先します。",
  ].join("\n");
}

/** 口コミ依頼文を生成させるプロンプト。 */
export function buildReviewRequestPrompt(prospect: Partial<Prospect>): string {
  return [
    AIKA_RULES,
    "",
    prospectContext(prospect),
    "",
    "入会・体験・大会参加など良い体験の直後に送る、Google口コミ依頼メッセージを1案作成してください。一言でも気軽に書ける雰囲気にします。",
  ].join("\n");
}
