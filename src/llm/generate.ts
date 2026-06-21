/**
 * 「投稿」時にその日のSNS本文を新規生成し、AI編集長が採点→改善を繰り返して質を上げる。
 *
 * 設計方針（JIN: 100点に近づける・事故ゼロ・個人情報を出さない）:
 * - 既定は OpenRouter（OPENROUTER_API_KEY があれば）。無ければローカル Ollama。
 * - 生成本文を「採点(0-100)＋改善版」のループで推敲（既定3回・95点で早期終了）。
 * - 会員・子ども・個人名は出さない。誇張や未実施の断定をしない（やさしく正直）。
 * - 失敗したら呼び出し側が定型文へフォールバック（変な本文を投稿しない）。
 * - APIキーはログ・チャットに出さない。
 */

export interface GenerateOptions {
  dateJst: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  seed?: number;
}

export type GenerateResult =
  | { ok: true; body: string; provider: "openrouter" | "ollama" }
  | { ok: false; reason: string };

export interface RefineOptions {
  body: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRounds?: number;
  targetScore?: number;
}

export type RefineResult =
  | { ok: true; body: string; rounds: number; score: number }
  | { ok: false; reason: string };

const DEFAULT_OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini";
const DEFAULT_OLLAMA_BASE = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_MODEL = "gemma3:4b";
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_REFINE_ROUNDS = 3;
const DEFAULT_TARGET_SCORE = 95;

const THEMES = [
  "昨日より少しだけ自分と向き合う、継続の大切さ",
  "初心者がはじめの一歩を踏み出す安心感",
  "親子で一緒に挑戦できる場所であること",
  "礼儀やあいさつから生まれる自信",
  "体験のハードルがとても低いこと",
  "仲間と励まし合えるつながり",
  "心と体が少しずつ整っていく感覚",
  "女性も安心して通えること",
  "うまくできなくても大丈夫という空気",
  "日々の小さな積み重ねが力になること",
];

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function pickTheme(dateJst: string, seed?: number): string {
  const base = seed ?? (Date.parse(`${dateJst}T00:00:00+09:00`) || Date.now());
  const index = Math.abs(Math.floor(base / 86_400_000) + (seed ?? 0)) % THEMES.length;
  return THEMES[index];
}

function weekdayJa(dateJst: string): string {
  const day = new Date(`${dateJst}T00:00:00+09:00`).getDay();
  return Number.isNaN(day) ? "" : WEEKDAYS[day];
}

const QUALITY_RULES = [
  "・2〜4行の短い文章。読みやすく、押し付けがましくない。",
  "・会員・子ども・スタッフの個人名や具体的な個人情報は絶対に書かない。",
  "・誇張や嘘、実際にやっていないことの断定をしない。",
  "・「成田」「FLATUP GYM」を自然に1回入れる。",
  "・ハッシュタグ・絵文字の羅列・前置き・引用符は付けない。",
];

function buildGenerateSystem(): string {
  return [
    "あなたは成田の格闘技ジム「FLATUP GYM」の、やさしく正直なSNS担当です。",
    "渡されたテーマで、Threads向けの短い投稿本文を日本語で作ってください。",
    "ルール:",
    ...QUALITY_RULES,
    "・出力は本文だけ。",
  ].join("\n");
}

function buildGenerateUser(theme: string, weekday: string): string {
  return [
    `今日のテーマ: ${theme}`,
    weekday ? `曜日: ${weekday}曜日（雰囲気づくりの参考程度に）` : "",
    "",
    "このテーマで、FLATUP GYMらしいやさしい投稿本文だけを返してください。",
  ].filter(Boolean).join("\n");
}

function buildRefineSystem(): string {
  return [
    "あなたはFLATUP GYM（成田の格闘技ジム）の厳しいSNS編集長です。",
    "渡された投稿本文を採点し、100点に近づけた改善版を作ります。",
    "評価基準（やさしく正直・読み手が安心する・自然な日本語・FLATUPらしさ）:",
    ...QUALITY_RULES,
    "出力形式は厳守してください:",
    "1行目: SCORE: <0-100の整数>",
    "2行目: ---",
    "3行目以降: 改善後の本文だけ（前置き・説明・引用符・ハッシュタグなし）",
  ].join("\n");
}

function buildRefineUser(body: string): string {
  return ["【投稿本文】", body.trim(), "", "採点して、改善版を上の形式で返してください。"].join("\n");
}

function cleanOutput(text: string): string {
  let out = text.trim();
  out = out.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  const quoted = out.match(/^["“”「『](.*)["“”」』]$/s);
  if (quoted) out = quoted[1].trim();
  return out;
}

function isValidBody(body: string): boolean {
  return body.length > 0 && body.length <= 1000;
}

/** 推敲応答（SCORE行 + --- + 本文）を分解する。形式が崩れても本文だけは拾う。 */
function parseRefine(raw: string): { score?: number; body: string } {
  const text = raw.trim();
  const scoreMatch = text.match(/SCORE\s*[:：]\s*(\d{1,3})/i);
  const score = scoreMatch ? Math.min(100, Number(scoreMatch[1])) : undefined;
  const sepIndex = text.indexOf("---");
  let body = sepIndex >= 0 ? text.slice(sepIndex + 3) : text.replace(/^SCORE\s*[:：].*$/im, "");
  return { score, body: cleanOutput(body) };
}

type ChatOk = { ok: true; content: string; provider: "openrouter" | "ollama" };
type ChatErr = { ok: false; reason: string };

async function chat(
  system: string,
  user: string,
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  temperature: number,
): Promise<ChatOk | ChatErr> {
  const apiKey = (env.OPENROUTER_API_KEY || "").trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (apiKey) {
      const baseUrl = (env.OPENROUTER_BASE_URL || DEFAULT_OPENROUTER_BASE).replace(/\/$/, "");
      const model = env.OPENQLOW_REWRITE_MODEL || DEFAULT_OPENROUTER_MODEL;
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
          temperature,
          max_tokens: 500,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return { ok: false, reason: `OpenRouter応答エラー(${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}` };
      }
      const data = (await res.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string } }> } | null;
      return { ok: true, content: data?.choices?.[0]?.message?.content ?? "", provider: "openrouter" };
    }

    const baseUrl = (env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE).replace(/\/$/, "");
    const model = env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL;
    const res = await fetchImpl(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        options: { temperature },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, reason: `Ollama応答エラー(${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}` };
    }
    const data = (await res.json().catch(() => null)) as { message?: { content?: string } } | null;
    return { ok: true, content: data?.message?.content ?? "", provider: "ollama" };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return { ok: false, reason: "AIの応答がタイムアウトしました" };
    return { ok: false, reason: `AIに接続できませんでした: ${error instanceof Error ? error.message : String(error)}` };
  } finally {
    clearTimeout(timer);
  }
}

/** その日の本文を新規生成する（推敲前のたたき台）。 */
export async function generatePostBody(opts: GenerateOptions): Promise<GenerateResult> {
  const env = opts.env ?? process.env;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const theme = pickTheme(opts.dateJst, opts.seed);
  const result = await chat(buildGenerateSystem(), buildGenerateUser(theme, weekdayJa(opts.dateJst)), env, fetchImpl, timeoutMs, 0.85);
  if (!result.ok) return result;
  const body = cleanOutput(result.content);
  if (!isValidBody(body)) return { ok: false, reason: "AIが空または長すぎる本文を返しました" };
  return { ok: true, body, provider: result.provider };
}

/** AI編集長による採点→改善を、目標点に達するか上限回数まで繰り返す。 */
export async function refinePostBody(opts: RefineOptions): Promise<RefineResult> {
  const env = opts.env ?? process.env;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRoundsEnv = Number(env.OPENQLOW_REFINE_ROUNDS);
  const maxRounds = opts.maxRounds ?? (Number.isFinite(maxRoundsEnv) && maxRoundsEnv > 0 ? maxRoundsEnv : DEFAULT_REFINE_ROUNDS);
  const targetScore = opts.targetScore ?? DEFAULT_TARGET_SCORE;

  let best = opts.body;
  let lastScore = 0;
  let rounds = 0;
  let improvedAny = false;

  for (let i = 0; i < Math.max(1, maxRounds); i += 1) {
    const result = await chat(buildRefineSystem(), buildRefineUser(best), env, fetchImpl, timeoutMs, 0.4);
    if (!result.ok) break;
    rounds += 1;
    const parsed = parseRefine(result.content);
    if (isValidBody(parsed.body)) {
      best = parsed.body;
      improvedAny = true;
    }
    if (typeof parsed.score === "number") lastScore = parsed.score;
    if (typeof parsed.score === "number" && parsed.score >= targetScore) break;
  }

  if (!improvedAny) return { ok: false, reason: "推敲できませんでした（たたき台のまま）" };
  return { ok: true, body: best, rounds, score: lastScore };
}

/** 生成→推敲をまとめて行う。失敗時は ok:false（呼び出し側が定型文へ）。 */
export async function generateRefinedPostBody(opts: GenerateOptions): Promise<GenerateResult> {
  const generated = await generatePostBody(opts);
  if (!generated.ok) return generated;
  const refined = await refinePostBody({
    body: generated.body,
    env: opts.env,
    fetchImpl: opts.fetchImpl,
    timeoutMs: opts.timeoutMs,
  });
  return refined.ok
    ? { ok: true, body: refined.body, provider: generated.provider }
    : generated; // 推敲失敗でも、生成本文は使える
}
