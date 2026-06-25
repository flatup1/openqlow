import { redactPii, ingestToMarkdown, sourceFileName, slugify } from "./ingest.js";
import { buildScorecard, renderScorecardMarkdown } from "./score.js";
import { compareScorecards, renderImprovementReport } from "./report.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// ───────── ① 取り込み: PII除去 ─────────
const raw =
  "問い合わせ: 090-1234-5678 / test@example.com / Uaa10d8962ee00789c2a52cfa01a94cff\n" +
  "Pairing code: M3VDEDUX";
const red = redactPii(raw);
assert(!red.includes("090-1234-5678"), "phone must be redacted");
assert(!red.includes("test@example.com"), "email must be redacted");
assert(!red.includes("Uaa10d8962ee00789c2a52cfa01a94cff"), "LINE userId must be redacted");
assert(!red.includes("M3VDEDUX"), "pairing code must be redacted");
assert(red.includes("[電話番号]") && red.includes("[メール]") && red.includes("[LINE_ID]"), "placeholders present");

// 全角電話も
assert(!redactPii("０９０－１２３４－５６７８").includes("１２３４"), "full-width phone must be redacted");

const md = ingestToMarkdown({ raw, title: "LINE 問い合わせ", date: "2026-06-25", kind: "line", tags: ["crm"] });
assert(md.startsWith("---"), "markdown has frontmatter");
assert(md.includes("privacy: redacted"), "marks redacted");
assert(!md.includes("090-1234-5678"), "ingested markdown carries no raw phone");
assert(sourceFileName("2026-06-25", "LINE 問い合わせ").startsWith("20260625-"), "filename has date prefix");
assert(slugify("こんにちは!!") === "source", "non-ascii slug falls back to 'source'");

// ───────── ② 採点 ─────────
const good =
  "ご不安ですよね😊 FLATUP GYMは怒鳴らない、世界一優しい格闘技ジムです。" +
  "初心者の方も自分のペースで安心して始められますよ。まずはご希望の曜日だけ教えていただけますか？";
const bad = "本気じゃないなら来るな。根性で限界まで追い込め。";
const sc = buildScorecard([good, bad], "2026-06-25");
assert(sc.count === 2, "scorecard counts both");
assert(sc.failRate === 0.5, `failRate should be 0.5, got ${sc.failRate}`);
assert(sc.items.some(i => i.decision === "reject"), "harsh reply must be flagged reject");
assert(sc.avgTotal > 0 && sc.avgTotal <= 100, "avgTotal in range");
assert(renderScorecardMarkdown(sc).includes("/100"), "scorecard markdown shows /100");

// 全部良いと failRate 0
const allGood = buildScorecard([good, good.replace("曜日", "時間帯")], "2026-06-25");
assert(allGood.failRate === 0, `all-good failRate should be 0, got ${allGood.failRate}`);

// ───────── ③ 改善提案 ─────────
const prev = buildScorecard([good, good], "2026-06-24"); // 高い
const curr = buildScorecard([good, bad], "2026-06-25");  // 下がった
const rep = compareScorecards(prev, curr);
assert(rep.regressions.length > 0, "regression detected when avg drops");
assert(rep.suggestions.length > 0, "weak axis produces suggestions");
const repMd = renderImprovementReport(rep);
assert(repMd.includes("自動マージしない"), "report warns no auto-merge");

// 初回（prevなし）でも落ちない
const first = compareScorecards(null, curr);
assert(typeof first.summary === "string" && first.regressions.length === 0, "first run has no regressions");

console.log("loop tests passed");
