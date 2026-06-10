// CLI: 体験後フォロー（当日お礼/翌日/入会案内/口コミ依頼）を生成して表示する。
//
//   npm run trial-followup -- --gender female --age 30代 --reaction "ミット打ちが楽しそう" --concern 料金 --status 検討中
//
// 既存の朝インタビュー trial ジャンルの回答（gender / age_band / reaction /
// hesitation_reason / enrollment_status）をそのまま渡せる。
// 送信は行わない。表示された下書きを人間が確認してから使う。

import {
  generateTrialFollowup,
  type Gender,
  type TrialFollowupInput,
} from "./trial_followup.js";

export function parseArgs(argv: string[]): TrialFollowupInput {
  const opts: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "";
      opts[key] = value;
    }
  }
  const input: TrialFollowupInput = {};
  if (opts.gender) input.gender = opts.gender as Gender;
  if (opts.age) input.ageBand = opts.age;
  if (opts.reaction) input.reaction = opts.reaction;
  if (opts.good) input.goodPoint = opts.good;
  if (opts.concern) input.concern = opts.concern;
  if (opts.status) input.enrollmentStatus = opts.status;
  return input;
}

function section(title: string, body: string): string {
  return `\n■ ${title}\n${body}`;
}

export function renderResult(input: TrialFollowupInput): string {
  const result = generateTrialFollowup(input);
  const m = result.messages;
  return [
    "================ FLATUP集客AI司令塔 / 体験後フォロー ================",
    section("① 当日お礼文", m.sameDayThanks),
    section("② 翌日フォロー文", m.nextDayFollow),
    section("③ 入会案内文", m.enrollmentInfo),
    section("④ Google口コミ依頼文", m.reviewRequest),
    section("注意", result.notes.map(n => `- ${n}`).join("\n")),
    "=================================================================",
  ].join("\n");
}

// tsx 直接実行時のみ動かす（テストからの import では実行しない）
const invokedDirectly = process.argv[1]?.endsWith("trial_followup_cli.ts");
if (invokedDirectly) {
  const input = parseArgs(process.argv.slice(2));
  console.log(renderResult(input));
  process.exit(0);
}
