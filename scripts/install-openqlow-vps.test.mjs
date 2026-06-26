import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const script = await readFile(path.join(root, "deploy/scripts/install-openqlow-vps.sh"), "utf8");

assert.match(script, /systemctl enable .*openqlow-loop\.timer/s);
assert.match(script, /systemctl start .*openqlow-loop\.timer/s);
assert.match(script, /openqlow-morning\.timer fires at 07:00 JST/);
assert.doesNotMatch(script, /LINE_CHANNEL_ACCESS_TOKEN=.*[^\\n]/);

console.log("install openqlow vps tests passed");
