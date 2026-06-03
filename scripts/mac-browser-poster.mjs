#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function escapeAppleScriptString(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function destinationLabel(destination) {
  if (destination === "threads") return "Threads";
  if (destination === "google_business") return "Googleビジネス";
  if (destination === "line_voom") return "LINE VOOM";
  return destination;
}

function defaultUrl(destination, url) {
  if (url) return url;
  if (destination === "threads") return "https://www.threads.net/";
  if (destination === "google_business") return "https://business.google.com/";
  if (destination === "line_voom") return "https://manager.line.biz/";
  return "about:blank";
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

async function showConfirmation(run, job) {
  const label = destinationLabel(job.destination);
  const media = (job.mediaFiles ?? []).join("\n");
  const message = [
    `${label} の投稿画面を開きました。`,
    "",
    "本文はクリップボードに入っています。",
    media ? `添付ファイル:\n${media}` : "添付ファイル: なし",
    "",
    "画面で本文と動画/画像を入れて、投稿が完了したら「投稿した」を押してください。",
    "まだ投稿していない場合は「まだ」を押してください。",
  ].join("\n");

  return run("osascript", [
    "-e",
    `display dialog "${escapeAppleScriptString(message)}" buttons {"まだ", "投稿した"} default button "まだ" with title "openQLOW 投稿確認"`,
    "-e",
    "button returned of result",
  ]);
}

export function createMacBrowserPoster(opts = {}) {
  const run = opts.run ?? defaultRun;
  return async function macBrowserPoster(jobFile) {
    const job = JSON.parse(await readFile(jobFile, "utf8"));
    const url = defaultUrl(job.destination, job.url);
    await copyToClipboard(run, job.text ?? "");
    await openDestination(run, url);
    const button = await showConfirmation(run, job);
    if (button.trim() !== "投稿した") {
      throw new Error("投稿確認が完了していません。画面で投稿後にもう一度実行してください。");
    }
    return {
      externalId: `${job.destination}-manual-confirmed-${job.recordId}`,
    };
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const jobFile = process.argv[2];
  if (!jobFile) {
    console.error("Usage: scripts/mac-browser-poster.mjs <job-json-file>");
    process.exit(2);
  }
  try {
    const poster = createMacBrowserPoster();
    const result = await poster(jobFile);
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
