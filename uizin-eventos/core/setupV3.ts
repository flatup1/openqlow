import { isAppsScriptUrl } from './publicEntry.ts';
import type { EntryFieldMode, EntryFormConfig } from './entryPackage.ts';

/** Google側（Tournament_OS_Google受付_v3.gs）の RECEPTION_BUILD と同じ値。テストで一致を確認する。 */
export const EXPECTED_RECEPTION_BUILD = '3.20261004.1';

export type Ping = { app: 'tournament-os'; protocol: 3; build: string; ready: boolean; eventId?: string; testComplete?: boolean; accepting?: boolean; deadline?: string; error?: string };

export function pingUrl(endpoint: string): string {
  const value = endpoint.trim();
  if (!isAppsScriptUrl(value)) throw new Error('「https://script.google.com/macros/s/…/exec」で終わるURLを貼ってください。');
  return value + '?action=ping';
}

export function parsePing(value: unknown): Ping {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== 'object' || v.app !== 'tournament-os' || v.protocol !== 3 || typeof v.build !== 'string' || typeof v.ready !== 'boolean') throw new Error('これはTournament OSの受付ではありません。貼ったURLを確認してください。');
  const text = (key: string) => (typeof v[key] === 'string' ? (v[key] as string) : undefined);
  const flag = (key: string) => (typeof v[key] === 'boolean' ? (v[key] as boolean) : undefined);
  return { app: 'tournament-os', protocol: 3, build: v.build, ready: v.ready, eventId: text('eventId'), deadline: text('deadline'), testComplete: flag('testComplete'), accepting: flag('accepting'), error: text('error') };
}

/** 自動確認が使えないとき、確認ページに出た文字を貼ってもらう。出る項目は公開してよいものだけ。 */
export function parsePingText(text: string): Ping {
  let value: unknown;
  try { value = JSON.parse(text.trim()); } catch { throw new Error('貼った文字を読めません。確かめるページに出た文字を、すべてコピーして貼ってください。'); }
  return parsePing(value);
}

export type Stage = 'wrong-app' | 'old-build' | 'not-setup' | 'wrong-event' | 'need-test' | 'need-open' | 'ready';
export type Diagnosis = { stage: Stage; ok: boolean; message: string };

/** 画面に出す「次の1つ」。迷う原因（古い版・別の大会・まだ設定前）を1行で言う。 */
export function diagnose(ping: Ping, expectedEventId: string): Diagnosis {
  if (ping.build !== EXPECTED_RECEPTION_BUILD) return { stage: 'old-build', ok: false, message: 'Googleの版が古いです。ひな形をもう一度コピーするか、「デプロイを管理」→ 鉛筆 →「新バージョン」→「デプロイ」を押してください。' };
  if (!ping.ready) return { stage: 'not-setup', ok: false, message: 'まだ最初の設定が終わっていません。Googleのシートのメニュー「Tournament OS」→「① 最初の設定」を押してください。' };
  if (ping.eventId !== expectedEventId) return { stage: 'wrong-event', ok: false, message: '別の大会のシートにつながっています。この大会用にコピーしたシートのURLを貼ってください。' };
  if (!ping.testComplete) return { stage: 'need-test', ok: false, message: 'つながりました。次は、テスト申込を1件送ってください。' };
  if (!ping.accepting) return { stage: 'need-open', ok: false, message: 'テストできました。次は、シートのメニュー「Tournament OS」→「② 受付を開始」を押してください。' };
  return { stage: 'ready', ok: true, message: '受付できます。選手に渡すURLをコピーできます。' };
}

const MODE_JA: Record<EntryFieldMode, string> = { required: '必須', optional: '任意', off: 'なし' };

/** 「設定」タブのB2から貼る7行。1回の貼り付けで大会ID・大会名・締切・項目が入る。 */
export function settingsPaste(input: { eventId: string; title: string; deadlineIso: string; config: EntryFormConfig }): string {
  const clean = (text: string) => text.replace(/[\t\r\n]+/g, ' ').trim();
  return [input.eventId, clean(input.title), input.deadlineIso, input.config.music ? 'あり' : 'なし', MODE_JA[input.config.grade], MODE_JA[input.config.age], MODE_JA[input.config.comment]].join('\n');
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

export type SetupFile = { kind: 'tournament-os-setup'; version: 1; eventId: string; title: string; date: string; venue: string; venueUrl: string; organizer: string; contact: string; deadline: string; endpoint: string; config: EntryFormConfig };

const FORBIDDEN = /@|TOS2\./;

/** 設定の書き出し。個人情報・鍵は含めない（含まれていたら止める）。 */
export function exportSetup(file: Omit<SetupFile, 'kind' | 'version'>): string {
  const body: SetupFile = { kind: 'tournament-os-setup', version: 1, ...file };
  for (const [k, v] of Object.entries(body)) if (typeof v === 'string' && k !== 'kind' && k !== 'organizer' && k !== 'contact' && FORBIDDEN.test(v)) throw new Error('設定に連絡先や鍵らしい文字が入っています。書き出しを止めました。');
  return JSON.stringify(body, null, 2);
}

export function importSetup(text: string): SetupFile {
  let value: Record<string, unknown>;
  try { value = JSON.parse(text); } catch { throw new Error('設定ファイルを読めません。書き出したファイルを選んでください。'); }
  const str = (key: string, max = 300) => { const v = value[key]; if (typeof v !== 'string' || v.length > max) throw new Error('設定ファイルの「' + key + '」が正しくありません。'); return v; };
  if (value.kind !== 'tournament-os-setup' || value.version !== 1) throw new Error('これはTournament OSの設定ファイルではありません。');
  const eventId = str('eventId', 64);
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(eventId)) throw new Error('設定ファイルの大会IDが正しくありません。');
  const endpoint = str('endpoint');
  if (endpoint && !isAppsScriptUrl(endpoint)) throw new Error('設定ファイルの受付URLが正しくありません。');
  const config = value.config as Record<string, unknown> | undefined;
  const mode = (key: string): EntryFieldMode => (config?.[key] === 'off' || config?.[key] === 'required' ? (config[key] as EntryFieldMode) : 'optional');
  return { kind: 'tournament-os-setup', version: 1, eventId, title: str('title'), date: str('date', 40), venue: str('venue'), venueUrl: str('venueUrl'), organizer: str('organizer'), contact: str('contact'), deadline: str('deadline', 40), endpoint, config: { music: config?.music === true, grade: mode('grade'), age: mode('age'), comment: mode('comment') } };
}
