import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AdLeadEvent } from "../line_bot/ad_channel_boundary.js";
import { formatDateInTimeZone } from "../utils/date.js";

const JST_TIME_ZONE = "Asia/Tokyo";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CAMPAIGN_CODE_PATTERN = /^(?:IG|META|FB|LINE|WEB)(?:[-_]?[A-Z0-9]+){1,3}$/;
const MAX_CAMPAIGN_CODE_LENGTH = 24;
const SOURCE_HASH_PATTERN = /^[0-9a-f]{64}$/;

export interface AdCampaignMetricRecord {
  date: string;
  campaignCode: string;
  spendYen?: number;
  impressions?: number;
  clicks?: number;
  lineAdds?: number;
  trialBookings?: number;
  enrollments?: number;
}

export interface AdCampaignDailySummary {
  campaignCode: string;
  leads: number;
  uniqueLeads: number;
  memberHandoffs: number;
  spendYen: number | null;
  impressions: number | null;
  clicks: number | null;
  lineAdds: number | null;
  trialBookings: number | null;
  enrollments: number | null;
  costPerLeadYen: number | null;
  costPerLineAddYen: number | null;
  costPerTrialBookingYen: number | null;
}

export interface AdvertisingDailySummary {
  date: string;
  campaigns: AdCampaignDailySummary[];
  totals: AdCampaignDailySummary;
  unattributedLeads: number;
  invalidRecords: number;
  confidence: "low" | "medium" | "high";
  nextActions: string[];
}

export interface AdvertisingDailyReport {
  summary: AdvertisingDailySummary;
  message: string;
}

export interface RunAdvertisingDailyReportOptions {
  env?: NodeJS.ProcessEnv;
  now?: Date;
  reportDate?: string;
  output?: (message: string) => void;
}

export interface RunAdvertisingDailyReportResult {
  ok: boolean;
  mode: "dry_run" | "disabled" | "blocked";
  date: string;
  message?: string;
  reportPath?: string;
  reason?: string;
}

interface ParsedRecords<T> {
  records: T[];
  invalid: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function optionalCount(value: unknown): number | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function parseAdLeadEvent(value: unknown): AdLeadEvent | undefined {
  if (!isRecord(value)) return undefined;
  const route = value.route;
  const sourceUserHash = value.sourceUserHash;
  const occurredAt = value.occurredAt;
  const campaignCode = value.campaignCode;
  if (route !== "ad_lead_intake" && route !== "member_support_handoff") return undefined;
  if (typeof sourceUserHash !== "string" || !SOURCE_HASH_PATTERN.test(sourceUserHash)) return undefined;
  if (typeof occurredAt !== "string" || !Number.isFinite(new Date(occurredAt).getTime())) return undefined;
  if (campaignCode !== undefined && (typeof campaignCode !== "string" || !CAMPAIGN_CODE_PATTERN.test(campaignCode))) {
    return undefined;
  }
  return {
    id: typeof value.id === "string" ? value.id : "AD-LEGACY",
    route,
    sourceUserHash,
    ...(campaignCode ? { campaignCode } : {}),
    occurredAt,
  };
}

function parseCampaignMetric(value: unknown): AdCampaignMetricRecord | undefined {
  if (!isRecord(value) || !isDateString(value.date) || typeof value.campaignCode !== "string") return undefined;
  const campaignCode = value.campaignCode.trim().toUpperCase();
  if (campaignCode.length > MAX_CAMPAIGN_CODE_LENGTH || !CAMPAIGN_CODE_PATTERN.test(campaignCode)) return undefined;

  const spendYen = optionalCount(value.spendYen);
  const impressions = optionalCount(value.impressions);
  const clicks = optionalCount(value.clicks);
  const lineAdds = optionalCount(value.lineAdds);
  const trialBookings = optionalCount(value.trialBookings);
  const enrollments = optionalCount(value.enrollments);
  if ([spendYen, impressions, clicks, lineAdds, trialBookings, enrollments].includes(null)) return undefined;

  const metric: AdCampaignMetricRecord = {
    date: value.date,
    campaignCode,
  };
  if (typeof spendYen === "number") metric.spendYen = spendYen;
  if (typeof impressions === "number") metric.impressions = impressions;
  if (typeof clicks === "number") metric.clicks = clicks;
  if (typeof lineAdds === "number") metric.lineAdds = lineAdds;
  if (typeof trialBookings === "number") metric.trialBookings = trialBookings;
  if (typeof enrollments === "number") metric.enrollments = enrollments;
  return metric;
}

async function readNdjson<T>(filePath: string, parser: (value: unknown) => T | undefined): Promise<ParsedRecords<T>> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { records: [], invalid: 0 };
    throw error;
  }

  const parsed: T[] = [];
  let invalid = 0;
  for (const line of text.split("\n").map(value => value.trim()).filter(Boolean)) {
    try {
      const record = parser(JSON.parse(line));
      if (record) parsed.push(record);
      else invalid += 1;
    } catch {
      invalid += 1;
    }
  }
  return { records: parsed, invalid };
}

function sumOptional(values: Array<number | undefined>): number | null {
  const present = values.filter((value): value is number => value !== undefined);
  return present.length ? present.reduce((total, value) => total + value, 0) : null;
}

function divideMoney(amount: number | null, count: number | null): number | null {
  if (amount === null || count === null || count <= 0) return null;
  return Math.round(amount / count);
}

function aggregateCampaign(
  campaignCode: string,
  events: AdLeadEvent[],
  metrics: AdCampaignMetricRecord[],
): AdCampaignDailySummary {
  const leadEvents = events.filter(event => event.route === "ad_lead_intake");
  const spendYen = sumOptional(metrics.map(metric => metric.spendYen));
  const impressions = sumOptional(metrics.map(metric => metric.impressions));
  const clicks = sumOptional(metrics.map(metric => metric.clicks));
  const lineAdds = sumOptional(metrics.map(metric => metric.lineAdds));
  const trialBookings = sumOptional(metrics.map(metric => metric.trialBookings));
  const enrollments = sumOptional(metrics.map(metric => metric.enrollments));
  const leads = leadEvents.length;

  return {
    campaignCode,
    leads,
    uniqueLeads: new Set(leadEvents.map(event => event.sourceUserHash)).size,
    memberHandoffs: events.filter(event => event.route === "member_support_handoff").length,
    spendYen,
    impressions,
    clicks,
    lineAdds,
    trialBookings,
    enrollments,
    costPerLeadYen: divideMoney(spendYen, leads),
    costPerLineAddYen: divideMoney(spendYen, lineAdds),
    costPerTrialBookingYen: divideMoney(spendYen, trialBookings),
  };
}

function addSummaries(summaries: AdCampaignDailySummary[]): AdCampaignDailySummary {
  const sum = (field: keyof AdCampaignDailySummary): number =>
    summaries.reduce((total, summary) => total + Number(summary[field] ?? 0), 0);
  const optionalSum = (field: keyof AdCampaignDailySummary): number | null =>
    summaries.some(summary => summary[field] !== null) ? sum(field) : null;

  const spendYen = optionalSum("spendYen");
  const lineAdds = optionalSum("lineAdds");
  const trialBookings = optionalSum("trialBookings");
  const leads = sum("leads");
  const allPresent = (field: keyof AdCampaignDailySummary): boolean =>
    summaries.length > 0 && summaries.every(summary => summary[field] !== null);
  return {
    campaignCode: "TOTAL",
    leads,
    uniqueLeads: sum("uniqueLeads"),
    memberHandoffs: sum("memberHandoffs"),
    spendYen,
    impressions: optionalSum("impressions"),
    clicks: optionalSum("clicks"),
    lineAdds,
    trialBookings,
    enrollments: optionalSum("enrollments"),
    costPerLeadYen: allPresent("spendYen") ? divideMoney(spendYen, leads) : null,
    costPerLineAddYen: allPresent("spendYen") && allPresent("lineAdds")
      ? divideMoney(spendYen, lineAdds)
      : null,
    costPerTrialBookingYen: allPresent("spendYen") && allPresent("trialBookings")
      ? divideMoney(spendYen, trialBookings)
      : null,
  };
}

function buildNextActions(
  campaigns: AdCampaignDailySummary[],
  totals: AdCampaignDailySummary,
  unattributedLeads: number,
  invalidRecords: number,
): string[] {
  const actions: string[] = [];
  if (invalidRecords > 0) actions.push(`壊れた記録が${invalidRecords}件あるため、広告データを確認する。`);
  if (unattributedLeads > 0) actions.push(`広告コードなしの問い合わせが${unattributedLeads}件あるため、広告リンクへコードを付ける。`);
  if (campaigns.length === 0) actions.push("最初の広告へキャンペーンコードを1つ付け、LINE反応を計測する。");
  if (campaigns.length === 0 || campaigns.some(campaign => campaign.spendYen === null)) {
    actions.push("すべての広告費を入力すると、問い合わせ1件あたりの実質コストを計算できる。");
  }
  if (campaigns.length === 0 || campaigns.some(campaign => campaign.clicks === null || campaign.impressions === null)) {
    actions.push("すべての表示数とクリック数を入力すると、広告の入口の強さを比較できる。");
  }
  if (campaigns.length === 0 || campaigns.some(campaign => campaign.trialBookings === null)) {
    actions.push("体験予約へ広告コードを引き継ぐと、予約獲得コストを計算できる。");
  }
  if (totals.spendYen !== null && totals.spendYen > 0 && totals.leads === 0) {
    actions.unshift("広告費が発生して問い合わせが0件のため、次回はCTAか冒頭の訴求を1つだけ変更する。");
  }
  return actions.slice(0, 3);
}

function confidenceFor(
  campaigns: AdCampaignDailySummary[],
  totals: AdCampaignDailySummary,
): AdvertisingDailySummary["confidence"] {
  const everyCampaignHas = (fields: Array<keyof AdCampaignDailySummary>): boolean =>
    campaigns.length > 0 && campaigns.every(campaign => fields.every(field => campaign[field] !== null));
  const hasTraffic = everyCampaignHas(["impressions", "clicks"]);
  const hasCost = everyCampaignHas(["spendYen"]);
  const hasOutcome = everyCampaignHas(["trialBookings", "enrollments"]);
  if (hasTraffic && hasCost && hasOutcome) return "high";
  if (hasTraffic && hasCost) return "medium";
  return "low";
}

function count(value: number | null, unit: "人" | "回"): string {
  return value === null ? "未入力" : `${value.toLocaleString("ja-JP")}${unit}`;
}

function money(value: number | null): string {
  return value === null ? "未入力" : `${value.toLocaleString("ja-JP")}円`;
}

function percentage(numerator: number | null, denominator: number | null): string {
  if (numerator === null || denominator === null || denominator <= 0) return "未計算";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export function renderAdvertisingDailyReport(summary: AdvertisingDailySummary): string {
  const total = summary.totals;
  const partialSuffix = (field: keyof AdCampaignDailySummary): string => {
    const hasValue = summary.campaigns.some(campaign => campaign[field] !== null);
    const hasMissing = summary.campaigns.some(campaign => campaign[field] === null);
    return hasValue && hasMissing ? "（一部のみ）" : "";
  };
  const campaignLines = summary.campaigns.length
    ? summary.campaigns.flatMap(campaign => [
        `【${campaign.campaignCode}】`,
        `- 広告費: ${money(campaign.spendYen)} / クリック: ${count(campaign.clicks, "回")}`,
        `- LINE問い合わせ: ${campaign.leads}件 / 体験予約: ${count(campaign.trialBookings, "人")}`,
        `- 問い合わせ単価: ${money(campaign.costPerLeadYen)} / 予約単価: ${money(campaign.costPerTrialBookingYen)}`,
      ])
    : ["- 対象データなし"];

  return [
    `📊 広告日報（${summary.date} / DRY-RUN）`,
    "",
    "【全体】",
    `- 広告費: ${money(total.spendYen)}${partialSuffix("spendYen")}`,
    `- 表示: ${count(total.impressions, "回")}${partialSuffix("impressions")} / クリック: ${count(total.clicks, "回")}${partialSuffix("clicks")} / CTR: ${percentage(total.clicks, total.impressions)}`,
    `- LINE追加: ${count(total.lineAdds, "人")}${partialSuffix("lineAdds")} / LINE問い合わせ: ${total.leads}件（実人数${total.uniqueLeads}人）`,
    `- 体験予約: ${count(total.trialBookings, "人")}${partialSuffix("trialBookings")} / 入会: ${count(total.enrollments, "人")}${partialSuffix("enrollments")}`,
    `- 問い合わせ単価: ${money(total.costPerLeadYen)} / 予約単価: ${money(total.costPerTrialBookingYen)}`,
    `- データ信頼度: ${summary.confidence}`,
    "",
    "【広告別】",
    ...campaignLines,
    "",
    "【次の一手】",
    ...summary.nextActions.map(action => `- ${action}`),
    "",
    `【データ確認】広告コードなし${summary.unattributedLeads}件 / 不正記録${summary.invalidRecords}件`,
    "※ この日報はドライランです。LINE送信・広告変更・AIKA更新はしていません。",
  ].join("\n");
}

export async function buildAdvertisingDailyReport(dataDir: string, reportDate: string): Promise<AdvertisingDailyReport> {
  if (!isDateString(reportDate)) throw new Error("reportDate must be YYYY-MM-DD");
  const [eventResult, metricResult] = await Promise.all([
    readNdjson(path.join(dataDir, "events.ndjson"), parseAdLeadEvent),
    readNdjson(path.join(dataDir, "campaign_metrics.ndjson"), parseCampaignMetric),
  ]);
  const dayEvents = eventResult.records.filter(event => formatDateInTimeZone(new Date(event.occurredAt), JST_TIME_ZONE) === reportDate);
  const dayMetrics = metricResult.records.filter(metric => metric.date === reportDate);
  const campaignCodes = Array.from(new Set([
    ...dayEvents.map(event => event.campaignCode).filter((code): code is string => Boolean(code)),
    ...dayMetrics.map(metric => metric.campaignCode),
  ])).sort();
  const campaigns = campaignCodes.map(code => aggregateCampaign(
    code,
    dayEvents.filter(event => event.campaignCode === code),
    dayMetrics.filter(metric => metric.campaignCode === code),
  ));
  const unattributedEvents = dayEvents.filter(event => !event.campaignCode);
  const unattributed = unattributedEvents.length
    ? aggregateCampaign("コードなし", unattributedEvents, [])
    : undefined;
  const visibleCampaigns = unattributed ? [...campaigns, unattributed] : campaigns;
  const totals = addSummaries(visibleCampaigns);
  // 同じ人が複数の広告コードで問い合わせても、全体の実人数は1人として数える。
  totals.uniqueLeads = new Set(
    dayEvents
      .filter(event => event.route === "ad_lead_intake")
      .map(event => event.sourceUserHash),
  ).size;
  const invalidRecords = eventResult.invalid + metricResult.invalid;
  const unattributedLeads = unattributedEvents.filter(event => event.route === "ad_lead_intake").length;
  const summary: AdvertisingDailySummary = {
    date: reportDate,
    campaigns: visibleCampaigns,
    totals,
    unattributedLeads,
    invalidRecords,
    confidence: confidenceFor(visibleCampaigns, totals),
    nextActions: buildNextActions(visibleCampaigns, totals, unattributedLeads, invalidRecords),
  };
  return { summary, message: renderAdvertisingDailyReport(summary) };
}

function previousJstDate(now: Date): string {
  return formatDateInTimeZone(new Date(now.getTime() - ONE_DAY_MS), JST_TIME_ZONE);
}

export async function runAdvertisingDailyReport(
  options: RunAdvertisingDailyReportOptions = {},
): Promise<RunAdvertisingDailyReportResult> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const reportDate = options.reportDate ?? previousJstDate(now);
  if (env.AD_LINE_REPORT_DISABLED === "true") {
    return { ok: true, mode: "disabled", date: reportDate, reason: "AD_LINE_REPORT_DISABLED=true" };
  }
  if (env.AD_LINE_REPORT_DRY_RUN === "false") {
    return {
      ok: false,
      mode: "blocked",
      date: reportDate,
      reason: "LINE送信は未承認です。AD_LINE_REPORT_DRY_RUN=true のまま使用してください。",
    };
  }

  const dataDir = (env.AD_LINE_DATA_DIR ?? "").trim() || path.resolve(process.cwd(), "data", "ad-line");
  const report = await buildAdvertisingDailyReport(dataDir, reportDate);
  let reportPath: string | undefined;
  if (env.AD_LINE_REPORT_WRITE_FILE !== "false") {
    const reportDir = path.join(dataDir, "reports");
    await mkdir(reportDir, { recursive: true, mode: 0o700 });
    reportPath = path.join(reportDir, `${reportDate}.md`);
    await writeFile(reportPath, `${report.message}\n`, { encoding: "utf8", mode: 0o600 });
  }
  (options.output ?? console.log)(report.message);
  return { ok: true, mode: "dry_run", date: reportDate, message: report.message, ...(reportPath ? { reportPath } : {}) };
}

export function isAdvertisingDailyReportCliEntry(importMetaUrl: string, argv1: string | undefined): boolean {
  if (!argv1) return false;
  return /\/ad_daily_report\.(?:ts|js)$/.test(importMetaUrl)
    && /(?:^|\/)ad_daily_report\.(?:ts|js)$/.test(argv1);
}

if (isAdvertisingDailyReportCliEntry(import.meta.url, process.argv[1])) {
  const result = await runAdvertisingDailyReport();
  console.log(`[ad-daily-report] mode=${result.mode} ok=${result.ok}${result.reason ? ` reason=${result.reason}` : ""}`);
  if (!result.ok) process.exit(1);
}
