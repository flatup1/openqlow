// Brand Growth Phase 2: Knowledge Registry 本体。
//
// 役割は「台帳」だけ。どこに何があるかを持ち、中身は持たない。
// ファイル読み込み、ネットワーク、環境変数、時刻、乱数を使わない。
//
// 登録時に、危ない状態のまま active になっていないかを検査して、
// 偽装された active を最初から入れさせない。

import type { KnowledgeEntry, KnowledgeRegistry, KnowledgeStatus } from "../contracts/knowledge.js";

/** 選ばれ得る状態。ここに無い状態は候補にすらしない。 */
export const SELECTABLE_STATUSES: readonly KnowledgeStatus[] = Object.freeze(["active", "review_due"]);

export function isSelectableStatus(status: KnowledgeStatus): boolean {
  return SELECTABLE_STATUSES.includes(status);
}

/** 中身を持たないことを型と実装の両方で守るための、禁止フィールド名。 */
const FORBIDDEN_CONTENT_KEYS: readonly string[] = Object.freeze([
  "content",
  "body",
  "text",
  "raw",
  "excerpt",
  "summary_text",
  "secret",
  "token",
  "credential",
]);

export class KnowledgeRegistryError extends Error {}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

/**
 * 台帳を作る。おかしな登録はここで止める。
 *
 * 止める条件:
 *   - id の重複
 *   - 実体未確認（source_hash が null）なのに active を名乗る
 *   - 秘密や個人情報を含むのに quarantined 以外
 *   - 中身を持つフィールドの混入
 *   - token_cost / evidence_confidence が範囲外
 */
export function createRegistry(entries: readonly KnowledgeEntry[], registryVersion: string): KnowledgeRegistry {
  const seen = new Set<string>();

  for (const entry of entries) {
    if (seen.has(entry.id)) {
      throw new KnowledgeRegistryError(`duplicate knowledge id: ${entry.id}`);
    }
    seen.add(entry.id);

    for (const key of Object.getOwnPropertyNames(entry)) {
      if (FORBIDDEN_CONTENT_KEYS.includes(key)) {
        throw new KnowledgeRegistryError(`knowledge entry must not carry content: ${entry.id}.${key}`);
      }
    }

    if (entry.source_hash === null && entry.status === "active") {
      throw new KnowledgeRegistryError(
        `unverified source must not be active: ${entry.id} (${entry.source_path})`,
      );
    }

    if ((entry.contains_secrets || entry.contains_pii) && entry.status !== "quarantined") {
      throw new KnowledgeRegistryError(`secret or pii entry must be quarantined: ${entry.id}`);
    }

    if (!Number.isFinite(entry.token_cost) || entry.token_cost < 0) {
      throw new KnowledgeRegistryError(`invalid token_cost: ${entry.id}`);
    }

    if (entry.evidence_confidence < 0 || entry.evidence_confidence > 1) {
      throw new KnowledgeRegistryError(`invalid evidence_confidence: ${entry.id}`);
    }
  }

  return deepFreeze({
    registry_version: registryVersion,
    entries: [...entries],
  });
}

/** id で1件引く。無ければ null。 */
export function findEntry(registry: KnowledgeRegistry, id: string): KnowledgeEntry | null {
  return registry.entries.find(entry => entry.id === id) ?? null;
}

/** その entry が持つ tag のうち、要求 tag と一致したもの（並びは決定的）。 */
export function matchedTags(entry: KnowledgeEntry, wanted: ReadonlySet<string>): readonly string[] {
  return Object.freeze(entry.tags.filter(tag => wanted.has(tag)).sort());
}
