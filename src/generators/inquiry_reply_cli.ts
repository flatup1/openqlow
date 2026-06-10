// CLI: 問い合わせ文を渡すと AIKA 返信案・追客文・属性分類を表示する。
//
//   npm run inquiry -- "小学生の子供に習わせたいのですが初心者でも大丈夫ですか？"
//   npm run inquiry -- "ダイエット目的で通いたい女性です。料金を教えてください" --gender female
//
// 送信は行わない。表示された下書きを人間が確認してから使う。

import {
  generateInquiryReply,
  type Gender,
  type InquiryInput,
} from "./inquiry_reply.js";

const ATTRIBUTE_LABEL: Record<string, string> = {
  kids: "キッズ",
  women: "女性",
  men: "男性",
  parent_child: "親子",
  senior: "シニア",
  beginner: "初心者",
};

const TEMPERATURE_LABEL: Record<string, string> = {
  high: "高",
  mid: "中",
  low: "低",
};

const NEXT_ACTION_LABEL: Record<string, string> = {
  propose_schedule: "体験日程を提案",
  await_reply: "返信待ち",
  resend: "再送",
  trial_done: "体験済み",
};

export function parseArgs(argv: string[]): InquiryInput {
  const positional: string[] = [];
  const opts: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "";
      opts[key] = value;
    } else {
      positional.push(token);
    }
  }
  const message = (opts.message ?? positional.join(" ")).trim();
  const input: InquiryInput = { message };
  if (opts.gender) input.gender = opts.gender as Gender;
  if (opts.purpose) input.purpose = opts.purpose;
  if (opts.time) input.preferredTime = opts.time;
  if (opts.memo) input.memo = opts.memo;
  return input;
}

function section(title: string, body: string): string {
  return `\n■ ${title}\n${body}`;
}

export function renderResult(input: InquiryInput): string {
  const result = generateInquiryReply(input);
  const c = result.classification;
  const r = result.replies;
  const lines = [
    "================ FLATUP集客AI司令塔 / 問い合わせ返信AIKA ================",
    section("属性分類", [
      `属性     : ${ATTRIBUTE_LABEL[c.attribute] ?? c.attribute}`,
      `温度感   : ${TEMPERATURE_LABEL[c.temperature] ?? c.temperature}`,
      `目的     : ${c.purpose}`,
      `次アクション : ${NEXT_ACTION_LABEL[c.nextAction] ?? c.nextAction}`,
      `優先度   : ${c.priority}`,
    ].join("\n")),
    section("① 丁寧な返信文", r.polite),
    section("② 短めの返信文", r.short),
    section("③ 予約誘導を強めた返信文", r.bookingFocused),
    section("④ 24時間後の追客文", r.followUp24h),
    section("⑤ 3日後の追客文", r.followUp3d),
    section("注意", result.notes.map(n => `- ${n}`).join("\n")),
    "=====================================================================",
  ];
  return lines.join("\n");
}

// tsx 直接実行時のみ動かす（テストからの import では実行しない）
const invokedDirectly = process.argv[1]?.endsWith("inquiry_reply_cli.ts");
if (invokedDirectly) {
  const input = parseArgs(process.argv.slice(2));
  if (!input.message) {
    console.error('Usage: npm run inquiry -- "<問い合わせ文>" [--gender female|male] [--purpose ...] [--time ...]');
    process.exit(1);
  }
  console.log(renderResult(input));
  process.exit(0);
}
