// 広告動画: fal.ai へ実際に投げる口。ここだけがネットワークに触る。
//
// 参照: 指示書 §3「API優先順位」（公式API優先・キューとWebhook・無駄なポーリング禁止）、
//       §4「ブラウザ操作」（重要操作は勝手に確定しない）、§14「オーナー承認」。
//
// 安全の決めごと（fail closed）:
//   1. 既定はドライラン。`OPENQLOW_DRY_RUN=false` で初めて実行側に入る。
//   2. さらに `AD_VIDEO_OWNER_APPROVAL` に承認語が入っていないと課金しない。
//   3. `plan.buildPlan()` が承認していない計画は、そもそも受け付けない。
//   4. APIキーは環境変数だけで扱い、戻り値にもログにも出さない。
//   5. 待つときは Webhook を優先。ポーリングは間隔を広げて回数を上限で止める。

import type { GenerationPlan, GenerationRequest } from "./plan.js";

export const OWNER_APPROVAL_ENV = "AD_VIDEO_OWNER_APPROVAL";
export const OWNER_APPROVAL_PHRASE = "approved-by-owner";
export const FAL_KEY_ENV = "FAL_KEY";
export const FAL_QUEUE_BASE_ENV = "FAL_QUEUE_BASE_URL";
/** 公式未確認。オーナーが公式ドキュメントで確認するまで、この既定値のまま使わない。 */
export const DEFAULT_QUEUE_BASE_URL = "https://queue.fal.run";

export type EnvBundle = Readonly<Record<string, string | undefined>>;

export interface SubmitOptions {
  readonly env: EnvBundle;
  /** 完了通知の受け口。あるとポーリングしないで済む。 */
  readonly webhook_url?: string | null;
  /** テスト用の差し替え。既定はグローバルの fetch。 */
  readonly fetchImpl?: typeof fetch;
}

export interface SubmitOutcome {
  /** 実際に送ったか。false ならドライラン（外へは何も出ていない）。 */
  readonly sent: boolean;
  readonly concept_id: string;
  readonly endpoint: string;
  readonly request_id: string | null;
  readonly status_url: string | null;
  /** 送らなかった理由、または送った結果の一言。 */
  readonly note_ja: string;
}

export class AdVideoClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AdVideoClientError";
    this.code = code;
  }
}

/** 実行してよいか。止める理由を日本語で返す。空なら実行してよい。 */
export function liveBlockers(plan: GenerationPlan, env: EnvBundle): readonly string[] {
  const reasons: string[] = [];
  if (!plan.approved_to_generate) {
    reasons.push(`計画が承認されていない: ${plan.blockers_ja.join(" / ")}`);
  }
  if (env.OPENQLOW_DRY_RUN !== "false") {
    reasons.push("ドライラン中（実行するなら OPENQLOW_DRY_RUN=false）");
  }
  if (env[OWNER_APPROVAL_ENV] !== OWNER_APPROVAL_PHRASE) {
    reasons.push(`オーナー承認が無い（${OWNER_APPROVAL_ENV}=${OWNER_APPROVAL_PHRASE} が要る）`);
  }
  if (!env[FAL_KEY_ENV]) {
    reasons.push(`${FAL_KEY_ENV} が設定されていない`);
  }
  return Object.freeze(reasons);
}

function queueUrl(env: EnvBundle, endpoint: string, webhookUrl: string | null): string {
  const base = (env[FAL_QUEUE_BASE_ENV] ?? DEFAULT_QUEUE_BASE_URL).replace(/\/+$/, "");
  const url = `${base}/${endpoint.replace(/^\/+/, "")}`;
  if (webhookUrl === null || webhookUrl === "") return url;
  return `${url}?fal_webhook=${encodeURIComponent(webhookUrl)}`;
}

/**
 * 1本ぶんをキューへ入れる。
 * 止める理由が1つでもあれば送らず、理由を付けて返す（例外にはしない）。
 */
export async function submitOne(
  plan: GenerationPlan,
  request: GenerationRequest,
  options: SubmitOptions,
): Promise<SubmitOutcome> {
  const blockers = liveBlockers(plan, options.env);
  if (blockers.length > 0) {
    return Object.freeze({
      sent: false,
      concept_id: request.concept_id,
      endpoint: request.endpoint,
      request_id: null,
      status_url: null,
      note_ja: `送っていない: ${blockers.join(" / ")}`,
    });
  }

  const doFetch = options.fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== "function") {
    throw new AdVideoClientError("no_fetch", "fetch が使えない実行環境です");
  }

  const response = await doFetch(queueUrl(options.env, request.endpoint, options.webhook_url ?? null), {
    method: "POST",
    headers: {
      // キーは値を持ち回らない。ここでヘッダに入れるだけ。
      Authorization: `Key ${options.env[FAL_KEY_ENV] as string}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request.input),
  });

  if (!response.ok) {
    // 本文にキーは含まれないが、長い応答はそのまま流さない。
    const detail = (await response.text()).slice(0, 300);
    throw new AdVideoClientError(
      `http_${response.status}`,
      `キュー投入に失敗した（HTTP ${response.status}）: ${detail}`,
    );
  }

  const body = (await response.json()) as {
    request_id?: string;
    status_url?: string;
  };
  return Object.freeze({
    sent: true,
    concept_id: request.concept_id,
    endpoint: request.endpoint,
    request_id: body.request_id ?? null,
    status_url: body.status_url ?? null,
    note_ja: "キューへ入れた。完了はWebhookか status_url で確認する",
  });
}

/** 計画のぶんをまとめて投げる。1本でも失敗したらそこで止める（残りは投げない）。 */
export async function submitPlan(
  plan: GenerationPlan,
  options: SubmitOptions,
): Promise<readonly SubmitOutcome[]> {
  const outcomes: SubmitOutcome[] = [];
  for (const request of plan.requests) {
    const outcome = await submitOne(plan, request, options);
    outcomes.push(outcome);
    if (!outcome.sent) break;
  }
  return Object.freeze(outcomes);
}
