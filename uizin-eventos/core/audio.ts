/** URL classification only. No network, automatic playback or external-service control. */
export function safeMusicUrl(raw: string): string {
  try {
    const url = new URL(raw.trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
    return url.href;
  } catch { return ''; }
}

export type AudioSource = { kind: 'audio' | 'external' | 'invalid' | 'empty'; url: string; label: string };
export function audioSource(raw: string): AudioSource {
  if (!raw.trim()) return { kind: 'empty', url: '', label: '音源 未登録' };
  const url = safeMusicUrl(raw);
  if (!url) return { kind: 'invalid', url: '', label: 'リンクを確認してください' };
  const parsed = new URL(url);
  if (/\.(mp3|m4a|aac|wav|ogg|opus)$/i.test(parsed.pathname)) return { kind: 'audio', url, label: '▶ OS内で再生' };
  const host = parsed.hostname.toLowerCase();
  const label = ['music.apple.com', 'embed.music.apple.com'].includes(host) ? 'Apple Musicで開く'
    : ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(host) ? 'YouTubeで開く' : '曲を開く';
  return { kind: 'external', url, label };
}

export type Volumes = { master: number; red: number; blue: number; pads: number };
export const DEFAULT_VOLUMES: Volumes = { master: 0.7, red: 1, blue: 1, pads: 0.7 };
export function readVolumes(value: unknown): Volumes {
  const result = { ...DEFAULT_VOLUMES };
  if (value && typeof value === 'object') {
    for (const key of Object.keys(result) as (keyof Volumes)[]) {
      const n = (value as Record<string, unknown>)[key];
      if (typeof n === 'number' && Number.isFinite(n)) result[key] = Math.min(1, Math.max(0, n));
    }
  }
  return result;
}

export type Pad = { id: string; label: string; url: string; group: 'winner' | 'sampler' };
export function defaultPads(): Pad[] {
  return [
    ...Array.from({ length: 5 }, (_, i) => ({ id: 'winner-' + i, label: 'Winner ' + (i + 1), url: '', group: 'winner' as const })),
    ...['拍手', '歓声', '盛り上げ', '表彰', 'Thank You', 'NEXT'].map((label, i) => ({ id: 'sampler-' + i, label, url: '', group: 'sampler' as const })),
  ];
}
export function readPads(value: unknown): Pad[] {
  const defaults = defaultPads();
  if (!Array.isArray(value)) return defaults;
  return defaults.map(pad => {
    const saved = value.find(p => p && p.id === pad.id);
    return saved ? { ...pad, label: typeof saved.label === 'string' ? saved.label.slice(0, 80) || pad.label : pad.label,
      url: typeof saved.url === 'string' ? saved.url.slice(0, 2048) : '' } : pad;
  });
}
