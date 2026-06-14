// ─────────────────────────────────────────────────────────────────────────
// EXPERIMENTAL SPIKE (2026-06) — 生成→採点→修復ループ（方向性B）
//
// expand.ts（本番の daily が使う固定テンプレ展開）は改変せず、その上に被せる
// 非侵襲ラッパー。各ドラフト本文を craft_score で採点し、低い軸を決定的に修復した
// 候補を作って再採点し、「安全に通った中で最良の版」を選ぶ。
//
// 設計方針:
//   - 依存ゼロ。LLM は使わない（だから“創作的再生成”ではなく“決定的修復”）。
//   - 修復候補は必ず checkDraftSafety を通す（安全側 = Codex領域は読み取りのみ）。
//   - expand.ts には触らない。expandIdeaScored を使わなければ挙動は一切変わらない。
//   - 撤去はこのファイルと expand_scored.test.ts を消すだけ。
// ─────────────────────────────────────────────────────────────────────────

import type { ContentIdea, PlatformDraft } from "../types.js";
import { expandIdea } from "./expand.js";
import { scoreCraft, type CraftScore, type CraftPlatform } from "./craft_score.js";
import { checkDraftSafety } from "../safety/check.js";
import { weightedLength, X_WEIGHTED_LIMIT } from "./text_metrics.js";

const SOFT_INVITE = "ワンコイン体験500円から、空気を感じに。";

// ── 決定的な修復変換 ──────────────────────────────────────────────────────

/** やわらかい誘いが無ければ末尾に1行足す（誘い軸の修復）。 */
function addSoftInvite(body: string): string {
  if (/(ワンコイン体験|500円から|空気を感じ)/.test(body)) return body;
  return `${body}\n${SOFT_INVITE}`;
}

/** X が長さ超過なら末尾の行から削って収める（媒体適合軸の修復）。 */
function tightenForX(body: string): string {
  const lines = body.split("\n");
  while (lines.length > 1 && weightedLength(lines.join("\n")) > X_WEIGHTED_LIMIT) {
    lines.pop();
  }
  return lines.join("\n").trimEnd();
}

/** 媒体ごとの候補本文（重複は除く）。 */
function variantsFor(platform: CraftPlatform, body: string): string[] {
  const set = new Set<string>([body, addSoftInvite(body)]);
  if (platform === "x") {
    set.add(tightenForX(body));
    set.add(tightenForX(addSoftInvite(body)));
  }
  return [...set];
}

// ── 1ドラフトの改善 ────────────────────────────────────────────────────────

export interface ImprovedDraft {
  platform: CraftPlatform;
  body: string;
  before: CraftScore;
  after: CraftScore;
  changed: boolean;
  /** 安全に通った候補が1つ以上あったか（無ければ原文のまま）。 */
  safe: boolean;
}

export interface ImproveOptions {
  recentBodies?: string[];
}

export function improveDraft(
  platform: CraftPlatform,
  body: string,
  options: ImproveOptions = {},
): ImprovedDraft {
  const score = (b: string): CraftScore => scoreCraft(b, { platform, recentBodies: options.recentBodies });
  const before = score(body);

  // variantsFor は先頭に原文 body を含むため、原文候補は before を使い回して二重採点を避ける
  // （scoreCraft は純関数なので同じ入力なら結果は同一。freshness の bigram 再計算も省ける）。
  const safeCandidates = variantsFor(platform, body)
    .filter(candidate => checkDraftSafety(candidate).ok)
    .map(candidate => ({ body: candidate, score: candidate === body ? before : score(candidate) }));

  // 総合 → 新鮮さ → 短さ の優先で最良を選ぶ。
  safeCandidates.sort(
    (a, b) =>
      b.score.total - a.score.total ||
      b.score.freshness.score - a.score.freshness.score ||
      weightedLength(a.body) - weightedLength(b.body),
  );

  const best = safeCandidates[0];
  if (!best) {
    // どの候補も安全を通らなかった（稀）。原文を維持。
    return { platform, body, before, after: before, changed: false, safe: false };
  }
  return {
    platform,
    body: best.body,
    before,
    after: best.score,
    changed: best.body !== body,
    safe: true,
  };
}

// ── idea 全体の展開＋改善 ──────────────────────────────────────────────────

export interface ScoredExpansion {
  drafts: PlatformDraft[];
  improvements: ImprovedDraft[];
}

export interface ExpandScoredOptions {
  /** 媒体ごとの直近本文（recent_bodies.loadRecentBodies の結果を渡す）。 */
  recentByPlatform?: Partial<Record<CraftPlatform, string[]>>;
}

export function expandIdeaScored(idea: ContentIdea, options: ExpandScoredOptions = {}): ScoredExpansion {
  const base = expandIdea(idea);
  const improvements: ImprovedDraft[] = [];

  const drafts = base.map(draft => {
    const platform = draft.platform as CraftPlatform;
    const recentBodies = options.recentByPlatform?.[platform];
    const improved = improveDraft(platform, draft.body, { recentBodies });
    improvements.push(improved);
    return improved.changed ? { ...draft, body: improved.body } : draft;
  });

  return { drafts, improvements };
}

export function formatImprovement(improved: ImprovedDraft): string {
  const arrow = improved.changed ? "→" : "＝";
  const delta = improved.after.total - improved.before.total;
  const deltaLabel = delta > 0 ? `+${delta}` : `${delta}`;
  return [
    `[${improved.platform}] ${improved.before.total}/25 ${arrow} ${improved.after.total}/25 (${deltaLabel})`,
    improved.changed ? `  修復: ${improved.after.verdict}` : `  変更なし: ${improved.after.verdict}`,
    improved.safe ? "" : "  ⚠ 安全に通る候補が無く原文維持",
  ]
    .filter(Boolean)
    .join("\n");
}
