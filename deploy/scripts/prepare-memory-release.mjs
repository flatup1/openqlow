import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.argv[2];
if (!root) throw new Error("Usage: node prepare-memory-release.mjs <release-root>");

async function replaceOnce(relativePath, before, after) {
  const file = path.join(root, relativePath);
  const text = await readFile(file, "utf8");
  if (text.includes(after)) return;
  const first = text.indexOf(before);
  if (first < 0 || text.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${relativePath}: expected exactly one release marker`);
  }
  await writeFile(file, text.replace(before, after), "utf8");
}

await replaceOnce(
  "src/shared/canon.ts",
  'scheduleLadies: "土曜14:30",',
  'scheduleLadies: "土曜14:30〜15:30",',
);

await replaceOnce(
  "src/shared/canon.test.ts",
  'assert(FLATUP_CANON.classes.includes("ムエタイ"), "classes must include ムエタイ");',
  [
    'assert(FLATUP_CANON.classes.includes("ムエタイ"), "classes must include ムエタイ");',
    'assert(FLATUP_CANON.scheduleLadies === "土曜14:30〜15:30", "ladies class must be 14:30-15:30");',
  ].join("\n"),
);

await replaceOnce(
  "deploy/scripts/install-openqlow-vps.sh",
  "openqlow-morning.timer fires at 07:00 JST daily",
  "openqlow-morning.timer fires at 06:00 JST daily",
);

await replaceOnce(
  "scripts/install-openqlow-vps.test.mjs",
  "openqlow-morning\\.timer fires at 07:00 JST",
  "openqlow-morning\\.timer fires at 06:00 JST",
);

const packagePath = path.join(root, "package.json");
const pkg = JSON.parse(await readFile(packagePath, "utf8"));
pkg.scripts["test:trial-kpi"] = "tsx src/commands/trial_kpi.test.ts";
pkg.scripts["test:management-brief"] = "tsx src/scheduler/management_brief.test.ts";
if (!pkg.scripts.test.includes("test:trial-kpi")) {
  pkg.scripts.test = pkg.scripts.test.replace(
    "npm run test:monthly-report &&",
    "npm run test:monthly-report && npm run test:trial-kpi &&",
  );
}
if (!pkg.scripts.test.includes("test:management-brief")) {
  pkg.scripts.test = pkg.scripts.test.replace(
    "npm run test:morning-briefing &&",
    "npm run test:morning-briefing && npm run test:management-brief &&",
  );
}
if (!pkg.scripts.test.includes("test:trial-kpi") || !pkg.scripts.test.includes("test:management-brief")) {
  throw new Error("package.json: failed to register release tests");
}
await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

console.log(`prepared memory release: ${root}`);
