// 障害の切り分けテスト。
//
// Phase 1 は LINE だけを扱い、保存先は state/ のローカルだけにしている。
// 「Obsidianが止まっていても保存できる」「Gmailが無くてもLINEは動く」を、
// 実装が外部に依存していないという形で確かめる（要件 §11 / §30 / §32）。

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadReplyDraftConfig, replyDraftStateDir } from "./config.js";
import { processInquiryEvent } from "./pipeline.js";
import { seenStorePath } from "./dedupe.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const names = (await fs.readdir(moduleDir)).filter(
  name => name.endsWith(".ts") && !name.endsWith(".test.ts"),
);

for (const name of names) {
  const source = await fs.readFile(path.join(moduleDir, name), "utf8");
  const code = source
    .split("\n")
    .filter(line => !line.trim().startsWith("//") && !line.trim().startsWith("*") && !line.trim().startsWith("/*"))
    .join("\n");
  // Obsidian へは書かない。だから Obsidian が止まっても保存は落ちない。
  assert(!/obsidianPath|OBSIDIAN_VAULT_ROOT|obsidianVaultRoot/.test(code), `${name}: Obsidianに依存しない`);
  // Gmail の読み取りは Phase 3。Phase 1 の実装には入れない。
  assert(!/googleapis|google-auth|gmail\.users/.test(code), `${name}: Gmailに依存しない`);
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), "reply-drafts-isolation-"));
const config = { ...loadReplyDraftConfig({ REPLY_DRAFT_ENABLED: "true", OPENQLOW_DRY_RUN: "false" }), root };
const now = new Date("2026-09-02T00:12:00Z");
const push = { calls: [] as string[], impl: async (text: string) => { push.calls.push(text); return { ok: true, mode: "sent" }; } };

// Gmail 側の台帳が壊れていても、LINE の処理は最後まで進む。
await fs.mkdir(replyDraftStateDir(root), { recursive: true });
await fs.writeFile(seenStorePath(root, "gmail"), "{壊れている", "utf8");

const result = await processInquiryEvent(
  { source: "line", text: "体験したいです", senderId: "U-customer", eventId: "evt-1" },
  { now, config, push: push.impl },
);
assert(result.ok && result.outcome === "saved", "Gmail側が壊れていてもLINEは保存できる");
assert(push.calls.length === 1, "通知も届く");

// 保存先は state/reply_drafts の下だけ。ほかの場所へ書き出していない。
const written = await fs.readdir(root);
assert(written.every(name => name === "state" || name === "logs"), `保存先は state/ と logs/ だけ（実際: ${written.join(",")}）`);

await fs.rm(root, { recursive: true, force: true });
console.log("reply_drafts isolation tests passed");
