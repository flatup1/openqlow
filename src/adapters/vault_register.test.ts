import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DraftRecord } from "../types.js";
import {
  registerApprovalEvent,
  registerDraftSave,
  registerPerformancePlaceholder,
} from "./vault_register.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const vault = await mkdtemp(path.join(tmpdir(), "openqlow-vault-register-"));
process.env.OBSIDIAN_VAULT_ROOT = vault;

const record: DraftRecord = {
  id: "FG-20260519-001",
  idea: {
    id: "FG-20260519-001",
    date: "2026-05-19",
    theme: "弱い自分と向き合う日",
    angle: "世界一優しい格闘技ジムの空気を伝える",
    audience: "beginners",
    source: "rotation",
    valueConnection: "営業ではなく理念を翻訳する。",
    canonReferences: [
      {
        layer: "全体入口",
        canonPath: "00_CORE/FLATUPGYM_AI_HOME.md",
        description: "AIが最初に読むホーム",
      },
    ],
  },
  drafts: [
    {
      id: "draft-x",
      ideaId: "FG-20260519-001",
      approvalId: "FG-20260519-001",
      platform: "x",
      publicationLevel: "level_2_draft",
      body: "FLATUPは、弱い自分と向き合えるやさしい場所です。",
      hashtags: ["FLATUPGYM"],
      cta: "",
      safetyNotes: [],
      createdAt: "2026-05-19T00:00:00.000Z",
    },
  ],
  status: "pending_approval",
  approvalMessage: "これ投稿する？",
  createdAt: "2026-05-19T00:00:00.000Z",
  updatedAt: "2026-05-19T00:00:00.000Z",
};

await registerApprovalEvent(record, "generated");
await registerApprovalEvent({ ...record, status: "saved" }, "approved", {
  approvalReply: "OK FG-20260519-001",
  savedFiles: ["/tmp/x.md"],
});
await registerDraftSave(record, ["/tmp/x.md"]);
await registerPerformancePlaceholder(record);

const logDir = path.join(vault, "6_システム", "openqlow_logs");
const approvalJsonl = await readFile(path.join(logDir, "approval-register.jsonl"), "utf8");
const postingJsonl = await readFile(path.join(logDir, "posting-log.jsonl"), "utf8");
const performanceJsonl = await readFile(path.join(logDir, "performance-log.jsonl"), "utf8");
const approvalMd = await readFile(path.join(logDir, "approval-register.md"), "utf8");

assert(approvalJsonl.includes('"action":"generated"'), "generated approval event is logged");
assert(approvalJsonl.includes('"action":"approved"'), "approved approval event is logged");
assert(approvalJsonl.includes("00_CORE/FLATUPGYM_AI_HOME.md"), "canon references are logged");
assert(postingJsonl.includes('"publicationStatus":"draft_saved_not_posted"'), "posting log does not claim public posting");
assert(performanceJsonl.includes('"metricsStatus":"pending"'), "performance placeholder is pending");
assert(approvalMd.includes("FG-20260519-001"), "markdown approval register is readable");

console.log("vault register tests passed");
