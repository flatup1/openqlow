import { generateAdCopy, AD_SEGMENTS, type AdSegment } from "./ad_copy.js";
import { parseArgs, renderResult } from "./ad_copy_cli.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// --- 全6セグメントが生成でき、Google/IG/LINE が揃う -------------------------
for (const segment of AD_SEGMENTS) {
  const r = generateAdCopy({ segment });
  assert(r.variant.google.headlines.length === 3, `${segment}: 3 google headlines`);
  assert(r.variant.google.descriptions.length >= 1, `${segment}: has google description`);
  assert(r.variant.instagram.caption.length > 0, `${segment}: has instagram caption`);
  assert(r.variant.instagram.hashtags.length > 0, `${segment}: has hashtags`);
  assert(r.variant.line.length > 0, `${segment}: has line copy`);
  // 全媒体で初回体験500円のCTAが入る
  assert(r.variant.google.descriptions.join(" ").includes("500円"), `${segment}: google mentions trial price`);
  assert(r.variant.instagram.caption.includes("500円"), `${segment}: instagram mentions trial price`);
  assert(r.variant.line.includes("500円"), `${segment}: line mentions trial price`);
  // 安全注意が必ず入る
  assert(r.notes.some(n => n.includes("自動配信はしません")), `${segment}: notes warn no auto-publish`);
}

// --- Google広告の文字数制限を守る（見出し半角30 / 説明文半角90 以内） -------
// 半角=1 / 全角=2 で概算（Googleの字幅ルールに合わせる）。
const halfWidth = (s: string): number =>
  [...s].reduce((n, ch) => n + (ch.charCodeAt(0) <= 0xff ? 1 : 2), 0);
for (const segment of AD_SEGMENTS) {
  const g = generateAdCopy({ segment }).variant.google;
  for (const h of g.headlines) {
    assert(halfWidth(h) <= 30, `${segment}: headline within 30 half-width: "${h}" (${halfWidth(h)})`);
  }
  for (const d of g.descriptions) {
    assert(halfWidth(d) <= 90, `${segment}: description within 90 half-width: "${d}" (${halfWidth(d)})`);
  }
  // 説明文は 価値 / 安心 / CTA の3本
  assert(g.descriptions.length === 3, `${segment}: 3 google descriptions`);
}

// --- セグメントごとに文面が差し替わる ---------------------------------------
const women = generateAdCopy({ segment: "women_beginner" });
const kids = generateAdCopy({ segment: "kids" });
assert(women.label === "女性初心者", "women label");
assert(kids.label === "キッズ", "kids label");
assert(women.variant.line !== kids.variant.line, "different segments produce different copy");
assert(women.variant.instagram.hashtags.includes("成田市"), "common tags appended");

// --- 誇大表現を含まない（簡易チェック） -------------------------------------
const FORBIDDEN = ["必ず痩せ", "確実に痩せ", "100%", "誰でも痩せ"];
for (const segment of AD_SEGMENTS) {
  const r = generateAdCopy({ segment });
  const all = [
    ...r.variant.google.headlines,
    ...r.variant.google.descriptions,
    r.variant.instagram.caption,
    r.variant.line,
  ].join(" ");
  for (const bad of FORBIDDEN) {
    assert(!all.includes(bad), `${segment}: ad copy must not contain overclaim "${bad}"`);
  }
}

// --- 不正なセグメントはエラー -----------------------------------------------
let threw = false;
try {
  generateAdCopy({ segment: "unknown" as AdSegment });
} catch {
  threw = true;
}
assert(threw, "unknown segment should throw");

// --- CLI 引数パース ----------------------------------------------------------
const p1 = parseArgs(["--segment", "kids", "--platform", "instagram"]);
assert(p1.segment === "kids", "parses valid segment");
assert(p1.platform === "instagram", "parses valid platform");
const p2 = parseArgs(["--segment", "bogus"]);
assert(p2.segment === undefined, "invalid segment is dropped");
const p3 = parseArgs(["--segment", "diet", "--platform", "bogus"]);
assert(p3.platform === undefined, "invalid platform is dropped");

// --- CLI レンダリング（platform 指定で絞れる） -------------------------------
const full = renderResult("women_beginner");
assert(full.includes("Google広告") && full.includes("Instagram広告") && full.includes("LINE配信"), "full render shows all platforms");
const onlyLine = renderResult("women_beginner", "line");
assert(onlyLine.includes("■ LINE配信") && !onlyLine.includes("■ Google広告"), "platform filter limits output");

console.log("ad copy tests passed");
