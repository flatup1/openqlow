export const DEFAULT_EVENT_ID = 'uizin-2026';

/**
 * 大会IDはURL・Durable Object名・保存キーに共通で使う。
 * 文字種を絞り、別大会のデータ混入や意図しないキー生成を防ぐ。
 */
export function normalizeEventId(value: unknown, fallback = DEFAULT_EVENT_ID): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{1,47}$/.test(normalized) ? normalized : fallback;
}

export function isValidEventId(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,47}$/.test(value.trim().toLowerCase());
}
