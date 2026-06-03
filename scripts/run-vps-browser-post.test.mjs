import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createVpsBrowserPostRunner } from "./run-vps-browser-post.mjs";

const tmp = await mkdtemp(path.join(tmpdir(), "openqlow-vps-browser-post-"));
const remote = path.join(tmp, "remote");
await mkdir(path.join(remote, "state", "browser_post_jobs"), { recursive: true });
await writeFile(path.join(remote, "state", "browser_post_jobs", "FG-20260603-701.json"), JSON.stringify({
  recordId: "FG-20260603-701",
  jobs: [{
    recordId: "FG-20260603-701",
    destination: "line_voom",
    status: "queued_for_mac_browser",
    url: "https://manager.line.biz/",
    text: "test",
    mediaFiles: ["/tmp/post.mp4"],
    finalClickAllowed: true,
    createdAt: "2026-06-03T00:00:00.000Z",
  }],
}, null, 2));

const calls = [];
const runner = createVpsBrowserPostRunner({
  localRoot: path.join(tmp, "local"),
  remoteStateRoot: remote,
  run: async (command, args, options) => {
    calls.push([command, ...args]);
    if (command === "npm") {
      const jobFile = path.join(options.env.OPENQLOW_ROOT, "state", "browser_post_jobs", "FG-20260603-701.json");
      const data = JSON.parse(await readFile(jobFile, "utf8"));
      data.jobs[0].status = "published";
      data.jobs[0].externalId = "line_voom-confirmed";
      await writeFile(jobFile, JSON.stringify(data, null, 2));
    }
    return "";
  },
});

const result = await runner("FG-20260603-701");
assert.equal(result.ok, true);
assert(calls.some(call => call[0] === "npm" && call.includes("dev")));

const remoteSaved = JSON.parse(await readFile(path.join(remote, "state", "browser_post_jobs", "FG-20260603-701.json"), "utf8"));
assert.equal(remoteSaved.jobs[0].status, "published");
assert.equal(remoteSaved.jobs[0].externalId, "line_voom-confirmed");

console.log("run vps browser post tests passed");
