import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash, randomUUID } from 'node:crypto';

export const owner = 'organizer@example.com';
export const script = readFileSync(new URL('../../public/templates/Tournament_OS_Google受付_v3.gs', import.meta.url), 'utf8');
export const JPEG = Buffer.from([0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9]);

export type Opts = { ignoreTextFormat?: boolean };

export function harness(opts: Opts = {}) {
  const props = new Map<string, string>(), resources = new Map<string, any>(), logs: string[] = [], zips: any[] = [];
  let currentOwner = owner, serial = 0, menu: string[] = [];
  const iterator = (array: any[]) => { let i = 0; return { hasNext: () => i < array.length, next: () => array[i++] }; };
  const blob = (bytes: any, type: string, name: string) => ({ bytes: typeof bytes === 'string' ? Buffer.from(bytes) : Buffer.from(bytes), type, name, getBytes() { return [...this.bytes]; }, setName(v: string) { this.name = v; return this; } });
  function resource(kind: string, name: string, data?: any): any {
    const id = 'res' + (++serial);
    const r: any = { kind, name, id, children: [] as any[], data, sharing: 'PRIVATE', editors: [] as any[], viewers: [] as any[], trashed: false,
      getId: () => id, getOwner: () => ({ getEmail: () => owner }), getSharingAccess: () => r.sharing, getEditors: () => r.editors, getViewers: () => r.viewers, isTrashed: () => r.trashed,
      getUrl: () => (kind === 'folder' ? 'https://drive.google.com/drive/folders/' : 'https://drive.google.com/file/d/') + id + '/view',
      getSize: () => r.data?.bytes?.length || 0, getBlob: () => blob(r.data.bytes, r.data.type, r.name),
      parents: [] as any[], getParents: () => iterator(r.parents),
      createFolder: (n: string) => { const c = resource('folder', n); c.parents.push(r); r.children.push(c); return c; },
      createFile: (v: any) => { const c = resource('file', v.name, v); c.parents.push(r); r.children.push(c); return c; },
      getFilesByName: (n: string) => iterator(r.children.filter((c: any) => c.kind === 'file' && c.name === n && !c.trashed)) };
    resources.set(id, r); return r;
  }
  function sheet(book: any, name: string): any {
    const formats = new Map<string, string>();
    const stored = (v: any, r: number, c: number, viaSetValue = false) => typeof v === 'string' && /^\d+(?:\.\d+)?$/.test(v) && (formats.get(r + ':' + c) !== '@' || (opts.ignoreTextFormat && !viaSetValue)) ? Number(v) : v;
    const s: any = { name, rows: [] as any[][],
      getLastRow: () => s.rows.length,
      appendRow: (values: any[]) => { const r = s.rows.length + 1; s.rows.push(values.map((v, c) => stored(v, r, c + 1))); },
      getDataRange: () => s.getRange(1, 1, s.rows.length, s.rows[0]?.length || 1),
      getRange: (r: number, c: number, n = 1, m = 1) => {
        const range: any = {
          getDisplayValues: () => Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => String(s.rows[r - 1 + i]?.[c - 1 + j] ?? '').replace(/^'(?=[=+\-@])/u, ''))),
          getDisplayValue: () => range.getDisplayValues()[0][0],
          setValues: (values: any[][]) => { values.forEach((row, i) => { s.rows[r - 1 + i] ??= []; row.forEach((v, j) => { s.rows[r - 1 + i][c - 1 + j] = stored(v, r + i, c + j); }); }); return range; },
          setValue: (v: any) => { s.rows[r - 1] ??= []; s.rows[r - 1][c - 1] = stored(v, r, c, true); return range; },
          setNumberFormat: (f: string) => { for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) formats.set((r + i) + ':' + (c + j), f); return range; },
          setFontWeight: () => range };
        return range;
      } };
    book.sheets.set(name, s); return s;
  }
  const bookFile = resource('file', 'copy-of-template');
  const book: any = { sheets: new Map<string, any>(), getId: () => bookFile.id, getSheetByName: (n: string) => book.sheets.get(n) || null, insertSheet: (n: string) => sheet(book, n) };
  sheet(book, 'シート1');
  const propsApi = { getProperty: (k: string) => props.get(k) ?? null, setProperty: (k: string, v: string) => { props.set(k, String(v)); }, setProperties: (o: Record<string, string>) => { for (const [k, v] of Object.entries(o)) props.set(k, String(v)); } };
  const api: any = {
    Session: { getEffectiveUser: () => ({ getEmail: () => currentOwner }) },
    PropertiesService: { getScriptProperties: () => propsApi },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => book, openById: (id: string) => { assert.equal(id, bookFile.id); return book; }, flush: () => undefined,
      getUi: () => ({ ButtonSet: { OK: 'OK' }, alert: () => undefined, createMenu: (t: string) => { const m: any = { addItem: (label: string) => { menu.push(label); return m; }, addToUi: () => undefined }; menu = [t]; return m; } }) },
    DriveApp: { Access: { PRIVATE: 'PRIVATE' }, createFolder: (n: string) => resource('folder', n), getFolderById: (id: string) => { const v = resources.get(id); if (!v) throw new Error('folder missing'); return v; }, getFileById: (id: string) => { const v = resources.get(id); if (!v) throw new Error('file missing'); return v; } },
    Utilities: { getUuid: () => randomUUID(), base64Decode: (v: string) => [...Buffer.from(v, 'base64')], newBlob: blob, Charset: { UTF_8: 'utf8' }, DigestAlgorithm: { SHA_256: 'sha256' }, computeDigest: (_: any, v: string | number[]) => [...createHash('sha256').update(typeof v === 'string' ? v : Buffer.from(v)).digest()].map((b) => (b > 127 ? b - 256 : b)),
      zip: (files: any[], name: string) => { zips.push(files); return { bytes: Buffer.from('zip'), type: 'application/zip', name }; } },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST_ONLY/exec' }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text: string) => ({ text, setMimeType() { return this; } }) },
    HtmlService: { createHtmlOutput: (html: string) => ({ html, setTitle() { return this; }, addMetaTag() { return this; } }) },
    Logger: { log: (v: string) => logs.push(v) }, console: { error: () => undefined },
  };
  vm.createContext(api); vm.runInContext(script, api);
  const call = (name: string, ...args: any[]) => { vm.runInContext('SETTINGS_CACHE_ = null;', api); return api[name](...args); };
  const settingsSheet = () => book.getSheetByName('設定');
  const setSetting = (key: string, value: string) => { const row = settingsSheet().rows.findIndex((r: any[]) => r[0] === key); assert.ok(row >= 0, key); settingsSheet().rows[row][1] = value; };
  const GOOD: Record<string, string> = { 大会名: 'テスト大会', 開催日: '2099-12-01', 会場: '体育館', 主催者名: '主催ジム', 問い合わせ先: '0200000000', 申込締切: '2099-11-30' };
  const fill = (over: Record<string, string> = {}) => { for (const [k, v] of Object.entries({ ...GOOD, ...over })) setSetting(k, v); };
  const eventId = () => props.get('eventId') || '';
  const params = (mode = 'test', over: Record<string, string> = {}) => ({ protocol: '3', eventId: eventId(), mode, requestId: randomUUID(), gym: '架空ジム', name: '架空選手', grade: '', age: '20', height: '170', weight: '65', record: '初試合', comment: '', musicUrl: '', contactName: 'テスト太郎', contactPhone: '09000000000', contactEmail: 'test@example.com', consent: 'yes', website: '', photoDataUrl: 'data:image/jpeg;base64,' + JPEG.toString('base64'), ...over });
  // 会長の操作: コピーしたシートを開く（onOpen）→ 「設定」タブに入れる → 「① 最初の設定」
  const ready = (over: Record<string, string> = {}) => { call('onOpen'); fill(over); call('setupTournament'); };
  return { api, props, resources, book, logs, zips, call, params, fill, ready, setSetting, settingsSheet, eventId, menu: () => menu, setOwner: (v: string) => { currentOwner = v; }, rows: (n: string) => book.getSheetByName(n).rows as any[][] };
}

