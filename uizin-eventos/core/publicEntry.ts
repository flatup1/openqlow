import type { EntryFieldMode } from './entryPackage.ts';
import { CLASS_LIMITS, DEFAULT_CLASS_SETTINGS, parseClassSettings, type ClassSettings } from './classRules.ts';

export type PublicEntryConfig = {
  endpoint: string;
  eventId: string;
  title: string;
  organizer: string;
  date: string;
  venue: string;
  venueUrl: string;
  deadline: string;
  contact: string;
  music: boolean;
  grade: EntryFieldMode;
  age: EntryFieldMode;
  comment: EntryFieldMode;
  protocol?: string;
  entryKey?: string;
  mode?: 'test' | 'live';
  /** クラス分けをするときだけ入る（しないときは項目ごと無い）。 */
  classes?: ClassSettings;
};

export const EMPTY_PUBLIC_ENTRY_CONFIG: PublicEntryConfig = {
  endpoint: '', eventId: 'my-tournament', title: '', organizer: '', date: '', venue: '', venueUrl: '', deadline: '', contact: '',
  music: false, grade: 'optional', age: 'optional', comment: 'optional',
};

const APPS_SCRIPT = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;

export function isAppsScriptUrl(value: string): boolean {
  return APPS_SCRIPT.test(value.trim());
}

export function publicEntryReady(config: PublicEntryConfig): boolean {
  const keyed = config.protocol === '2' && /^[\w-]{32,100}$/.test(config.entryKey || '');
  return isAppsScriptUrl(config.endpoint) && (keyed || config.protocol === '3') && (config.mode === 'test' || config.mode === 'live');
}

export function isVenueUrl(value: string): boolean {
  return /^https:\/\/(?:share\.google|maps\.app\.goo\.gl|www\.google\.com\/maps)(?:\/|$)/.test(value.trim());
}

export function publicEntryHash(config: PublicEntryConfig): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(config)) {
    if (key === 'classes') continue;
    params.set(key, typeof value === 'boolean' ? (value ? 'on' : 'off') : value as string);
  }
  if (config.classes?.enabled) {
    const c = config.classes, d = DEFAULT_CLASS_SETTINGS;
    params.set('cls', 'on');
    const put = (key: string, value: string, fallback: string) => { if (value !== fallback) params.set(key, value); };
    put('cuN', c.upper.name, d.upper.name); put('cuC', c.upper.condition, d.upper.condition); put('cuR', c.upper.rule, d.upper.rule);
    put('clN', c.lower.name, d.lower.name); put('clC', c.lower.condition, d.lower.condition); put('clR', c.lower.rule, d.lower.rule);
    if (c.upperMinWins !== d.upperMinWins) params.set('cw', String(c.upperMinWins));
  }
  return '#' + params.toString();
}

export function publicEntryConfig(hash: string): PublicEntryConfig {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const mode = (key: string, fallback: EntryFieldMode): EntryFieldMode => {
    const value = params.get(key);
    return value === 'off' || value === 'optional' || value === 'required' ? value : fallback;
  };
  let classes: ClassSettings | undefined;
  if (params.get('cls') === 'on') {
    const d = DEFAULT_CLASS_SETTINGS;
    const text = (key: string, fallback: string, max: number) => (params.get(key) || fallback).slice(0, max);
    const wins = params.get('cw') || '';
    classes = parseClassSettings({
      enabled: true,
      upper: { name: text('cuN', d.upper.name, CLASS_LIMITS.name), condition: text('cuC', d.upper.condition, CLASS_LIMITS.condition), rule: text('cuR', d.upper.rule, CLASS_LIMITS.rule) },
      lower: { name: text('clN', d.lower.name, CLASS_LIMITS.name), condition: text('clC', d.lower.condition, CLASS_LIMITS.condition), rule: text('clR', d.lower.rule, CLASS_LIMITS.rule) },
      upperMinWins: /^\d{1,2}$/.test(wins) && Number(wins) >= 1 ? Number(wins) : d.upperMinWins,
    });
  }
  return {
    endpoint: params.get('endpoint')?.trim() ?? '',
    eventId: params.get('eventId')?.trim() || 'my-tournament',
    title: params.get('title')?.trim() ?? '', organizer: params.get('organizer')?.trim() ?? '',
    date: params.get('date')?.trim() ?? '', venue: params.get('venue')?.trim() ?? '', venueUrl: params.get('venueUrl')?.trim() ?? '',
    deadline: params.get('deadline')?.trim() ?? '', contact: params.get('contact')?.trim() ?? '',
    music: params.get('music') === 'on', grade: mode('grade', 'optional'), age: mode('age', 'optional'), comment: mode('comment', 'optional'),
    ...(params.has('protocol') ? { protocol: params.get('protocol') || '' } : {}),
    ...(params.has('entryKey') ? { entryKey: params.get('entryKey') || '' } : {}),
    ...(params.has('mode') ? { mode: params.get('mode') === 'test' ? 'test' as const : 'live' as const } : {}),
    ...(classes ? { classes } : {}),
  };
}
