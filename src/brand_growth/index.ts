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
