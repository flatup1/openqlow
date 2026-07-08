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
import { buildProspectFromInquiry } from "./intake.js";
import { resolveStatus, type Prospect, type ProspectInput, type ProspectStatus } from "./prospect.js";
import { generateInquiryReply } from "../generators/inquiry_reply.js";
import { generateTrialFollowup } from "../generators/trial_followup.js";
import type { Gender } from "../generators/shared.js";

const baseDir = process.env.OPENQLOW_DATA_DIR || path.join(process.cwd(), "data");
const storeFile = path.join(baseDir, "prospects.json");
const followupHours = Number(process.env.OPENQLOW_FOLLOWUP_HOURS) || 24;

function coerceGender(value: string): Gender {
  if (value === "female" || /女/.test(value)) return "female";
  if (value === "male" || /男/.test(value)) return "male";
  return "unknown";
}

/** 見込み客1人に合った返信下書きを返す（status に応じて生成器を使い分け）。 */
function draftFor(p: Prospect): string {
  const gender = coerceGender(p.gender);
  if (p.status === "joined") {
    return generateTrialFollowup({ gender }).messages.reviewRequest;
  }
  if (p.status === "trial_done") {
    return generateTrialFollowup({
      gender,
      ageBand: p.ageGroup,
      concern: p.memo || p.lostReason,
      enrollmentStatus: p.trialStatus,
    }).messages.nextDayFollow;
  }
  return generateInquiryReply({
    message: p.inquiryText?.trim() || "体験について相談したい",
    gender,
  }).replies.followUp24h;
}

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

function printHelp(): void {
  console.log(`CRM（集客・追客アシスタント）の使い方

  npm run crm -- <コマンド>

■ よく使う
  intake --message "<問い合わせ文>"   問い合わせを取り込み、返信下書きまで一気に出す
  followups [--drafts]                 今フォローすべき人の一覧（--drafts で全員の返信下書きも一括表示）
  draft <番号>                         その人向けの返信下書きを出す（自動送信はしません）
  daily-report                         今日の集計レポートを作って保存

■ 名簿の操作
  list [--status 入会]                 一覧表示（--status で状態を絞り込み。日本語OK）
  find <名前の一部>                    名前で探す
  show <番号>                          その人の詳しい情報をすべて表示
  status <番号> <状態> [--memo "…"]   状態を更新（メモも残せる。メモは返信下書きに反映）
  add [--name 田中 --gender female ...] 手動で1件登録

■ その他
  log-error <種別> <メッセージ>        うまく動かない時の記録を残す
  help                                 この使い方を表示

ヒント: どのコマンドも勝手にメッセージを送りません。送るのは必ず人の最終確認のあとです。`);
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const { flags, positional } = parseFlags(rest);
  const store = openProspectStore(storeFile);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }

  switch (command) {
    case "add": {
      const input = flagsToProspectInput(flags);
      if (!input.lastContactAt) input.lastContactAt = new Date().toISOString();
      const created = await store.create(input);
      console.log(`登録しました: #${created.id} ${created.name || "(無名)"} [${created.status}]`);
      return 0;
    }
    case "intake": {
      const message = (flags.message ?? positional.join(" ")).trim();
      if (!message) {
        console.error('Usage: crm intake --message "<問い合わせ文>" [--name 田中] [--gender female|male] [--source LINE]');
        return 1;
      }
      const { prospect, replyDraft } = buildProspectFromInquiry(
        { message, gender: flags.gender as Gender | undefined },
        { name: flags.name, contactSource: flags.source },
      );
      const created = await store.create(prospect);
      console.log(`台帳に下書き登録しました: #${created.id} ${created.name || "(無名)"}`);
      console.log(`属性:${created.category} / 温度感:${created.temperature} / 目的:${created.purpose} / 次アクション:${created.nextAction}`);
      console.log("\n■ 返信下書き（確認して送信してください・自動送信はしません）\n" + replyDraft);
      return 0;
    }
    case "list": {
      const all = await store.getAll();
      let rows = all;
      let label = "全";
      if (flags.status) {
        const want = resolveStatus(flags.status);
        if (!want) {
          console.error(`不明な状態: ${flags.status}（例: 返信した / 体験予約 / 体験済み / 入会 / 見送り）`);
          return 1;
        }
        rows = all.filter(p => p.status === want);
        label = want;
      }
      if (!rows.length) {
        console.log(flags.status ? `状態「${label}」の見込み客はいません。` : "見込み客はまだ登録されていません。");
        return 0;
      }
      console.log(`■ 一覧（${label}：${rows.length}件）`);
      for (const p of rows) {
        console.log(`#${p.id} ${p.name || "(無名)"} | ${p.category} | ${p.status} | 温度:${p.temperature || "-"} | 最終連絡:${p.lastContactAt?.slice(0, 16) || "-"}`);
      }
      return 0;
    }
    case "status": {
      const id = Number(positional[0] ?? flags.id);
      const status = resolveStatus(positional[1] ?? flags.to ?? "");
      if (!id || !status) {
        console.error("Usage: crm status <番号> <状態> [--memo \"ひとことメモ\"]");
        console.error("  状態（日本語OK）: 返信した / 体験予約 / 体験済み / 入会 / 見送り など（英語コードも可）");
        return 1;
      }
      const updated = await store.update(id, {
        status,
        lastContactAt: new Date().toISOString(),
        ...(flags.memo ? { memo: flags.memo } : {}),
      });
      if (!updated) {
        console.error(`#${id} が見つかりません。`);
        return 1;
      }
      console.log(`#${id} を ${status} に更新しました。${flags.memo ? `（メモ: ${flags.memo}）` : ""}`);
      return 0;
    }
    case "find": {
      const query = (positional.join(" ") || flags.name || "").trim();
      if (!query) {
        console.error("Usage: crm find <名前の一部>");
        return 1;
      }
      const hits = (await store.getAll()).filter(p => (p.name || "").includes(query));
      if (!hits.length) {
        console.log(`「${query}」に一致する見込み客はいません。`);
        return 0;
      }
      for (const p of hits) {
        console.log(`#${p.id} ${p.name || "(無名)"} | ${p.category} | ${p.status} | 温度:${p.temperature || "-"}`);
      }
      return 0;
    }
    case "show": {
      const id = Number(positional[0] ?? flags.id);
      const p = id ? await store.get(id) : undefined;
      if (!p) {
        console.error("Usage: crm show <番号>（その人の詳しい情報をすべて表示します）");
        return 1;
      }
      const row = (label: string, value: unknown) =>
        console.log(`  ${label}: ${value === "" || value === undefined || value === null ? "（未記録）" : value}`);
      console.log(`■ #${p.id} ${p.name || "(無名)"}`);
      row("状態", p.status);
      row("属性", p.category);
      row("温度感", p.temperature);
      row("性別", p.gender);
      row("年代", p.ageGroup);
      row("目的", p.purpose);
      row("流入元", p.contactSource);
      row("問い合わせ", p.inquiryText);
      row("メモ", p.memo);
      row("体験日", p.trialDate);
      row("体験の状況", p.trialStatus);
      row("見送り理由", p.lostReason);
      row("次アクション", p.nextAction);
      row("最終連絡", p.lastContactAt?.slice(0, 16));
      row("登録日", p.createdAt?.slice(0, 16));
      row("更新日", p.updatedAt?.slice(0, 16));
      console.log("\nヒント: 返信下書きは `npm run crm -- draft " + p.id + "` で出せます。");
      return 0;
    }
    case "draft": {
      const id = Number(positional[0] ?? flags.id);
      const p = id ? await store.get(id) : undefined;
      if (!p) {
        console.error("Usage: crm draft <番号>（その人向けの返信下書きを出します）");
        return 1;
      }
      console.log(`■ #${p.id} ${p.name || "(無名)"} 向け 返信下書き（確認して送信・自動送信なし）\n`);
      console.log(draftFor(p));
      return 0;
    }
    case "followups": {
      const all = await store.getAll();
      const now = new Date();
      const withDrafts = "drafts" in flags;
      const print = (title: string, list: Prospect[]) => {
        console.log(`\n■ ${title}（${list.length}件）`);
        if (!list.length) {
          console.log("  なし");
          return;
        }
        for (const p of list) {
          console.log(`  #${p.id} ${p.name || "(無名)"}　→ 返信案: crm draft ${p.id}`);
          if (withDrafts) {
            const draft = draftFor(p).split("\n").map(line => `      ${line}`).join("\n");
            console.log(`    --- 返信下書き（確認して送信・自動送信なし） ---\n${draft}\n`);
          }
        }
      };
      print("追客漏れ候補", getFollowupNeeded(all, now, followupHours));
      print("体験後フォロー候補", getTrialFollowupNeeded(all));
      print("口コミ依頼候補", getReviewRequestCandidates(all));
      console.log(
        withDrafts
          ? "\nヒント: 上の下書きはそのまま確認して送れます（自動送信はしません）。"
          : "\nヒント: 各候補の下書きを一括で出すなら `npm run crm -- followups --drafts`（自動送信なし）。",
      );
      return 0;
    }
    case "daily-report": {
      const all = await store.getAll();
      const { markdown, dateIso } = buildDailyReport(all, new Date(), { followupHours });
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
      console.error(`不明なコマンド: ${command}\n使い方は \`npm run crm -- help\` で確認できます。`);
      return 1;
  }
}

const invokedBasename = process.argv[1] ? path.basename(process.argv[1]) : "";
const invokedDirectly = invokedBasename === "crm_cli.ts" || invokedBasename === "crm_cli.js";
if (invokedDirectly) {
  const code = await main(process.argv.slice(2));
  process.exit(code);
}

export { main as runCrmCli };
