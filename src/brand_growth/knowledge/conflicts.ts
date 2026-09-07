// Brand Growth Phase 2: 知識どうしの食い違いの扱い。
//
// 方針は1つだけ。**食い違ったまま片方を黙って採用しない。**
// 両方を保留して記録を残し、人間の判断へ回す。

import type { KnowledgeConflict } from "../contracts/knowledge.js";
import type { Candidate } from "./precedence.js";

export interface ConflictScan {
  /** 保留にすべき entry id。 */
  readonly conflicted_ids: ReadonlySet<string>;
  readonly conflicts: readonly KnowledgeConflict[];
}

/**
 * 候補の中から食い違いを見つける。
 *
 * 拾う形は2つ:
 *   1. 片方が相手を conflicts_with に挙げている（宣言された食い違い）
 *   2. status が conflicted（すでに食い違いが分かっている）
 */
export function scanConflicts(candidates: readonly Candidate[]): ConflictScan {
  const conflictedIds = new Set<string>();
  const conflicts: KnowledgeConflict[] = [];
  const byId = new Map(candidates.map(c => [c.entry.id, c]));

  // 1. 宣言された食い違い。id の組を並べて重複を作らない。
  const seenPairs = new Set<string>();
  for (const candidate of candidates) {
    for (const otherId of candidate.entry.conflicts_with) {
      if (!byId.has(otherId)) continue;
      const pair = [candidate.entry.id, otherId].sort();
      const key = pair.join("|");
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      conflictedIds.add(pair[0] as string);
      conflictedIds.add(pair[1] as string);
      conflicts.push({
        entry_ids: Object.freeze(pair),
        reason: "declared_conflict",
        owner_decision_required: true,
      });
    }
  }

  // 2. すでに conflicted と分かっているもの。
  for (const candidate of candidates) {
    if (candidate.entry.status !== "conflicted") continue;
    if (conflictedIds.has(candidate.entry.id)) continue;
    conflictedIds.add(candidate.entry.id);
    conflicts.push({
      entry_ids: Object.freeze([candidate.entry.id]),
      reason: "status_conflicted",
      owner_decision_required: true,
    });
  }

  // 記録の並びを固定して、同じ入力から同じ結果が出るようにする。
  conflicts.sort((a, b) => a.entry_ids.join("|").localeCompare(b.entry_ids.join("|")));

  return { conflicted_ids: conflictedIds, conflicts: Object.freeze(conflicts) };
}
