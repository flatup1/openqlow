import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const service = await readFile(path.join(root, "deploy/systemd/openqlow-loop.service"), "utf8");
const timer = await readFile(path.join(root, "deploy/systemd/openqlow-loop.timer"), "utf8");

assert.match(service, /Description=OPENQLOW self-improvement loop/);
assert.match(service, /Type=oneshot/);
assert.match(service, /WorkingDirectory=\/opt\/openqlow/);
assert.match(service, /EnvironmentFile=\/etc\/openqlow\/openqlow\.env/);
assert.match(service, /ExecStart=\/usr\/bin\/node dist\/loop\/run\.js/);
assert.match(service, /ReadWritePaths=.*\/opt\/openqlow/);
assert.match(service, /ReadWritePaths=.*\/opt\/obsidian-vault/);
assert.match(service, /NoNewPrivileges=true/);
assert.match(service, /ProtectSystem=full/);
assert.match(service, /ProtectHome=true/);

const execStart = service.split("\n").find(line => line.startsWith("ExecStart=")) ?? "";
assert.doesNotMatch(execStart, /line|slack|mail|send|push|morning|reminder|serve/i);

assert.match(timer, /Description=Run OPENQLOW self-improvement loop daily at 04:30 JST/);
assert.match(timer, /OnCalendar=\*-\*-\* 04:30:00 Asia\/Tokyo/);
assert.match(timer, /Persistent=true/);
assert.match(timer, /Unit=openqlow-loop\.service/);

console.log("systemd loop tests passed");
