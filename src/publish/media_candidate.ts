import { readdir } from "node:fs/promises";
import path from "node:path";
import { formatApprovalMessage } from "../approval/message.js";
import { checkDraftSafety } from "../safety/check.js";
import { saveRecord } from "../state/file_store.js";
import type { ContentIdea, DraftRecord, Platform, PlatformDraft } from "../types.js";
import type { PublishDestination } from "./publisher_types.js";
import { optimizePostForDestinations } from "./platform_optimizer.js";

export interface CreateMediaPublishCandidateInput {
  root: string;
  body: string;
  mediaFiles: string[];
  destinations: PublishDestination[];
  now?: Date;
}

function yyyymmdd(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date).replaceAll("-", "");
}

async function nextMediaApprovalId(root: string, now: Date): Promise<string> {
  const date = yyyymmdd(now);
  const dir = path.join(root, "state");
  const files = await readdir(dir).catch(() => []);
  const used = files
    .map((file) => file.match(new RegExp(`^FG-${date}-(\\d{3})\\.json$`))?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number);

  let index = 701;
  while (used.includes(index)) index += 1;
  return `FG-${date}-${String(index).padStart(3, "0")}`;
}

function destinationPlatform(destination: PublishDestination): Platform {
  if (destination === "line_voom") return "line";
  if (destination === "threads") return "threads";
  return "instagram";
}

function tagsFromText(text: string): string[] {
  return (text.match(/#[\p{L}\p{N}_]+/gu) ?? []).map(tag => tag.slice(1));
}

function buildDrafts(id: string, destinations: PublishDestination[], body: string, now: string): PlatformDraft[] {
  const optimized = optimizePostForDestinations({ body, destinations });
  return destinations.map(destination => {
    const post = optimized[destination];
    if (!post) throw new Error(`Missing optimized post for ${destination}`);
    return {
      id: `${id}_${destination}`,
      ideaId: id,
      approvalId: id,
      platform: destinationPlatform(destination),
      publicationLevel: "level_2_draft",
      body: post.text,
      hashtags: tagsFromText(post.text),
      cta: "",
      safetyNotes: [
        "画像/動画つき投稿候補。公開前に人間確認を残す。",
        "媒体別の文字数・ハッシュタグ方針に合わせて整形済み。",
      ],
      createdAt: now,
    };
  });
}

export async function createMediaPublishCandidate(input: CreateMediaPublishCandidateInput): Promise<DraftRecord> {
  const nowDate = input.now ?? new Date();
  const now = nowDate.toISOString();
  const id = await nextMediaApprovalId(input.root, nowDate);
  const idea: ContentIdea = {
    id,
    date: yyyymmdd(nowDate),
    theme: "画像/動画つきSNS投稿",
    angle: "指定メディアを各媒体に合わせて投稿する",
    audience: "local_narita",
    source: "obsidian_inbox",
    valueConnection: "指定ファイルを使い、Threads / LINE VOOM / Googleビジネス向けに最適化した投稿候補を作る。",
    canonReferences: [
      {
        layer: "AGENTS.md",
        canonPath: "AGENTS.md#Marketing Output Rules",
        description: "FLATUPらしい投稿と人間確認ルール",
      },
    ],
  };
  const drafts = buildDrafts(id, input.destinations, input.body, now);
  const safety = checkDraftSafety(drafts.map(draft => draft.body).join("\n\n"));
  const approvalMessage = [
    formatApprovalMessage(idea, drafts, safety),
    "",
    `メディア: ${input.mediaFiles.join(", ")}`,
  ].join("\n");

  const record: DraftRecord = {
    id,
    idea,
    drafts,
    mediaFiles: input.mediaFiles,
    status: "pending_approval",
    approvalMessage,
    createdAt: now,
    updatedAt: now,
  };

  await saveRecord(input.root, record);
  return record;
}
