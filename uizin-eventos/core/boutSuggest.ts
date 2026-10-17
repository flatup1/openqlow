import { gymKey, type LocalBout, type LocalFighter, type LocalTournament } from './privateTournament.ts';
import { classNameKey } from './classRules.ts';

/*
 * Pure helpers for building bout cards. No I/O, no Date, no random.
 * Same weight rule as contractWeight / boutWarnings in privateTournament.ts.
 */

/** Readable weight in kg (10..250), or null. "65kg" and "65 kg" are accepted. */
export function parseKg(value: string | undefined): number | null {
  const n = Number(String(value ?? '').trim().replace(/kg$/i, '').trim());
  return Number.isFinite(n) && n >= 10 && n <= 250 ? n : null;
}

/** Absolute weight gap rounded to 0.1kg. null when either weight is unreadable. */
export function weightGap(red?: LocalFighter, blue?: LocalFighter): number | null {
  const a = parseKg(red?.weight), b = parseKg(blue?.weight);
  if (a === null || b === null) return null;
  return Math.round(Math.abs(a - b) * 10) / 10;
}

export function isBlankBout(b: LocalBout): boolean {
  return !b.redId && !b.blueId;
}

/** Fighters that are in no bout, in roster order. */
export function unplacedFighters(fighters: LocalFighter[], bouts: LocalBout[]): LocalFighter[] {
  const placed = new Set<string>();
  for (const b of bouts) {
    if (b.redId) placed.add(b.redId);
    if (b.blueId) placed.add(b.blueId);
  }
  return fighters.filter((f) => !placed.has(f.id));
}

type Candidate = { fighter: LocalFighter; weight: number | null; index: number };

/** Two fighters count as "same gym" only when both gyms are non-empty and equal after gymKey (width, case, spaces and invisible characters do not matter). */
function sameGym(a: LocalFighter, b: LocalFighter): boolean {
  const g = gymKey(a.gym);
  return g !== '' && g === gymKey(b.gym);
}

/** How far (kg) a same-class partner may be before the class stops mattering. Same as the weight-gap caution. */
export const CLASS_PREFER_GAP_KG = 5;

const classOf = (c: Candidate): string => classNameKey(c.fighter.fighterClass ?? '');

/**
 * Pair neighbours in an already sorted list. Same gym: use the next different-gym fighter instead.
 * Class (A/B) is a PREFERENCE, never a split: when the nearest partner is of the other class, a same-class partner
 * within CLASS_PREFER_GAP_KG is taken instead. Fighters without a class never change the pairing.
 */
function pairNeighbours(list: Candidate[]): [Candidate, Candidate][] {
  const rest = list.slice();
  const pairs: [Candidate, Candidate][] = [];
  while (rest.length >= 2) {
    const a = rest.shift()!;
    let at = 0; // neighbour
    if (sameGym(a.fighter, rest[0].fighter)) {
      const alt = rest.findIndex((c) => !sameGym(a.fighter, c.fighter));
      if (alt > 0) at = alt;
    }
    const mine = classOf(a), theirs = classOf(rest[at]);
    if (mine && theirs && mine !== theirs && a.weight !== null) {
      const near = rest.findIndex((c) => classOf(c) === mine && !sameGym(a.fighter, c.fighter) && c.weight !== null && c.weight - (a.weight as number) <= CLASS_PREFER_GAP_KG);
      if (near > 0) at = near;
    }
    const b = rest.splice(at, 1)[0];
    pairs.push([a, b]);
  }
  return pairs; // a lone leftover stays unpaired
}

/**
 * Suggest NEW bouts for fighters not yet placed. Returns only the new bouts.
 * - fighters already in any existing bout are ignored; inputs are never mutated
 * - sorted by weight (stable); fighters without a usable weight go last and are paired among themselves
 * - neighbours are paired; same gym is avoided when a different-gym partner exists
 * - when both classes are present, a same-class partner within 5kg is preferred (no class-based splitting)
 * - an odd fighter stays unpaired (never a bout with an empty side)
 * - red = earlier in roster order, blue = the other one
 * - className / rule are blank (the page copies them from the previous bout)
 */
export function suggestBouts(fighters: LocalFighter[], bouts: LocalTournament['bouts'], newId: () => string): LocalTournament['bouts'] {
  const pool: Candidate[] = unplacedFighters(fighters, bouts).map((fighter) => ({
    fighter, weight: parseKg(fighter.weight), index: fighters.indexOf(fighter),
  }));
  const byWeight = (a: Candidate, b: Candidate) => (a.weight as number) - (b.weight as number) || a.index - b.index;
  const weighed = pool.filter((c) => c.weight !== null).sort(byWeight);
  const unknown = pool.filter((c) => c.weight === null).sort((a, b) => a.index - b.index);
  const pairs = [...pairNeighbours(weighed), ...pairNeighbours(unknown)];
  return pairs.map(([a, b]) => {
    const [red, blue] = a.index <= b.index ? [a, b] : [b, a];
    return { id: newId(), redId: red.fighter.id, blueId: blue.fighter.id, className: '', rule: '' };
  });
}

export type BoutProblem = { side: 'red' | 'blue' | 'both' | 'same' | 'unknown'; text: string };

/** Per-bout problems. Empty exactly when validateTournament finds no problem for this bout. */
export function boutProblems(bout: LocalBout, index: number, fighters: LocalFighter[]): BoutProblem[] {
  const n = '第' + (index + 1) + '試合';
  const out: BoutProblem[] = [];
  if (!bout.redId && !bout.blueId) out.push({ side: 'both', text: n + 'の赤コーナーと青コーナーの選手を選んでください。' });
  else if (!bout.redId) out.push({ side: 'red', text: n + 'の赤コーナーの選手を選んでください。' });
  else if (!bout.blueId) out.push({ side: 'blue', text: n + 'の青コーナーの選手を選んでください。' });
  if (bout.redId && bout.redId === bout.blueId) out.push({ side: 'same', text: n + 'で同じ選手が選ばれています。' });
  if ([bout.redId, bout.blueId].some((id) => id && !fighters.some((f) => f.id === id))) out.push({ side: 'unknown', text: n + 'に名簿にいない選手がいます。選び直してください。' });
  return out;
}

/** Remove blank bouts and keep currentBout valid for isLocalTournament. Half-filled bouts stay. */
export function dropBlankBouts(t: LocalTournament): LocalTournament {
  const bouts = t.bouts.filter((b) => !isBlankBout(b));
  // いまの試合より前にあった空の試合が消えると、番号が前に詰まる。同じ試合を指し続けるよう、消えた数だけ引く
  const before = t.bouts.slice(0, Math.max(0, t.currentBout)).filter(isBlankBout).length;
  const currentBout = Math.min(Math.max(0, t.currentBout - before), Math.max(0, bouts.length - 1));
  return { ...t, bouts, currentBout };
}

export type NextActionKey = 'title' | 'date' | 'fighters' | 'fighters2' | 'bouts' | 'half' | 'save' | 'open' | 'done';

export type NextActionState = {
  titleReady: boolean;   // a real title (not empty / not 大会名未設定)
  dateReady: boolean;    // date is complete
  fighterCount: number;
  bouts: LocalBout[];
  dirty: boolean;
  problems: number;      // validateTournament problems + half-filled bouts
  opened?: boolean;      // the match-day screen was already opened after this save
};

/** What the chairman should do next. The page maps keys to Japanese copy. */
export function nextAction(s: NextActionState): NextActionKey {
  if (!s.titleReady) return 'title';
  if (!s.dateReady) return 'date';
  if (s.fighterCount === 0) return 'fighters';
  if (s.fighterCount < 2) return 'fighters2';
  const real = s.bouts.filter((b) => !isBlankBout(b));
  if (real.length === 0) return 'bouts';
  if (real.some((b) => !b.redId || !b.blueId)) return 'half';
  if (s.dirty) return 'save';
  if (s.problems > 0) return 'save';
  return s.opened ? 'done' : 'open';
}
