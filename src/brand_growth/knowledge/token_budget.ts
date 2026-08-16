// Brand Growth Phase 2: 予算に収まるまで削る。
//
// 削る順は「権威の低いものから」。
// ただし Constitution（憲法）は何があっても落とさない。
// 憲法だけで予算を超える場合は、削らずに警告を出す。安全側を優先する。

import type { KnowledgeEntry } from "../contracts/knowledge.js";
import { authorityRank, type Candidate } from "./precedence.js";

/** 落としてはいけない知識か。 */
export function isProtected(entry: KnowledgeEntry): boolean {
  return entry.category === "constitution";
}

export interface BudgetResult {
  readonly kept: readonly Candidate[];
  readonly dropped: readonly Candidate[];
  readonly token_total: number;
  /** 保護対象だけで超過したか。 */
  readonly exceeded_by_protected: boolean;
}

function total(candidates: readonly Candidate[]): number {
  return candidates.reduce((sum, c) => sum + c.entry.token_cost, 0);
}

/**
 * 予算内へ収める。
 * order は選定順（先頭が最優先）で渡すこと。削る相手を選ぶときだけ順序を逆に見る。
 */
export function applyTokenBudget(order: readonly Candidate[], budget: number): BudgetResult {
  const kept = [...order];
  const dropped: Candidate[] = [];

  while (total(kept) > budget) {
    let victimIndex = -1;
    let victimRank = -1;

    // 権威が最も低いものを探す。同じ権威なら、選定順で後ろにあるものを落とす。
    for (let i = 0; i < kept.length; i += 1) {
      const candidate = kept[i];
      if (candidate === undefined || isProtected(candidate.entry)) continue;
      const rank = authorityRank(candidate.entry.authority);
      if (rank >= victimRank) {
        victimRank = rank;
        victimIndex = i;
      }
    }

    if (victimIndex === -1) {
      // 残りは全部保護対象。これ以上は削らない。
      return {
        kept: Object.freeze(kept),
        dropped: Object.freeze(dropped),
        token_total: total(kept),
        exceeded_by_protected: true,
      };
    }

    const [victim] = kept.splice(victimIndex, 1);
    if (victim !== undefined) dropped.push(victim);
  }

  return {
    kept: Object.freeze(kept),
    dropped: Object.freeze(dropped),
    token_total: total(kept),
    exceeded_by_protected: false,
  };
}
