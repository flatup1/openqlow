import { auditSite } from "./site_audit.js";
import { parseArgs, renderResult } from "./site_audit_cli.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// --- 観点は常に6つ ----------------------------------------------------------
const empty = auditSite({ content: "" });
assert(empty.findings.length === 6, `6 checks always run, got ${empty.findings.length}`);
assert(empty.score === 0, "empty content scores 0");
assert(empty.findings.every(f => f.severity === "missing"), "empty content => all missing");
assert(empty.findings.every(f => f.suggestion), "missing findings include a suggestion");

// --- 充実したページは高スコア・missing なし ---------------------------------
const strong = auditSite({
  pageLabel: "トップページ",
  content: `
    FLATUP GYM 成田のキックボクシングジム。
    初心者・女性も安心、怒鳴らないアットホームな雰囲気。女性インストラクター在籍。
    ガチスパー禁止で安全に続けられます。
    料金: 初回体験500円 / 月会費 女性8800円 / 入会金10000円。
    キッズクラスもあり、礼儀と自信が身につく習い事として保護者にも人気です。
    アクセス: 成田市の住所、専用駐車場あり。
    お問い合わせはLINEからお気軽にどうぞ。初回体験を予約する。
  `,
});
assert(strong.pageLabel === "トップページ", "uses provided label");
assert(strong.score >= 90, `rich page scores high, got ${strong.score}`);
assert(!strong.findings.some(f => f.severity === "missing"), "rich page has no missing findings");

// --- HTMLタグは除去して可視テキストで判定する -------------------------------
const html = auditSite({
  content: `<div><style>.x{}</style><script>var a=1;</script>
    <a class="btn cta" href="/reserve">初回体験500円を予約する</a></div>`,
});
const cta = html.findings.find(f => f.area === "体験予約の導線");
assert(cta?.severity === "good", "CTA inside <a> tag is detected as good after tag stripping");

// --- 料金未記載は最も重要な欠落として missing ------------------------------
const noPrice = auditSite({ content: "初心者歓迎の楽しいジムです。体験予約はこちら。" });
const priceFinding = noPrice.findings.find(f => f.area === "料金の分かりやすさ");
assert(priceFinding?.severity === "missing", "no price => missing");
assert(priceFinding?.suggestion?.includes("500円"), "price suggestion references trial price");

// --- 体験に触れるが予約導線が弱い => warn -----------------------------------
const weakCta = auditSite({ content: "体験ができます。楽しいジムです。" });
const ctaWeak = weakCta.findings.find(f => f.area === "体験予約の導線");
assert(ctaWeak?.severity === "warn", "mentions 体験 but no action => warn");

// --- スコアは 0-100 の範囲 ---------------------------------------------------
assert(strong.score >= 0 && strong.score <= 100, "score within range");
assert(strong.summary.includes("スコア"), "summary mentions score");

// --- 安全注意が必ず入る ------------------------------------------------------
assert(empty.notes.some(n => n.includes("簡易チェック")), "notes flag heuristic nature");

// --- CLI 引数パース ----------------------------------------------------------
const parsed = parseArgs(["--file", "./index.html", "--label", "トップ"]);
assert(parsed.file === "./index.html", "parses --file");
assert(parsed.label === "トップ", "parses --label");

// --- CLI レンダリング --------------------------------------------------------
const rendered = renderResult({ content: strong ? "料金 初回体験500円 LINE 予約する 駐車場 成田 キッズ 礼儀 初心者 女性 安心" : "" });
assert(rendered.includes("サイト改善チェック"), "render includes title");
assert(rendered.includes("✅") || rendered.includes("⚠") || rendered.includes("❌"), "render shows severity marks");

console.log("site audit tests passed");
