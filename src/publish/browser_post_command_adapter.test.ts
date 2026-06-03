import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { BrowserPostJob } from "./browser_post_job.js";
import { createCommandBrowserPostAdapter } from "./browser_post_command_adapter.js";

const job: BrowserPostJob = {
  recordId: "FG-20260603-006",
  destination: "line_voom",
  status: "queued_for_mac_browser",
  url: "https://manager.line.biz/",
  text: "FLATUP GYM command adapter test",
  mediaFiles: ["/tmp/post.mp4"],
  finalClickAllowed: true,
  createdAt: "2026-06-03T06:00:00.000Z",
};

const calls: string[][] = [];
const adapter = createCommandBrowserPostAdapter({
  command: "/tmp/fake-browser-poster",
  run: async (command, args) => {
    calls.push([command, ...args]);
    const payload = JSON.parse(await readFile(args[0], "utf8"));
    assert.equal(payload.destination, "line_voom");
    assert.deepEqual(payload.mediaFiles, ["/tmp/post.mp4"]);
    return JSON.stringify({ externalId: "line_voom-posted-1" });
  },
});

const result = await adapter.publish(job);

assert.equal(result.externalId, "line_voom-posted-1");
assert.equal(calls[0][0], "/tmp/fake-browser-poster");

const failing = createCommandBrowserPostAdapter({
  command: "/tmp/fake-browser-poster",
  run: async () => "not json",
});
await assert.rejects(() => failing.publish(job), /non-JSON/);

console.log("browser post command adapter tests passed");
