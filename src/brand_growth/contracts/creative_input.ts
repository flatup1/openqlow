// Brand Growth Phase 1 契約: Router の入力 CreativeInput / AssetRef。
//
// 参照: Design Pack SCHEMA_CATALOG §2。
// 重要な不変条件:
//   contains_minor が true で consent_status が confirmed 以外なら、
//   その人物を生成 Provider へ渡してはいけない（fail closed / AT-025）。
// ID に氏名・LINE user ID・電話番号を入れない（SCHEMA_CATALOG §1）。

import type { ContentMode, Objective, PlatformId, TargetPrimary } from "./route_decision.js";

export type InputChannel = "cli" | "web" | "owner_line" | "line" | "api" | "fixture";

export type MediaType = "image" | "video" | "audio" | "character_sheet" | "document";

export type SourceType =
  | "gym_photo"
  | "member_photo"
  | "facility_photo"
  | "existing_video"
  | "character_sheet"
  /** 事実確認済みの一次資料。大会日時など外部事実の根拠に使う。 */
  | "verified_document"
  | "unknown";

export type ConsentStatus = "confirmed" | "missing" | "not_required" | "unknown";

export type RetentionClass = "session" | "project" | "archive" | "unknown";

export interface AssetRef {
  readonly asset_id: string;
  readonly uri: string;
  readonly sha256: string;
  readonly media_type: MediaType;
  readonly source_type: SourceType;
  readonly contains_person: boolean;
  readonly contains_minor: boolean;
  readonly consent_status: ConsentStatus;
  readonly consent_reference: string | null;
  readonly retention_class: RetentionClass;
}

export interface CreativeInput {
  readonly request_id: string;
  readonly raw_text: string;
  readonly input_channel: InputChannel;
  readonly assets: readonly AssetRef[];
  /** UTC ISO 8601。表示時だけ Asia/Tokyo へ変換する。 */
  readonly requested_at: string;

  /** 以下は任意の明示ヒント。推定より常に優先される（TARGET_ROUTER_SPEC §2）。 */
  readonly target_hint?: TargetPrimary | null;
  readonly objective_hint?: Objective | null;
  readonly platform_hint?: PlatformId | null;
  readonly duration_hint_seconds?: number | null;
  readonly aspect_ratio_hint?: string | null;
  readonly content_mode_hint?: ContentMode | null;
  readonly budget_limit?: number | null;
}

/**
 * その素材の人物を生成へ渡してよいか。未成年で同意未確認なら渡さない。
 * 「不明」は「同意あり」ではない。判断に迷う側は必ず止める。
 */
export function assetBlocksPersonGeneration(asset: AssetRef): boolean {
  return asset.contains_minor && asset.consent_status !== "confirmed";
}

/** 未成年同意が未確認の素材を集める（1件でもあれば人間へ確認する）。 */
export function blockedMinorAssets(input: CreativeInput): readonly AssetRef[] {
  return input.assets.filter(assetBlocksPersonGeneration);
}

/** 人物が写っている素材。 */
export function personAssets(input: CreativeInput): readonly AssetRef[] {
  return input.assets.filter(asset => asset.contains_person);
}

/** 外部事実（大会日時など）の根拠になる一次資料があるか。 */
export function hasVerifiedFactSource(input: CreativeInput): boolean {
  return input.assets.some(asset => asset.source_type === "verified_document");
}

/** 動かす対象になり得る画像素材があるか。 */
export function hasImageAsset(input: CreativeInput): boolean {
  return input.assets.some(asset => asset.media_type === "image");
}

/** 承認済みオリジナルキャラクターシートがあるか。 */
export function hasCharacterSheet(input: CreativeInput): boolean {
  return input.assets.some(
    asset => asset.media_type === "character_sheet" || asset.source_type === "character_sheet",
  );
}

/** 既存の動画素材があるか（別尺づくりの入力）。 */
export function hasVideoAsset(input: CreativeInput): boolean {
  return input.assets.some(asset => asset.media_type === "video");
}
