// 案件ファイル読み込み・問い合わせ下書き・レポートのテスト。
// あわせて「調達AIは送信手段を持たない」ことをソース走査で固定する。

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SourcingRequirement } from "./requirement.js";
import type { Candidate } from "./candidate.js";
import { screenAll } from "./candidate.js";
import { scoreAll } from "./score.js";
import { EXPRESS_LEAD_TIME } from "./schedule.js";
import { buildReport, comparisonTable, formatFunnel, funnelOf } from "./report.js";
import { DRAFT_HEADER, buildDeadlineConfirmation, buildNegotiation, buildRfq } from "./message.js";
import { candidateTemplate, parseCaseFile } from "./case_file.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

const requirement: SourcingRequirement = {
  id: "test-medal",
  item: "メダル",
  quantity: 50,
  arrivalDeadline: "2026-09-22",
  deadlineHalf: "AM",
  destination: "千葉県成田市",
  destinationEnglish: "Narita, Chiba, Japan",
  useDate: "2026-09-23",
  mustHaves: ["金属製", "ゴールド系"],
  mustHavesEnglish: ["Metal medal (zinc alloy)", "Gold plating"],
  priorities: ["納期", "品質", "総額", "デザイン"],
};

// --- 問い合わせ下書き ---
const rfq = buildRfq(requirement, "award medals");
assert(rfq.full.startsWith(DRAFT_HEADER), "下書き見出しが先頭に付く");
assert(rfq.subject.includes("50 pcs"), "件名に数量が入る");
assert(rfq.subject.includes("by the morning of September 22, 2026"), "件名に午前必着が入る");
assert(rfq.body.includes("Narita, Chiba, Japan by the morning of September 22, 2026"), "本文で届け先と必着を明示");
assert(!rfq.full.includes("千葉県"), "海外業者への文面に日本語の届け先を混ぜない");
assert(rfq.body.includes("\n\nHello,") === false && rfq.body.startsWith("Hello,"), "本文はHelloで始まる");
assert(rfq.body.includes("Quantity: 50 pcs\nProduct: custom award medals"), "数量と品名が並ぶ");
assert(rfq.body.includes("Thank you."), "末尾の締めが残る");
assert(rfq.body.split("\n\n").length > 5, "段落の空行が残っている（1行に潰れていない）");
assert(rfq.body.includes("GUARANTEE"), "納期保証を必ず聞く");
assert(rfq.body.includes("itemized"), "内訳つきの総額を必ず聞く");
assert(rfq.body.includes("- Metal medal (zinc alloy)"), "要件は英語で箇条書きになる");
assert(rfq.body.includes("Our event will be held on September 23, 2026"), "使用日は英語表記で入る");

const pmRequirement: SourcingRequirement = { ...requirement, deadlineHalf: "PM" };
assert(!buildRfq(pmRequirement, "medal").subject.includes("morning"), "午前指定でなければ morning とは書かない");

const rounds = [1, 2, 3] as const;
const discounts = ["5%", "10%", "15%"];
rounds.forEach((round, i) => {
  const draft = buildNegotiation(requirement, "award medals", round);
  assert(draft.body.includes(`about ${discounts[i]}`), `${round}回目の値引き幅は${discounts[i]}`);
  assert(draft.body.includes("must not change"), "納期を犠牲にしないと毎回書く");
});

const confirm = buildDeadlineConfirmation(requirement);
assert(confirm.body.includes("Yes or No"), "曖昧な回答を許さない聞き方をする");

// --- 案件ファイルの検証 ---
const good = {
  requirement,
  itemEnglish: "award medals",
  lead: EXPRESS_LEAD_TIME,
  assumption: { fxRateToJpy: 150, dutyRatePercent: 0, consumptionTaxRatePercent: 10, domesticFeesJpy: 0 },
  candidates: [],
};
assert(parseCaseFile(good).value !== undefined, "正しい案件ファイルは読める");
assert(parseCaseFile({ ...good, itemEnglish: "" }).errors.some(e => e.includes("itemEnglish")), "英語名が無ければ落とす");
assert(parseCaseFile({ ...good, assumption: undefined }).errors.some(e => e.includes("assumption")), "為替・税率の前提が無ければ落とす");
assert(parseCaseFile("なにか").errors.length > 0, "オブジェクトでなければ落とす");

const dupIds = parseCaseFile({
  ...good,
  candidates: [
    { id: "a", supplier: "A", marketplace: "Alibaba", delivery: { couriers: [] }, quality: {}, trust: {} },
    { id: "a", supplier: "B", marketplace: "Alibaba", delivery: { couriers: [] }, quality: {}, trust: {} },
  ],
});
assert(dupIds.errors.some(e => e.includes("重複")), "IDの重複を落とす");

// null は「未確認」として undefined に揃える（JSONに undefined が書けないため）
const withNulls = parseCaseFile({
  ...good,
  candidates: [{ ...candidateTemplate(), id: "tmpl", supplier: "テンプレ" }],
});
assert(withNulls.value !== undefined, `テンプレートはそのまま読める: ${withNulls.errors.join(",")}`);
const templated = withNulls.value!.candidates[0];
assert(templated.moq === undefined, "null は未確認（undefined）になる");
assert(templated.quality.materialOk === undefined, "品質の null も未確認になる");
assert(templated.quote === undefined, "見積の null は未取得になる");
const templateScreen = screenAll([templated], requirement).screenings[0];
assert(templateScreen.unknowns.some(u => u.includes("素材")), "未確認が未確認として一覧に出る");
assert(!templateScreen.warnings.some(w => w.includes("素材")), "未確認を「要件を満たさない」と誤判定しない");

// リポジトリに置いた実案件ファイルが常に読めること
const medalCase = JSON.parse(readFileSync(path.join(repoRoot, "docs/sourcing/cases/2026-09-medal.json"), "utf8"));
const parsedMedal = parseCaseFile(medalCase);
assert(parsedMedal.value !== undefined, `同梱の案件ファイルが読めない: ${parsedMedal.errors.join(" / ")}`);
assert(parsedMedal.value!.requirement.arrivalDeadline === "2026-09-22", "必着日は2026-09-22");
assert(parsedMedal.value!.requirement.deadlineHalf === "AM", "午前必着");

// --- レポート ---
function candidate(patch: Partial<Candidate>): Candidate {
  return {
    id: "c",
    supplier: "業者",
    marketplace: "Alibaba",
    moq: 50,
    delivery: { guaranteedArrivalDate: "2026-09-20", guaranteedHalf: "AM", isGuaranteed: true, couriers: ["DHL"] },
    quality: {},
    trust: {},
    ...patch,
  };
}
const assumption = { fxRateToJpy: 150, dutyRatePercent: 0, consumptionTaxRatePercent: 10, domesticFeesJpy: 0 };
const quote = {
  currency: "USD" as const,
  unitPrice: 1.2,
  quantity: 50,
  moldFee: 40,
  designFee: 0,
  accessoryUnitPrice: 0.3,
  sampleFee: 0,
  shippingFee: 60,
  otherFees: 0,
};
const candidates = [
  candidate({ id: "a", supplier: "A社", quote, quality: { materialOk: true, evidencePhotos: true }, designMatchPercent: 80 }),
  candidate({ id: "b", supplier: "B社", quote: { ...quote, unitPrice: 2.0 } }),
  candidate({ id: "c", supplier: "C社", delivery: { guaranteedArrivalDate: "2026-09-30", isGuaranteed: true, couriers: ["DHL"] } }),
];
const { screenings } = screenAll(candidates, requirement);
const scored = scoreAll(candidates, requirement, assumption);

const funnel = funnelOf(scored, screenings);
assert(funnel.searched === 3 && funnel.passedFilter === 2 && funnel.quoted === 2, "ファネルの数が合う");
assert(formatFunnel(funnel).includes("SEARCH"), "進捗表示にSEARCHが出る");

const kept = scored.filter(s => !screenings.find(x => x.candidateId === s.candidate.id)!.excluded);
const table = comparisonTable(kept);
assert(table.includes("| Rank | Supplier |"), "比較表の見出しが出る");
assert(table.includes("A社") && !table.includes("C社"), "除外された業者は表に出ない");

const report = buildReport({ requirement, lead: EXPRESS_LEAD_TIME, today: "2026-09-05", scored: kept, screenings });
assert(report.includes("🥇 BEST BUY"), "BEST BUYを出す");
assert(report.includes("🥈 Backup"), "控えも出す");
assert(report.includes("未確認:"), "1位でも未確認を隠さない");
assert(report.includes("## 除外") && report.includes("c:"), "除外理由も残す");
assert(report.includes("不可能"), "今日発注では間に合わないことを先頭で告げる");
assert(report.includes("オーナー承認後"), "発注が承認事項であることを必ず書く");

// --- 送信手段を持たないことの保証 ---
// 下書きを作る場所と、実際に送る場所は分ける。ここに通信が入ったら誤送信の入口になる。
const FORBIDDEN = [/\bfetch\s*\(/, /axios/, /node:https?\b/, /XMLHttpRequest/, /nodemailer/];
const sources = readdirSync(here).filter(f => f.endsWith(".ts") && !f.endsWith(".test.ts"));
assert(sources.length >= 7, "走査対象のソースが取れている");
for (const file of sources) {
  const body = readFileSync(path.join(here, file), "utf8");
  const lines = body.split("\n").filter(line => !line.trimStart().startsWith("//"));
  for (const pattern of FORBIDDEN) {
    assert(!lines.some(line => pattern.test(line)), `src/sourcing/${file} に送信らしき処理がある: ${pattern}`);
  }
}

console.log("sourcing report tests passed");
