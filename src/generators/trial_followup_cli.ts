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
import { parseFlags, section } from "./shared.js";

export function parseArgs(argv: string[]): TrialFollowupInput {
  const { flags } = parseFlags(argv);
  const input: TrialFollowupInput = {};
  if (flags.gender) input.gender = flags.gender as Gender;
  if (flags.age) input.ageBand = flags.age;
  if (flags.reaction) input.reaction = flags.reaction;
  if (flags.good) input.goodPoint = flags.good;
  if (flags.concern) input.concern = flags.concern;
  if (flags.status) input.enrollmentStatus = flags.status;
  return input;
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
