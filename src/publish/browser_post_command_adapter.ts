import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { BrowserPostJob } from "./browser_post_job.js";
import type { BrowserPostAdapter } from "./browser_post_runner.js";

const execFileAsync = promisify(execFile);

type RunCommand = (command: string, args: string[]) => Promise<string>;

export interface CommandBrowserPostAdapterOptions {
  command: string;
  run?: RunCommand;
}

async function defaultRun(command: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(command, args, { encoding: "utf8" });
  return stdout;
}

function parseExternalId(output: string): string {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(output);
  } catch {
    throw new Error(`Browser poster returned non-JSON output: ${output.slice(0, 200)}`);
  }
  if (typeof json.externalId === "string" && json.externalId) return json.externalId;
  throw new Error("Browser poster output missing externalId");
}

export function createCommandBrowserPostAdapter(opts: CommandBrowserPostAdapterOptions): BrowserPostAdapter {
  if (!opts.command.trim()) throw new Error("browser poster command is required");
  const run = opts.run ?? defaultRun;
  return {
    async publish(job: BrowserPostJob): Promise<{ externalId: string }> {
      const dir = await mkdtemp(path.join(tmpdir(), "openqlow-browser-post-"));
      const jobFile = path.join(dir, `${job.recordId}-${job.destination}.json`);
      await writeFile(jobFile, `${JSON.stringify(job, null, 2)}\n`, "utf8");
      const output = await run(opts.command, [jobFile]);
      return { externalId: parseExternalId(output.trim()) };
    },
  };
}
