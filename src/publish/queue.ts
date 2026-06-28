import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DraftRecord } from "../types.js";
import type { DestinationInstruction, PublishDestination, PublishQueueEntry } from "./publisher_types.js";

const INSTRUCTIONS: Record<PublishDestination, DestinationInstruction> = {
  google_business: {
    mode: "api_setup_required",
    requiredEnvKeys: [
      "GOOGLE_BUSINESS_ACCOUNT_ID",
      "GOOGLE_BUSINESS_LOCATION_ID",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_REFRESH_TOKEN",
    ],
    humanFinalClickRequired: true,
    note: "Google Business Profile APIのOAuth設定後に投稿可能。現段階ではキュー作成のみ。",
  },
  threads: {
    mode: "api_or_browser_assist",
    requiredEnvKeys: ["THREADS_USER_ID", "THREADS_ACCESS_TOKEN"],
    humanFinalClickRequired: true,
    note: "Threads API設定後はAPI投稿候補。未設定時はブラウザ補助で下書き確認。",
  },
  line_voom: {
    mode: "browser_assist_only",
    requiredEnvKeys: [],
    humanFinalClickRequired: true,
    note: "LINE VOOMは公式の安定投稿API前提にしない。ブラウザで開き、オーナーが最終投稿する。",
  },
  instagram: {
    mode: "api_or_browser_assist",
    requiredEnvKeys: ["INSTAGRAM_USER_ID", "INSTAGRAM_ACCESS_TOKEN"],
    humanFinalClickRequired: true,
    note: "Instagram Graph API設定後はAPI投稿（画像必須・公開画像URL要）。未設定時はブラウザ補助。",
  },
};

export async function createPublishQueueEntry(
  root: string,
  record: DraftRecord,
  destinations: PublishDestination[],
  now = new Date(),
  opts: { mediaFiles?: string[] } = {},
): Promise<string> {
  const dir = path.join(root, "state", "publish_queue");
  await mkdir(dir, { recursive: true });

  const selectedInstructions = Object.fromEntries(
    destinations.map(destination => [destination, INSTRUCTIONS[destination]])
  ) as Record<PublishDestination, DestinationInstruction>;

  const entry: PublishQueueEntry = {
    recordId: record.id,
    status: "queued_for_owner",
    destinations,
    ...(opts.mediaFiles?.length ? { mediaFiles: opts.mediaFiles } : {}),
    sourceDraftIds: record.drafts.map(draft => draft.id),
    createdAt: now.toISOString(),
    instructions: selectedInstructions,
  };

  const file = path.join(dir, `${record.id}.json`);
  await writeFile(file, `${JSON.stringify(entry, null, 2)}\n`, "utf8");
  return file;
}
