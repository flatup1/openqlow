import type { PublishDestination } from "./publisher_types.js";

export interface MediaPostCommand {
  body: string;
  mediaFiles: string[];
  targets: PublishDestination[];
}

const ALL_TARGETS: PublishDestination[] = ["google_business", "threads", "line_voom"];

function normalizeTarget(value: string): PublishDestination | undefined {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "google" || normalized === "gbp" || normalized === "google_business") return "google_business";
  if (normalized === "threads" || normalized === "thread") return "threads";
  if (normalized === "line" || normalized === "voom" || normalized === "line_voom") return "line_voom";
  return undefined;
}

function parseTargets(value: string | undefined): PublishDestination[] {
  if (!value || value.trim().toLowerCase() === "all") return ALL_TARGETS;
  const targets = value
    .split(/[,\s、]+/)
    .map(normalizeTarget)
    .filter((target): target is PublishDestination => Boolean(target));
  return targets.length ? [...new Set(targets)] : ALL_TARGETS;
}

function splitFiles(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(/[,、]+/).map(file => file.trim()).filter(Boolean);
}

function fieldFromLines(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const match = text.match(new RegExp(`(?:^|\\n)\\s*${label}\\s*[:=：]\\s*(.+?)(?=\\n\\s*(?:本文|ファイル|投稿先)\\s*[:=：]|$)`, "s"));
    const value = match?.[1]?.trim();
    if (value) return value;
  }
  return undefined;
}

function fieldFromInline(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const match = text.match(new RegExp(`${label}\\s*=\\s*(.+?)(?=\\s+(?:本文|ファイル|投稿先)=|$)`, "s"));
    const value = match?.[1]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function parseMediaCommand(text: string): MediaPostCommand | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/投稿")) return undefined;

  const body = fieldFromLines(trimmed, ["本文"]) ?? fieldFromInline(trimmed, ["本文"]);
  const files = fieldFromLines(trimmed, ["ファイル"]) ?? fieldFromInline(trimmed, ["ファイル"]);
  const targets = fieldFromLines(trimmed, ["投稿先"]) ?? fieldFromInline(trimmed, ["投稿先"]);

  if (!body || splitFiles(files).length === 0) return undefined;
  return {
    body,
    mediaFiles: splitFiles(files),
    targets: parseTargets(targets),
  };
}
