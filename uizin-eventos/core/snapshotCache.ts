import type { Snapshot } from './types.ts';

const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const strings = (v: Record<string, unknown>, keys: string[]) => keys.every(k => typeof v[k] === 'string');
function timer(v: unknown): boolean {
  return object(v) && ['idle', 'running', 'paused'].includes(String(v.mode)) && finite(v.elapsedMs) &&
    (v.startedAt === null || finite(v.startedAt)) && (v.durationMs === null || finite(v.durationMs));
}
function fighter(v: unknown): boolean {
  return object(v) && strings(v, ['name', 'team', 'record', 'comment', 'photo']) &&
    ['kana', 'age', 'height', 'weight', 'category', 'stance', 'musicUrl'].every(k => v[k] === undefined || typeof v[k] === 'string');
}
/** A damaged cache is ignored, never allowed to crash the screens or authorize writes. */
export function readSnapshotCache(raw: string | null): Snapshot | null {
  try {
    const v: unknown = JSON.parse(raw ?? 'null');
    if (!object(v) || !finite(v.serverNow) || !object(v.state) || !object(v.program)) return null;
    const s = v.state, p = v.program;
    if (!['version', 'updatedAt', 'matchIndex', 'cueIndex', 'round'].every(k => Number.isInteger(s[k])) ||
      typeof s.programRevision !== 'string' || s.programRevision !== p.revision ||
      !['before', 'walkout', 'fight', 'interval', 'result', 'finished'].includes(String(s.phase)) ||
      !['eventTimer', 'roundTimer', 'cueTimer'].every(k => timer(s[k])) || !object(s.hold) ||
      typeof s.hold.active !== 'boolean' || typeof s.hold.message !== 'string') return null;
    if (!object(p.meta) || !strings(p.meta, ['title', 'venue', 'date', 'startAt', 'holdMessage']) ||
      !finite(p.fetchedAt) || !Array.isArray(p.matches) || !Array.isArray(p.cues) ||
      !Array.isArray(p.warnings) || !p.warnings.every(w => typeof w === 'string')) return null;
    if (!p.matches.every(m => object(m) && ['no', 'rounds', 'roundSeconds', 'breakSeconds'].every(k => finite(m[k])) &&
      strings(m, ['className', 'rule', 'note']) && fighter(m.red) && fighter(m.blue))) return null;
    if (!p.cues.every(c => object(c) && finite(c.no) && finite(c.seconds) && (c.matchNo === null || finite(c.matchNo)) &&
      strings(c, ['kind', 'title', 'artist', 'appleMusicUrl', 'youtubeUrl', 'otherUrl', 'note']))) return null;
    // Reachability checks are time-sensitive. Recompute on the next connection.
    return { ...v, state: { ...s, lastCommand: null }, musicReport: null } as Snapshot;
  } catch { return null; }
}

export function snapshotCacheKey(apiBase: string): string {
  return 'uizin.eventos.snapshot.v1:' + apiBase;
}
