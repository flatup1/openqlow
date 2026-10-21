import type { EntryFieldMode } from './entryPackage.ts';
import { CLASS_LIMITS, DEFAULT_CLASS_SETTINGS, parseClassSettings, type ClassSettings } from './classRules.ts';
import { DEFAULT_WEIGHT_SETTINGS, isDefaultWeightSettings, weightSettingsToParam, weightsFromParam, type WeightSettings } from './weightClass.ts';

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
  /** 階級分け（区分→階級）をするときだけ入る。 */
  weights?: WeightSettings;
  /** ロゴを出すときだけ true（出さないときは項目ごと無い）。 */
  logo?: boolean;
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
/** 階級分けの項目。wc＝あり／wd＝表（初期の表と同じときは付けない）。logo は、ふつうの項目と同じ扱い */
const WEIGHT_KEYS = ['wc', 'wd'] as const;

/**
 * 申し込みページのリンク（# のあと）を作る。並べる順番に意味がある：
 * ふつうの項目 → クラスの項目 → 階級の項目 → protocol → mode → end=1。
 * 切れたリンクは、後ろから先に無くなる。だから「mode」か「end」が欠ければ、切れたと分かる。
 */
export function publicEntryHash(config: PublicEntryConfig): string {
  const params = new URLSearchParams();
  const put = (key: string, value: unknown) => params.set(key, typeof value === 'boolean' ? (value ? 'on' : 'off') : String(value));
  for (const [key, value] of Object.entries(config)) {
    if (key === 'classes' || key === 'weights' || key === 'logo' || key === 'protocol' || key === 'mode') continue;
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
  if (config.weights?.enabled) {
    params.set('wc', 'on');
    if (!isDefaultWeightSettings(config.weights)) params.set('wd', weightSettingsToParam(config.weights));
  }
  if (config.logo) params.set('logo', 'on');
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
 * - 階級の項目（wc・wd）があるリンクも、同じ。wc=on なのに、表が読めないときも、切れている。
 */
export function publicEntryLinkCut(hash: string): boolean {
  try {
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    if (hash === '' || hash === '#') return false;
    const music = params.get('music'), comment = params.get('comment');
    if (!params.has('eventId') || !params.has('title') || !params.has('contact') || (music !== 'on' && music !== 'off') || (comment !== 'off' && comment !== 'optional' && comment !== 'required')) return true;
    if (params.has('mode') && !['test', 'live'].includes(params.get('mode') || '')) return true;
    const hasClassKey = CLASS_KEYS.some((key) => params.has(key)) || WEIGHT_KEYS.some((key) => params.has(key)) || params.has('logo');
    if (params.has(LINK_END_KEY) && params.get(LINK_END_KEY) !== '1') return true;
    if (hasClassKey) {
      if (params.get(LINK_END_KEY) !== '1') return true;
      if (params.has('wd') && params.get('wc') !== 'on') return true;
      // クラスの項目と階級の項目のどちらか一方だけがあるリンクも、ここまで来る。cls は、クラスの項目があるときだけ見る
      if (CLASS_KEYS.some((key) => params.has(key))) {
        const cls = params.get('cls');
        if (cls !== 'on' && cls !== 'off') return true;
        if (cls === 'on' && !publicEntryConfig(hash).classes) return true;
      }
      if (params.has('wc')) {
        const wc = params.get('wc');
        if (wc !== 'on' && wc !== 'off') return true;
        if (wc === 'on' && !publicEntryConfig(hash).weights) return true;
      }
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
  let weights: WeightSettings | undefined;
  if (params.get('wc') === 'on') weights = params.has('wd') ? weightsFromParam(params.get('wd')) : DEFAULT_WEIGHT_SETTINGS;
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
    ...(weights ? { weights } : {}),
    ...(params.get('logo') === 'on' ? { logo: true } : {}),
  };
}
