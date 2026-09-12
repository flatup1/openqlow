// 広告動画: 「勝手に課金しない・勝手に送らない」ことのテスト。
//
// このテストは本物のネットワークを使わない。fetch は差し替える。
// 差し替えた fetch が呼ばれたかどうかで「外へ出たか」を確かめる。

import {
  FAL_KEY_ENV,
  OWNER_APPROVAL_ENV,
  OWNER_APPROVAL_PHRASE,
  liveBlockers,
  submitOne,
  submitPlan,
} from "./client.js";
import type { GenerationPlan, GenerationRequest } from "./plan.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const request: GenerationRequest = Object.freeze({
  concept_id: "flatup_women_beginner_002",
  endpoint: "minimax/h3-max-turbo/text-to-video",
  task_kind: "text_to_video",
  output_basename: "flatup_women_beginner_002__480p_5s",
  input: Object.freeze({
    prompt: "a bright clean gym",
    duration: 5,
    resolution: "480p",
    aspect_ratio: "9:16",
    prompt_expansion_mode: "balanced",
  }),
});

const approvedPlan: GenerationPlan = Object.freeze({
  model_key: "minimax/h3-max-turbo",
  resolution: "480p",
  requests: Object.freeze([request]),
  cost: Object.freeze({
    clips: 1,
    seconds_each: 5,
    usd_per_output_second: 0.01,
    total_usd: 0.05,
    formula_ja: "1本 × 5秒 × $0.01/秒 = $0.05",
    price_verified_official: true,
  }),
  approved_to_generate: true,
  blockers_ja: Object.freeze([]),
  warnings_ja: Object.freeze([]),
});

const blockedPlan: GenerationPlan = Object.freeze({
  ...approvedPlan,
  approved_to_generate: false,
  blockers_ja: Object.freeze(["単価が公式未確認"]),
});

const fullEnv = Object.freeze({
  OPENQLOW_DRY_RUN: "false",
  [OWNER_APPROVAL_ENV]: OWNER_APPROVAL_PHRASE,
  [FAL_KEY_ENV]: "dummy-key-for-test",
});

function spyFetch(): { impl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => ({ request_id: "req_test_1", status_url: "https://example.invalid/status" }),
      text: async () => "",
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

// --- 何もそろっていなければ送らない ------------------------------------------------------------
{
  const blockers = liveBlockers(approvedPlan, {});
  assert(blockers.length >= 3, `既定では複数の理由で止まる: ${blockers.join(" / ")}`);
  assert(blockers.some(b => b.includes("ドライラン")), "既定はドライラン");
  assert(blockers.some(b => b.includes(OWNER_APPROVAL_ENV)), "オーナー承認が要る");
  assert(blockers.some(b => b.includes(FAL_KEY_ENV)), "キーが要る");
}

// --- 承認語が違えば送らない ------------------------------------------------------------------
{
  const blockers = liveBlockers(approvedPlan, { ...fullEnv, [OWNER_APPROVAL_ENV]: "yes" });
  assert(blockers.some(b => b.includes(OWNER_APPROVAL_ENV)), "承認語が違えば止まる");
}

// --- 計画が承認されていなければ送らない ---------------------------------------------------------
{
  const spy = spyFetch();
  const outcome = await submitOne(blockedPlan, request, { env: fullEnv, fetchImpl: spy.impl });
  assert(!outcome.sent, "承認されていない計画は送らない");
  assert(spy.calls.length === 0, "fetch を1回も呼ばない（外へ出ていない）");
  assert(outcome.note_ja.includes("公式未確認"), `理由がそのまま残る: ${outcome.note_ja}`);
}

// --- ドライランでは送らない ------------------------------------------------------------------
{
  const spy = spyFetch();
  const outcome = await submitOne(approvedPlan, request, {
    env: { ...fullEnv, OPENQLOW_DRY_RUN: "true" },
    fetchImpl: spy.impl,
  });
  assert(!outcome.sent, "ドライランでは送らない");
  assert(spy.calls.length === 0, "ドライランで fetch を呼ばない");
}

// --- すべてそろって初めて送る ----------------------------------------------------------------
{
  const spy = spyFetch();
  const outcome = await submitOne(approvedPlan, request, { env: fullEnv, fetchImpl: spy.impl });
  assert(outcome.sent, "承認・キー・非ドライランがそろえば送る");
  assert(outcome.request_id === "req_test_1", "request_id を持ち帰る（§11の記録に要る）");
  assert(spy.calls.length === 1, "1本につき1回だけ呼ぶ");
  assert(spy.calls[0].includes("minimax/h3-max-turbo/text-to-video"), `URLにモデルが入る: ${spy.calls[0]}`);
  assert(!spy.calls[0].includes("dummy-key-for-test"), "キーをURLに載せない");
}

// --- Webhook を渡すと URL に載る（ポーリングしないため） -------------------------------------------
{
  const spy = spyFetch();
  await submitOne(approvedPlan, request, {
    env: fullEnv,
    fetchImpl: spy.impl,
    webhook_url: "https://example.invalid/hook",
  });
  assert(spy.calls[0].includes("fal_webhook="), `Webhookが載る: ${spy.calls[0]}`);
}

// --- 1本目で止まったら残りは投げない --------------------------------------------------------------
{
  const spy = spyFetch();
  const manyPlan: GenerationPlan = Object.freeze({
    ...blockedPlan,
    requests: Object.freeze([request, request, request]),
  });
  const outcomes = await submitPlan(manyPlan, { env: fullEnv, fetchImpl: spy.impl });
  assert(outcomes.length === 1, "止まったらそこで終わる");
  assert(spy.calls.length === 0, "1本も外へ出ていない");
}

console.log("ad_video client tests passed");
