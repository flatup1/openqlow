// Brand Growth Phase 2: どちらを先に選ぶかの規則。
//
// 決め方は固定で、入力が同じなら結果も必ず同じになる。
// 実行時刻・乱数・外部状態を一切使わない（reviewed_at は文字列のまま比較する）。

import type { KnowledgeAuthority, KnowledgeEntry, PriorityGroup } from "../contracts/knowledge.js";

/** 強い順。添字が小さいほど強い。 */
export const AUTHORITY_ORDER: readonly KnowledgeAuthority[] = Object.freeze([
  "owner_canon",
  "machine_canon",
  "approved_policy",
  "validated_learning",
  "approved_reference",
  "historical",
]);

export function authorityRank(authority: KnowledgeAuthority): number {
  const index = AUTHORITY_ORDER.indexOf(authority);
  // 未知の値は最弱として扱う。黙って強く見せない。
  return index === -1 ? AUTHORITY_ORDER.length : index;
}

/** 選定の候補。並べ替えに必要な情報だけを持つ。 */
export interface Candidate {
  readonly entry: KnowledgeEntry;
  readonly group: PriorityGroup;
  readonly matched_tags: readonly string[];
}

/** reviewed_at が無いものは最も古いものとして扱う。 */
function reviewedKey(entry: KnowledgeEntry): string {
  return entry.reviewed_at ?? "";
}

/**
 * 並び順の比較。返り値が負なら a が先。
 * 順序: 優先段 → authority → 一致tag数の多さ → reviewed_at の新しさ
 *       → 根拠の強さ → token の小ささ → id
 */
export function compareCandidates(a: Candidate, b: Candidate): number {
  if (a.group !== b.group) return a.group - b.group;

  const authority = authorityRank(a.entry.authority) - authorityRank(b.entry.authority);
  if (authority !== 0) return authority;

  const tags = b.matched_tags.length - a.matched_tags.length;
  if (tags !== 0) return tags;

  const reviewed = reviewedKey(b.entry).localeCompare(reviewedKey(a.entry));
  if (reviewed !== 0) return reviewed;

  const evidence = b.entry.evidence_confidence - a.entry.evidence_confidence;
  if (evidence !== 0) return evidence;

  const tokens = a.entry.token_cost - b.entry.token_cost;
  if (tokens !== 0) return tokens;

  return a.entry.id.localeCompare(b.entry.id);
}

/** 並べ替える。元配列は変更しない。 */
export function sortCandidates(candidates: readonly Candidate[]): readonly Candidate[] {
  return Object.freeze([...candidates].sort(compareCandidates));
}
