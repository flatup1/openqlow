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

console.log("mac browser poster tests passed");
