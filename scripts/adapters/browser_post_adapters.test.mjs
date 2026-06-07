import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSiteAdapter } from "./lib/site_adapter.mjs";

const dir = await mkdtemp(path.join(tmpdir(), "openqlow-browser-adapters-"));

async function writeJob(name, payload) {
  const file = path.join(dir, name);
  await writeFile(file, JSON.stringify(payload, null, 2));
  return file;
}

const googleJobFile = await writeJob("google.json", {
  recordId: "FG-20260607-001",
  destination: "google_business",
  url: "https://business.google.com/",
  text: "昨日の自分を、ほんの少し超える",
  finalClickAllowed: true,
});

const voomJobFile = await writeJob("voom.json", {
  recordId: "FG-20260607-002",
  destination: "line_voom",
  url: "https://manager.line.biz/",
  text: "今日のFLATUP GYM",
  finalClickAllowed: true,
});

const googleCalls = [];
const googleAdapter = createSiteAdapter({
  destination: "google_business",
  label: "Googleビジネス",
  defaultUrl: "https://business.google.com/",
  steps: ["最新情報を追加を開く", "本文を貼り付ける", "投稿内容を確認する"],
  run: async (command, args) => {
    googleCalls.push([command, ...args]);
    if (command === "osascript" && args.join(" ").includes("button returned of result")) {
      return "投稿した";
    }
    return "";
  },
  env: {},
});

const googleResult = await googleAdapter(googleJobFile);
assert.deepEqual(googleResult, {
  status: "posted",
  externalId: "google_business-manual-confirmed-FG-20260607-001",
});
assert(googleCalls.some(call => call[0] === "open" && call.includes("https://business.google.com/")));
assert(googleCalls.some(call => call[0] === "osascript" && call.join(" ").includes("set the clipboard to")));
assert(googleCalls.some(call => call[0] === "osascript" && call.join(" ").includes("Googleビジネス")));

const cancelAdapter = createSiteAdapter({
  destination: "line_voom",
  label: "LINE VOOM",
  defaultUrl: "https://manager.line.biz/",
  steps: ["VOOM投稿画面を開く"],
  run: async () => "まだ",
  env: {},
});

await assert.rejects(() => cancelAdapter(voomJobFile), /JIN確認で未投稿/);

const fullAutoAdapter = createSiteAdapter({
  destination: "google_business",
  label: "Googleビジネス",
  defaultUrl: "https://business.google.com/",
  steps: [],
  run: async () => "",
  env: { OPENQLOW_FORCE_FULL_AUTO: "true" },
});

await assert.rejects(() => fullAutoAdapter(googleJobFile), /完全自動投稿はまだ有効化していません/);

const wrongDestinationAdapter = createSiteAdapter({
  destination: "google_business",
  label: "Googleビジネス",
  defaultUrl: "https://business.google.com/",
  steps: [],
  run: async () => "",
  env: {},
});

await assert.rejects(() => wrongDestinationAdapter(voomJobFile), /destination が一致しません/);

console.log("browser post adapter tests passed");
