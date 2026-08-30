import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildAdvertisingDailyReport,
  isAdvertisingDailyReportCliEntry,
  runAdvertisingDailyReport,
} from "./ad_daily_report.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

assert.equal(
  isAdvertisingDailyReportCliEntry("file:///repo/src/scheduler/ad_daily_report.ts", "/repo/src/scheduler/ad_daily_report.ts"),
  true,
);
assert.equal(
  isAdvertisingDailyReportCliEntry("file:///repo/dist/scheduler/ad_daily_report.js", "/repo/dist/scheduler/ad_daily_report.js"),
  true,
);
assert.equal(
  isAdvertisingDailyReportCliEntry("file:///repo/src/scheduler/other.ts", "/repo/src/scheduler/ad_daily_report.ts"),
  false,
);

const dataDir = await mkdtemp(path.join(os.tmpdir(), "openqlow-ad-report-"));
try {
  const events = [
    { id: "AD-1", route: "ad_lead_intake", sourceUserHash: HASH_A, campaignCode: "IG01", occurredAt: "2026-08-29T00:00:00.000Z" },
    { id: "AD-2", route: "ad_lead_intake", sourceUserHash: HASH_A, campaignCode: "IG01", occurredAt: "2026-08-29T01:00:00.000Z" },
    { id: "AD-3", route: "ad_lead_intake", sourceUserHash: HASH_B, occurredAt: "2026-08-29T02:00:00.000Z" },
    { id: "AD-4", route: "member_support_handoff", sourceUserHash: HASH_C, campaignCode: "IG01", occurredAt: "2026-08-29T03:00:00.000Z" },
    { id: "AD-5", route: "ad_lead_intake", sourceUserHash: HASH_A, campaignCode: "IG-KIDS-01", occurredAt: "2026-08-29T04:00:00.000Z" },
    { id: "AD-OLD", route: "ad_lead_intake", sourceUserHash: HASH_C, campaignCode: "META02", occurredAt: "2026-08-28T03:00:00.000Z" },
    { id: "AD-NEXT", route: "ad_lead_intake", sourceUserHash: HASH_C, campaignCode: "META02", occurredAt: "2026-08-30T00:00:00.000Z" },
  ];
  await writeFile(
    path.join(dataDir, "events.ndjson"),
    `${events.map(event => JSON.stringify(event)).join("\n")}\nnot-json\n`,
    "utf8",
  );
  await writeFile(
    path.join(dataDir, "campaign_metrics.ndjson"),
    `${[
      {
        date: "2026-08-29",
        campaignCode: "ig01",
        spendYen: 3000,
        impressions: 10000,
        clicks: 40,
        lineAdds: 8,
        trialBookings: 1,
        enrollments: 0,
      },
      {
        date: "2026-08-30",
        campaignCode: "meta02",
        spendYen: 1200,
        impressions: 4000,
        clicks: 20,
        lineAdds: 3,
        trialBookings: 1,
        enrollments: 0,
      },
    ].map(metric => JSON.stringify(metric)).join("\n")}\n`,
    "utf8",
  );

  const report = await buildAdvertisingDailyReport(dataDir, "2026-08-29");
  assert.equal(report.summary.totals.leads, 4);
  assert.equal(report.summary.totals.uniqueLeads, 2, "same lead across campaigns is counted once in the total");
  assert.equal(report.summary.totals.memberHandoffs, 1);
  assert.equal(report.summary.totals.spendYen, 3000);
  assert.equal(report.summary.totals.costPerLeadYen, null, "partial campaign spend never creates a misleading total CPL");
  assert.equal(report.summary.totals.costPerLineAddYen, null);
  assert.equal(report.summary.totals.costPerTrialBookingYen, null);
  assert.equal(report.summary.unattributedLeads, 1);
  assert.equal(report.summary.invalidRecords, 1);
  assert.equal(report.summary.confidence, "low");
  assert.match(report.message, /広告日報（2026-08-29 \/ DRY-RUN）/);
  assert.match(report.message, /広告費: 3,000円（一部のみ）/);
  assert.match(report.message, /問い合わせ単価: 未入力/);
  assert.match(report.message, /広告コードなしの問い合わせが1件/);
  assert.doesNotMatch(report.message, new RegExp(HASH_A), "source hashes are not exposed in the owner report");

  const completeReport = await buildAdvertisingDailyReport(dataDir, "2026-08-30");
  assert.equal(completeReport.summary.totals.leads, 1);
  assert.equal(completeReport.summary.totals.costPerLeadYen, 1200);
  assert.equal(completeReport.summary.totals.costPerTrialBookingYen, 1200);
  assert.equal(completeReport.summary.confidence, "high");

  const output: string[] = [];
  const run = await runAdvertisingDailyReport({
    env: {
      AD_LINE_DATA_DIR: dataDir,
      AD_LINE_REPORT_DRY_RUN: "true",
      AD_LINE_REPORT_WRITE_FILE: "true",
    },
    reportDate: "2026-08-29",
    output: message => output.push(message),
  });
  assert.equal(run.ok, true);
  assert.equal(run.mode, "dry_run");
  assert.equal(output.length, 1);
  assert.ok(run.reportPath);
  const saved = await readFile(run.reportPath, "utf8");
  assert.match(saved, /LINE送信・広告変更・AIKA更新はしていません/);
  assert.doesNotMatch(saved, new RegExp(HASH_B));

  const blocked = await runAdvertisingDailyReport({
    env: { AD_LINE_DATA_DIR: dataDir, AD_LINE_REPORT_DRY_RUN: "false" },
    reportDate: "2026-08-29",
    output: () => undefined,
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.mode, "blocked", "production send attempts fail closed");

  const disabled = await runAdvertisingDailyReport({
    env: { AD_LINE_REPORT_DISABLED: "true" },
    reportDate: "2026-08-29",
    output: () => undefined,
  });
  assert.equal(disabled.ok, true);
  assert.equal(disabled.mode, "disabled");
} finally {
  await rm(dataDir, { recursive: true, force: true });
}

const emptyDir = await mkdtemp(path.join(os.tmpdir(), "openqlow-ad-report-empty-"));
try {
  const empty = await buildAdvertisingDailyReport(emptyDir, "2026-08-29");
  assert.equal(empty.summary.totals.leads, 0);
  assert.equal(empty.summary.confidence, "low");
  assert.match(empty.message, /対象データなし/);
  assert.match(empty.message, /最初の広告へキャンペーンコードを1つ付け/);
} finally {
  await rm(emptyDir, { recursive: true, force: true });
}

console.log("advertising daily report tests passed");
