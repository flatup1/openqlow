import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function escapeAppleScriptString(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

async function defaultRun(command, args) {
  const { stdout } = await execFileAsync(command, args, { encoding: "utf8" });
  return stdout.trim();
}

async function copyToClipboard(run, text) {
  await run("osascript", ["-e", `set the clipboard to "${escapeAppleScriptString(text)}"`]);
}

async function openDestination(run, url) {
  await run("open", ["-a", "Google Chrome", url]);
}

function fullAutoEnabled(env) {
  return env.OPENQLOW_FORCE_FULL_AUTO === "true";
}

function buildConfirmMessage({ label, steps, mediaFiles }) {
  const stepText = steps.map((step, index) => `${index + 1}. ${step}`).join("\n");
  const media = mediaFiles.length > 0 ? mediaFiles.join("\n") : "なし";
  return [
    `${label} の投稿準備をしました。`,
    "",
    "本文はクリップボードに入っています。",
    "",
    "画面で確認すること:",
    stepText,
    "",
    `添付ファイル:\n${media}`,
    "",
    "JINが画面で投稿まで完了したら「投稿した」。",
    "まだ投稿していない、または不安なら「まだ」。",
  ].join("\n");
}

async function showVisualConfirmation(run, { label, steps, mediaFiles }) {
  return run("osascript", [
    "-e",
    `display dialog "${escapeAppleScriptString(buildConfirmMessage({ label, steps, mediaFiles }))}" buttons {"まだ", "投稿した"} default button "まだ" with title "openQLOW ${escapeAppleScriptString(label)} 投稿確認"`,
    "-e",
    "button returned of result",
  ]);
}

function validateJob(job, destination) {
  if (job.destination !== destination) {
    throw new Error(`destination が一致しません: expected ${destination}, got ${job.destination ?? "unknown"}`);
  }
  if (job.finalClickAllowed !== true) {
    throw new Error("投稿アダプタには finalClickAllowed=true が必要です。");
  }
  if (typeof job.recordId !== "string" || !job.recordId) {
    throw new Error("recordId がありません。");
  }
}

export function createSiteAdapter(opts) {
  const run = opts.run ?? defaultRun;
  const env = opts.env ?? process.env;
  const destination = opts.destination;
  const label = opts.label;
  const defaultUrl = opts.defaultUrl;
  const steps = opts.steps ?? [];

  return async function siteAdapter(jobFile) {
    const job = JSON.parse(await readFile(jobFile, "utf8"));
    validateJob(job, destination);

    if (fullAutoEnabled(env)) {
      throw new Error("完全自動投稿はまだ有効化していません。JIN確認ありの半自動モードで実行してください。");
    }

    await copyToClipboard(run, job.text ?? "");
    await openDestination(run, job.url || defaultUrl);

    const button = await showVisualConfirmation(run, {
      label,
      steps,
      mediaFiles: job.mediaFiles ?? [],
    });
    if (button.trim() !== "投稿した") {
      throw new Error("JIN確認で未投稿です。投稿できていないため成功扱いしません。");
    }

    return {
      status: "posted",
      externalId: `${destination}-manual-confirmed-${job.recordId}`,
    };
  };
}

export async function runSiteAdapter(opts, argv = process.argv) {
  const jobFile = argv[2];
  if (!jobFile) {
    throw new Error("Usage: adapter <job-json-file>");
  }
  return opts.adapter(jobFile);
}
