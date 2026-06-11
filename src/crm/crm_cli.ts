// CRM CLI — 見込み客の記録・追客の見える化・日報・自己修復ログ
//
//   npm run crm -- add --name 田中 --gender female --category female --status new_inquiry --inquiry "初心者でも大丈夫ですか"
//   npm run crm -- list
//   npm run crm -- status 1 replied
//   npm run crm -- followups
//   npm run crm -- daily-report
//   npm run crm -- log-error api_error "401 Unauthorized"
//
// 送信は行わない。日報・追客候補は人間が確認してから動く（営業参謀であって営業担当ではない）。

import path from "node:path";
import { parseFlags } from "../generators/shared.js";
import { openProspectStore } from "./store.js";
import { buildDailyReport, saveDailyReport } from "./daily_report.js";
import { getFollowupNeeded, getReviewRequestCandidates, getTrialFollowupNeeded } from "./queries.js";
import { logError, type ErrorType } from "./self_repair.js";
import { PROSPECT_STATUSES, type ProspectInput, type ProspectStatus } from "./prospect.js";

const baseDir = process.env.OPENQLOW_DATA_DIR || path.join(process.cwd(), "data");
const storeFile = path.join(baseDir, "prospects.json");

function flagsToProspectInput(flags: Record<string, string>): ProspectInput {
  const input: ProspectInput = {};
  if (flags.name) input.name = flags.name;
  if (flags.source) input.contactSource = flags.source;
  if (flags.gender) input.gender = flags.gender;
  if (flags.age) input.ageGroup = flags.age;
  if (flags.category) input.category = flags.category as ProspectInput["category"];
  if (flags.purpose) input.purpose = flags.purpose;
  if (flags.temperature) input.temperature = flags.temperature as ProspectInput["temperature"];
  if (flags.status) input.status = flags.status as ProspectStatus;
  if (flags.inquiry) input.inquiryText = flags.inquiry;
  if (flags.memo) input.memo = flags.memo;
  if (flags.trialDate) input.trialDate = flags.trialDate;
  if (flags.contact) input.lastContactAt = flags.contact;
  return input;
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const { flags, positional } = parseFlags(rest);
  const store = openProspectStore(storeFile);

  switch (command) {
    case "add": {
      const input = flagsToProspectInput(flags);
      if (!input.lastContactAt) input.lastContactAt = new Date().toISOString();
      const created = await store.create(input);
      console.log(`登録しました: #${created.id} ${created.name || "(無名)"} [${created.status}]`);
      return 0;
    }
    case "list": {
      const all = await store.getAll();
      if (!all.length) {
        console.log("見込み客はまだ登録されていません。");
        return 0;
      }
      for (const p of all) {
        console.log(`#${p.id} ${p.name || "(無名)"} | ${p.category} | ${p.status} | 温度:${p.temperature || "-"} | 最終連絡:${p.lastContactAt?.slice(0, 16) || "-"}`);
      }
      return 0;
    }
    case "status": {
      const id = Number(positional[0] ?? flags.id);
      const status = (positional[1] ?? flags.to) as ProspectStatus;
      if (!id || !PROSPECT_STATUSES.includes(status)) {
        console.error(`Usage: crm status <id> <${PROSPECT_STATUSES.join("|")}>`);
        return 1;
      }
      const updated = await store.update(id, { status, lastContactAt: new Date().toISOString() });
      if (!updated) {
        console.error(`#${id} が見つかりません。`);
        return 1;
      }
      console.log(`#${id} を ${status} に更新しました。`);
      return 0;
    }
    case "followups": {
      const all = await store.getAll();
      const now = new Date();
      const print = (title: string, list: { id: number; name: string }[]) => {
        console.log(`\n■ ${title}（${list.length}件）`);
        if (!list.length) console.log("  なし");
        for (const p of list) console.log(`  #${p.id} ${p.name || "(無名)"}`);
      };
      print("追客漏れ候補", getFollowupNeeded(all, now));
      print("体験後フォロー候補", getTrialFollowupNeeded(all));
      print("口コミ依頼候補", getReviewRequestCandidates(all));
      return 0;
    }
    case "daily-report": {
      const all = await store.getAll();
      const { markdown, dateIso } = buildDailyReport(all, new Date());
      const { filePath } = await saveDailyReport(markdown, dateIso, baseDir);
      console.log(markdown);
      console.log(`\n保存しました: ${filePath}`);
      return 0;
    }
    case "log-error": {
      const type = (positional[0] ?? flags.type ?? "unknown") as ErrorType;
      const message = positional.slice(1).join(" ") || flags.message || "";
      const { filePath } = await logError(type, message, flags.context, baseDir);
      console.log(`自己修復ログを記録しました: ${filePath}`);
      return 0;
    }
    default:
      console.error("Commands: add | list | status <id> <status> | followups | daily-report | log-error <type> <message>");
      return 1;
  }
}

const invokedDirectly = process.argv[1]?.endsWith("crm_cli.ts");
if (invokedDirectly) {
  const code = await main(process.argv.slice(2));
  process.exit(code);
}

export { main as runCrmCli };
