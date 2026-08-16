// Brand Growth Phase 1 受入試験。
//
// Design Pack tests/ACCEPTANCE_TESTS.md の Phase 1 部分を実装する。
//   AT-001〜AT-009 の route 判定部分 / AT-025 未成年同意 / AT-026 AIKA非依存 / AT-046 質問を増やさない
// Phase 3 以降の内容（Brief、Prompt IR、Negative、Hero Moment、二層台詞）は後続 Phase で検証する。
//
// この試験は外部へ一切アクセスしない。ネットワーク、実顧客データ、資格情報を使わない。

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AMBIGUOUS_PERSON,
  ALL_FIXTURES,
  DURATION_HINT_OVERRIDES_TEXT,
  DURATION_INVALID_DECIMAL,
  DURATION_INVALID_TOO_LONG,
  DURATION_INVALID_ZERO,
  DURATION_IN_MINUTES,
  DURATION_MIXED_UNITS,
  DURATION_WITH_PLATFORM,
  AT001_WOMEN_REEL,
  AT002_KIDS_ANIME,
  AT003_COMPETITION_COOL,
  AT004_PARENT_AND_CHILD,
  AT005_SENIOR,
  AT006_WEBSITE_HERO,
  AT007_INSTAGRAM_DEFAULT,
  AT008_MINIMAL_AMBIGUOUS,
  AT009_EVENT_FACTS_MISSING,
  AT025_MINOR_CONSENT,
  AT046_OWNER_MINIMAL_WORK,
  FORBIDDEN_EMOTION_REQUEST,
  HINT_OVERRIDES_TEXT,
  MEDICAL_CLAIM_REQUEST,
  PARAPHRASE_CASES,
} from "../fixtures/acceptance_inputs.js";
import { ALLOWED_CLARIFICATION_REASONS, ROUTER_VERSION } from "../contracts/route_decision.js";
import { normalizeText } from "./normalize_input.js";
import { explainDecision, route } from "./route.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// --- AT-001 初心者女性 Instagram Reel ---------------------------------------

{
  const d = route(AT001_WOMEN_REEL);
  assert(d.target_primary === "women_beginners", `AT-001 target: got ${d.target_primary}`);
  assert(d.objective === "trial", `AT-001 objective: got ${d.objective}`);
  assert(d.emotional_goal === "safety", `AT-001 emotional goal: got ${d.emotional_goal}`);
  assert(d.content_mode === "image_to_video", `AT-001 content mode: got ${d.content_mode}`);
  assert(d.quality_profile === "people_i2v", `AT-001 quality profile: got ${d.quality_profile}`);
  assert(d.platforms !== null && d.platforms[0]?.platform === "instagram_reel", "AT-001 platform is instagram reel");
  // Women / beginner / Constitution の Knowledge が要る。
  assert(d.required_knowledge_tags.includes("target:women_beginners"), "AT-001 women knowledge tag");
  assert(d.required_knowledge_tags.includes("brand:constitution"), "AT-001 constitution tag");
  assert(d.required_knowledge_tags.includes("story:first_step"), "AT-001 beginner story tag");
  // 誘導は soft_conversion、ただし承認が出るまで本文に載せない。
  assert(d.cta_policy === "soft_conversion", `AT-001 cta: got ${d.cta_policy}`);
  assert(d.cta_approval_required, "AT-001 cta pending approval");
  assert(!d.clarification_required, "AT-001 needs no clarification");
  // MUST NOT: 料金の直書きが決定内容に混ざらない。
  assert(!JSON.stringify(d).includes("円"), "AT-001 decision has no price literal");
}

// --- AT-002 Kids Anime -------------------------------------------------------

{
  const d = route(AT002_KIDS_ANIME);
  assert(d.target_primary === "kids", `AT-002 target: got ${d.target_primary}`);
  assert(d.content_mode === "animation", `AT-002 content mode: got ${d.content_mode}`);
  // 子ども向けの表層は fun。
  assert(d.emotional_goal === "fun", `AT-002 emotional goal: got ${d.emotional_goal}`);
  // 親の層は secondary target として残す。台詞の二層化は Phase 3。
  assert(d.target_secondary === "parents", `AT-002 secondary target: got ${d.target_secondary}`);
  // オリジナルキャラクター保持の blocker が要る。
  assert(d.quality_profile === "original_character", `AT-002 quality profile: got ${d.quality_profile}`);
  assert(d.intent === "animate", `AT-002 intent: got ${d.intent}`);
  assert(!d.clarification_required, "AT-002 needs no clarification (実在人物ではない)");
}

// --- AT-003 Competition Cool -------------------------------------------------

{
  const d = route(AT003_COMPETITION_COOL);
  assert(d.target_primary === "competition", `AT-003 target: got ${d.target_primary}`);
  assert(d.emotional_goal === "aspiration", `AT-003 emotional goal: got ${d.emotional_goal}`);
  // 格闘の blocker と Negative 範囲を選ぶ。中身の Negative は Phase 3。
  assert(d.quality_profile === "combat", `AT-003 quality profile: got ${d.quality_profile}`);
}

// --- AT-004 親子 --------------------------------------------------------------

{
  const d = route(AT004_PARENT_AND_CHILD);
  assert(d.target_primary === "kids_parents", `AT-004 target: got ${d.target_primary}`);
  assert(d.target_secondary === "kids", `AT-004 secondary: got ${d.target_secondary}`);
  assert(d.emotional_goal === "trust", `AT-004 emotional goal: got ${d.emotional_goal}`);
  assert(d.content_mode === "image_to_video", `AT-004 content mode: got ${d.content_mode}`);
  // 二層 brief と Hero Moment（共有動作）は Phase 3。ここでは対象の二層だけを保証する。
  assert(d.required_knowledge_tags.includes("story:shared_action"), "AT-004 shared action story tag");
}

// --- AT-005 シニア ------------------------------------------------------------

{
  const d = route(AT005_SENIOR);
  assert(d.target_primary === "senior", `AT-005 target: got ${d.target_primary}`);
  assert(
    d.emotional_goal === "confidence" || d.emotional_goal === "safety",
    `AT-005 emotional goal should be confidence or safety: got ${d.emotional_goal}`,
  );
  // 医療の断定を求めていないので確認は要らない。
  assert(!d.clarification_required, "AT-005 needs no clarification");
}

// --- AT-006 Website Hero ------------------------------------------------------

{
  const d = route(AT006_WEBSITE_HERO);
  assert(d.objective === "trust", `AT-006 objective: got ${d.objective}`);
  assert(d.platforms !== null && d.platforms[0]?.platform === "website_hero", "AT-006 platform is website hero");
  assert(d.content_mode === "image_to_video", `AT-006 content mode: got ${d.content_mode}`);
  // 事実は Phase 10 の public canon snapshot から取る。Router は事実を持たない。
  assert(!JSON.stringify(d).includes("成田"), "AT-006 decision has no address literal");
}

// --- AT-007 Instagram 既定 -----------------------------------------------------

{
  const d = route(AT007_INSTAGRAM_DEFAULT);
  assert(d.platforms !== null && d.platforms[0]?.platform === "instagram_reel", "AT-007 platform is instagram");
  assert(d.platforms !== null && d.platforms[0]?.aspect_ratio === "9:16", "AT-007 aspect ratio default 9:16");
  // 変換の合図が無いので trust。
  assert(d.objective === "trust", `AT-007 objective: got ${d.objective}`);
  assert(d.target_primary.length > 0, "AT-007 target inferred");
  assert(d.assumptions.length > 0, "AT-007 assumptions are visible");
  // MUST NOT: カメラを聞き返さない。
  assert(d.clarification_reasons.length === 0, "AT-007 asks nothing about camera");
}

// --- AT-008 最小の曖昧依頼 ------------------------------------------------------

{
  const d = route(AT008_MINIMAL_AMBIGUOUS);
  assert(d.intent === "animate", `AT-008 intent: got ${d.intent}`);
  assert(d.target_primary === "general_beginner", `AT-008 inferred target: got ${d.target_primary}`);
  assert(d.objective === "trust", `AT-008 objective: got ${d.objective}`);
  assert(d.content_mode === "image_to_video", `AT-008 safe motion default: got ${d.content_mode}`);
  assert(d.assumptions.some(a => a.field === "target_primary"), "AT-008 target assumption is visible");
  // 人物が1人だけなら誰を動かすか聞かない。
  assert(!d.clarification_required, "AT-008 no clarification when subject is unambiguous");
}

// --- AT-009 大会の事実が無い ----------------------------------------------------

{
  const d = route(AT009_EVENT_FACTS_MISSING);
  assert(d.intent === "announce", `AT-009 intent: got ${d.intent}`);
  assert(d.objective === "event", `AT-009 objective: got ${d.objective}`);
  assert(d.clarification_required, "AT-009 clarification required");
  assert(d.clarification_reasons.includes("event_facts"), "AT-009 asks for verified event facts");
  assert(d.quality_profile === "event_facts", `AT-009 quality profile: got ${d.quality_profile}`);
  // MUST NOT: 日付や場所を作らない。Router は本文を書かないため、決定内容に日付が現れない。
  assert(!/\d{4}-\d{2}-\d{2}/.test(JSON.stringify({ ...d, decided_at: "" })), "AT-009 invents no date");
}

// --- AT-025 未成年の同意（fail closed）------------------------------------------

{
  const d = route(AT025_MINOR_CONSENT);
  assert(d.clarification_required, "AT-025 minor consent blocks the route");
  assert(d.clarification_reasons.includes("minor_consent"), "AT-025 reason is minor consent");
  assert(d.quality_profile === "minor_i2v", `AT-025 quality profile: got ${d.quality_profile}`);
}

// --- AT-046 オーナーの手間を増やさない -------------------------------------------

{
  const d = route(AT046_OWNER_MINIMAL_WORK);
  assert(!d.clarification_required, "AT-046 standard request asks nothing");
  assert(d.clarification_reasons.length === 0, "AT-046 no questions");
  // 聞いてよい理由は5種類だけ。カメラ・照明・音楽・Negative・比率は型に存在しない。
  assert(ALLOWED_CLARIFICATION_REASONS.length === 5, "only five clarification reasons exist");
  const forbiddenAsk = /camera|lighting|music|lens|negative|aspect|ratio|duration/i;
  for (const reason of ALLOWED_CLARIFICATION_REASONS) {
    assert(!forbiddenAsk.test(reason), `clarification reason must not be about craft: ${reason}`);
  }
}

// --- 尺の明示を失わない（Codex レビュー 2026-08-15）--------------------------------

{
  // 1. 媒体が未指定でも、本人が言った尺は型付きで残る。
  const d = route(AT004_PARENT_AND_CHILD);
  assert(d.requested_duration_seconds === 15, `duration should be 15: got ${d.requested_duration_seconds}`);
  assert(d.platforms === null, "platform stays null when unspecified");
}

{
  // 2. 媒体と尺の両方が明示されたら、両方に同じ値が入る。
  const d = route(DURATION_WITH_PLATFORM);
  assert(d.requested_duration_seconds === 30, `top level duration: got ${d.requested_duration_seconds}`);
  assert(d.platforms !== null && d.platforms[0]?.platform === "instagram_reel", "platform is instagram reel");
  assert(d.platforms !== null && d.platforms[0]?.duration_seconds === 30, "platform plan duration matches");
}

{
  // 3. 尺の指定が無ければ null。既定尺を top level へ書かない。
  const d = route(AT001_WOMEN_REEL);
  assert(d.requested_duration_seconds === null, `unspecified duration must be null: got ${d.requested_duration_seconds}`);
  assert(d.platforms !== null && d.platforms[0]?.duration_seconds === 15, "platform default still applies");
}

{
  // 4. 使えない値は null。例外を投げない。理由は assumptions に残す。
  for (const fixture of [
    DURATION_INVALID_ZERO,
    DURATION_INVALID_TOO_LONG,
    DURATION_INVALID_DECIMAL,
    DURATION_MIXED_UNITS,
  ]) {
    const d = route(fixture);
    assert(
      d.requested_duration_seconds === null,
      `invalid duration must be null for ${fixture.request_id}: got ${d.requested_duration_seconds}`,
    );
    assert(
      d.assumptions.some(a => a.field === "requested_duration_seconds"),
      `rejected duration must be visible for ${fixture.request_id}`,
    );
  }
}

{
  // 分の指定は秒へ換算する。
  const d = route(DURATION_IN_MINUTES);
  assert(d.requested_duration_seconds === 60, `1分 should become 60: got ${d.requested_duration_seconds}`);
}

{
  // 構造化ヒントは本文の明示より強い。
  const d = route(DURATION_HINT_OVERRIDES_TEXT);
  assert(d.requested_duration_seconds === 30, `hint should win: got ${d.requested_duration_seconds}`);
  assert(d.platforms !== null && d.platforms[0]?.duration_seconds === 30, "platform plan follows the hint");
}

// --- 明示ヒントは推定より強い（TARGET_ROUTER_SPEC §2）-----------------------------

{
  const d = route(HINT_OVERRIDES_TEXT);
  assert(d.target_primary === "senior", `hint should beat text: got ${d.target_primary}`);
  assert(d.objective === "line_add", `objective hint should win: got ${d.objective}`);
  assert(d.confidence_by_field.target_primary >= 0.9, "explicit hint has explicit confidence");
}

// --- 恐怖・罪悪感の依頼は安全側へ変換する ------------------------------------------

{
  const d = route(FORBIDDEN_EMOTION_REQUEST);
  assert(d.emotional_goal !== "aspiration", "forbidden emotion is not passed through");
  assert(
    d.assumptions.some(a => a.field === "emotional_goal" && a.reason.includes("安全側")),
    "conversion from forbidden emotion is visible",
  );
}

// --- 医療の断定は人間へ回す --------------------------------------------------------

{
  const d = route(MEDICAL_CLAIM_REQUEST);
  assert(d.clarification_required, "medical claim requires human decision");
  assert(d.clarification_reasons.includes("medical_or_legal_claim"), "medical claim reason recorded");
}

// --- 誰を動かすか決まらない場合だけ聞く ---------------------------------------------

{
  const d = route(AMBIGUOUS_PERSON);
  assert(d.clarification_reasons.includes("ambiguous_person"), "two people require a choice");
}

// --- 言い換え・表記揺れ・打ち消し（38件以上）-----------------------------------------

assert(PARAPHRASE_CASES.length >= 30, `need at least 30 paraphrase cases, got ${PARAPHRASE_CASES.length}`);

{
  const seenIds = new Set<string>();
  for (const testCase of PARAPHRASE_CASES) {
    assert(!seenIds.has(testCase.id), `duplicate paraphrase case id: ${testCase.id}`);
    seenIds.add(testCase.id);

    const d = route(testCase.input);
    const e = testCase.expect;
    const where = `${testCase.id} "${testCase.input.raw_text}"`;

    if (e.target !== undefined) {
      assert(d.target_primary === e.target, `${where} target: expected ${e.target}, got ${d.target_primary}`);
    }
    if (e.secondary !== undefined) {
      assert(d.target_secondary === e.secondary, `${where} secondary: got ${d.target_secondary}`);
    }
    if (e.objective !== undefined) {
      assert(d.objective === e.objective, `${where} objective: expected ${e.objective}, got ${d.objective}`);
    }
    if (e.intent !== undefined) {
      assert(d.intent === e.intent, `${where} intent: expected ${e.intent}, got ${d.intent}`);
    }
    if (e.content_mode !== undefined) {
      assert(d.content_mode === e.content_mode, `${where} content mode: got ${d.content_mode}`);
    }
    if (e.emotional_goal !== undefined) {
      assert(d.emotional_goal === e.emotional_goal, `${where} emotional goal: got ${d.emotional_goal}`);
    }
    if (e.platform !== undefined) {
      if (e.platform === null) {
        assert(d.platforms === null, `${where} platform should stay unknown, got ${JSON.stringify(d.platforms)}`);
      } else {
        assert(
          d.platforms !== null && d.platforms.some(p => p.platform === e.platform),
          `${where} platform: expected ${e.platform}, got ${JSON.stringify(d.platforms)}`,
        );
      }
    }
    if (e.duration !== undefined) {
      assert(
        d.requested_duration_seconds === e.duration,
        `${where} duration: expected ${e.duration}, got ${d.requested_duration_seconds}`,
      );
    }
    if (e.cta_approval !== undefined) {
      assert(d.cta_approval_required === e.cta_approval, `${where} cta approval: got ${d.cta_approval_required}`);
    }
    if (e.clarification !== undefined) {
      assert(d.clarification_required === e.clarification, `${where} clarification: got ${d.clarification_required}`);
    }
    if (e.assumption_field !== undefined) {
      assert(
        d.assumptions.some(a => a.field === e.assumption_field),
        `${where} should record an assumption for ${e.assumption_field}`,
      );
    }

    // 一行入力から、人が読める結果まで返せること。
    const summary = explainDecision(d);
    for (const label of ["対象:", "配信面:", "尺:", "CTA:"]) {
      assert(summary.includes(label), `${where} summary must contain ${label}`);
    }
    // 同じ入力は何度でも同じ結果になること。
    assert(JSON.stringify(d) === JSON.stringify(route(testCase.input)), `${where} must be reproducible`);
  }
}

// --- 打ち消しの単体確認（negative control を試験内に固定する）--------------------------

{
  // 打ち消しが無ければ子ども向けと判定される文が、
  const positive = route({ ...AT046_OWNER_MINIMAL_WORK, request_id: "req_neg_positive", raw_text: "子ども向けにして" });
  assert(positive.target_primary === "kids", `negation control baseline: got ${positive.target_primary}`);

  // 「ではなく」が付くと採用されない。
  const negated = route({
    ...AT046_OWNER_MINIMAL_WORK,
    request_id: "req_neg_negated",
    raw_text: "子ども向けではなく初心者女性向けにして",
  });
  assert(negated.target_primary === "women_beginners", `negation should flip: got ${negated.target_primary}`);
  assert(negated.target_primary !== positive.target_primary, "negation must change the result");
}

{
  // 長音符はダッシュに変換しない。変換すると「リール」が「リ-ル」になり語が壊れる。
  assert(normalizeText("リール　ショート").includes("リール"), "long vowel mark must be preserved");
  assert(normalizeText("ＩＮＳＴＡＧＲＡＭ") === "INSTAGRAM", "full width letters are normalized");
  assert(normalizeText("  余分な   空白  ") === "余分な 空白", "extra spaces are collapsed");
}

{
  // 語の一部に当たらない（online の中の line を拾わない）。
  const withBoundary = route({
    ...AT046_OWNER_MINIMAL_WORK,
    request_id: "req_boundary",
    raw_text: "onlineで相談したい人向け",
  });
  assert(withBoundary.platforms === null, "online must not be read as the LINE platform");

  // 明示されていれば拾う。
  const explicitLine = route({
    ...AT046_OWNER_MINIMAL_WORK,
    request_id: "req_explicit_line",
    raw_text: "公式ラインで配る動画",
  });
  assert(
    explicitLine.platforms !== null && explicitLine.platforms.some(p => p.platform === "line"),
    "explicit LINE must be detected",
  );
}

{
  // 優先順位: explicit hint > explicit phrase。本文に別の対象が書かれていてもヒントが勝つ。
  const d = route({
    ...AT046_OWNER_MINIMAL_WORK,
    request_id: "req_precedence",
    raw_text: "子ども向けのリールにして",
    target_hint: "senior",
    objective_hint: "trial",
  });
  assert(d.target_primary === "senior", `hint must beat phrase: got ${d.target_primary}`);
  assert(d.objective === "trial", `objective hint must win: got ${d.objective}`);
  assert(d.confidence_by_field.target_primary >= 0.9, "hint keeps explicit confidence");

  // 優先順位: explicit phrase > asset metadata。素材は子どもでも本文の指定が勝つ。
  const overAsset = route({ ...AT025_MINOR_CONSENT, request_id: "req_phrase_over_asset", raw_text: "シニア向けにして" });
  assert(overAsset.target_primary === "senior", `phrase must beat asset: got ${overAsset.target_primary}`);
  // ただし未成年同意の停止は素材側の事実なので消えない。
  assert(overAsset.clarification_required, "minor consent still blocks regardless of target phrase");
}

// --- 全fixture共通の不変条件 --------------------------------------------------------

for (const fixture of ALL_FIXTURES) {
  const d = route(fixture);

  // target は絶対に欠けない。
  assert(typeof d.target_primary === "string" && d.target_primary.length > 0, `target missing for ${fixture.request_id}`);

  // 同じ入力からは同じ結果（決定性）。
  const again = route(fixture);
  assert(JSON.stringify(d) === JSON.stringify(again), `router must be deterministic for ${fixture.request_id}`);

  // 実行時刻を使わない。判断時刻は入力の requested_at をそのまま引き継ぐ。
  assert(d.decided_at === fixture.requested_at, `decided_at must come from input for ${fixture.request_id}`);

  // 版が必ず入る。
  assert(d.router_version === ROUTER_VERSION, `router version for ${fixture.request_id}`);
  assert(d.version_bundle.router_version === ROUTER_VERSION, `version bundle for ${fixture.request_id}`);

  // 出力は凍結され、後から書き換えられない。入れ子も凍結する。
  assert(Object.isFrozen(d), `decision must be frozen for ${fixture.request_id}`);
  assert(Object.isFrozen(d.confidence_by_field), `confidence must be frozen for ${fixture.request_id}`);
  assert(Object.isFrozen(d.assumptions), `assumptions must be frozen for ${fixture.request_id}`);
  assert(Object.isFrozen(d.version_bundle), `version bundle must be frozen for ${fixture.request_id}`);
  // 書き換えを試みても値が変わらないこと自体を確かめる（strict mode では例外、それ以外では無視される）。
  const beforeTarget = d.target_primary;
  try {
    (d as { target_primary: string }).target_primary = "instructor";
  } catch {
    // strict mode では TypeError になる。ここでは値が変わらないことだけを保証する。
  }
  assert(d.target_primary === beforeTarget, `decision must be immutable for ${fixture.request_id}`);

  // 明示された尺と配信面の尺が食い違わない。
  if (d.requested_duration_seconds !== null && d.platforms !== null) {
    for (const plan of d.platforms) {
      assert(
        plan.duration_seconds === d.requested_duration_seconds,
        `platform duration must match the requested duration for ${fixture.request_id}`,
      );
    }
  }
  // 尺は「明示された値」か null のどちらか。既定値を top level へ入れない。
  assert(
    d.requested_duration_seconds === null || Number.isInteger(d.requested_duration_seconds),
    `requested duration must be an integer or null for ${fixture.request_id}`,
  );

  // 聞いてよい理由以外は出さない。
  for (const reason of d.clarification_reasons) {
    assert(ALLOWED_CLARIFICATION_REASONS.includes(reason), `unexpected clarification reason: ${reason}`);
  }

  // 未成年の同意が未確認なら必ず止まる（fail closed）。
  const blocked = fixture.assets.some(a => a.contains_minor && a.consent_status !== "confirmed");
  if (blocked) {
    assert(d.clarification_required, `minor consent must fail closed for ${fixture.request_id}`);
  }

  // JIN が一行で読める要約が出る。
  const summary = explainDecision(d);
  assert(summary.includes("対象:") && summary.includes("CTA:"), `summary should be readable for ${fixture.request_id}`);
}

// --- AT-026 AIKA 非依存 / 境界の静的検査 ---------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
const moduleRoot = path.resolve(here, "..");

function collectTsFiles(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) collectTsFiles(full, out);
    else if (name.endsWith(".ts")) out.push(full);
  }
}

const moduleFiles: string[] = [];
collectTsFiles(moduleRoot, moduleFiles);
assert(moduleFiles.length >= 10, `brand_growth should contain the Phase 1 files, got ${moduleFiles.length}`);

const IMPORT_PATTERN = /(?:^|\n)\s*(?:import|export)[^;]*?from\s+["']([^"']+)["']/g;

for (const file of moduleFiles) {
  const source = readFileSync(file, "utf8");
  const relative = path.relative(moduleRoot, file);
  const isTest = file.endsWith(".test.ts");

  // 既存モジュールへ依存しない。AIKA、canon、safety、LINE、publish 等を import しない。
  IMPORT_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMPORT_PATTERN.exec(source)) !== null) {
    const specifier = match[1] ?? "";
    const isNodeBuiltin = specifier.startsWith("node:");
    const isInsideModule = specifier.startsWith("./") || specifier.startsWith("../");
    assert(isNodeBuiltin || isInsideModule, `${relative} must not import external package: ${specifier}`);
    if (isInsideModule) {
      const resolved = path.resolve(path.dirname(file), specifier);
      assert(
        resolved.startsWith(moduleRoot + path.sep),
        `${relative} must stay inside brand_growth: ${specifier}`,
      );
    }
    if (isNodeBuiltin) {
      // node 組み込みを使ってよいのは、この境界検査を行う試験ファイルだけ。
      assert(isTest, `${relative} must not use node builtin: ${specifier}`);
    }
  }

  // AIKA / 顧客チャネル / Python 実装への言及そのものを禁止する。
  for (const forbidden of ["src/aika", "port/aika", "line_bot", "src/publish", "src/safety", "src/shared/canon"]) {
    assert(!source.includes(`from "${forbidden}`), `${relative} must not import ${forbidden}`);
    assert(!source.includes(`require("${forbidden}`), `${relative} must not require ${forbidden}`);
  }

  if (!isTest) {
    // 外部への読み書き・ネットワーク・資格情報を持たない。
    for (const forbidden of [
      "node:fs",
      "node:http",
      "node:https",
      "node:net",
      "node:child_process",
      "process.env",
      "fetch(",
      "XMLHttpRequest",
    ]) {
      assert(!source.includes(forbidden), `${relative} must not use ${forbidden}`);
    }
    // 実行時刻や乱数を使わない（決定性）。
    for (const forbidden of ["Date.now(", "new Date(", "Math.random("]) {
      assert(!source.includes(forbidden), `${relative} must not use ${forbidden}`);
    }
  }
}

console.log("brand_growth router tests passed");
