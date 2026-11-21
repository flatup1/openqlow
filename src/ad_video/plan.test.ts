// 広告動画: 計画・見積り・止め方のテスト。
//
// ここで守りたいこと:
//   - 公式未確認の単価では生成に進まない
//   - 見積りは 本数 × 秒数 × 単価
//   - 大量生成・高額はオーナー承認が要る
//   - 5案すべてが表現ルールを通る

import { AD_CONCEPTS, findConcept } from "./concepts.js";
import { checkExpression, mentionsMinor } from "./guard.js";
import { H3_MAX_TURBO, findPrice, unverifiedReasons } from "./catalog.js";
import {
  BULK_APPROVAL_THRESHOLD_CLIPS,
  COST_APPROVAL_THRESHOLD_USD,
  buildPlan,
  estimateCost,
  outputBasename,
} from "./plan.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// --- 見積りの計算 ---------------------------------------------------------------------------
{
  const cost = estimateCost({
    clips: 5,
    seconds_each: 5,
    usd_per_output_second: 0.01,
    price_verified_official: true,
  });
  assert(cost.total_usd === 0.25, `5本×5秒×$0.01 = $0.25 のはず: ${cost.total_usd}`);
  assert(cost.formula_ja.includes("5本 × 5秒"), "式が日本語で読める");
}

// --- 公式未確認なら止まる -------------------------------------------------------------------
{
  const reasons = unverifiedReasons(H3_MAX_TURBO, "480p");
  assert(reasons.length > 0, "台帳が公式未確認のうちは、必ず理由が出る");

  const plan = buildPlan({ concept_ids: ["flatup_women_beginner_002"] });
  assert(!plan.approved_to_generate, "公式未確認のあいだは生成に進まない");
  assert(
    plan.blockers_ja.some(b => b.includes("公式未確認")),
    `止める理由に公式未確認が含まれる: ${plan.blockers_ja.join(" / ")}`,
  );
}

// --- 台帳にない設定は通さない ----------------------------------------------------------------
{
  const plan = buildPlan({ concept_ids: ["flatup_women_beginner_002"], resolution: "1080p" });
  assert(
    plan.blockers_ja.some(b => b.includes("1080p")),
    "台帳にない解像度は止める",
  );

  const longPlan = buildPlan({ concept_ids: ["flatup_women_beginner_002"], duration_seconds: 7 });
  assert(
    longPlan.blockers_ja.some(b => b.includes("7秒")),
    "台帳にない尺は止める",
  );
}

// --- 知らないコンセプトは止める ---------------------------------------------------------------
{
  const plan = buildPlan({ concept_ids: ["no_such_concept"] });
  assert(
    plan.blockers_ja.some(b => b.includes("no_such_concept")),
    "存在しないコンセプトは止める",
  );
  assert(plan.requests.length === 0, "存在しないものは投げる対象に入れない");
}

// --- 大量生成・高額は承認が要る ----------------------------------------------------------------
{
  const ids = AD_CONCEPTS.map(c => c.id);
  assert(
    ids.length <= BULK_APPROVAL_THRESHOLD_CLIPS,
    `最初のバッチは ${BULK_APPROVAL_THRESHOLD_CLIPS}本以内（§9 STEP2）`,
  );

  const price = findPrice(H3_MAX_TURBO, "768p");
  assert(price !== null, "768p の単価が台帳にある");
  const expensive = estimateCost({
    clips: 200,
    seconds_each: 15,
    usd_per_output_second: price?.usd_per_output_second ?? 0,
    price_verified_official: true,
  });
  assert(
    expensive.total_usd > COST_APPROVAL_THRESHOLD_USD,
    "200本×15秒は承認しきい値を超える見積りになる",
  );
}

// --- ファイル名が意味を持つ（§12） -------------------------------------------------------------
{
  const concept = findConcept("flatup_women_beginner_002");
  assert(concept !== null, "コンセプトがある");
  if (concept === null) throw new Error("unreachable");
  const name = outputBasename(concept, "480p", 5);
  assert(name === "flatup_women_beginner_002__480p_5s", `命名が読める形: ${name}`);
}

// --- 5案すべてが表現ルールを通る -----------------------------------------------------------------
{
  for (const concept of AD_CONCEPTS) {
    // 検査するのは「モデルへ送る本文」と「お客さまの目に触れる文」だけ。
    // 社内向けの狙い（aim_ja）は「怒鳴らない」のように禁止語を含めて説明するので対象外。
    const guard = checkExpression(`${concept.prompt_en} ${concept.cta_ja} ${concept.title_ja}`);
    assert(
      guard.ok,
      `${concept.id} に禁止表現: ${guard.hits.map(h => h.term).join(", ")}`,
    );
    assert(!mentionsMinor(concept.prompt_en), `${concept.id} は未成年を含まない（最初のバッチは女性初心者）`);
    assert(concept.beats.length >= 3, `${concept.id} は5秒の構成が書かれている`);
    assert(concept.prompt_en.length > 120, `${concept.id} のプロンプトが薄すぎない`);
    assert(concept.id.startsWith("flatup_"), `${concept.id} は命名規則に沿う`);
  }
  assert(AD_CONCEPTS.length === 5, "最初のバッチは5案（§17）");
}

// --- 料金・住所を絵の指示に混ぜない -------------------------------------------------------------
{
  for (const concept of AD_CONCEPTS) {
    assert(!/\d{3,}円/.test(concept.prompt_en), `${concept.id} のプロンプトに料金を書かない`);
    assert(!concept.prompt_en.includes("成田"), `${concept.id} のプロンプトに住所を書かない`);
  }
}

console.log("ad_video plan tests passed");
