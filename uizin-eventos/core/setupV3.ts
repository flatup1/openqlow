import { isAppsScriptUrl, publicEntryHash, type PublicEntryConfig } from './publicEntry.ts';
import { parseClassSettings, type ClassSettings } from './classRules.ts';
import { formatDateInput } from './dateInput.ts';
import type { EntryFieldMode } from './entryPackage.ts';

/** Google側（Tournament_OS_Google受付_v3.gs）の RECEPTION_BUILD と同じ値。テストで一致を確認する。 */
export const EXPECTED_RECEPTION_BUILD = '3.20261010.5';
/** クラス分けが入る前の版（3.20261004.4）も、そのまま使える。 */
export const ACCEPTED_RECEPTION_BUILDS = ['3.20261004.4', EXPECTED_RECEPTION_BUILD] as const;

export type Ping = {
  app: 'tournament-os'; protocol: 3; build: string; ready: boolean; accepting?: boolean;
  eventId?: string; testComplete?: boolean; settingsProblem?: string; storageProblem?: string;
  title?: string; date?: string; venue?: string; venueUrl?: string; organizer?: string; contact?: string; deadline?: string;
  music?: boolean; grade?: EntryFieldMode; age?: EntryFieldMode; comment?: EntryFieldMode; error?: string;
  classMode?: boolean; classes?: ClassSettings;
  /** 「設定」タブに、クラスの行が無い（古い版のコピー）ときだけ false が来る。ふつうは来ない */
  classRows?: boolean;
  /** 見出しが変わったときだけ来る：直すタブの名前・マス・あるべき見出し（申込の中身・メールは来ない） */
  errorTab?: string; errorCell?: string; errorExpected?: string;
};

export function pingUrl(endpoint: string): string {
  const value = endpoint.trim();
  if (!isAppsScriptUrl(value)) throw new Error('「https://script.google.com/macros/s/…/exec」で終わるURLを貼ってください。');
  return value + '?action=ping';
}

/** 受け取るのは公開してよい項目だけ。知らない項目は捨てる。 */
export function parsePing(value: unknown): Ping {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== 'object' || v.app !== 'tournament-os' || v.protocol !== 3 || typeof v.build !== 'string' || typeof v.ready !== 'boolean') throw new Error('これはTournament OSの受付ではありません。貼ったURLを確認してください。');
  const text = (key: string, max = 300) => (typeof v[key] === 'string' && (v[key] as string).length <= max ? (v[key] as string) : undefined);
  const flag = (key: string) => (typeof v[key] === 'boolean' ? (v[key] as boolean) : undefined);
  const mode = (key: string): EntryFieldMode | undefined => (v[key] === 'off' || v[key] === 'optional' || v[key] === 'required' ? (v[key] as EntryFieldMode) : undefined);
  return {
    app: 'tournament-os', protocol: 3, build: v.build.slice(0, 40), ready: v.ready, accepting: flag('accepting'), eventId: text('eventId', 64), testComplete: flag('testComplete'), settingsProblem: text('settingsProblem', 600), storageProblem: text('storageProblem', 600),
    title: text('title'), date: text('date', 20), venue: text('venue'), venueUrl: text('venueUrl', 500), organizer: text('organizer'), contact: text('contact'), deadline: text('deadline', 20),
    music: flag('music'), grade: mode('grade'), age: mode('age'), comment: mode('comment'), error: text('error', 40),
    classMode: flag('classMode'), classes: v.classMode === true ? parseClassSettings(v.classes) : undefined,
    classRows: v.classRows === false ? false : undefined,
    errorTab: text('errorTab', 60), errorCell: text('errorCell', 6), errorExpected: text('errorExpected', 60),
  };
}

/** 自動確認が使えないとき、確認ページに出た文字を貼ってもらう。出る項目は公開してよいものだけ。 */
export function parsePingText(text: string): Ping {
  let value: unknown;
  try { value = JSON.parse(text.trim()); } catch { throw new Error('貼った文字を読めません。確かめるページに出た文字を、すべてコピーして貼ってください。'); }
  return parsePing(value);
}

export type Stage = 'old-build' | 'not-setup' | 'wrong-owner' | 'sharing' | 'headers' | 'missing-tab' | 'bad-settings' | 'storage-full' | 'need-selftest' | 'need-open' | 'ready';
export type Diagnosis = { stage: Stage; ok: boolean; message: string };

/** 申込表の1行目（見出し）が変わっているとき、直すタブ・マス・あるべき文字を言う。 */
function headersMessage(ping: Ping): string {
  if (!ping.errorTab || !ping.errorCell || !ping.errorExpected) return '申込表の1行目（見出し）が変わっています。ジムの担当者に、この画面を見せてください。';
  return '「' + ping.errorTab + '」タブの' + ping.errorCell + 'を、「' + ping.errorExpected + '」に直してください。（1行目に列を足したときは、その列を消します。行や列を足したり、並べかえたりしないでください）';
}

/** 画面に出す「次の1つ」。迷う原因（古い版・設定前・設定の間違い）を1行で言う。 */
export function diagnose(ping: Ping): Diagnosis {
  if (!(ACCEPTED_RECEPTION_BUILDS as readonly string[]).includes(ping.build)) return { stage: 'old-build', ok: false, message: 'Googleの版が古いです。ひな形をもう一度コピーするか、「デプロイを管理」→ 鉛筆 →「新バージョン」→「デプロイ」を押してください。' };
  if (!ping.ready) {
    // Google側が「設定前」ではなく、別の理由で止まっているとき。①を押しても直らないものは、それぞれ別の案内にする
    if (ping.error === 'owner') return { stage: 'wrong-owner', ok: false, message: 'デプロイは、①を押したのと同じGoogleアカウントでやり直します。（Googleの右上の丸いアイコンで、どのアカウントか確かめます）' };
    if (ping.error === 'sharing') return { stage: 'sharing', ok: false, message: 'シートと写真フォルダの共有を「制限付き」にしてください。' };
    if (ping.error === 'headers') return { stage: 'headers', ok: false, message: headersMessage(ping) };
    if (ping.error === 'missing') return { stage: 'missing-tab', ok: false, message: (ping.errorTab ? '「' + ping.errorTab + '」タブ' : '申込表のタブ') + 'が見つかりません。Googleのシートのメニュー「Tournament OS」→「① 最初の設定」を押すと、作り直します。' };
    return { stage: 'not-setup', ok: false, message: 'まだ最初の設定が終わっていません。Googleのシートのメニュー「Tournament OS」→「① 最初の設定」を押してください。' };
  }
  if (ping.settingsProblem) return { stage: 'bad-settings', ok: false, message: 'シートの「設定」タブを直してください。' + ping.settingsProblem };
  if (ping.storageProblem) return { stage: 'storage-full', ok: false, message: ping.storageProblem };
  if (!ping.testComplete) return { stage: 'need-selftest', ok: false, message: 'つながりました。自動テストがまだです。シートのメニュー「Tournament OS」→「① 最初の設定」をもう一度押してください。' };
  if (!ping.accepting) return { stage: 'need-open', ok: false, message: 'つながりました。テストもできています。次は、シートのメニュー「Tournament OS」→「② 受付を開始」を押してください。' };
  return { stage: 'ready', ok: true, message: '受付できます。選手に渡すURLをコピーできます。' };
}

/** 申込ページへ渡す大会の情報は、Googleのシートの「設定」タブから読んだものだけ。画面で入れ直さない。 */
export function entryConfigFromPing(ping: Ping, endpoint: string, mode: 'test' | 'live'): PublicEntryConfig {
  const need = [ping.eventId, ping.title, ping.date, ping.venue, ping.organizer, ping.contact, ping.deadline];
  if (!isAppsScriptUrl(endpoint) || need.some((v) => !v)) throw new Error('シートの「設定」タブが、まだ全部入っていません。');
  if (ping.classMode && !ping.classes) throw sheetFixError('クラス分けが「あり」ですが、クラスの内容を読めませんでした。「設定」タブのクラスの欄（B13〜B20）を確かめてください。');
  const config: PublicEntryConfig = {
    endpoint: endpoint.trim(), protocol: '3', mode, eventId: ping.eventId!, title: ping.title!, organizer: ping.organizer!, date: formatDateInput(ping.date!), venue: ping.venue!, venueUrl: ping.venueUrl || '',
    deadline: ping.deadline!, contact: ping.contact!, music: ping.music === true, grade: ping.grade || 'optional', age: ping.age || 'optional', comment: ping.comment || 'optional',
    ...(ping.classes ? { classes: ping.classes } : {}),
  };
  if (publicEntryHash(config).length > 4500) throw sheetFixError(longestFieldMessage(ping));
  return config;
}

/** 「設定」タブを直せば解決する問題（画面では、設定の直しものとして出す）。 */
export class SheetFixError extends Error {}
function sheetFixError(message: string): SheetFixError { return new SheetFixError(message); }

/** URLが長すぎるとき、いちばん長い欄を名前で言う（クラスだけのせいにしない）。 */
function longestFieldMessage(ping: Ping): string {
  const parts: [string, string, string][] = [
    ['大会名', 'B2', ping.title || ''], ['会場', 'B4', ping.venue || ''], ['会場の地図URL', 'B5', ping.venueUrl || ''], ['主催者名', 'B6', ping.organizer || ''], ['問い合わせ先', 'B7', ping.contact || ''],
    ['上のクラスの条件', 'B15', ping.classes?.upper.condition || ''], ['上のクラスのルール', 'B16', ping.classes?.upper.rule || ''], ['下のクラスの条件', 'B18', ping.classes?.lower.condition || ''], ['下のクラスのルール', 'B19', ping.classes?.lower.rule || ''],
  ];
  const top = parts.reduce((a, b) => (b[2].length > a[2].length ? b : a));
  const classy = top[0].includes('クラス');
  return (classy ? 'クラスの' : '') + '文が長すぎて、選手に渡すURLに入りません。「' + top[0] + '」（セル ' + top[1] + '）を短くしてください。';
}

/** 申込ページに渡す内容が作れない理由のうち、「設定」タブを直せば解決するもの（なければ空）。 */
export function entryConfigProblem(ping: Ping, endpoint: string): string {
  try { entryConfigFromPing(ping, endpoint, 'live'); return ''; } catch (e) { return e instanceof SheetFixError || (e instanceof Error && e.message.startsWith('クラス')) ? e.message : ''; }
}

/** ひな形（オーナーが自分のシートを公開用にしたもの）のURLから、会長が開く「コピーを作る」リンクを作る。 */
export function templateCopyLink(sheetUrl: string): string {
  const match = sheetUrl.trim().match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]{20,})(?:[/?#].*)?$/);
  if (!match) throw new Error('GoogleスプレッドシートのURL（https://docs.google.com/spreadsheets/d/…）を貼ってください。');
  return 'https://docs.google.com/spreadsheets/d/' + match[1] + '/copy';
}

export function isTemplateCopyLink(value: string): boolean {
  return /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]{20,}\/copy$/.test(value.trim());
}

export type SetupFile = { kind: 'tournament-os-setup'; version: 2; eventId: string; endpoint: string };

const FORBIDDEN = /@|TOS2\./;

/** 設定の書き出し。大会の中身はGoogleのシートにあるので、ここに入れるのは「この画面での大会名札」と受付URLだけ。 */
export function exportSetup(file: Omit<SetupFile, 'kind' | 'version'>): string {
  const body: SetupFile = { kind: 'tournament-os-setup', version: 2, ...file };
  for (const v of [body.eventId, body.endpoint]) if (FORBIDDEN.test(v)) throw new Error('設定に連絡先や鍵らしい文字が入っています。書き出しを止めました。');
  return JSON.stringify(body, null, 2);
}

export function importSetup(text: string): SetupFile {
  let value: Record<string, unknown>;
  try { value = JSON.parse(text); } catch { throw new Error('設定ファイルを読めません。書き出したファイルを選んでください。'); }
  if (!value || value.kind !== 'tournament-os-setup' || value.version !== 2) throw new Error('これはTournament OSの設定ファイルではありません。');
  const eventId = value.eventId, endpoint = value.endpoint;
  if (typeof eventId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(eventId)) throw new Error('設定ファイルの名札が正しくありません。');
  if (typeof endpoint !== 'string' || (endpoint !== '' && !isAppsScriptUrl(endpoint))) throw new Error('設定ファイルの受付URLが正しくありません。');
  return { kind: 'tournament-os-setup', version: 2, eventId, endpoint };
}

/**
 * 古いブラウザか。:has が使えない（古いSafari 15.3以前・古いChrome）、または古いSafariと名乗る、または古いIE。
 * 見つけたら、黄色の注意で「Chromeで開いてください」と言う（止めはしない）。
 */
export function isOldBrowser(ua: string, css: { supports?: (q: string) => boolean } | undefined): boolean {
  if (/MSIE |Trident\//.test(ua)) return true;
  if (!css || typeof css.supports !== 'function') return true;
  try { if (!css.supports('selector(:has(*))')) return true; } catch { return true; }
  const safari = /Version\/(\d+)\.(\d+)[^]*Safari\//.exec(ua);
  if (safari && !/Chrome|Chromium|CriOS|FxiOS|Edg\/|EdgiOS|OPR\//.test(ua) && (Number(safari[1]) < 15 || (Number(safari[1]) === 15 && Number(safari[2]) < 4))) return true;
  return false;
}
