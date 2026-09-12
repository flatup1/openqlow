// CLI: 広告動画の生成計画を見る。既定では何も生成しない（指示書 §13 / §14 / §17）。
//
//   npm run ad-video                                   5案の一覧と、5秒×5本の見積り
//   npm run ad-video -- --concept flatup_women_beginner_002
//   npm run ad-video -- --concept flatup_women_beginner_002 --resolution 768p
//   npm run ad-video -- --submit                       実際にキューへ投げる（承認が要る）
//
// --submit を付けても、次のすべてが揃っていなければ送らない:
//   OPENQLOW_DRY_RUN=false / AD_VIDEO_OWNER_APPROVAL=approved-by-owner / FAL_KEY / 計画が承認済み

import { AD_CONCEPTS, findConcept, type AdConcept } from "./concepts.js";
import { buildPlan, type GenerationPlan } from "./plan.js";
import { liveBlockers, submitPlan } from "./client.js";
import { AXIS_META } from "./scoring.js";

export interface CliArgs {
  readonly conceptIds: readonly string[];
  readonly resolution?: string;
  readonly durationSeconds?: number;
  readonly submit: boolean;
}

export function parseArgs(argv: readonly string[]): CliArgs {
  const conceptIds: string[] = [];
  let resolution: string | undefined;
  let durationSeconds: number | undefined;
  let submit = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--submit") submit = true;
    else if (arg === "--concept" && argv[i + 1]) conceptIds.push(argv[++i]);
    else if (arg === "--resolution" && argv[i + 1]) resolution = argv[++i];
    else if (arg === "--seconds" && argv[i + 1]) {
      const parsed = Number(argv[++i]);
      if (Number.isFinite(parsed)) durationSeconds = parsed;
    }
  }

  return Object.freeze({
    conceptIds: Object.freeze(conceptIds.length > 0 ? conceptIds : AD_CONCEPTS.map(c => c.id)),
    resolution,
    durationSeconds,
    submit,
  });
}

function renderConcept(concept: AdConcept): string {
  const beats = concept.beats.map(b => `    ${b.at} ${b.ja}`).join("\n");
  return [
    `[${concept.id}] ${concept.title_ja}`,
    `  狙い: ${concept.aim_ja}`,
    `  ターゲット: ${concept.target_ja}`,
    "  5秒構成:",
    beats,
    `  CTA: ${concept.cta_ja}（${concept.cta_destination === "line" ? "LINE" : "LP"}）`,
    `  避ける: ${concept.avoid_ja.join(" / ")}`,
  ].join("\n");
}

export function renderPlan(plan: GenerationPlan, conceptIds: readonly string[]): string {
  const blocks: string[] = ["============ FLATUP 広告動画 / 生成計画 ============"];

  for (const id of conceptIds) {
    const concept = findConcept(id);
    blocks.push(concept === null ? `[${id}] 見つからない` : renderConcept(concept));
  }

  blocks.push("---- 見積り ----");
  blocks.push(`  モデル: ${plan.model_key} / 解像度: ${plan.resolution}`);
  blocks.push(`  ${plan.cost.formula_ja}`);
  blocks.push(
    plan.cost.price_verified_official
      ? "  単価: 公式確認済み"
      : "  単価: 公式未確認（この状態では課金生成に進まない）",
  );

  blocks.push("---- 採点の観点（生成後に人が付ける・100点満点） ----");
  for (const meta of AXIS_META) {
    blocks.push(`  ${meta.label_ja}（${meta.weight}点）: ${meta.question_ja}`);
  }

  if (plan.warnings_ja.length > 0) {
    blocks.push("---- 気をつけること ----");
    for (const warning of plan.warnings_ja) blocks.push(`  - ${warning}`);
  }

  blocks.push("---- 実行可否 ----");
  if (plan.approved_to_generate) {
    blocks.push("  計画としてはOK。実行は承認とキーが揃ってから。");
  } else {
    blocks.push("  生成しない。理由:");
    for (const blocker of plan.blockers_ja) blocks.push(`  - ${blocker}`);
  }
  blocks.push("===================================================");
  return blocks.join("\n");
}

const invokedDirectly = process.argv[1]?.endsWith("run_cli.ts");
if (invokedDirectly) {
  const args = parseArgs(process.argv.slice(2));
  const plan = buildPlan({
    concept_ids: args.conceptIds,
    resolution: args.resolution,
    duration_seconds: args.durationSeconds,
  });
  console.log(renderPlan(plan, args.conceptIds));

  if (args.submit) {
    const blockers = liveBlockers(plan, process.env);
    if (blockers.length > 0) {
      console.error("\n送信しない。理由:");
      for (const blocker of blockers) console.error(`- ${blocker}`);
      process.exit(1);
    }
    const outcomes = await submitPlan(plan, { env: process.env });
    for (const outcome of outcomes) {
      console.log(`${outcome.concept_id}: ${outcome.note_ja}${outcome.request_id ? ` / request_id=${outcome.request_id}` : ""}`);
    }
  }
  process.exit(0);
}
