// ─────────────────────────────────────────────────────────────────────────
// EXPERIMENTAL SPIKE (2026-06) — craft スコア台帳（方向性C: 改善ループの入口）
//
// craft_score / expand_scored が出すスコアを追記型 JSONL に貯める。後で
// score_insight.ts が Codex の performance-log.jsonl（実測）と突合し、
// 「どの軸が効くか」を相関で出す。スコアを“データ化”する最小の土台。
//
// 捨てやすさ:
//   - 依存ゼロ・追記専用。
//   - 既存の register/log フォーマットは触らず、独自ファイル
//     (craft-score-ledger.jsonl) に書く。衝突しない。
//   - 撤去はこのファイルと score_ledger.test.ts を消すだけ。
// ─────────────────────────────────────────────────────────────────────────

import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { obsidianPath } from "../utils/paths.js";
import type { CraftScore, CraftPlatform } from "./craft_score.js";
import type { ImprovedDraft } from "./expand_scored.js";

export interface CraftDims {
  hook: number;
  specificity: number;
  platformFit: number;
  invitation: number;
  freshness: number;
}

export interface CraftLedgerEntry {
  ts: string;
  recordId: string;
  ideaId?: string;
  platform: CraftPlatform;
  theme?: string;
  total: number;
  verdict: CraftScore["verdict"];
  dims: CraftDims;
}

export function defaultLedgerPath(): string {
  return obsidianPath("6_システム", "openqlow_logs", "craft-score-ledger.jsonl");
}

export function dimsOf(score: CraftScore): CraftDims {
  return {
    hook: score.hook.score,
    specificity: score.specificity.score,
    platformFit: score.platformFit.score,
    invitation: score.invitation.score,
    freshness: score.freshness.score,
  };
}

export function entryFromScore(
  args: { recordId: string; ideaId?: string; platform: CraftPlatform; theme?: string; score: CraftScore },
  ts: string = new Date().toISOString(),
): CraftLedgerEntry {
  return {
    ts,
    recordId: args.recordId,
    ideaId: args.ideaId,
    platform: args.platform,
    theme: args.theme,
    total: args.score.total,
    verdict: args.score.verdict,
    dims: dimsOf(args.score),
  };
}

/** expand_scored の improvements（改善後スコア）から台帳エントリを作る。 */
export function entriesFromImprovements(
  improvements: ImprovedDraft[],
  meta: { recordId: string; ideaId?: string; theme?: string },
  ts: string = new Date().toISOString(),
): CraftLedgerEntry[] {
  return improvements.map(imp =>
    entryFromScore(
      { recordId: meta.recordId, ideaId: meta.ideaId, platform: imp.platform, theme: meta.theme, score: imp.after },
      ts,
    ),
  );
}

export async function appendCraftScores(entries: CraftLedgerEntry[], options: { path?: string } = {}): Promise<string> {
  const file = options.path ?? defaultLedgerPath();
  if (entries.length === 0) return file;
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, entries.map(e => JSON.stringify(e)).join("\n") + "\n", "utf8");
  return file;
}

export async function readCraftLedger(options: { path?: string } = {}): Promise<CraftLedgerEntry[]> {
  const file = options.path ?? defaultLedgerPath();
  const text = await readFile(file, "utf8").catch(() => "");
  const entries: CraftLedgerEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as CraftLedgerEntry);
    } catch {
      // 壊れた行はスキップ
    }
  }
  return entries;
}
