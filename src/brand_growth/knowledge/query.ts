// Brand Growth Phase 2: 必要な知識だけを選ぶ。
//
// 参照: KNOWLEDGE_REGISTRY_SPEC、ACCEPTANCE_TESTS AT-035 / AT-036 / AT-042。
//
// 絶対に守ること:
//   1. 全 target を読み込まない。要求された target 以外の target 知識は候補にしない。
//   2. 秘密・個人情報・quarantined は selected に入らない。理由だけを返す。
//   3. 食い違いは黙って解決しない。両方を保留して人間へ回す。
//   4. 憲法が使えないなら、そもそも問い合わせを成立させない。
//   5. 同じ入力からは同じ結果。時刻・乱数・外部状態を使わない。

import type {
  KnowledgeEntry,
  KnowledgeQuery,
  KnowledgeRegistry,
  KnowledgeResult,
  PriorityGroup,
  SelectedKnowledge,
  WithheldKnowledge,
  WithheldReason,
} from "../contracts/knowledge.js";
import { scanConflicts } from "./conflicts.js";
import { sortCandidates, type Candidate } from "./precedence.js";
import { isSelectableStatus, matchedTags } from "./registry.js";
import { applyTokenBudget, isProtected } from "./token_budget.js";

/** 状態から「選べない理由」を出す。選べるなら null。 */
function statusReason(entry: KnowledgeEntry): WithheldReason | null {
  if (entry.contains_secrets) return "contains_secrets";
  if (entry.contains_pii) return "contains_pii";
  if (entry.status === "quarantined") return "quarantined";
  if (entry.status === "conflicted") return "conflicted";
  if (entry.status === "deprecated") return "deprecated";
  if (entry.status === "missing") {
    return entry.location === "external" ? "external_unavailable" : "unverified_source";
  }
  if (entry.authority === "historical") return "historical";
  if (!isSelectableStatus(entry.status)) return "unverified_source";
  return null;
}

/**
 * どの優先段に入るか。入らなければ null（＝今回は不要）。
 * 段は KNOWLEDGE_REGISTRY_SPEC の 1〜7 に対応する。
 */
function priorityGroupFor(entry: KnowledgeEntry, query: KnowledgeQuery): PriorityGroup | null {
  // 1. オーナー正本（憲法・辞書・承認ポリシー）は常に土台。
  if (entry.authority === "owner_canon") return 1;

  // 2. 事実が要るときだけ machine canon を見る。
  if (entry.authority === "machine_canon" || entry.category === "canon_reference") {
    return query.facts_needed ? 2 : null;
  }

  // 3. 要求された target と完全一致したときだけ。
  if (query.target !== null && entry.tags.includes(`target:${query.target}`)) return 3;

  // 4. 作り方の一致。
  if (query.content_mode !== null && entry.tags.includes(`mode:${query.content_mode}`)) return 4;

  // 5. 配信面の一致。
  if (query.platform !== null && entry.tags.includes(`platform:${query.platform}`)) return 5;

  // 6. 承認済みの学習。
  if (entry.authority === "validated_learning") {
    const objectiveMatch = query.objective !== null && entry.tags.includes(`objective:${query.objective}`);
    const targetMatch = query.target !== null && entry.tags.includes(`target:${query.target}`);
    return objectiveMatch || targetMatch ? 6 : null;
  }

  // 7. 承認済み参考資料。要求 tag に触れているものだけ。
  if (entry.authority === "approved_reference") {
    const wanted = new Set(query.required_tags);
    return entry.tags.some(tag => wanted.has(tag)) ? 7 : null;
  }

  return null;
}

/** 他 target 専用の知識か（＝今回読んではいけないもの）。 */
function belongsToOtherTarget(entry: KnowledgeEntry, query: KnowledgeQuery): boolean {
  const targetTags = entry.tags.filter(tag => tag.startsWith("target:"));
  if (targetTags.length === 0) return false;
  if (query.target === null) return true;
  return !targetTags.includes(`target:${query.target}`);
}

function toSelected(candidate: Candidate): SelectedKnowledge {
  const e = candidate.entry;
  return {
    id: e.id,
    title: e.title,
    category: e.category,
    authority: e.authority,
    status: e.status,
    source_path: e.source_path,
    source_hash: e.source_hash,
    version: e.version,
    token_cost: e.token_cost,
    priority_group: candidate.group,
    matched_tags: candidate.matched_tags,
  };
}

function toWithheld(entry: KnowledgeEntry, reason: WithheldReason): WithheldKnowledge {
  return { id: entry.id, title: entry.title, source_path: entry.source_path, reason };
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

function blockedResult(
  registry: KnowledgeRegistry,
  reason: string,
  withheld: readonly WithheldKnowledge[],
  warnings: readonly string[],
  conflicts: KnowledgeResult["conflicts"],
): KnowledgeResult {
  return deepFreeze({
    blocked: true,
    block_reason: reason,
    selected: [],
    withheld: [...withheld].sort((a, b) => a.id.localeCompare(b.id)),
    missing_required: [],
    conflicts,
    owner_approval_required: conflicts.length > 0,
    warnings: [...warnings].sort(),
    token_total: 0,
    registry_version: registry.registry_version,
  });
}

export function queryKnowledge(registry: KnowledgeRegistry, query: KnowledgeQuery): KnowledgeResult {
  const withheld: WithheldKnowledge[] = [];
  const warnings = new Set<string>();
  const wantedTags = new Set<string>(query.required_tags);
  if (query.target !== null) wantedTags.add(`target:${query.target}`);
  if (query.content_mode !== null) wantedTags.add(`mode:${query.content_mode}`);
  if (query.platform !== null) wantedTags.add(`platform:${query.platform}`);
  if (query.objective !== null) wantedTags.add(`objective:${query.objective}`);

  // --- 候補を集める ---
  const candidates: Candidate[] = [];

  for (const entry of registry.entries) {
    const reason = statusReason(entry);
    if (reason !== null) {
      withheld.push(toWithheld(entry, reason));
      if (reason === "external_unavailable") {
        warnings.add(`external_source_unavailable:${entry.id}`);
      }
      continue;
    }

    // 全 target 読み込みの禁止。ここが AT-042 の要。
    if (belongsToOtherTarget(entry, query)) {
      withheld.push(toWithheld(entry, "other_target"));
      continue;
    }

    const group = priorityGroupFor(entry, query);
    if (group === null) {
      const isCanon = entry.authority === "machine_canon" || entry.category === "canon_reference";
      withheld.push(toWithheld(entry, isCanon && !query.facts_needed ? "facts_not_needed" : "not_requested"));
      continue;
    }

    candidates.push({ entry, group, matched_tags: matchedTags(entry, wantedTags) });
  }

  // --- 食い違いは黙って解決しない ---
  const conflictScan = scanConflicts(candidates);
  const survivors: Candidate[] = [];
  for (const candidate of candidates) {
    if (conflictScan.conflicted_ids.has(candidate.entry.id)) {
      withheld.push(toWithheld(candidate.entry, "conflicted"));
      continue;
    }
    survivors.push(candidate);
  }

  // --- 憲法が使えないなら、そもそも成立させない ---
  const hasConstitution = survivors.some(c => c.entry.category === "constitution");
  if (!hasConstitution) {
    return blockedResult(
      registry,
      "constitution_unavailable",
      withheld,
      [...warnings, "constitution_unavailable"],
      conflictScan.conflicts,
    );
  }

  // --- 並べる ---
  const sorted = sortCandidates(survivors);

  // --- 件数の上限 ---
  const withinCount: Candidate[] = [];
  for (const candidate of sorted) {
    if (withinCount.length < query.max_entries || isProtected(candidate.entry)) {
      withinCount.push(candidate);
    } else {
      withheld.push(toWithheld(candidate.entry, "max_entries"));
    }
  }

  // --- 予算の上限。憲法は落とさない ---
  const budget = applyTokenBudget(withinCount, query.token_budget);
  for (const candidate of budget.dropped) {
    withheld.push(toWithheld(candidate.entry, "token_budget"));
  }
  if (budget.exceeded_by_protected) {
    warnings.add("token_budget_exceeded_by_protected");
  }

  // --- 足りない必須 tag ---
  const providedTags = new Set<string>();
  for (const candidate of budget.kept) {
    for (const tag of candidate.entry.tags) providedTags.add(tag);
  }
  const missingRequired = query.required_tags.filter(tag => !providedTags.has(tag));

  // --- target 知識が無い場合は、一般向けで進めることを明示する ---
  if (query.target !== null && !budget.kept.some(c => c.entry.tags.includes(`target:${query.target}`))) {
    warnings.add(`target_knowledge_missing:${query.target}`);
    warnings.add("generic_fallback_used");
  }

  return deepFreeze({
    blocked: false,
    block_reason: null,
    selected: budget.kept.map(toSelected),
    withheld: withheld.sort((a, b) => a.id.localeCompare(b.id)),
    missing_required: [...missingRequired].sort(),
    conflicts: conflictScan.conflicts,
    owner_approval_required: conflictScan.conflicts.length > 0,
    warnings: [...warnings].sort(),
    token_total: budget.token_total,
    registry_version: registry.registry_version,
  });
}

/**
 * JIN が読める要約。
 * 何を選び、何を外し、なぜ止まったかを短く出す。中身は一切出さない。
 */
export function explainKnowledgeResult(result: KnowledgeResult): string {
  if (result.blocked) {
    return `知識の取得を止めました。理由: ${result.block_reason}\n人間の確認が必要です。`;
  }
  const lines = [
    `使う知識: ${result.selected.length}件（${result.token_total}トークン）`,
    `外した知識: ${result.withheld.length}件`,
  ];
  if (result.conflicts.length > 0) {
    lines.push(`食い違い: ${result.conflicts.length}件。オーナーの判断待ちです。`);
  }
  if (result.missing_required.length > 0) {
    lines.push(`足りない情報: ${result.missing_required.join(", ")}`);
  }
  if (result.warnings.length > 0) {
    lines.push(`注意: ${result.warnings.join(", ")}`);
  }
  return lines.join("\n");
}
