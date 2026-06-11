import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildRepairSuggestion, logError } from "./self_repair.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// --- 既知のエラー種別は専用の修復案を出す --------------------------------------
const api = buildRepairSuggestion("api_insufficient_balance", "402 Payment Required");
assert(api.markdown.includes("# Self Repair Log"), "log has title");
assert(api.markdown.includes("api_insufficient_balance"), "includes error type");
assert(api.markdown.includes("402 Payment Required"), "includes error message");
assert(api.markdown.includes("残高"), "balance-specific suggestion");
assert(api.markdown.includes("人間確認が必要な項目"), "lists human-check items");
assert(api.markdown.includes("自動修復は行いません"), "states no auto-repair");

// --- 未知の種別は unknown にフォールバック ------------------------------------
const unknown = buildRepairSuggestion("not_a_real_type" as never, "???");
assert(unknown.markdown.includes("分類できない") || unknown.markdown.includes("不明"), "falls back to unknown advice");

// --- context を反映 -----------------------------------------------------------
const withCtx = buildRepairSuggestion("db_save_error", "EACCES", "data/prospects.json");
assert(withCtx.markdown.includes("data/prospects.json"), "context appended");

// --- ファイルに追記される ------------------------------------------------------
const dir = await mkdtemp(path.join(tmpdir(), "crm-repair-"));
try {
  const r1 = await logError("cron_failed", "timer not active", undefined, dir);
  assert(r1.filePath.includes(path.join("logs", "self_repair")), "writes under logs/self_repair");
  assert(/\d{4}-\d{2}-\d{2}_error\.md$/.test(r1.filePath), "dated error log filename");
  // 同日2件目は追記
  await logError("disk_full", "no space left", undefined, dir);
  const content = await readFile(r1.filePath, "utf8");
  const count = (content.match(/# Self Repair Log/g) ?? []).length;
  assert(count === 2, `appends to same-day file, got ${count} entries`);
  console.log("crm self repair tests passed");
} finally {
  await rm(dir, { recursive: true, force: true });
}
