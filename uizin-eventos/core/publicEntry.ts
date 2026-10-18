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

/** リンクのいちばん最後に付ける目印。リンクが途中で切れたら、これが無くなるので、切れたことが分かる。 */
export const LINK_END_KEY = 'end';

const CLASS_KEYS = ['cls', 'cuN', 'cuC', 'cuR', 'clN', 'clC', 'clR', 'cw'] as const;

/**
 * 申し込みページのリンク（# のあと）を作る。並べる順番に意味がある：
 * ふつうの項目 → クラスの項目 → protocol → mode → end=1。
 * 切れたリンクは、後ろから先に無くなる。だから「mode」か「end」が欠ければ、切れたと分かる。
 */
export function publicEntryHash(config: PublicEntryConfig): string {
  const params = new URLSearchParams();
  const put = (key: string, value: unknown) => params.set(key, typeof value === 'boolean' ? (value ? 'on' : 'off') : String(value));
  for (const [key, value] of Object.entries(config)) {
    if (key === 'classes' || key === 'protocol' || key === 'mode') continue;
    put(key, value);
  }
  if (config.classes?.enabled) {
    const c = config.classes, d = DEFAULT_CLASS_SETTINGS;
    params.set('cls', 'on');
    const putText = (key: string, value: string, fallback: string) => { if (value !== fallback) params.set(key, value); };
    putText('cuN', c.upper.name, d.upper.name); putText('cuC', c.upper.condition, d.upper.condition); putText('cuR', c.upper.rule, d.upper.rule);
    putText('clN', c.lower.name, d.lower.name); putText('clC', c.lower.condition, d.lower.condition); putText('clR', c.lower.rule, d.lower.rule);
    if (c.upperMinWins !== d.upperMinWins) params.set('cw', String(c.upperMinWins));
  }
  if (config.protocol !== undefined) put('protocol', config.protocol);
  if (config.mode !== undefined) put('mode', config.mode);
  params.set(LINK_END_KEY, '1');
  return '#' + params.toString();
}

/**
 * リンクが途中で切れている（LINEやメールで、後ろが欠けた）かどうか。切れていたら、送らせない。
 * - 昔のリンク（目印 end も クラスも無い）は、そのまま使える。
 * - クラスの項目があるリンクは、最後の end=1 が無ければ、切れている。
 * - cls=on なのに、クラスの文が読めないときも、切れている（同じ名前など）。
 */
export function publicEntryLinkCut(hash: string): boolean {
  try {
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    if (hash === '' || hash === '#') return false;
    const music = params.get('music'), comment = params.get('comment');
    if (!params.has('eventId') || !params.has('title') || !params.has('contact') || (music !== 'on' && music !== 'off') || (comment !== 'off' && comment !== 'optional' && comment !== 'required')) return true;
    if (params.has('mode') && !['test', 'live'].includes(params.get('mode') || '')) return true;
    const hasClassKey = CLASS_KEYS.some((key) => params.has(key));
    if (params.has(LINK_END_KEY) && params.get(LINK_END_KEY) !== '1') return true;
    if (hasClassKey) {
      if (params.get(LINK_END_KEY) !== '1') return true;
      const cls = params.get('cls');
      if (cls !== 'on' && cls !== 'off') return true;
      if (cls === 'on' && !publicEntryConfig(hash).classes) return true;
    }
    return false;
  } catch {
    return true;
  }
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
    // mode は「test」か「live」だけ。途中で切れた「te」などを live と読むと、練習の申し込みが本番に入ってしまう
    ...(params.get('mode') === 'test' || params.get('mode') === 'live' ? { mode: params.get('mode') as 'test' | 'live' } : {}),
    ...(classes ? { classes } : {}),
  };
}
