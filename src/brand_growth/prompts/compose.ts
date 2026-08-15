// Brand Growth Phase 3: Brief から Provider 非依存の Prompt IR を作る。
//
// カメラや光は「感情から」決める。派手さのために選ばない。
// Provider の名前・モデル・記法・endpoint はここに一切出さない。

import type { CreativeBrief } from "../contracts/creative_brief.js";
import type { EmotionalGoal, RouteDecision } from "../contracts/route_decision.js";
import { composeNegatives, selectNegativeCategories, subjectPreservationFor, type NegativeSelectionInput } from "./negative_compose.js";
import type { PromptIR } from "./prompt_ir.js";

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

interface Look {
  readonly camera: string;
  readonly lens: string;
  readonly composition: string;
  readonly lighting: string;
  readonly atmosphere: string;
  readonly color: string;
  readonly speed: string;
  readonly music: string;
}

/** 感情ごとの画づくり。カメラは1つだけ選ぶ。 */
const LOOK: Record<EmotionalGoal, Look> = {
  safety: {
    camera: "eye level, locked off with a very slow push in",
    lens: "standard field of view, no distortion",
    composition: "subject slightly off center with open space ahead",
    lighting: "soft diffused daylight, no hard shadows",
    atmosphere: "calm and clean",
    color: "low saturation, natural skin tones",
    speed: "real time, no slow motion",
    music: "quiet and sparse, no build up",
  },
  fun: {
    camera: "slightly low angle at child eye level, small handheld float",
    lens: "standard field of view",
    composition: "subject centered with room to move",
    lighting: "bright even daylight",
    atmosphere: "playful and open",
    color: "slightly higher saturation, warm",
    speed: "real time with a brief hold on the reaction",
    music: "light and simple",
  },
  aspiration: {
    camera: "horizontal, minimal pan that follows the action",
    lens: "standard to slightly long field of view",
    composition: "subject centered, headroom tight",
    lighting: "directional key light with controlled shadow",
    atmosphere: "focused and quiet before the action",
    color: "cool neutral, deep blacks",
    speed: "real time with one short hold at impact",
    music: "restrained, no aggressive percussion",
  },
  trust: {
    camera: "static wide, no movement",
    lens: "standard field of view",
    composition: "level horizon, symmetrical framing",
    lighting: "even ambient light",
    atmosphere: "orderly and clean",
    color: "neutral and natural",
    speed: "real time",
    music: "minimal or none",
  },
  confidence: {
    camera: "eye level, slow steady framing",
    lens: "standard field of view",
    composition: "stable frame with the subject supported by the environment",
    lighting: "soft front light, shadows kept light",
    atmosphere: "unhurried",
    color: "warm neutral",
    speed: "real time, unhurried",
    music: "quiet and steady",
  },
  permission: {
    camera: "eye level, observational and still",
    lens: "standard field of view",
    composition: "subject among others, not isolated",
    lighting: "ordinary daylight",
    atmosphere: "everyday, not special",
    color: "natural",
    speed: "real time",
    music: "very light",
  },
  belonging: {
    camera: "slightly wider, static",
    lens: "standard field of view",
    composition: "several people share the frame",
    lighting: "warm ambient light",
    atmosphere: "shared and relaxed",
    color: "warm",
    speed: "real time",
    music: "warm and simple",
  },
  empathy: {
    camera: "static close framing",
    lens: "slightly long field of view, shallow depth",
    composition: "face and eyes in the upper third",
    lighting: "soft side light",
    atmosphere: "quiet",
    color: "muted",
    speed: "real time",
    music: "sparse",
  },
};

/** 身体の動きの扱い。誇張せず、現実の重心移動を守る。 */
function bodyMechanicsFor(brief: CreativeBrief): readonly string[] {
  const base = [
    "believable weight transfer",
    "feet stay in contact with the floor",
    "controlled recovery after the action",
  ];
  if (brief.target === "competition" || brief.target === "sparring_fans") {
    return Object.freeze([...base, "readable technique", "respect between opponents"]);
  }
  if (brief.target === "senior") {
    return Object.freeze([...base, "small range of motion", "no sudden direction change"]);
  }
  return Object.freeze(base);
}

/** 一般的な制約メモ。Provider を特定しない。 */
function providerConstraintsFor(brief: CreativeBrief): readonly string[] {
  const notes = [
    "duration and aspect ratio must be checked against the chosen provider before generation",
    "if the provider cannot keep identity across the clip, shorten the clip rather than adding motion",
    "no provider specific syntax is included in this IR",
  ];
  if (brief.visual_mode === "image_to_video") {
    notes.push("image to video requires a reference frame that already matches the intended framing");
  }
  return Object.freeze(notes);
}

export interface ComposeInput {
  readonly brief: CreativeBrief;
  readonly decision: RouteDecision;
  readonly negatives: NegativeSelectionInput;
  /** 固有名を外した代わりに使う見た目の言葉。無ければ空。 */
  readonly style_replacement_attributes: readonly string[];
}

export function composePromptIR(input: ComposeInput): PromptIR {
  const { brief, decision } = input;
  const look = LOOK[brief.emotional_goal_one];
  const categories = selectNegativeCategories(input.negatives);

  const platform = decision.platforms !== null ? decision.platforms[0] : undefined;
  const duration = decision.requested_duration_seconds ?? platform?.duration_seconds ?? null;
  const aspect = platform?.aspect_ratio ?? null;

  // 固有名の代わりの見た目の言葉は、雰囲気の説明として足す。名前は入らない。
  const atmosphere =
    input.style_replacement_attributes.length > 0
      ? `${look.atmosphere}; ${input.style_replacement_attributes.join(", ")}`
      : look.atmosphere;

  const ir: PromptIR = {
    prompt_id: `prm_${brief.request_id.replace(/^req_/, "")}`,
    brief_id: brief.brief_id,
    target: brief.target,
    objective: brief.objective,
    emotional_goal: brief.emotional_goal_one,
    human_context: brief.person_context,
    story: brief.story_beats.map(beat => beat.beat),
    hero_moment: brief.hero_moment.moment,
    subject_preservation: subjectPreservationFor(input.negatives),
    action: brief.shot_plan.primary_action,
    body_mechanics: bodyMechanicsFor(brief),
    camera: look.camera,
    lens: look.lens,
    composition: look.composition,
    lighting: look.lighting,
    atmosphere,
    color: look.color,
    speed: look.speed,
    sound: brief.audio_intent,
    music: look.music,
    continuity: Object.freeze([
      "same location for the whole clip",
      "same lighting for the whole clip",
      "one continuous action",
    ]),
    negative_categories: composeNegatives(categories),
    duration_seconds: duration,
    aspect_ratio: aspect,
    // 誘導は本編の中に入れない。承認後に編集で足す前提のメモとして持つ。
    cta_editing_note:
      brief.cta_draft === null
        ? null
        : `本編の余韻が終わってから、静かに次の一言を置く（承認後）: ${brief.cta_draft}`,
    provider_constraints: providerConstraintsFor(brief),
    knowledge_references: brief.knowledge_references,
    assumptions: brief.assumptions,
    version_bundle: brief.version_bundle,
    estimated_cost: null,
    paid_generation_approval_required: true,
    visual_mode: brief.visual_mode,
  };

  return deepFreeze(ir);
}

/**
 * 最終的な自然言語のプロンプト。
 * Provider の記法を使わず、素直な英文で書く。固有名も事実も入れない。
 */
export function renderFinalPrompt(ir: PromptIR): string {
  const lines = [
    `Subject: ${ir.target.replace(/_/g, " ")} at a friendly kickboxing gym. The member is the protagonist.`,
    `Emotional goal: ${ir.emotional_goal}.`,
    `Story: ${ir.story.join(" -> ")}.`,
    `Key moment: ${ir.hero_moment}.`,
    `Action: ${ir.action}. Exactly one action in the clip.`,
    `Body mechanics: ${ir.body_mechanics.join(", ")}.`,
    `Camera: ${ir.camera}. ${ir.lens}.`,
    `Composition: ${ir.composition}.`,
    `Lighting: ${ir.lighting}. Atmosphere: ${ir.atmosphere}.`,
    `Color: ${ir.color}. Speed: ${ir.speed}.`,
    `Continuity: ${ir.continuity.join("; ")}.`,
  ];

  if (ir.subject_preservation.length > 0) {
    lines.push(`Preserve: ${ir.subject_preservation.join("; ")}.`);
  }
  if (ir.duration_seconds !== null) {
    lines.push(`Duration: ${ir.duration_seconds} seconds.`);
  }
  if (ir.aspect_ratio !== null) {
    lines.push(`Aspect ratio: ${ir.aspect_ratio}.`);
  }

  const avoid = ir.negative_categories
    .map(block => `${block.category}: ${block.rules.join(", ")}`)
    .join(" | ");
  lines.push(`Avoid -> ${avoid}.`);

  return lines.join("\n");
}
