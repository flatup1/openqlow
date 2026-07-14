import 'dotenv/config';

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: num('PORT', 8787),
  apiKey: process.env.GEMINI_API_KEY ?? '',
  videoModel: process.env.VIDEO_MODEL ?? 'veo-3.1-lite-generate-preview',
  demoMode: (process.env.VIDEO_GENERATION_DEMO_MODE ?? 'true').toLowerCase() === 'true',
  rateLimitMax: num('RATE_LIMIT_MAX', 20),
  maxUploadBytes: num('MAX_UPLOAD_BYTES', 10 * 1024 * 1024),
  artifactTtlMinutes: num('ARTIFACT_TTL_MINUTES', 60),
  isProd: process.env.NODE_ENV === 'production',
} as const;

/** 実APIを使える状態か(デモモードでなく、キーがある)。 */
export function canUseRealApi(): boolean {
  return !config.demoMode && config.apiKey.length > 0;
}
