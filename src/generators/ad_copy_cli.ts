// CLI: ターゲットの広告文（Google / Instagram / LINE）を生成して表示する。
//
//   npm run ad-copy -- --segment women_beginner
//   npm run ad-copy -- --segment kids --platform instagram
//
// segment: women_beginner | kids | men_40s | diet | self_defense | exercise_shortage
// platform（任意）: google | instagram | line（省略時は全媒体）
// 配信は行わない。表示された下書きを人間が確認してから使う。

import {
  generateAdCopy,
  AD_SEGMENTS,
  type AdPlatform,
  type AdSegment,
} from "./ad_copy.js";
import { parseFlags, section } from "./shared.js";

const SEGMENT_LABELS = AD_SEGMENTS.join(" | ");

export function parseArgs(argv: string[]): { segment?: AdSegment; platform?: AdPlatform } {
  const { flags } = parseFlags(argv);
  const out: { segment?: AdSegment; platform?: AdPlatform } = {};
  if (flags.segment && (AD_SEGMENTS as string[]).includes(flags.segment)) {
    out.segment = flags.segment as AdSegment;
  }
  if (flags.platform === "google" || flags.platform === "instagram" || flags.platform === "line") {
    out.platform = flags.platform;
  }
  return out;
}

export function renderResult(segment: AdSegment, platform?: AdPlatform): string {
  const result = generateAdCopy({ segment });
  const v = result.variant;
  const blocks: string[] = [
    `============ FLATUP集客AI司令塔 / 広告文（${result.label}） ============`,
  ];
  if (!platform || platform === "google") {
    blocks.push(
      section(
        "Google広告",
        [
          `見出し: ${v.google.headlines.join(" / ")}`,
          `説明文: ${v.google.descriptions.join(" ")}`,
        ].join("\n"),
      ),
    );
  }
  if (!platform || platform === "instagram") {
    blocks.push(
      section(
        "Instagram広告",
        `${v.instagram.caption}\n\n${v.instagram.hashtags.map(t => `#${t}`).join(" ")}`,
      ),
    );
  }
  if (!platform || platform === "line") {
    blocks.push(section("LINE配信", v.line));
  }
  blocks.push(section("注意", result.notes.map(n => `- ${n}`).join("\n")));
  blocks.push("=====================================================================");
  return blocks.join("\n");
}

// tsx 直接実行時のみ動かす（テストからの import では実行しない）
const invokedDirectly = process.argv[1]?.endsWith("ad_copy_cli.ts");
if (invokedDirectly) {
  const { segment, platform } = parseArgs(process.argv.slice(2));
  if (!segment) {
    console.error(`Usage: npm run ad-copy -- --segment <${SEGMENT_LABELS}> [--platform google|instagram|line]`);
    process.exit(1);
  }
  console.log(renderResult(segment, platform));
  process.exit(0);
}
