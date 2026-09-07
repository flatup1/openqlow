// Brand Growth Phase 2 契約: Knowledge Registry の型。
//
// 参照: Design Pack KNOWLEDGE_REGISTRY_SPEC / SCHEMA_CATALOG §4。
//
// 最重要の設計:
//   このモジュールは「何がどこにあるか」だけを持ち、**中身は絶対に持たない**。
//   本文フィールドを型に置かないことで、秘密情報や顧客情報がここへ入る道を塞ぐ。
//   資格情報を含む文書は quarantined として path だけ登録し、読み込み口を作らない。
//
// Phase 1 の型（CreativeInput / RouteDecision / VersionBundle）の意味は変更しない。

export type KnowledgeCategory =
  | "constitution"
  | "dictionary"
  | "target"
  | "creative"
  | "provider"
  | "learning"
  | "policy"
  | "canon_reference";

/** 強い順。owner_canon が最上位で、historical は事実として使わない。 */
export type KnowledgeAuthority =
  | "owner_canon"
  | "machine_canon"
  | "approved_policy"
  | "validated_learning"
  | "approved_reference"
  | "historical";

/**
 * active / review_due だけが選ばれ得る。
 * missing は「宣言はあるが実体を確認できていない」= active と偽装しないための状態。
 */
export type KnowledgeStatus =
  | "active"
  | "review_due"
  | "conflicted"
  | "quarantined"
  | "missing"
  | "deprecated";

/** local はこのリポジトリ内、external は Vault 等の外部。external は既定で使わない。 */
export type KnowledgeLocation = "local" | "external";

/**
 * 知識1件分のメタデータ。
 * 本文・要約・抜粋を持つフィールドは意図的に存在しない。
 */
export interface KnowledgeEntry {
  readonly id: string;
  readonly title: string;
  readonly category: KnowledgeCategory;
  readonly tags: readonly string[];
  readonly authority: KnowledgeAuthority;
  readonly status: KnowledgeStatus;
  readonly source_path: string;
  /** 実体を確認していなければ null。確認していない値を作らない。 */
  readonly source_hash: string | null;
  readonly version: string;
  /** UTC ISO 8601。文字列のまま比較する（実行時刻に依存しないため）。 */
  readonly reviewed_at: string | null;
  readonly review_due: string | null;
  /** Prompt へ入れたときのおおよその重さ。予算配分にだけ使う。 */
  readonly token_cost: number;
  /** 根拠の強さ 0〜1。同点時の決め手にだけ使う。 */
  readonly evidence_confidence: number;
  readonly contains_secrets: boolean;
  readonly contains_pii: boolean;
  readonly location: KnowledgeLocation;
  /** 内容が食い違う相手の id。片方を黙って採用しないために使う。 */
  readonly conflicts_with: readonly string[];
}

export interface KnowledgeRegistry {
  readonly registry_version: string;
  readonly entries: readonly KnowledgeEntry[];
}

export interface KnowledgeQuery {
  /** これが無いと成立しない tag。足りなければ missing_required に出る。 */
  readonly required_tags: readonly string[];
  readonly target: string | null;
  readonly objective: string | null;
  readonly platform: string | null;
  readonly content_mode: string | null;
  readonly max_entries: number;
  readonly token_budget: number;
  /** 料金・時間などの事実が要るときだけ true。machine canon はこのときだけ候補になる。 */
  readonly facts_needed: boolean;
}

/** 選ばれなかった理由。人が読んで納得できる粒度にする。 */
export type WithheldReason =
  | "quarantined"
  | "contains_secrets"
  | "contains_pii"
  | "conflicted"
  | "deprecated"
  | "historical"
  | "unverified_source"
  | "external_unavailable"
  | "other_target"
  | "not_requested"
  | "facts_not_needed"
  | "max_entries"
  | "token_budget";

/** 優先順位の段。小さいほど先に選ばれる。KNOWLEDGE_REGISTRY_SPEC の1〜7に対応。 */
export type PriorityGroup = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface SelectedKnowledge {
  readonly id: string;
  readonly title: string;
  readonly category: KnowledgeCategory;
  readonly authority: KnowledgeAuthority;
  readonly status: KnowledgeStatus;
  readonly source_path: string;
  readonly source_hash: string | null;
  readonly version: string;
  readonly token_cost: number;
  readonly priority_group: PriorityGroup;
  readonly matched_tags: readonly string[];
}

export interface WithheldKnowledge {
  readonly id: string;
  readonly title: string;
  readonly source_path: string;
  readonly reason: WithheldReason;
}

export interface KnowledgeConflict {
  readonly entry_ids: readonly string[];
  readonly reason: string;
  /** 競合は必ず人間が決める。自動で片方を選ばない。 */
  readonly owner_decision_required: true;
}

export interface KnowledgeResult {
  /** 憲法が使えない等、そもそも問い合わせを成立させてはいけない状態。 */
  readonly blocked: boolean;
  readonly block_reason: string | null;
  readonly selected: readonly SelectedKnowledge[];
  readonly withheld: readonly WithheldKnowledge[];
  readonly missing_required: readonly string[];
  readonly conflicts: readonly KnowledgeConflict[];
  readonly owner_approval_required: boolean;
  readonly warnings: readonly string[];
  readonly token_total: number;
  readonly registry_version: string;
}
