// Brand Growth Phase 3 契約: CreativeBrief。
//
// 参照: SCHEMA_CATALOG §5、VISION_BOOK、PROMPT_BIBLE。
//
// 思考の順番は固定であり、飛ばせない:
//   人の状況（怖い・もどかしい・望み・壁）
//     → 感情の目標をひとつだけ
//     → 物語の流れ
//     → Hero Moment をひとつだけ
//     → 画づくり
//     → Prompt IR
//
// FLATUPは主人公ではない。主人公は必ずお客さま。
// FLATUPは「安全な場所」「仲間」「導き手」「挑戦の舞台」のいずれかを務める。
//
// 料金・住所・時間などの事実はここに書かない（正本は src/shared/canon.ts）。

import type { EmotionalGoal, Objective, TargetPrimary } from "./route_decision.js";
import type { Assumption, ContentMode, CtaPolicy } from "./route_decision.js";
import type { VersionBundle } from "./version_bundle.js";

/** その人が今どこにいるか。ここを飛ばして画から考えない。 */
export interface PersonContext {
  readonly fear: string;
  readonly frustration: string;
  readonly desire: string;
  readonly barrier: string;
}

/** FLATUP が物語で務める役。主人公にはしない。 */
export type StoryRoleOfFlatup = "safe_place" | "companions" | "guide" | "stage_for_challenge";

export interface StoryBeat {
  readonly order: number;
  readonly beat: string;
}

/**
 * 一本にひとつだけの見せ場。
 * 説明の台詞やテロップが無くても意味が伝わることが条件。
 */
export interface HeroMoment {
  readonly moment: string;
  readonly why_it_lands: string;
  /** 言葉の説明なしで理解できるか。false は採用しない。 */
  readonly readable_without_explanation: boolean;
}

export interface Shot {
  readonly order: number;
  readonly description: string;
}

/** 1本につき主要な動作はひとつ。詰め込まない。 */
export interface ShotPlan {
  readonly primary_action: string;
  readonly shots: readonly Shot[];
}

/**
 * 子ども向けの二層。
 * 表側は子どもが見て楽しい層、奥は親が受け取る層。
 * 親向けの言葉を子どもの台詞に混ぜない。
 */
export interface TwoLayer {
  readonly child_surface: string;
  readonly parent_deep_layer: string;
}

export interface ReusePlan {
  readonly master_seconds: number | null;
  readonly variants: readonly string[];
}

export interface CreativeBrief {
  readonly brief_id: string;
  readonly request_id: string;
  readonly route_id: string;
  readonly target: TargetPrimary;
  readonly objective: Objective;
  readonly person_context: PersonContext;
  /** 感情の目標はちょうど1つ。複数持たせない。 */
  readonly emotional_goal_one: EmotionalGoal;
  readonly emotional_arc: readonly string[];
  readonly story_role_of_flatup: StoryRoleOfFlatup;
  readonly story_beats: readonly StoryBeat[];
  /** 見せ場はちょうど1つ。 */
  readonly hero_moment: HeroMoment;
  readonly visual_mode: ContentMode;
  readonly shot_plan: ShotPlan;
  readonly audio_intent: string;
  readonly cta_policy: CtaPolicy;
  /** 出さない場合は null。承認前に本文へ載せない。 */
  readonly cta_draft: string | null;
  readonly cta_approval_required: boolean;
  readonly reuse_plan: ReusePlan;
  readonly experiment_hypothesis: string;
  readonly assumptions: readonly Assumption[];
  /** 使った知識の id。中身は持たない。 */
  readonly knowledge_references: readonly string[];
  /** 子ども系は必須。それ以外は null。 */
  readonly two_layer: TwoLayer | null;
  readonly version_bundle: VersionBundle;
}

export interface BriefResult {
  /** 知識が使えない等、作ってはいけない状態。 */
  readonly blocked: boolean;
  readonly block_reason: string | null;
  readonly brief: CreativeBrief | null;
  readonly warnings: readonly string[];
}
