#!/usr/bin/env node
import { execFile } from "node:child_process";
import { cp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

async function defaultRun(command, args, options = {}) {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    ...options,
  });
  return `${stdout}${stderr}`;
}

async function copyLocalFile(src, dest) {
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(src, dest, { force: true });
}

export function createVpsBrowserPostRunner(opts = {}) {
  const run = opts.run ?? defaultRun;
  const localRoot = opts.localRoot ?? path.join(tmpdir(), "openqlow-vps-browser-post-local");
  const remoteStateRoot = opts.remoteStateRoot;
  const sshTarget = opts.sshTarget ?? "root@162.43.41.182";
  const sshKey = opts.sshKey ?? `${process.env.HOME}/.ssh/openqlow_vps`;

  return async function runVpsBrowserPost(id) {
    if (!id?.trim()) throw new Error("post id is required");
    const stateDir = path.join(localRoot, "state", "browser_post_jobs");
    await mkdir(stateDir, { recursive: true });
    const localJobFile = path.join(stateDir, `${id}.json`);

    if (remoteStateRoot) {
      await copyLocalFile(path.join(remoteStateRoot, "state", "browser_post_jobs", `${id}.json`), localJobFile);
    } else {
      await run("scp", ["-i", sshKey, `${sshTarget}:/opt/openqlow/state/browser_post_jobs/${id}.json`, localJobFile]);
    }

    await run("npm", ["run", "dev", "--", "publish:browser-run", id], {
      cwd: repoRoot,
      env: {
        ...process.env,
        OPENQLOW_ROOT: localRoot,
        OPENQLOW_BROWSER_POSTER_CMD: path.join(repoRoot, "scripts", "mac-browser-poster.mjs"),
      },
    });

    if (remoteStateRoot) {
      await copyLocalFile(localJobFile, path.join(remoteStateRoot, "state", "browser_post_jobs", `${id}.json`));
    } else {
      await run("scp", ["-i", sshKey, localJobFile, `${sshTarget}:/opt/openqlow/state/browser_post_jobs/${id}.json`]);
    }

    return { ok: true, localJobFile };
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const id = process.argv[2];
  if (!id) {
    console.error("Usage: scripts/run-vps-browser-post.mjs <post-id>");
    process.exit(2);
  }
  try {
    const runner = createVpsBrowserPostRunner();
    const result = await runner(id);
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
