import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildDailyReport, saveDailyReport } from "./daily_report.js";
import { normalizeProspectInput, type Prospect, type ProspectInput } from "./prospect.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

let idSeq = 0;
function make(input: ProspectInput, createdAt = "2026-06-11T01:00:00.000Z"): Prospect {
  idSeq += 1;
  return { id: idSeq, ...normalizeProspectInput(input), createdAt, updatedAt: createdAt };
}

const now = new Date("2026-06-11T12:00:00.000Z");
const overdue = "2026-06-10T00:00:00.000Z";

const prospects: Prospect[] = [
  make({ name: "新規さん", status: "new_inquiry", category: "female", purpose: "ダイエット" }),
  make({ name: "返信待ちさん", status: "waiting_reply", lastContactAt: overdue, gender: "female", inquiryText: "初心者でも大丈夫ですか" }),
  make({ name: "追客さん", status: "replied", lastContactAt: overdue, gender: "male", inquiryText: "料金を教えてください" }),
  make({ name: "体験予定さん", status: "trial_scheduled", trialDate: "2026-06-14" }),
  make({ name: "体験済みさん", status: "trial_done", trialDate: "2026-06-09", gender: "female" }),
  make({ name: "入会さん", status: "joined", joined: 1 }, "2026-06-11T02:00:00.000Z"),
  make({ name: "失注さん", status: "lost", lostReason: "家族と相談中" }),
];

const { markdown, dateIso } = buildDailyReport(prospects, now);

assert(markdown.startsWith("# FLATUP集客日報 2026-06-11"), "report has dated title");
assert(dateIso.startsWith("2026-06-11"), "dateIso correct");

// 各セクションが存在
for (const heading of [
  "## 1. 今日の新規問い合わせ",
  "## 2. 返信漏れ候補",
  "## 3. 追客候補",
  "## 4. 体験予約済み",
  "## 5. 体験後フォロー候補",
  "## 6. 口コミ依頼候補",
  "## 7. 入会・失注状況",
  "## 8. 今日の改善アクションTop3",
  "## 9. openQLOWコメント",
]) {
  assert(markdown.includes(heading), `report includes "${heading}"`);
}

// 候補の振り分け
assert(markdown.includes("返信待ちさん"), "waiting_reply shows in 返信漏れ");
assert(markdown.includes("追客さん"), "replied overdue shows in 追客");
assert(markdown.includes("体験予定さん"), "trial_scheduled shows in 体験予約済み");
assert(markdown.includes("体験済みさん"), "trial_done shows in 体験後フォロー");
assert(markdown.includes("入会さん"), "joined shows in 口コミ依頼");
assert(markdown.includes("家族と相談中"), "lost reason shown");

// 推奨メッセージが AIKA 生成文（末尾 AIKA）を含む
assert(markdown.includes("AIKA"), "recommended messages reuse AIKA generators");

// 改善アクションが最低3つ
const top3 = markdown.split("## 8. 今日の改善アクションTop3")[1].split("## 9.")[0];
assert(/1\. .+/.test(top3) && /3\. .+/.test(top3), "Top3 actions listed");

// 自動送信しない旨
assert(markdown.includes("自動送信はしません"), "report notes no auto-send");

// 保存
const dir = await mkdtemp(path.join(tmpdir(), "crm-report-"));
try {
  const { filePath, bytes } = await saveDailyReport(markdown, dateIso, dir);
  assert(filePath.endsWith("2026-06-11_FLATUP集客日報.md"), "saved with dated filename");
  assert(bytes > 0, "wrote bytes");
  const saved = await readFile(filePath, "utf8");
  assert(saved.includes("FLATUP集客日報"), "file content correct");
  console.log("crm daily report tests passed");
} finally {
  await rm(dir, { recursive: true, force: true });
}
