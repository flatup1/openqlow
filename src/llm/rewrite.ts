/**
 * 投稿本文を「指示どおりに書き直す」だけの薄いLLMクライアント。
 *
 * 設計方針（JIN: 最短最速・60点でOK・事故ゼロ）:
 * - 既定はクラウドの OpenRouter（OPENROUTER_API_KEY があれば使う／VPSインストール不要）。
 *   キーが無い場合は VPSローカルの Ollama（OLLAMA_BASE_URL）へフォールバック。
 * - 失敗（キー無し・接続不可・空応答・タイムアウト）したら本文は絶対に書き換えない。
 *   → 呼び出し側が「直せませんでした」と正直に返し、変な本文を投稿させない。
 * - 出力は本文テキストのみ。前置き・引用符・コードフェンスは軽く除去。
 * - APIキーはログ／チャットに一切出さない（このファイルでも出力しない）。
 */

export interface RewriteOptions {
  currentBody: string;
  instruction: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export type RewriteResult =
  | { ok: true; body: string; provider: "openrouter" | "ollama" }
  | { ok: false; reason: string };

const DEFAULT_OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini";
const DEFAULT_OLLAMA_BASE = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_MODEL = "gemma3:4b";
const DEFAULT_TIMEOUT_MS = 20_000;

function buildSystemPrompt(): string {
  return [
    "あなたは成田の格闘技ジム「FLATUP GYM」のSNS投稿を整える編集者です。",
    "渡された投稿本文を、ユーザーの指示どおりに日本語で書き直してください。",
    "ルール:",
    "・出力は書き直した本文だけ。前置き・説明・引用符・ハッシュタグは付けない。",
    "・誇張や嘘は書かない。実際にやっていないことを断定しない（やさしく正直なトーン）。",
    "・元の長さ感を保つ（2〜4行程度の短い文章）。",
    "・会員や子どもの個人情報・実名は新たに作らない。",
  ].join("\n");
}

function buildUserPrompt(currentBody: string, instruction: string): string {
  return [
    "【今の本文】",
    currentBody.trim() || "(本文が空です。指示に沿って新しく書いてください)",
    "",
    "【書き直しの指示】",
    instruction.trim(),
    "",
    "上のルールに従い、書き直した本文だけを返してください。",
  ].join("\n");
}

/** モデル出力からありがちな飾り（前置き・コードフェンス・囲み引用符）を軽く落とす。 */
function cleanOutput(text: string): string {
  let out = text.trim();
  out = out.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  const quoted = out.match(/^["“”「『](.*)["“”」』]$/s);
  if (quoted) out = quoted[1].trim();
  return out;
}

function validateBody(body: string): RewriteResult | undefined {
  if (!body) return { ok: false, reason: "AIが空の本文を返しました" };
  // 暴走防止: 異常に長い出力は採用しない（60点の短文が目的）。
  if (body.length > 1000) return { ok: false, reason: "AIの出力が長すぎます" };
  return undefined;
}

async function callOpenRouter(opts: Required<Pick<RewriteOptions, "currentBody" | "instruction">>, env: NodeJS.ProcessEnv, fetchImpl: typeof fetch, timeoutMs: number, apiKey: string): Promise<RewriteResult> {
  const baseUrl = (env.OPENROUTER_BASE_URL || DEFAULT_OPENROUTER_BASE).replace(/\/$/, "");
  const model = env.OPENQLOW_REWRITE_MODEL || DEFAULT_OPENROUTER_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://github.com/flatup1/openqlow",
        "X-Title": "OPENQLOW",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 500,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserPrompt(opts.currentBody, opts.instruction) },
        ],
      }),
    });
    if (!res.ok) {
      // 本文（status以外）は鍵を含む可能性は無いが、安全側で先頭のみ。
      const detail = await res.text().catch(() => "");
      return { ok: false, reason: `OpenRouter応答エラー(${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}` };
    }
    const data = (await res.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string } }> } | null;
    const body = cleanOutput(data?.choices?.[0]?.message?.content ?? "");
    const invalid = validateBody(body);
    if (invalid) return invalid;
    return { ok: true, body, provider: "openrouter" };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, reason: "OpenRouterの応答がタイムアウトしました" };
    }
    return { ok: false, reason: `OpenRouterに接続できませんでした: ${error instanceof Error ? error.message : String(error)}` };
  } finally {
    clearTimeout(timer);
  }
}

async function callOllama(opts: Required<Pick<RewriteOptions, "currentBody" | "instruction">>, env: NodeJS.ProcessEnv, fetchImpl: typeof fetch, timeoutMs: number): Promise<RewriteResult> {
  const baseUrl = (env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE).replace(/\/$/, "");
  const model = env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        options: { temperature: 0.4 },
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserPrompt(opts.currentBody, opts.instruction) },
        ],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, reason: `Ollama応答エラー(${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}` };
    }
    const data = (await res.json().catch(() => null)) as { message?: { content?: string } } | null;
    const body = cleanOutput(data?.message?.content ?? "");
    const invalid = validateBody(body);
    if (invalid) return invalid;
    return { ok: true, body, provider: "ollama" };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, reason: "AIの応答がタイムアウトしました" };
    }
    return { ok: false, reason: `AIに接続できませんでした: ${error instanceof Error ? error.message : String(error)}` };
  } finally {
    clearTimeout(timer);
  }
}

export async function rewriteDraftBody(opts: RewriteOptions): Promise<RewriteResult> {
  const env = opts.env ?? process.env;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (!opts.instruction.trim()) {
    return { ok: false, reason: "指示が空です" };
  }

  const core = { currentBody: opts.currentBody, instruction: opts.instruction };
  const apiKey = (env.OPENROUTER_API_KEY || "").trim();

  if (apiKey) {
    return callOpenRouter(core, env, fetchImpl, timeoutMs, apiKey);
  }
  // キーが無ければローカルOllamaを試す（無ければ正直に失敗する）。
  return callOllama(core, env, fetchImpl, timeoutMs);
}
