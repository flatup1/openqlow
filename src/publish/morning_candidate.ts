import { readdir } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";
import type { ContentIdea, DraftRecord, PlatformDraft } from "../types.js";
import { formatApprovalMessage } from "../approval/message.js";
import { checkDraftSafety } from "../safety/check.js";
import { saveRecord } from "../state/file_store.js";

export interface MorningCandidateInput {
  dateJst: string;
}

function yyyymmdd(dateJst: string): string {
  return dateJst.replaceAll("-", "");
}

async function nextMorningApprovalId(root: string, dateJst: string): Promise<string> {
  const date = yyyymmdd(dateJst);
  const dir = path.join(root, "state");
  const files = await readdir(dir).catch(() => []);
  const used = files
    .map((file) => file.match(new RegExp(`^FG-${date}-(\\d{3})\\.json$`))?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number(value));

  let index = 901;
  while (used.includes(index)) index += 1;
  return `FG-${date}-${String(index).padStart(3, "0")}`;
}

function allDraftText(drafts: PlatformDraft[]): string {
  return drafts.map(draft => `${draft.body}\n${draft.cta}\n${draft.hashtags.join(" ")}`).join("\n\n");
}

function buildThreadsBody(): string {
  return [
    "強さは、急に作るものではなく、昨日より少しだけ自分と向き合う積み重ね。",
    "成田の世界一やさしい格闘技ジム、FLATUP GYM。",
    "今日も、一人ひとりが安心して挑戦できる場所であり続けます。",
  ].join("\n");
}

/** 本文末尾に付けるLINE友だち追加リンク（OPENQLOW_LINE_ADD_URL があるときだけ）。 */
function lineAddLink(env: Record<string, string | undefined> = process.env): string {
  const url = (env.OPENQLOW_LINE_ADD_URL || "").trim();
  if (!url) return "";
  return `\n\n▼体験・ご質問は公式LINEから\n${url}`;
}

export async function createMorningPublishCandidate(
  input: MorningCandidateInput
): Promise<DraftRecord> {
  const config = loadConfig();
  const id = await nextMorningApprovalId(config.root, input.dateJst);
  const now = new Date().toISOString();
  const idea: ContentIdea = {
    id,
    date: input.dateJst,
    theme: "昨日のFLATUP GYM記録",
    angle: "日々の整理から、安心して続けられるジムづくりを伝える",
    audience: "local_narita",
    source: "obsidian_inbox",
    valueConnection: "朝の営業記録を、個人情報を出さずにSNS投稿候補へ変換する。",
    canonReferences: [
      {
        layer: "AGENTS.md",
        canonPath: "AGENTS.md#Daily openQLOW Dialogue",
        description: "毎朝のopenQLOWヒアリングと人間確認ルール",
      },
    ],
  };

  const drafts: PlatformDraft[] = [
    {
      id: `${id}_threads`,
      ideaId: id,
      approvalId: id,
      platform: "threads",
      publicationLevel: "level_2_draft",
      body: buildThreadsBody() + lineAddLink(),
      hashtags: ["FLATUPGYM"],
      cta: "",
      safetyNotes: [
        "朝の内部記録から個人名や個別対応の詳細は出さない。",
        "公開はOKコマンド後の投稿準備まで。最終投稿はオーナー確認。",
      ],
      createdAt: now,
    },
  ];

  const safety = checkDraftSafety(allDraftText(drafts));
  const approvalMessage = formatApprovalMessage(idea, drafts, safety);
  const record: DraftRecord = {
    id,
    idea,
    drafts,
    status: "pending_approval",
    approvalMessage,
    createdAt: now,
    updatedAt: now,
  };

  await saveRecord(config.root, record);
  return record;
}
