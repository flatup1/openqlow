// ─────────────────────────────────────────────────────────────────────────
// EXPERIMENTAL SPIKE (2026-06) — register からの直近本文ローダー
//
// craft_score の freshness 軸は「直近投稿との非類似度」を測るが、これまでは
// 呼び出し側が recentBodies を手で渡す必要があった。本モジュールは保存済み
// ドラフトの register（drafts/<platform>/index.jsonl）から直近本文を読み出し、
// freshness を実データで自動判定できるようにする。
//
// 捨てやすさ:
//   - 依存ゼロ
//   - src/adapters/ (Codex領域) は読み取りのみ。書き込み・改変はしない。
//   - adapters のドラフト .md 形式に読み取り側で軽く依存する（下の extractBody）。
//     形式が変わったら extractBody だけ直せばよい。
//   - 撤去はこのファイルと recent_bodies.test.ts を消すだけ。
// ─────────────────────────────────────────────────────────────────────────

import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";
import { scoreCraft, type CraftScore } from "./craft_score.js";

/** ドラフトが保存される媒体（adapters が drafts/<platform>/ を作る対象）。 */
export type DraftPlatform = "x" | "instagram" | "threads";

interface IndexEntry {
  id: string;
  file: string;
  createdAt?: string;
}

export interface RecentBodiesOptions {
  /** プロジェクトルート。既定は loadConfig().root。テストや別ルートで上書き可。 */
  root?: string;
  /** 読み込む直近件数。既定 12。 */
  limit?: number;
  /** 除外するドラフトID（採点対象自身を比較から外すため）。 */
  excludeId?: string;
}

// adapters が書く .md からヘッダ／メタ行／ハッシュタグ行を落として本文だけ取り出す。
// 形式は x_typefully.ts / threads_draft.ts / instagram_draft.ts に準拠（読み取り専用）。
export function extractBody(fileText: string): string {
  return fileText
    .split(/\r?\n/)
    .filter(line => {
      const t = line.trim();
      if (!t) return false;
      if (/^#\s/.test(t)) return false; // 見出し（# X Draft / # タイトル）
      if (/^-\s+[A-Za-z_]+:/.test(t)) return false; // - key: value メタ行
      if (/^(approval_id|publication_level|typefully_mode|cta)\s*:/i.test(t)) return false; // X のフッタ
      if (/^#[^\s#]+(?:\s+#[^\s#]+)*$/.test(t)) return false; // ハッシュタグだけの行
      return true;
    })
    .join("\n")
    .trim();
}

function parseIndex(jsonl: string): IndexEntry[] {
  const entries: IndexEntry[] = [];
  for (const line of jsonl.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as IndexEntry;
      if (parsed && typeof parsed.file === "string") entries.push(parsed);
    } catch {
      // 壊れた行は黙ってスキップ（ログは膨れるので残さない）。
    }
  }
  return entries;
}

/**
 * register（drafts/<platform>/index.jsonl）から直近の本文を新しい順に読み出す。
 * index が無い／読めない場合は [] を返す（freshness は中立扱いになる）。
 */
export async function loadRecentBodies(
  platform: DraftPlatform,
  options: RecentBodiesOptions = {},
): Promise<string[]> {
  const root = options.root ?? loadConfig().root;
  const limit = options.limit ?? 12;
  const indexPath = path.join(root, "drafts", platform, "index.jsonl");

  const jsonl = await readFile(indexPath, "utf8").catch(() => "");
  if (!jsonl) return [];

  const entries = parseIndex(jsonl)
    .filter(entry => entry.id !== options.excludeId)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, limit);

  // 各ドラフトファイルは独立に読めるので並列化する（逐次 await だと件数分だけ直列待ちになる）。
  // Promise.all は入力順を保つので、新しい順の並びはそのまま維持される。
  const texts = await Promise.all(
    entries.map(entry => readFile(entry.file, "utf8").catch(() => "")),
  );

  const bodies: string[] = [];
  for (const text of texts) {
    const body = extractBody(text);
    if (body) bodies.push(body);
  }
  return bodies;
}

export interface HistoryScoreOptions extends RecentBodiesOptions {}

/**
 * ドラフトを「register の直近本文」と突き合わせて採点する便利関数。
 * recentBodies を自前で用意せずに freshness を効かせられる。
 */
export async function scoreCraftWithHistory(
  draft: { id?: string; body: string; platform: DraftPlatform },
  options: HistoryScoreOptions = {},
): Promise<CraftScore> {
  const recentBodies = await loadRecentBodies(draft.platform, {
    ...options,
    excludeId: options.excludeId ?? draft.id,
  });
  return scoreCraft(draft.body, { platform: draft.platform, recentBodies });
}

// ── CLI ──────────────────────────────────────────────────────────────────
// register に何が見えているかを確認するための覗き窓。
//   tsx src/distribution/recent_bodies.ts threads [limit]
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const platform = (process.argv[2] ?? "threads") as DraftPlatform;
  const limit = Number(process.argv[3] ?? 12);
  if (!["x", "instagram", "threads"].includes(platform)) {
    console.error("platform は x / instagram / threads のいずれか。");
    process.exit(1);
  }
  loadRecentBodies(platform, { limit }).then(bodies => {
    console.log(`platform=${platform} に対し register から ${bodies.length} 件の直近本文を取得:`);
    bodies.forEach((body, i) => {
      const head = body.split(/\r?\n/).find(Boolean) ?? "";
      console.log(`  ${i + 1}. ${head.slice(0, 40)}${head.length > 40 ? "…" : ""}`);
    });
  });
}
