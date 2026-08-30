import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const script = await readFile(path.join(root, "deploy/scripts/install-openqlow-vps.sh"), "utf8");
const activateAdLineDryRun = await readFile(path.join(root, "deploy/scripts/activate-ad-line-dry-run.sh"), "utf8");
const morningTimer = await readFile(path.join(root, "deploy/systemd/openqlow-morning.timer"), "utf8");
const adReportService = await readFile(path.join(root, "deploy/systemd/openqlow-ad-daily-report.service"), "utf8");
const adReportTimer = await readFile(path.join(root, "deploy/systemd/openqlow-ad-daily-report.timer"), "utf8");

assert.match(script, /systemctl enable .*openqlow-loop\.timer/s);
assert.match(script, /systemctl start .*openqlow-loop\.timer/s);
assert.match(script, /openqlow-morning\.timer fires at 06:00 JST/);
assert.doesNotMatch(script, /LINE_CHANNEL_ACCESS_TOKEN=.*[^\\n]/);
assert.match(morningTimer, /OnCalendar=\*-\*-\* 06:00:00 Asia\/Tokyo/);
assert.match(morningTimer, /AccuracySec=1s/);
assert.match(adReportService, /ExecStart=\/usr\/bin\/node dist\/scheduler\/ad_daily_report\.js/);
assert.match(adReportService, /ReadWritePaths=\/opt\/openqlow\/ad-line-data/);
assert.match(adReportTimer, /OnCalendar=\*-\*-\* 06:10:00 Asia\/Tokyo/);
assert.match(adReportTimer, /dry-run only/);
assert.doesNotMatch(
  script.match(/systemctl enable \\\n[\s\S]*?openqlow-loop\.timer/)?.[0] ?? "",
  /openqlow-ad-daily-report\.timer/,
  "広告日報タイマーはインストール時に自動有効化しない",
);
assert.match(script, /広告日報のドライランは承認後にだけ/);
assert.match(activateAdLineDryRun, /upsert_env AD_LINE_DRY_RUN true/);
assert.match(activateAdLineDryRun, /upsert_env AD_LINE_REPORT_DISABLED true/);
assert.doesNotMatch(activateAdLineDryRun, /upsert_env AD_LINE_CHANNEL_ACCESS_TOKEN/);
assert.doesNotMatch(activateAdLineDryRun, /systemctl (?:stop|disable) openqlow-morning/);
assert.doesNotMatch(activateAdLineDryRun, /systemctl enable .*openqlow-ad-daily-report/s);
assert.match(activateAdLineDryRun, /LINE webhook verification failed; previous endpoint restored/);
assert.match(activateAdLineDryRun, /Expected unsigned external request to be rejected with 401/);
assert.match(activateAdLineDryRun, /for _attempt in \{1\.\.20\}/);
assert.match(activateAdLineDryRun, /'"stored":0'/);

console.log("install openqlow vps tests passed");
