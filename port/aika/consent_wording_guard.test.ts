// 入会同意フローの「お客様に見せる文面」ガード。
//
// なぜ必要か:
//   2026-08-06 に作った LINE 設定書の【1/2】文面が
//   「違約金（入会金相当10,000円）が発生します」と断定していた。
//   正本 src/shared/cancellation_rules.md は「発生する**可能性がある**」
//   「AIKAは断定しない」としており、正本違反。9日間だれも気づかなかった。
//
//   気づけなかった理由は2つある。どちらも既存の仕組みの穴だった。
//     1. no-hardcoded-canon.test.ts は src/ と port/ しか走査せず、docs/ を見ない。
//     2. response_quality.ts の100点スコアラーは「話し方」しか見ない。
//        実測でも修正前後どちらも 100/100 perfect だった（＝断定を検出できない）。
//
//   そこでこのテストは「事実の正しさ」の側を見張る。話し方はスコアラーに任せる。
//
// 置き場所について:
//   採点に response_quality.ts と guardian_consent.ts を使うため port/aika に置く。
//   src/ から port/ は import できない（tsconfig の rootDir が src のため）。
//   ただしこのテストは openqlow のリポジトリ構成（docs/ と src/）に依存するので、
//   **AIKA へ移植するキットには含めない**。移植対象は .ts の本体だけ。
//
// 対象は「お客様の目に入る文面」だけ。設計メモや変更履歴の散文は対象外にする。
//   - Markdown: ```コードフェンス``` の中と、表の中の `インラインコード`
//     （＝実際に貼り付ける文面とボタン送信テキスト）だけを見る
//   - TypeScript: 文字列リテラルを見る
//   - HTML: タグを除いた本文を見る

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildAgeBandQuestion,
  buildGuardianConsentCard,
  buildConsentRecordMessage,
  GUARDIAN_CONSENT_REPLY,
  formatManagementNumber,
} from "./guardian_consent.js";
import { scoreResponseQuality } from "./response_quality.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

const violations: string[] = [];

// --- 1. 顧客向け文面の抽出 ----------------------------------------------------

interface Snippet {
  file: string;
  line: number;
  text: string;
}

/** Markdown からお客様に貼られる文面だけを取り出す。散文の説明は拾わない。 */
function extractFromMarkdown(rel: string): Snippet[] {
  const lines = readFileSync(path.join(repoRoot, rel), "utf8").split("\n");
  const out: Snippet[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      out.push({ file: rel, line: i + 1, text: line });
      continue;
    }
    // 表の中の `インラインコード` はボタンの送信テキスト＝トークに残る文言。
    // 表の行（| で始まる）に限る。散文中のインラインコードは説明であって文面ではない
    // （「FG-MC-20260806-0001 の形式は使うな」のような反例を拾ってしまうため）。
    if (!line.trimStart().startsWith("|")) continue;
    for (const m of line.matchAll(/`([^`]+)`/g)) {
      out.push({ file: rel, line: i + 1, text: m[1] });
    }
  }
  return out;
}

/** TypeScript から文字列リテラルを取り出す。 */
function extractFromTs(rel: string): Snippet[] {
  const lines = readFileSync(path.join(repoRoot, rel), "utf8").split("\n");
  const out: Snippet[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue;
    for (const m of line.matchAll(/"([^"]*)"/g)) {
      out.push({ file: rel, line: i + 1, text: m[1] });
    }
  }
  return out;
}

/** HTML からタグを除いた本文を取り出す。 */
function extractFromHtml(rel: string): Snippet[] {
  const raw = readFileSync(path.join(repoRoot, rel), "utf8");
  // <style> と HTMLコメントは文面ではないので落とす。
  const body = raw
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  return body
    .split("\n")
    .map((line, i) => ({ file: rel, line: i + 1, text: line.replace(/<[^>]*>/g, " ").trim() }))
    .filter(s => s.text.length > 0);
}

const snippets: Snippet[] = [
  ...extractFromMarkdown("docs/GUARDIAN_CONSENT_LINE_SETUP.md"),
  ...extractFromTs("src/crm/guardian_consent.ts"),
  ...extractFromTs("port/aika/guardian_consent.ts"),
  ...extractFromHtml("docs/templates/未成年者入会_保護者同意書.html"),
];

// --- 2. 違約金を断定していないか ----------------------------------------------
//
// 正本 cancellation_rules.md:
//   「入会金相当10,000円が発生する**可能性**がある」
//   「発生するかどうかは契約内容・キャンペーン条件による」「AIKAは断定しない」
//
// よって顧客向け文面で違約金に触れるときは、必ず含みを持たせる語が要る。

const HEDGES = ["可能性", "場合があ", "場合があり", "ことがあ", "こともあ", "場合は", "などにより", "異なる"];

for (const s of snippets) {
  if (!s.text.includes("違約金")) continue;
  // 「違約金」を含む文面に、断定を避ける語が1つも無ければ違反。
  if (!HEDGES.some(h => s.text.includes(h))) {
    violations.push(
      `${s.file}:${s.line} [違約金の断定] 正本は「発生する可能性がある」。含みを持たせる語が必要: ${s.text.trim().slice(0, 90)}`,
    );
  }
}

// --- 3. 違約金の金額を顧客向け文面に直書きしていないか --------------------------
//
// 金額を書くと、料金改定のたびに過去の同意記録と食い違う。
// 金額の正本は cancellation_rules.md であって、文面ではない。

const AMOUNT = /10[,，]?000|1万/;

for (const s of snippets) {
  if (!s.text.includes("違約金") && !s.text.includes("入会金相当")) continue;
  if (AMOUNT.test(s.text)) {
    violations.push(
      `${s.file}:${s.line} [違約金の金額直書き] 金額は正本 cancellation_rules.md にだけ置く: ${s.text.trim().slice(0, 90)}`,
    );
  }
}

// --- 4. 管理番号はドット区切りか ----------------------------------------------
//
// FG-MC-20260806-0001 のハイフン区切りは、返信前の品質ゲートが電話番号と
// 誤検出して送信を止める（2026-08-06 実測）。ドット区切りでなければならない。

const managementNumber = formatManagementNumber(1, new Date("2026-08-06T05:00:00Z"));
assert(
  /^FG-MC-\d{4}\.\d{2}\.\d{2}\.\d{4}$/.test(managementNumber),
  `管理番号はドット区切りでなければならない（電話番号と誤検出されるため）: ${managementNumber}`,
);

for (const s of snippets) {
  if (/FG-MC-\d{8}-\d{4}/.test(s.text)) {
    violations.push(
      `${s.file}:${s.line} [管理番号の形式] ハイフン区切りは電話番号と誤検出される。ドット区切りにする: ${s.text.trim().slice(0, 90)}`,
    );
  }
}

// --- 5. 文言の版が3か所で揃っているか ------------------------------------------
//
// 文言の版（CONSENT_TERMS_VERSION）は「どの文言に同意したか」を後から特定する鍵。
// ところが同じ版番号が3か所に散らばっている。
//
//   1. src/crm/guardian_consent.ts   … 同意記録に焼き込まれる版（台帳の正）
//   2. port/aika/guardian_consent.ts … LINEカードを組み立てる側の版
//   3. 紙の同意書（HTML）             … 印刷した用紙がどの文言か見分けるための版
//
// 1つだけ上げて他を忘れると、記録の版と実際に見せた文言がズレる。
// 紙に至っては、引き出しの中の古い用紙と新しい用紙が見分けられなくなる。
// 人間の注意力に頼らず、ここで機械的に揃っていることを確かめる。
//
// import ではなくテキストとして読むのは、port/aika を依存ゼロに保つため。

function readVersion(rel: string, re: RegExp): string {
  const raw = readFileSync(path.join(repoRoot, rel), "utf8");
  const m = raw.match(re);
  assert(m, `${rel} から文言の版を読み取れませんでした`);
  return m![1];
}

const versionCrm = readVersion(
  "src/crm/guardian_consent.ts",
  /CONSENT_TERMS_VERSION\s*=\s*"([^"]+)"/,
);
const versionAika = readVersion(
  "port/aika/guardian_consent.ts",
  /CONSENT_TERMS_VERSION\s*=\s*"([^"]+)"/,
);
const versionPaper = readVersion(
  "docs/templates/未成年者入会_保護者同意書.html",
  /文言版\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/,
);

if (versionAika !== versionCrm) {
  violations.push(
    `[文言の版ズレ] port/aika=${versionAika} と src/crm=${versionCrm} が違う。` +
      `記録される版と実際に見せる文言がズレる。両方を同じ値にすること`,
  );
}
if (versionPaper !== versionCrm) {
  violations.push(
    `[文言の版ズレ] 紙の同意書=${versionPaper} と src/crm=${versionCrm} が違う。` +
      `文言を変えたら紙の「文言版」も更新し、古い用紙は差し替えること`,
  );
}

// --- 6. 実際にLINEへ出るカード文面が100点か ------------------------------------
//
// docs の文面ではなく、コードが組み立てる本物の文面を採点する。
// ここが落ちたら、お客様に送る前に気づける。

const cards: ReadonlyArray<readonly [string, string]> = [
  ["年代をたずねるカード", buildAgeBandQuestion().text],
  ["保護者同意カード", buildGuardianConsentCard().text],
  ["同意受付の控え", buildConsentRecordMessage(managementNumber, new Date("2026-08-06T05:00:00Z"))],
];

for (const [name, text] of cards) {
  const r = scoreResponseQuality(text, {});
  if (r.total !== 100 || r.decision !== "perfect") {
    violations.push(`[話し方スコア] ${name}: ${r.total}/100 (${r.decision}) — 100/perfect であること`);
  }
}

// 保護者の同意文だけは 100点を求めない。理由:
//
//   これは AIKA が話す言葉ではなく、**お客様が送る言葉**であり、そのまま同意の記録
//   （＝後から「何に同意したか」を示す証拠）になる。
//
//   スコアラーの「FLATUPらしさ」軸は、文中に FLATUP/やさしい/安心/初心者 などが
//   無いと減点する。実測で 98/100 good、内訳は kindness 23/25（他3軸は満点）。
//   ここを100にするには同意文へ「安心」等を混ぜることになるが、それは
//   証拠として残る文章を売り文句で薄めることであり、本末転倒になる。
//
//   そこでこの1本だけは「悪化していないこと」を見張る。revise / reject に落ちたら
//   本当に問題があるということなので、そのときは止める。
{
  const r = scoreResponseQuality(GUARDIAN_CONSENT_REPLY, {});
  if (r.decision === "revise" || r.decision === "reject") {
    violations.push(`[話し方スコア] 保護者の同意文: ${r.total}/100 (${r.decision}) — good 以上であること`);
  }
}

// --- 結果 ---------------------------------------------------------------------

assert(
  violations.length === 0,
  `入会同意フローの文面に問題があります:\n${violations.map(v => "  - " + v).join("\n")}`,
);

console.log(
  `consent_wording_guard tests passed (${snippets.length} 文面を検査、カード${cards.length}枚すべて100/100 perfect、0 violations)`,
);
