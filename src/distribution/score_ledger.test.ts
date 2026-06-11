import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { scoreCraft } from "./craft_score.js";
import { expandIdeaScored } from "./expand_scored.js";
import type { ContentIdea } from "../types.js";
import {
  appendCraftScores,
  readCraftLedger,
  entryFromScore,
  entriesFromImprovements,
  dimsOf,
} from "./score_ledger.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const dir = await mkdtemp(path.join(tmpdir(), "openqlow-score-ledger-"));
const ledgerPath = path.join(dir, "craft-score-ledger.jsonl");

// entryFromScore: CraftScore から台帳エントリを作る
const score = scoreCraft("「お父さん、見てた？」\n親子割で月-¥500。ワンコイン体験500円から。", { platform: "x" });
const entry = entryFromScore({ recordId: "FG-20260609-001", platform: "x", theme: "親子", score });
assert(entry.recordId === "FG-20260609-001", "recordId carried");
assert(entry.total === score.total, "total carried");
assert(JSON.stringify(entry.dims) === JSON.stringify(dimsOf(score)), "dims carried");

// 追記 → 読み戻しのラウンドトリップ
await appendCraftScores([entry], { path: ledgerPath });
await appendCraftScores(
  [entryFromScore({ recordId: "FG-20260609-002", platform: "threads", theme: "太陽", score })],
  { path: ledgerPath },
);
const read = await readCraftLedger({ path: ledgerPath });
assert(read.length === 2, `should read back 2 entries (got ${read.length})`);
assert(read[0].recordId === "FG-20260609-001", "first entry preserved");
assert(read[1].platform === "threads", "second entry platform preserved");

// 空配列の追記は何もしない（ファイルを汚さない）
await appendCraftScores([], { path: ledgerPath });
const read2 = await readCraftLedger({ path: ledgerPath });
assert(read2.length === 2, "empty append should add nothing");

// 欠損ファイルは空配列
const missing = await readCraftLedger({ path: path.join(dir, "nope.jsonl") });
assert(missing.length === 0, "missing ledger reads empty");

// expand_scored の improvements から台帳エントリを作れる
const idea: ContentIdea = {
  id: "idea_led",
  date: "2026-06-09",
  theme: "未知テーマ",
  angle: "安心して挑戦できる場所",
  audience: "beginners",
  source: "mma_topic",
  valueConnection: "FLATUPの価値観に接続。",
};
const { improvements } = expandIdeaScored(idea);
const entries = entriesFromImprovements(improvements, { recordId: "FG-20260609-003", ideaId: idea.id, theme: idea.theme });
assert(entries.length === improvements.length, "one ledger entry per improvement");
assert(entries.every(e => e.recordId === "FG-20260609-003"), "recordId applied to all");
assert(entries.every(e => e.ideaId === "idea_led"), "ideaId applied to all");

console.log("score ledger tests passed");
