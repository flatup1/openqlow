// Brand Growth Phase 1 契約: VersionBundle。
//
// 参照: Design Pack SCHEMA_CATALOG §8。
// 後から「どの版で作ったか」を追えるようにするための束。
// Phase 1 で存在するのは Router だけなので、未実装 Phase の版は null にする。
// null は「まだ無い」であって「0」ではない（SCHEMA_CATALOG §1）。

import { ROUTER_VERSION } from "./route_decision.js";

export interface VersionBundle {
  readonly constitution_version: string | null;
  readonly dictionary_version: string | null;
  readonly router_version: string;
  readonly knowledge_registry_version: string | null;
  readonly target_knowledge_version: string | null;
  readonly prompt_engine_version: string | null;
  readonly prompt_template_version: string | null;
  readonly negative_rules_version: string | null;
  readonly metrics_schema_version: string | null;
  readonly provider_adapter_id: string | null;
  readonly provider_adapter_version: string | null;
  readonly learning_policy_version: string | null;
}

/** Phase 1 の版束。Knowledge / Prompt / Provider / Learning は後続 Phase で埋める。 */
export const PHASE1_VERSION_BUNDLE: VersionBundle = Object.freeze({
  constitution_version: null,
  dictionary_version: null,
  router_version: ROUTER_VERSION,
  knowledge_registry_version: null,
  target_knowledge_version: null,
  prompt_engine_version: null,
  prompt_template_version: null,
  negative_rules_version: null,
  metrics_schema_version: null,
  provider_adapter_id: null,
  provider_adapter_version: null,
  learning_policy_version: null,
});
