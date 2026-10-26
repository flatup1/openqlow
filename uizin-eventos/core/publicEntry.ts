import type { EntryFieldMode } from './entryPackage.ts';
import { CLASS_LIMITS, DEFAULT_CLASS_SETTINGS, parseClassSettings, type ClassSettings } from './classRules.ts';
import { DEFAULT_WEIGHT_SETTINGS, isDefaultWeightSettings, weightSettingsToParam, weightsFromParam, type WeightSettings } from './weightClass.ts';
import { PLEDGE_LINK_KEYS, packPledge, packText, pledgeCanon, pledgeHashMatches, unpackPledge, unpackText, type GuardianMode, type PledgeConfig } from './pledge.ts';
import { hanamichiRuleOk } from './hanamichi.ts';

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
  /**
   * 花道の選手に見せる「花道のルール」の1行。クラス分けをして、花道の区分があるときだけ入る（しないときは項目ごと無い）。リンクでは hr。
   * これがあると、花道の区分を選んだ人には、クラス（A/B）の欄を出さず、この1行を灰色で見せる。文は持たない（文は設定タブの「花道のルール」から来る）。
   * protocol が 3 で、クラス分け（cls=on）があるリンクのときだけ読む。
   */
  hanamichiRule?: string;
  /** 階級分け（区分→階級）をするときだけ入る。 */
  weights?: WeightSettings;
  /** ロゴを出すときだけ true（出さないときは項目ごと無い）。 */
  logo?: boolean;
  /** 花道の追加の質問をするときだけ true（しないときは項目ごと無い）。リンクでは hn=on。protocol が 3 のときだけ読む。 */
  hanamichi?: boolean;
  /** くわしい戦績（キックの勝ち負け・他の格闘技・タイトル/入賞歴）の欄を出すときだけ true。リンクでは rd=on。protocol が 3 のときだけ読む。古い版の受付のリンクには付けない。 */
  recordDetail?: boolean;
  /** 誓約書（最後の□の✔）をするときだけ入る（しないときは項目ごと無い）。リンクでは pl=on と plg・plm・plc・plt。protocol が 3 のときだけ読む。文は持たない（文はリンクの plt から来る） */
  pledge?: PledgeConfig;
  /** 誓約書の文の指紋（16進の小文字64字）。リンクでは plf。ページは作らず、POST の pledgeHash にそのまま入れて返す（ページが計算するのは、文が書きかえられていないかを確かめるときだけ：pledgeLinkGenuine）。pledge があるときだけ意味がある */
  pledgeHash?: string;
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
/** 花道のルール（花道の選手にクラスを選ばせない代わりに見せる1行）。hr＝'u'+base64url(UTF-16BE(文))。クラスの項目のあとに付ける。値の名前（hanamichiRule）は、リンクに出さない */
const HANAMICHI_RULE_KEY = 'hr';
/** 階級分けの項目。wc＝あり／wd＝表（初期の表と同じときは付けない）。logo は、ふつうの項目と同じ扱い */
const WEIGHT_KEYS = ['wc', 'wd'] as const;
/** 花道の追加の質問。hn＝on だけ（なしのときは付けない）。値の名前（hanamichi）は、リンクに出さない */
const HANAMICHI_KEY = 'hn';
/** くわしい戦績。rd＝on だけ（なしのときは付けない）。値の名前（recordDetail）は、リンクに出さない */
const RECORD_DETAIL_KEY = 'rd';
/** 誓約書の鍵（pl, plg, plm, plc, plf, plt の順）は PLEDGE_LINK_KEYS。値の名前（pledge・pledgeHash）は、リンクに出さない */
const GUARDIAN_MODES: readonly string[] = ['under18', 'all', 'none'];
const PLEDGE_HASH = /^[0-9a-f]{64}$/;

/**
 * 申し込みページのリンク（# のあと）を作る。並べる順番に意味がある：
 * ふつうの項目 → クラスの項目（cls…cw）→ 花道のルール（hr） → 階級の項目 → ロゴ → 花道（hn=on） → 誓約書（pl・plg・plm・plc・plf・plt） → protocol → mode → end=1。
 * 切れたリンクは、後ろから先に無くなる。だから「mode」か「end」が欠ければ、切れたと分かる。
 */
export function publicEntryHash(config: PublicEntryConfig): string {
  const params = new URLSearchParams();
  const put = (key: string, value: unknown) => params.set(key, typeof value === 'boolean' ? (value ? 'on' : 'off') : String(value));
  for (const [key, value] of Object.entries(config)) {
    if (key === 'classes' || key === 'hanamichiRule' || key === 'weights' || key === 'logo' || key === 'hanamichi' || key === 'recordDetail' || key === 'pledge' || key === 'pledgeHash' || key === 'protocol' || key === 'mode') continue;
    put(key, value);
  }
  if (config.classes?.enabled) {
    const c = config.classes, d = DEFAULT_CLASS_SETTINGS;
    params.set('cls', 'on');
    const putText = (key: string, value: string, fallback: string) => { if (value !== fallback) params.set(key, value); };
    putText('cuN', c.upper.name, d.upper.name); putText('cuC', c.upper.condition, d.upper.condition); putText('cuR', c.upper.rule, d.upper.rule);
    putText('clN', c.lower.name, d.lower.name); putText('clC', c.lower.condition, d.lower.condition); putText('clR', c.lower.rule, d.lower.rule);
    if (c.upperMinWins !== d.upperMinWins) params.set('cw', String(c.upperMinWins));
    // 花道のルール：クラス分けがあるときだけ（クラスが無ければ、見せる所もない）
    if (config.hanamichiRule) params.set(HANAMICHI_RULE_KEY, packText(config.hanamichiRule));
  }
  if (config.weights?.enabled) {
    params.set('wc', 'on');
    if (!isDefaultWeightSettings(config.weights)) params.set('wd', weightSettingsToParam(config.weights));
  }
  if (config.logo) params.set('logo', 'on');
  // くわしい戦績（rd）は、花道（hn）のまえに書く（鍵の並びは、ここで決まる。試験が、並びを見ている）
  if (config.recordDetail) params.set(RECORD_DETAIL_KEY, 'on');
  if (config.hanamichi) params.set(HANAMICHI_KEY, 'on');
  if (config.pledge) {
    const p = config.pledge;
    params.set('pl', 'on');
    params.set('plg', p.mode);
    params.set('plm', p.gymMode ? 'on' : 'off');
    params.set('plc', p.confirmed ? 'on' : 'off');
    if (config.pledgeHash) params.set('plf', config.pledgeHash);
    params.set('plt', packPledge(p.items, p.guardian, p.gym));
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
 * - 階級の項目（wc・wd）があるリンクも、同じ。wc=on なのに、表が読めないときも、切れている。
 * - 花道の項目（hn）があるリンクも、同じ。hn は「on」だけが正しい。ほかの値（off・o・空）は、切れている。
 *   hn の無い昔のリンクは、切れではない。
 * - 花道のルール（hr）があるリンクも、同じ。hr は、クラス分け（cls=on）といっしょにあり、文が読めること（1〜120字）。読めなければ、切れている。
 *   hr の無い昔のリンクは、切れではない（花道の区分でも、今までどおりクラスを選ぶ）。
 * - 誓約書の項目（pl・plg・plm・plc・plf・plt のどれか）があるリンクも、同じ。pl は「on」だけが正しく、
 *   plg は under18|all|none、plm と plc は on|off、plf は16進64字、plt は文が読めること。1つでも欠けたり読めなければ、切れている。
 *   誓約書の無い昔のリンクは、切れではない。
 */
export function publicEntryLinkCut(hash: string): boolean {
  try {
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    if (hash === '' || hash === '#') return false;
    const music = params.get('music'), comment = params.get('comment');
    if (!params.has('eventId') || !params.has('title') || !params.has('contact') || (music !== 'on' && music !== 'off') || (comment !== 'off' && comment !== 'optional' && comment !== 'required')) return true;
    if (params.has('mode') && !['test', 'live'].includes(params.get('mode') || '')) return true;
    const hasClassKey = CLASS_KEYS.some((key) => params.has(key)) || params.has(HANAMICHI_RULE_KEY) || WEIGHT_KEYS.some((key) => params.has(key)) || params.has('logo') || params.has(HANAMICHI_KEY) || PLEDGE_LINK_KEYS.some((key) => params.has(key));
    if (params.has(LINK_END_KEY) && params.get(LINK_END_KEY) !== '1') return true;
    if (hasClassKey) {
      if (params.get(LINK_END_KEY) !== '1') return true;
      if (params.has('wd') && params.get('wc') !== 'on') return true;
      if (params.has(HANAMICHI_KEY) && params.get(HANAMICHI_KEY) !== 'on') return true;
      if (params.has(HANAMICHI_RULE_KEY) && (params.get('cls') !== 'on' || readRule(params) === undefined)) return true;
      if (PLEDGE_LINK_KEYS.some((key) => params.has(key)) && !readPledge(params)) return true;
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

/**
 * リンクの誓約書の文（plt）が、文の指紋（plf）と合っているか。合わないときは、文がリンクの中で書きかえられている
 * （Googleの受付は、送られた指紋と「誓約書」タブの指紋しか比べないので、画面に出た文が本物かは、ここでしか分からない）。
 * 指紋の作り方は、受付と同じ：pledgeCanon の文字を UTF-8 にした SHA-256。計算は crypto.subtle（ブラウザにも Node にもある）。投げない。
 * 誓約書の無いリンクは true。crypto.subtle が無い・計算に失敗したときは、確かめられないので true（今までどおり。受付の指紋の検査は、そのまま残る）。
 */
export async function pledgeLinkGenuine(config: Pick<PublicEntryConfig, 'pledge' | 'pledgeHash'>, subtle: SubtleCrypto | null | undefined = globalThis.crypto?.subtle): Promise<boolean> {
  if (!config.pledge) return true;
  try {
    if (!subtle) return true;
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(pledgeCanon(config.pledge)));
    return pledgeHashMatches(new Uint8Array(digest), config.pledgeHash ?? '');
  } catch {
    return true;
  }
}

/** リンクの hr（花道のルールの1行）を読む。きちんとした形（packText が作る形で、1〜120字）のときだけ。読めない・無いときは undefined（切れ検出が止める） */
function readRule(params: URLSearchParams): string | undefined {
  const packed = params.get(HANAMICHI_RULE_KEY);
  if (packed === null) return undefined;
  const text = unpackText(packed);
  return text !== undefined && hanamichiRuleOk(text) && packText(text) === packed ? text : undefined;
}

/** リンクの誓約書の鍵を読む。6つの鍵が全部あって、どれも正しい形のときだけ。ひとつでも欠ける・読めないときは undefined（切れ検出が止める） */
function readPledge(params: URLSearchParams): { pledge: PledgeConfig; pledgeHash: string } | undefined {
  if (params.get('pl') !== 'on') return undefined;
  const mode = params.get('plg') ?? '', gymMode = params.get('plm'), confirmed = params.get('plc'), hash = params.get('plf') ?? '';
  if (!GUARDIAN_MODES.includes(mode) || (gymMode !== 'on' && gymMode !== 'off') || (confirmed !== 'on' && confirmed !== 'off') || !PLEDGE_HASH.test(hash)) return undefined;
  const texts = unpackPledge(params.get('plt') ?? '');
  if (!texts) return undefined;
  return { pledge: { items: texts.items, guardian: texts.guardian, gym: texts.gym, mode: mode as GuardianMode, gymMode: gymMode === 'on', confirmed: confirmed === 'on' }, pledgeHash: hash };
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
  // 花道のルールも、protocol が 3 の受付だけが知っている。クラス分けが読めたときだけ使う（クラスが無ければ、見せる所もない）
  const rule = params.get('protocol') === '3' && classes ? readRule(params) : undefined;
  // 誓約書は、花道と同じく、protocol が 3 の受付だけが知っている。古い受付（protocol 2）には、誓約書の鍵を送らないよう、読まない
  const pledge = params.get('protocol') === '3' ? readPledge(params) : undefined;
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
    ...(rule ? { hanamichiRule: rule } : {}),
    ...(weights ? { weights } : {}),
    ...(params.get('logo') === 'on' ? { logo: true } : {}),
    // 花道は、protocol が 3 の受付だけが知っている。古い受付（protocol 2）には、花道の鍵を送らないよう、読まない
    ...(params.get(HANAMICHI_KEY) === 'on' && params.get('protocol') === '3' ? { hanamichi: true } : {}),
    // くわしい戦績も、protocol が 3 の受付だけが知っている。古い受付（protocol 2・rd なし）は、今までの「戦績」の一行のまま
    ...(params.get(RECORD_DETAIL_KEY) === 'on' && params.get('protocol') === '3' ? { recordDetail: true } : {}),
    ...(pledge ? pledge : {}),
  };
}
