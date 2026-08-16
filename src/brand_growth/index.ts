// FLATUP Brand Growth モジュール（Phase 1）。
//
// できること: 一行の依頼から「誰に・何のために・どう作るか」を決めるだけ。
// できないこと（意図的に持たない）:
//   - 外部API呼び出し、課金、公開、送信、本番接続
//   - 顧客への返信（AIKA の領域。この module は一切関与しない）
//   - 料金・住所・時間などの事実の保持（正本は src/shared/canon.ts）
//   - Knowledge 取得、Prompt 生成、Provider 実行、学習（Phase 2 以降）
//
// この index は型と純関数を再輸出するだけで、読み込んでも副作用が起きない。

export type {
  AssetRef,
  ConsentStatus,
  CreativeInput,
  InputChannel,
  MediaType,
  RetentionClass,
  SourceType,
} from "./contracts/creative_input.js";

export {
  assetBlocksPersonGeneration,
  blockedMinorAssets,
  hasCharacterSheet,
  hasImageAsset,
  hasVerifiedFactSource,
  hasVideoAsset,
  personAssets,
} from "./contracts/creative_input.js";

export type {
  Assumption,
  Classified,
  ClarificationReason,
  ConfidenceBand,
  ConfidenceField,
  ContentMode,
  CtaPolicy,
  EmotionalGoal,
  Intent,
  Objective,
  PlatformId,
  PlatformPlan,
  QualityProfile,
  RouteDecision,
  SignalSource,
  TargetPrimary,
} from "./contracts/route_decision.js";

export {
  ALLOWED_CLARIFICATION_REASONS,
  ROUTER_VERSION,
  confidenceBand,
} from "./contracts/route_decision.js";

export type { VersionBundle } from "./contracts/version_bundle.js";
export { PHASE1_VERSION_BUNDLE } from "./contracts/version_bundle.js";

export { explainDecision, route } from "./router/route.js";

// --- Phase 2: Knowledge Registry（台帳のみ。中身は持たない）---

export type {
  KnowledgeAuthority,
  KnowledgeCategory,
  KnowledgeConflict,
  KnowledgeEntry,
  KnowledgeLocation,
  KnowledgeQuery,
  KnowledgeRegistry,
  KnowledgeResult,
  KnowledgeStatus,
  PriorityGroup,
  SelectedKnowledge,
  WithheldKnowledge,
  WithheldReason,
} from "./contracts/knowledge.js";

export {
  createRegistry,
  findEntry,
  isSelectableStatus,
  KnowledgeRegistryError,
  SELECTABLE_STATUSES,
} from "./knowledge/registry.js";

export { AUTHORITY_ORDER, authorityRank } from "./knowledge/precedence.js";
export { scanConflicts } from "./knowledge/conflicts.js";
export { applyTokenBudget, isProtected } from "./knowledge/token_budget.js";
export { createManifestRegistry, MANIFEST_ENTRIES, MANIFEST_VERSION } from "./knowledge/manifest.js";
export { explainKnowledgeResult, queryKnowledge } from "./knowledge/query.js";

// --- Phase 3: Director と Provider 非依存の Prompt IR（dry-run のみ）---

export type {
  BriefResult,
  CreativeBrief,
  HeroMoment,
  PersonContext,
  ReusePlan,
  Shot,
  ShotPlan,
  StoryBeat,
  StoryRoleOfFlatup,
  TwoLayer,
} from "./contracts/creative_brief.js";

export { buildBrief, DIRECTOR_VERSION } from "./director/build_brief.js";
export { arcFor } from "./director/emotional_arc.js";
export { heroMomentFor, primaryActionFor } from "./director/hero_moment.js";
export { childSurfaceIsClean, requiresTwoLayer, twoLayerFor } from "./director/two_layer.js";

export type { NegativeBlock, NegativeCategory, PromptIR } from "./prompts/prompt_ir.js";
export {
  buildVersionBundle,
  NEGATIVE_RULES_VERSION,
  PROMPT_ENGINE_VERSION,
  PROMPT_TEMPLATE_VERSION,
} from "./prompts/prompt_ir.js";

export { composePromptIR, renderFinalPrompt } from "./prompts/compose.js";
export {
  composeNegatives,
  selectNegativeCategories,
  subjectPreservationFor,
} from "./prompts/negative_compose.js";
export { guardStyleNames, isFreeOfStyleNames } from "./prompts/style_name_guard.js";
export type { ApprovalRequirement, CreativePackage } from "./prompts/render_preview.js";
export { renderCreativePackage } from "./prompts/render_preview.js";

// --- Phase 4: 生成前の見張り役と、結果の記録（保存は追記のみ・外部送信なし）---

export type {
  AssessedBy,
  BlockingCheck,
  BlockingCheckName,
  CheckOutcome,
  QualityAssessment,
  ScoredCheck,
  ScoredCheckName,
  Usability,
} from "./contracts/quality.js";
export {
  BLOCKING_CHECK_NAMES,
  QUALITY_SCHEMA_VERSION,
  SCORED_CHECK_NAMES,
} from "./contracts/quality.js";

export type { PreflightCheck, PreflightParams, PreflightResult } from "./quality/preflight.js";
export { explainPreflight, QUALITY_GUARDIAN_VERSION, runPreflight } from "./quality/preflight.js";

export type { PostQaParams } from "./quality/post_qa.js";
export { assessQuality, countUsable, explainAssessment } from "./quality/post_qa.js";

export { deepFreeze, isUtcIso8601, RecordRuleError } from "./contracts/record_rules.js";

export type { ResolveRootOptions } from "./storage/config.js";
export {
  BRAND_GROWTH_ROOT_ENV,
  DEFAULT_RUNTIME_DIRNAME,
  resolveStoreRoot,
  StoreConfigError,
} from "./storage/config.js";

export type { ReadResult, StoredEvent } from "./storage/event_store.js";
export {
  appendEvent,
  currentEvents,
  EVENT_SCHEMA_VERSION,
  makeEvent,
  readEvents,
  StorageError,
  supersedeEvent,
} from "./storage/event_store.js";

export type {
  AttemptCostRecord,
  ContentOutcomeView,
  CostSummary,
  EffectiveCostReason,
  Experiment,
  ExperimentArm,
  ExperimentDesign,
  ExperimentResult,
  ExperimentVariableName,
  ManualEntry,
  MeasuredMetricsView,
  MetricFieldName,
  MetricSnapshot,
  MetricSource,
  MetricWindow,
  Money,
  PredictedEmotionalScore,
} from "./contracts/growth.js";
export {
  COST_SCHEMA_VERSION,
  EXPERIMENT_SCHEMA_VERSION,
  METRIC_FIELD_NAMES,
  METRIC_SCHEMA_VERSION,
  PREDICTED_AXIS_NAMES,
} from "./contracts/growth.js";

export { explainCost, summarizeCost } from "./growth/cost.js";
export {
  buildOutcomeView,
  explainOutcome,
  importMetricSnapshot,
  isAveragingAllowed,
  recordPredictedScore,
} from "./growth/metrics.js";
export {
  constantVariables,
  designExperiment,
  diffVariables,
  explainExperiment,
  recordExperimentResult,
} from "./growth/experiment.js";
