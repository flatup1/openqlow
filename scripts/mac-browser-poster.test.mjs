import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createMacBrowserPoster } from "./mac-browser-poster.mjs";

const dir = await mkdtemp(path.join(tmpdir(), "openqlow-mac-browser-poster-"));
const jobFile = path.join(dir, "job.json");
await writeFile(jobFile, JSON.stringify({
  recordId: "FG-20260603-701",
  destination: "line_voom",
  url: "https://manager.line.biz/",
  text: "今日のキッズ練習風景。\n#FLATUPGYM",
  mediaFiles: ["/Users/jin/Desktop/openqlow-posts/ready/videos/final_sunny_5fighters.mp4"],
  finalClickAllowed: true,
}, null, 2));

const calls = [];
const poster = createMacBrowserPoster({
  run: async (command, args) => {
    calls.push([command, ...args]);
    if (command === "osascript" && args.includes("button returned of result")) {
      return "投稿した";
    }
    return "";
  },
});

const result = await poster(jobFile);
assert.equal(result.externalId, "line_voom-manual-confirmed-FG-20260603-701");
assert(calls.some(call => call[0] === "open" && call.includes("https://manager.line.biz/")));
assert(calls.some(call => call[0] === "osascript" && call.join(" ").includes("set the clipboard to")));
assert(calls.some(call => call[0] === "osascript" && call.join(" ").includes("投稿した")));

const payload = JSON.parse(await readFile(jobFile, "utf8"));
assert.equal(payload.destination, "line_voom");

const cancelledPoster = createMacBrowserPoster({
  run: async () => "まだ",
});
await assert.rejects(() => cancelledPoster(jobFile), /投稿確認が完了していません/);

const autoCalls = [];
const autoPoster = createMacBrowserPoster({
  env: { OPENQLOW_BROWSER_AUTO_CLICK: "true" },
  run: async (command, args) => {
    autoCalls.push([command, ...args]);
    return command === "osascript" && args.join(" ").includes("openQLOW 自動投稿")
      ? "auto-clicked"
      : "";
  },
});

const autoResult = await autoPoster(jobFile);
assert.equal(autoResult.externalId, "line_voom-auto-clicked-FG-20260603-701");
assert(autoCalls.some(call => call[0] === "open" && call.includes("https://manager.line.biz/")));
assert(autoCalls.some(call => call[0] === "osascript" && call.join(" ").includes("openQLOW 自動投稿")));
assert(!autoCalls.some(call => call.join(" ").includes("display dialog")), "AUTO_CLICK=true では手動確認ダイアログを出さない");

const unsafeJobFile = path.join(dir, "unsafe-job.json");
await writeFile(unsafeJobFile, JSON.stringify({
  recordId: "FG-20260603-702",
  destination: "threads",
  text: "自動投稿不可",
  finalClickAllowed: false,
}, null, 2));

await assert.rejects(() => autoPoster(unsafeJobFile), /finalClickAllowed=true が必要です/);

const adapterCalls = [];
const adapterPoster = createMacBrowserPoster({
  env: {
    OPENQLOW_BROWSER_AUTO_CLICK: "true",
    OPENQLOW_BROWSER_AUTO_CLICK_CMD: "/tmp/fake-auto-clicker",
  },
  run: async (command, args) => {
    adapterCalls.push([command, ...args]);
    if (command === "/tmp/fake-auto-clicker") {
      return JSON.stringify({ externalId: "adapter-ok-123" });
    }
    return "";
  },
});

const adapterResult = await adapterPoster(jobFile);
assert.equal(adapterResult.externalId, "adapter-ok-123");
assert(adapterCalls.some(call => call[0] === "/tmp/fake-auto-clicker" && call[1] === jobFile));

console.log("mac browser poster tests passed");
