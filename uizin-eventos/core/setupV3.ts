import { isAppsScriptUrl, type PublicEntryConfig } from './publicEntry.ts';
import { formatDateInput } from './dateInput.ts';
import type { EntryFieldMode } from './entryPackage.ts';

/** Google側（Tournament_OS_Google受付_v3.gs）の RECEPTION_BUILD と同じ値。テストで一致を確認する。 */
export const EXPECTED_RECEPTION_BUILD = '3.20261004.2';

export type Ping = {
  app: 'tournament-os'; protocol: 3; build: string; ready: boolean; accepting?: boolean;
  eventId?: string; testComplete?: boolean; settingsProblem?: string;
  title?: string; date?: string; venue?: string; venueUrl?: string; organizer?: string; contact?: string; deadline?: string;
  music?: boolean; grade?: EntryFieldMode; age?: EntryFieldMode; comment?: EntryFieldMode; error?: string;
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
    app: 'tournament-os', protocol: 3, build: v.build.slice(0, 40), ready: v.ready, accepting: flag('accepting'), eventId: text('eventId', 64), testComplete: flag('testComplete'), settingsProblem: text('settingsProblem', 600),
    title: text('title'), date: text('date', 20), venue: text('venue'), venueUrl: text('venueUrl', 500), organizer: text('organizer'), contact: text('contact'), deadline: text('deadline', 20),
    music: flag('music'), grade: mode('grade'), age: mode('age'), comment: mode('comment'), error: text('error', 40),
  };
}

/** 自動確認が使えないとき、確認ページに出た文字を貼ってもらう。出る項目は公開してよいものだけ。 */
export function parsePingText(text: string): Ping {
  let value: unknown;
  try { value = JSON.parse(text.trim()); } catch { throw new Error('貼った文字を読めません。確かめるページに出た文字を、すべてコピーして貼ってください。'); }
  return parsePing(value);
}

export type Stage = 'old-build' | 'not-setup' | 'bad-settings' | 'need-selftest' | 'need-open' | 'ready';
export type Diagnosis = { stage: Stage; ok: boolean; message: string };

/** 画面に出す「次の1つ」。迷う原因（古い版・設定前・設定の間違い）を1行で言う。 */
export function diagnose(ping: Ping): Diagnosis {
  if (ping.build !== EXPECTED_RECEPTION_BUILD) return { stage: 'old-build', ok: false, message: 'Googleの版が古いです。ひな形をもう一度コピーするか、「デプロイを管理」→ 鉛筆 →「新バージョン」→「デプロイ」を押してください。' };
  if (!ping.ready) return { stage: 'not-setup', ok: false, message: 'まだ最初の設定が終わっていません。Googleのシートのメニュー「Tournament OS」→「① 最初の設定」を押してください。' };
  if (ping.settingsProblem) return { stage: 'bad-settings', ok: false, message: 'シートの「設定」タブを直してください。' + ping.settingsProblem };
  if (!ping.testComplete) return { stage: 'need-selftest', ok: false, message: 'つながりました。自動テストがまだです。シートのメニュー「Tournament OS」→「① 最初の設定」をもう一度押してください。' };
  if (!ping.accepting) return { stage: 'need-open', ok: false, message: 'つながりました。テストもできています。次は、シートのメニュー「Tournament OS」→「② 受付を開始」を押してください。' };
  return { stage: 'ready', ok: true, message: '受付できます。選手に渡すURLをコピーできます。' };
}

/** 申込ページへ渡す大会の情報は、Googleのシートの「設定」タブから読んだものだけ。画面で入れ直さない。 */
export function entryConfigFromPing(ping: Ping, endpoint: string, mode: 'test' | 'live'): PublicEntryConfig {
  const need = [ping.eventId, ping.title, ping.date, ping.venue, ping.organizer, ping.contact, ping.deadline];
  if (!isAppsScriptUrl(endpoint) || need.some((v) => !v)) throw new Error('シートの「設定」タブが、まだ全部入っていません。');
  return {
    endpoint: endpoint.trim(), protocol: '3', mode, eventId: ping.eventId!, title: ping.title!, organizer: ping.organizer!, date: formatDateInput(ping.date!), venue: ping.venue!, venueUrl: ping.venueUrl || '',
    deadline: ping.deadline!, contact: ping.contact!, music: ping.music === true, grade: ping.grade || 'optional', age: ping.age || 'optional', comment: ping.comment || 'optional',
  };
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
