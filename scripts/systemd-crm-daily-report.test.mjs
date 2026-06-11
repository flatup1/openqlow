import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const service = await readFile(path.join(root, "deploy/systemd/openqlow-crm-daily-report.service"), "utf8");
const timer = await readFile(path.join(root, "deploy/systemd/openqlow-crm-daily-report.timer"), "utf8");

assert.match(service, /Description=OPENQLOW CRM daily report generation/);
assert.match(service, /Type=oneshot/);
assert.match(service, /WorkingDirectory=\/opt\/openqlow/);
assert.match(service, /EnvironmentFile=\/etc\/openqlow\/openqlow\.env/);
assert.match(service, /ExecStart=\/usr\/bin\/npm run crm -- daily-report/);
assert.match(service, /ReadWritePaths=.*\/home\/flatup\/openqlow-data/);
const execStart = service.split("\n").find(line => line.startsWith("ExecStart=")) ?? "";
assert.doesNotMatch(execStart, /line|slack|mail|send|push|morning|reminder|serve/i);

assert.match(timer, /Description=Run OPENQLOW CRM daily report at 08:05 JST/);
assert.match(timer, /OnCalendar=\*-\*-\* 08:05:00 Asia\/Tokyo/);
assert.match(timer, /Persistent=true/);
assert.match(timer, /Unit=openqlow-crm-daily-report\.service/);

console.log("systemd crm daily report tests passed");
