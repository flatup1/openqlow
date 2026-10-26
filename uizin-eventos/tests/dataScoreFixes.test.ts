// 採点（2026-10-24）で見つかった問題の直しの試験：コピーのファイル（base64・鍵の回数）、保存データの検査（くわしい戦績の形）、
// records.csv の読み方、くわしい戦績の上限、名簿の読み直し（本物の道 mergeKeepExisting）、別の画面への「保存しました」の知らせ。
// 名前・大会名・ジム名・パスワードは、ぜんぶ架空。
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import test from 'node:test';
import * as store from '../app/lib/privateStore.ts';
import { decryptBackup, deletePrivateEvent, encryptBackup, preparePrivateEventSave, readPrivateEvent, watchPrivateEvent, writePrivateEvent } from '../app/lib/privateStore.ts';
import { emptyTournament, importFighters, isLocalTournament, type LocalFighter, type LocalTournament } from '../core/privateTournament.ts';
import { parseRecordDetailCsv, RECORD_DETAIL_HEADERS, RECORD_DETAIL_LIMITS, recordDetailProblems, type RecordDetail } from '../core/recordDetail.ts';
import { toRowsIndexed } from '../core/csv.ts';
import { classifyRestoreError, decryptWithRetry, mergeKeepExisting, readRecordDetails } from '../app/private/logic.ts';
import { recordIsWrong, type KickText } from '../app/components/recordDetailText.ts';

const fighter = (id: string, over: Partial<LocalFighter> = {}): LocalFighter => ({ id, gym: '架空ジム', name: '架空' + id, grade: '', age: '', height: '160', weight: '50', record: '初試合', comment: '', musicUrl: '', photoDataUrl: '', ...over });
/** 1人目にくわしい戦績を付けた大会（undefined なら、くわしい戦績の欄そのものが無い） */
const tournamentWith = (recordDetail?: unknown): LocalTournament => ({ ...emptyTournament('score-fix'), title: '架空大会', fighters: [fighter('R-001', recordDetail === undefined ? {} : { recordDetail: recordDetail as RecordDetail }), fighter('R-002')] });

/* ───────── 1. コピーのファイルの base64：速く、しかも前と1字も変わらない ───────── */

// 前の作り方（2026-10-24 まで）。新しい作り方が、これと1字も変わらないことを確かめる
const oldBytesToBase64 = (bytes: Uint8Array): string => { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); };
const oldBase64ToBytes = (value: string): Uint8Array => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
const random = (n: number): Uint8Array => Uint8Array.from(randomBytes(n));

test('base64：前の作り方と1字も変わらない（0バイト・0x8000 の区切りの前後・いろいろな大きさ。前に作ったコピーのファイルも戻せる）', () => {
  const sizes = [0, 1, 2, 3, 4, 5, 31, 0x7fff, 0x8000, 0x8001, 0xffff, 0x10000, 0x10001, 0x18001, 200_003, 1_000_007];
  for (const n of sizes) {
    const bytes = random(n);
    const text = store.bytesToBase64(bytes);
    assert.equal(text, oldBytesToBase64(bytes), n + ' バイト：前の作り方と同じ文字');
    assert.equal(text, Buffer.from(bytes).toString('base64'), n + ' バイト：ふつうの base64');
    const back = store.base64ToBytes(oldBytesToBase64(bytes));
    assert.ok(back instanceof Uint8Array && back.byteOffset === 0 && back.buffer.byteLength === n, n + ' バイト：むだのない入れ物');
    assert.deepEqual(back, oldBase64ToBytes(text), n + ' バイト：戻した中身も、前の作り方と同じ');
    assert.ok(Buffer.from(back).equals(Buffer.from(bytes)), n + ' バイト：元にもどる');
  }
  const every = Uint8Array.from({ length: 256 * 3 }, (_, i) => i % 256);
  assert.equal(store.bytesToBase64(every), oldBytesToBase64(every), '0〜255 の全部の値');
  const view = random(0x8000 * 2 + 9).subarray(3, 0x8000 + 5);
  assert.equal(store.bytesToBase64(view), oldBytesToBase64(view), '大きな入れ物の一部（途中から始まる）でも同じ');
});

test('base64：1バイトずつ文字をつながない（写真の多い大会で、コピーのファイルを作るとき十数秒止まらないように）', () => {
  const bytes = random(100_000);
  const original = String.fromCharCode;
  let calls = 0;
  String.fromCharCode = function (...codes: number[]): string { calls++; return original.apply(String, codes); };
  let text = '';
  try { text = store.bytesToBase64(bytes); } finally { String.fromCharCode = original; }
  assert.ok(calls <= Math.ceil(bytes.length / 0x8000), '文字にする呼び出しは、0x8000 バイトに1回まで（いま ' + calls + ' 回）');
  assert.equal(text, Buffer.from(bytes).toString('base64'));
});

test('base64：戻すとき、文字を1字ずつ取り出して関数を呼ぶ遅いやり方をしない（コピーのファイルから戻すとき止まらないように）', () => {
  const text = Buffer.from(random(100_000)).toString('base64');
  const proto = String.prototype as unknown as Record<symbol, (this: string) => Iterator<string>>;
  const original = proto[Symbol.iterator];
  let iterated = 0;
  proto[Symbol.iterator] = function (this: string) { iterated++; return original.call(this); };
  let bytes: Uint8Array = new Uint8Array(0);
  try { bytes = store.base64ToBytes(text); } finally { proto[Symbol.iterator] = original; }
  assert.equal(iterated, 0, '文字を1字ずつ取り出す道具を使っていない');
  assert.equal(Buffer.from(bytes).toString('base64'), text);
});

/* ───────── 2. コピーのファイルの鍵：新しいファイルは 600,000回。回数をファイルに書く。前のファイル（回数なし＝250,000回）も戻せる ───────── */

const PASSWORD = 'Fictional-pass-for-test-2026';
/** node の暗号で、ファイルを開く（画面とは別の作り方で、回数を確かめる） */
const nodeOpen = (text: string, password: string, iterations: number): unknown => {
  const p = JSON.parse(text);
  const key = pbkdf2Sync(password, Buffer.from(p.salt, 'base64'), iterations, 32, 'sha256');
  const buf = Buffer.from(p.data, 'base64');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(p.iv, 'base64'));
  d.setAuthTag(buf.subarray(buf.length - 16));
  return JSON.parse(Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()]).toString('utf8'));
};
/** 前の版のアプリと同じ作り方のファイル（回数を書かない・250,000回）。画面の試験（scripts/test-*.mjs）の nodeBackup と同じ */
const oldStyleBackup = (value: unknown, password: string): string => {
  const salt = Buffer.from(randomBytes(16)), iv = Buffer.from(randomBytes(12));
  const key = pbkdf2Sync(password, salt, 250_000, 32, 'sha256');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return JSON.stringify({ format: 'tournament-os-private-1', salt: salt.toString('base64'), iv: iv.toString('base64'), data: data.toString('base64') });
};
/** 前の版（2026-10-24 の HEAD）の encryptBackup が、そのまま作ったファイル（パスワード Fictional-old-pass-2026。中身は架空） */
const OLD_APP_FILE = '{"format":"tournament-os-private-1","salt":"HsupmXmKBFj2/NjuoFQO/w==","iv":"uQ7lXvt4IzrjXk42","data":"Rh3QrGY4ApWKttQ4wnFSQxW/mpUfAOk3VsOjAZ1bmJBTLl0XLhAJtalmDdvX8kYbn0pLwtu5SiP3X6y40V/gyVaIFs1cJ/mlzD3rGII0Ul8eDiStFgOlEFarRUwEgjx5Zthb/GK/DeTW75dkDx7X0xYWkevUbCkMRQuBG0NMGvvZmFWFhiyfQrAaetoB+DW9gjNVTpWdUi2PLTUDvPv+RRmlvcxKdpWHIivxz67F+vZ+O/zVGHz/RGytYZmxe51yjhJ3gJmjunykM+joXQHbd6uR9BImnKabxCKqQX1Z3KMEM6QMOmke6Xz4RF4HKNVZIXk3gDRMZfhAVk0trGvJh61dSyqP6HX0YlN3CJXE5CMRtbaqRdGDJwLqnSvmEhLwF+8rWb6G3fkGBkJakC4oBGTMqe4zMYXpndMnlg1R7ljBiYPC8flGjKbSbm7+1ZprYGm9TnWHpWj78F6zqYvxU6R48pLUzEk/qJ4Pui48Pcnep5wO/44esLfAK0imiUQHriHSyjZrYH5VZzXw10KPPRMM7QdMphnLkeK5tAMsSiX3RL8mQdoO/mzHbVeV0whPzVXmBLI5tQ60sf72On3xsKRdclwWfzvpgOnCE2NmdnsrxWU5/Ds2dkOgeo80NKC4Cd60WTG0rg7SECYHVcjVQ/V8KuhsjvqV7hSnjcA8sStcVY8EtLVTvyjlJeqDySjrcu6fTw=="}';
const OLD_APP_VALUE = {"schema":1,"eventId":"old-backup","title":"架空の大会（前の版のコピー）","venue":"架空体育館","date":"2026年10月24日","updatedAt":1792800000000,"currentBout":0,"fighters":[{"id":"R-001","gym":"架空ジム","name":"架空選手","grade":"中2","age":"14","height":"160","weight":"50","record":"4戦2勝1敗1分","comment":"","musicUrl":"","photoDataUrl":"data:image/jpeg;base64,/9j/2Q==","recordDetail":{"v":1,"kick":{"games":4,"win":2,"loss":1,"draw":1},"others":[],"titles":[]}}],"bouts":[]};

test('コピーのファイル：新しく作るファイルは 600,000回で鍵を作り、回数をファイルに書く（形の名前は前のまま）', async () => {
  const value = tournamentWith();
  const text = await encryptBackup(value, PASSWORD);
  const payload = JSON.parse(text);
  assert.equal(payload.format, 'tournament-os-private-1', '形の名前は変えない（前の画面・ほかの検査が見ている）');
  assert.equal(payload.iterations, 600_000);
  assert.deepEqual(nodeOpen(text, PASSWORD, 600_000), value, '600,000回で作った鍵で開ける');
  assert.throws(() => nodeOpen(text, PASSWORD, 250_000), '前の回数（250,000回）の鍵では開かない');
  assert.deepEqual(await decryptBackup(text, PASSWORD), value, 'この画面でも、そのまま戻せる');
});

test('コピーのファイル：前の版のファイル（回数が書いていない＝250,000回）も、そのまま戻せる', async () => {
  assert.equal('iterations' in JSON.parse(OLD_APP_FILE), false, '見本は、回数が書いていない前の版のファイル');
  assert.deepEqual(await decryptBackup(OLD_APP_FILE, 'Fictional-old-pass-2026'), OLD_APP_VALUE, '前の版のアプリが作ったファイル（前の版の戦績 4戦2勝1敗1分 も入っている）');
  const value = tournamentWith();
  assert.deepEqual(await decryptBackup(oldStyleBackup(value, PASSWORD), PASSWORD), value, '前の版と同じ作り方のファイル');
  await assert.rejects(decryptBackup(OLD_APP_FILE, 'Wrong-old-pass-2026'), (error: unknown) => classifyRestoreError(error) === 'password', 'パスワードがちがうときは、今までどおり「パスワードがちがいます」');
  assert.deepEqual(await decryptWithRetry((pw) => decryptBackup(OLD_APP_FILE, pw), ' Ｆictional-old-pass-2026 '), OLD_APP_VALUE, '全角・前後の空白を直して、もう一度ためすのも今までどおり');
});

test('コピーのファイル：書いてある回数がおかしいときは、鍵を作らずに「こわれたファイル」として断る（大きすぎる数で止まらない）', async () => {
  const good = JSON.parse(await encryptBackup(tournamentWith(), PASSWORD));
  for (const iterations of [0, -1, 1, 1.5, 249_999, 10_000_001, 1e12, '600000', null, true, {}]) {
    const started = Date.now();
    await assert.rejects(decryptBackup(JSON.stringify({ ...good, iterations }), PASSWORD), (error: unknown) => error instanceof Error && /中身を読み取れません/.test(error.message) && classifyRestoreError(error) === 'content', JSON.stringify(iterations));
    assert.ok(Date.now() - started < 1_000, JSON.stringify(iterations) + '：すぐに断る（鍵を作らない）');
  }
});

/* ───────── 3. 保存データの検査：くわしい戦績は「形」だけを見る ───────── */

test('保存データの検査：決まりに合わない（前の版・あとで決まりが変わった）くわしい戦績でも、形が正しければ、大会ぜんぶを読める（保存・ブラウザの保存・コピーのファイル）', async () => {
  const kick = (games: number, win: number, loss: number, draw: number) => ({ v: 1, kick: { games, win, loss, draw }, others: [], titles: [] });
  const ruleBreaking: Array<[string, unknown]> = [
    ['前の版の申し込み（4戦2勝1敗1分）', kick(4, 2, 1, 1)],
    ['勝ち・負けの合計が試合数と合わない（4戦2勝1敗）', kick(4, 2, 1, 0)],
    ['試合数0なのに勝ちがある', kick(0, 3, 0, 0)],
    ['他の格闘技の試合数が0・競技名が空・合計が合わない', { v: 1, kick: kick(1, 1, 0, 0).kick, others: [{ sport: '', games: 0, win: 2, loss: 0, draw: 0, noResult: 0 }], titles: [] }],
    ['タイトルの大会名・階級・成績が空', { v: 1, kick: kick(0, 0, 0, 0).kick, others: [], titles: [{ event: '', year: 2025, class: ' ', result: '' }] }],
    ['版の印（v）が無い', { kick: kick(2, 1, 1, 0).kick, others: [], titles: [] }],
  ];
  for (const [label, detail] of ruleBreaking) {
    assert.ok(recordDetailProblems(detail).length > 0 || label.startsWith('前の版') || label.startsWith('版の印'), label + '：申し込みの決まりには合わない（または前の版の形）');
    const value = tournamentWith(detail);
    assert.equal(isLocalTournament(value), true, label + '：保存データの検査は通る');
    assert.equal(isLocalTournament(structuredClone(value)), true, label + '：ブラウザの保存から読み直しても通る');
    assert.equal(preparePrivateEventSave(value, undefined, 5).fighters[0].recordDetail, value.fighters[0].recordDetail, label + '：保存できる');
  }
  // コピーのファイルからも戻せる（前は、1人でも合わないと「中身を読み取れません」で、まるごと戻せなかった）
  const value = tournamentWith(kick(4, 2, 1, 0));
  assert.deepEqual(await decryptBackup(await encryptBackup(value, PASSWORD), PASSWORD), value);
});

test('保存データの検査：形がおかしいくわしい戦績は、今までどおり断る（数でない・0〜999 の外・長すぎる・多すぎる・欄が無い）', () => {
  const okKick = { games: 4, win: 3, loss: 1, draw: 0 };
  const other = { sport: '空手', games: 1, win: 1, loss: 0, draw: 0, noResult: 0 };
  const title = { event: '架空カップ', year: 2025, class: '-60kg', result: '優勝' };
  const d = (over: Record<string, unknown>) => ({ v: 1, kick: okKick, others: [], titles: [], ...over });
  const bad: Array<[string, unknown]> = [
    ['null', null], ['文字', '4戦3勝1敗'], ['配列', []],
    ['試合数が文字', d({ kick: { ...okKick, games: '4' } })], ['試合数が1000', d({ kick: { ...okKick, games: 1000 } })], ['勝ちがマイナス', d({ kick: { ...okKick, win: -1 } })],
    ['引き分けが小数', d({ kick: { ...okKick, draw: 0.5 } })], ['負けが無い', d({ kick: { games: 4, win: 3, draw: 0 } })], ['キックが無い', d({ kick: undefined })], ['キックが null', d({ kick: null })],
    ['他の格闘技が配列でない', d({ others: {} })], ['他の格闘技が6つ', d({ others: Array.from({ length: 6 }, () => other) })], ['競技名が21字', d({ others: [{ ...other, sport: 'あ'.repeat(21) }] })],
    ['競技名が数', d({ others: [{ ...other, sport: 5 }] })], ['勝敗なしが無い', d({ others: [{ ...other, noResult: undefined }] })], ['他の格闘技の1つが null', d({ others: [null] })],
    ['タイトルが無い', d({ titles: undefined })], ['タイトルが6つ', d({ titles: Array.from({ length: 6 }, () => title) })], ['獲得年が文字', d({ titles: [{ ...title, year: '2025' }] })],
    ['獲得年が1899', d({ titles: [{ ...title, year: 1899 }] })], ['大会名が61字', d({ titles: [{ ...title, event: 'あ'.repeat(61) }] })], ['階級が31字', d({ titles: [{ ...title, class: 'あ'.repeat(31) }] })],
    ['成績が61字', d({ titles: [{ ...title, result: 'あ'.repeat(61) }] })],
  ];
  for (const [label, detail] of bad) assert.equal(isLocalTournament(tournamentWith(detail)), false, label);
  assert.equal(isLocalTournament(tournamentWith(d({ others: Array.from({ length: 5 }, () => ({ ...other, sport: ' ' + 'あ'.repeat(20) + ' ' })), titles: Array.from({ length: 5 }, () => ({ ...title, year: 2100 })) }))), true, '上限ちょうど（5つ・20字・2100年）は通る');
});

test('保存データの検査：申し込みの決まりで正しい戦績は、これまでどおり、ぜんぶ通る（前に読めた物が、読めなくならない）', () => {
  let seed = 20261024;
  const next = (max: number) => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed % (max + 1); };
  const split = (games: number, parts: number) => { const out = Array.from({ length: parts }, () => 0); for (let i = 0; i < games; i++) out[next(parts - 1)]++; return out; };
  for (let i = 0; i < 400; i++) {
    const games = next(3) === 0 ? 0 : 1 + next(998);
    const [win, loss, draw] = games === 0 ? [0, 0, 0] : split(games, 3);
    const others = Array.from({ length: next(5) }, () => { const g = 1 + next(998); const [w, l, dr, nr] = split(g, 4); return { sport: (next(1) ? ' ' : '') + 'あ'.repeat(1 + next(19)), games: g, win: w, loss: l, draw: dr, noResult: nr }; });
    const titles = Array.from({ length: next(5) }, () => ({ event: 'い'.repeat(1 + next(59)), year: 1900 + next(200), class: 'う'.repeat(1 + next(29)), result: 'え'.repeat(1 + next(59)) }));
    const detail = { v: 1, kick: { games, win, loss, draw }, others, titles };
    assert.deepEqual(recordDetailProblems(detail), [], '試す材料は、申し込みの決まりに合う');
    assert.equal(isLocalTournament(tournamentWith(detail)), true, JSON.stringify(detail).slice(0, 120));
  }
});

test('ブラウザの保存：決まりに合わない戦績の人がいても、「保存データを読めません」にならず、大会が開く', { timeout: 10_000 }, async () => {
  const browser = fakeBrowser();
  try {
    const value = tournamentWith({ v: 1, kick: { games: 4, win: 2, loss: 1, draw: 0 }, others: [], titles: [] });
    browser.rows.set(value.eventId, structuredClone(value));
    assert.deepEqual(await readPrivateEvent(value.eventId), value);
  } finally { browser.restore(); }
});

test('くわしい戦績の上限は、小さくしない（保存した大会・コピーのファイルの形の検査も、この数を使う。小さくすると、前の大会が読めなくなる）', () => {
  const L = RECORD_DETAIL_LIMITS;
  assert.ok(L.games >= 999 && L.others >= 5 && L.titles >= 5 && L.sport >= 20 && L.event >= 60 && L.class >= 30 && L.result >= 60 && L.yearMin <= 1900 && L.yearMax >= 2100, JSON.stringify(L));
});

/* ───────── 4. records.csv：名簿と同じ CSV の読み方（「"」は欄の最初だけ引用の始まり） ───────── */

const HEAD = RECORD_DETAIL_HEADERS.join(',');
const kickRow = (receipt: string, games = 2, win = 1, loss = 1) => [receipt, '2026-10-01 10:00', 'キック', 'キックボクシング', String(games), String(win), String(loss), '0', '', '', '', ''].join(',');

test('records.csv：引用符のない欄の途中の「"」（空手5"級）は、ただの文字。あとの選手の戦績も消えない（準備の画面の数え方と同じ答え）', () => {
  const csv = [HEAD, kickRow('R-001'), ['R-001', '2026-10-01 10:00', '他の格闘技', '空手5"級', '1', '1', '0', '0', '0', '', '', ''].join(','), kickRow('R-002'), kickRow('R-003')].join('\r\n') + '\r\n';
  const parsed = parseRecordDetailCsv(csv);
  assert.ok(parsed.ok);
  assert.deepEqual([...(parsed.ok ? parsed.byReceipt.keys() : [])], ['R-001', 'R-002', 'R-003']);
  assert.equal(parsed.ok ? parsed.byReceipt.get('R-001')?.others[0].sport : '', '空手5"級');
  const sameReader = new Set(toRowsIndexed(csv).rows.map(({ row }) => row['受付番号']));
  assert.deepEqual([...sameReader], ['R-001', 'R-002', 'R-003'], '準備の画面が数えるときの読み方と、同じ受付番号');
  const read = readRecordDetails(new TextEncoder().encode(csv));
  assert.deepEqual([...read.details.keys()], ['R-001', 'R-002', 'R-003'], '3人とも付く');
  assert.equal(read.skipped, 0, '知らせの「付けなかった人数」もずれない');
  assert.equal(read.unreadable, false);
});

test('records.csv：「"」が閉じないまま終わるファイルは、後ろの行を黙って捨てず、ぜんぶ「読めない」にする', () => {
  const csv = [HEAD, kickRow('R-001'), ['R-002', 'x', '他の格闘技', '"空手', '1', '1', '0', '0', '0', '', '', ''].join(','), kickRow('R-003')].join('\r\n');
  const parsed = parseRecordDetailCsv(csv);
  assert.equal(parsed.ok, false);
  assert.match(parsed.ok ? '' : parsed.reason, /「"」が閉じていない/);
  assert.deepEqual(readRecordDetails(new TextEncoder().encode(csv)), { details: new Map(), unreadable: true, skipped: 0 }, '準備の画面は「読めなかった」と知らせる');
});

test('records.csv：これまで読めた書き方は、同じに読む（BOM・CRLF・CRだけ・空の行・受付が全部の欄を "…" で囲む形・"" と , と改行を中に持つ欄・欄の前後の空白）', () => {
  const q = (cells: string[]) => cells.map((cell) => '"' + cell.replace(/"/g, '""') + '"').join(',');
  const rows = [
    q([...RECORD_DETAIL_HEADERS]),
    q(['R-1', '2026/10/24 8:00', 'キック', 'キックボクシング', '4', '3', '1', '0', '', '', '', '']),
    '',
    q(['R-1', '2026/10/24 8:00', '他の格闘技', 'ムエ,"タイ"', '3', '1', '1', '0', '1', '', '', '']),
    ' "R-1" ,"2026/10/24 8:00", "タイトル・入賞" ,"架空\nカップ","","","","","","2025","\'-60kg","優勝"',
  ];
  const want = { v: 1, kick: { games: 4, win: 3, loss: 1, draw: 0 }, others: [{ sport: 'ムエ,"タイ"', games: 3, win: 1, loss: 1, draw: 0, noResult: 1 }], titles: [{ event: '架空\nカップ', year: 2025, class: '-60kg', result: '優勝' }] };
  for (const [label, text] of [['BOM・CRLF', '﻿' + rows.join('\r\n') + '\r\n'], ['LF', rows.join('\n')], ['CRだけ（前の Mac の Excel）', rows.join('\r')], ['先頭と最後に空の行', '\r\n\r\n' + rows.join('\r\n') + '\r\n\r\n']]) {
    const parsed = parseRecordDetailCsv(text);
    assert.ok(parsed.ok, label);
    assert.deepEqual(parsed.ok ? parsed.byReceipt.get('R-1') : null, want, label);
  }
});

/* ───────── 5. 黄色の札（recordIsWrong）の上限は、core の RECORD_DETAIL_LIMITS と同じ（写しを持たない） ───────── */

test('recordIsWrong：上限は core の RECORD_DETAIL_LIMITS に従う（上限を変えると、黄色の札も同じに変わる）', () => {
  const limits = RECORD_DETAIL_LIMITS as unknown as Record<string, number>;
  const saved = { ...limits };
  const ok: KickText = { games: '5', win: '3' };
  const otherOf = (sport: string) => [{ sport, games: '1', win: '1' }];
  const titleOf = (over: Partial<{ event: string; year: string; class: string; result: string }>) => [{ event: '架空', year: '2025', class: '-60kg', result: '優勝', ...over }];
  try {
    Object.assign(limits, { games: 1200, sport: 25, event: 70, class: 40, result: 70, yearMin: 1800, yearMax: 2200 });
    assert.equal(recordIsWrong({ games: '1100', win: '' }, [], []), false, '試合数の上限');
    assert.equal(recordIsWrong(ok, otherOf('あ'.repeat(24)), []), false, '競技名の上限');
    assert.equal(recordIsWrong(ok, [], titleOf({ event: 'あ'.repeat(65), class: 'あ'.repeat(35), result: 'あ'.repeat(65) })), false, '大会名・階級・成績の上限');
    assert.equal(recordIsWrong(ok, [], titleOf({ year: '1850' })), false, '獲得年の下の上限');
    assert.equal(recordIsWrong(ok, [], titleOf({ year: '2150' })), false, '獲得年の上の上限');
    Object.assign(limits, { sport: 10 });
    assert.equal(recordIsWrong(ok, otherOf('あ'.repeat(11)), []), true, '小さくしたときも、同じ数');
  } finally { Object.assign(limits, saved); }
  assert.deepEqual({ ...limits }, saved, 'もとの上限に戻した');
});

test('recordIsWrong：上限ちょうどは まちがいでない、1つこえると まちがい。決まりの確認（recordDetailProblems）と同じ境目', () => {
  const L = RECORD_DETAIL_LIMITS;
  const ok: KickText = { games: '5', win: '3' };
  const title = { event: '架空', year: '2025', class: '-60kg', result: '優勝' };
  const pairs: Array<[string, boolean, boolean]> = [];
  const check = (label: string, wrong: boolean, problems: string[]) => pairs.push([label, wrong, problems.length > 0]);
  const rd = (over: Partial<RecordDetail>) => recordDetailProblems({ v: 1, kick: { games: 5, win: 3, loss: 2, draw: 0 }, others: [], titles: [], ...over });
  for (const n of [L.sport, L.sport + 1]) check('競技名 ' + n + '字', recordIsWrong(ok, [{ sport: 'あ'.repeat(n), games: '1', win: '1' }], []), rd({ others: [{ sport: 'あ'.repeat(n), games: 1, win: 1, loss: 0, draw: 0, noResult: 0 }] }));
  for (const key of ['event', 'class', 'result'] as const) for (const n of [L[key], L[key] + 1]) check(key + ' ' + n + '字', recordIsWrong(ok, [], [{ ...title, [key]: 'あ'.repeat(n) }]), rd({ titles: [{ event: '架空', year: 2025, class: '-60kg', result: '優勝', [key]: 'あ'.repeat(n) }] }));
  for (const year of [L.yearMin - 1, L.yearMin, L.yearMax, L.yearMax + 1]) check('獲得年 ' + year, recordIsWrong(ok, [], [{ ...title, year: String(year) }]), rd({ titles: [{ event: '架空', year, class: '-60kg', result: '優勝' }] }));
  for (const games of [L.games, L.games + 1]) check('試合数 ' + games, recordIsWrong({ games: String(games), win: '0' }, [], []), rd({ kick: { games, win: 0, loss: games, draw: 0 } }));
  for (const [label, wrong, problem] of pairs) assert.equal(wrong, problem, label);
  assert.deepEqual(pairs.map(([, wrong]) => wrong), [false, true, false, true, false, true, false, true, true, false, false, true, false, true]);
});

/* ───────── 7. 名簿の読み直し：本物の道（mergeKeepExisting）で、使っていない mergeFighters だけが見ていた場面を確かめる ───────── */

test('名簿の読み直し（mergeKeepExisting）：管理番号で合わせる。ファイルに無い人は同じ位置に残し、新しい人は最後。写真はファイルに無ければ前のまま（書きかえを選んでも）。今の名簿もファイルも変えない', () => {
  const original = importFighters('管理番号,選手名,体重\nF1,赤,55\nF2,青,58').fighters;
  original[0].photoDataUrl = 'data:image/jpeg;base64,/9j/2Q==';
  const snapshot = JSON.stringify(original);
  const file = importFighters('管理番号,選手名,体重,クラス\nF1,赤,56,Aクラス\nF3,緑,60,');
  const fileSnapshot = JSON.stringify(file.fighters);
  const result = mergeKeepExisting(original, file.fighters, { hasClassColumn: file.hasClassColumn, hasDivisionColumn: file.hasDivisionColumn, hasWeightClassColumn: file.hasWeightClassColumn });
  // ふつうの読み直し：前からいる人は黙って変えない（体重55のまま）。空だったクラスだけ足す
  assert.deepEqual(result.merged.map((f) => f.id), ['F1', 'F2', 'F3']);
  assert.equal(result.merged[0].weight, '55');
  assert.equal(result.merged[0].photoDataUrl, original[0].photoDataUrl);
  assert.equal(result.merged[0].fighterClass, 'Aクラス', 'クラスは、空だったので、ファイルから足す');
  assert.equal(result.merged[1], original[1], 'ファイルに無い人は、同じ物のまま');
  assert.deepEqual(result.differs.map((d) => d.fields.map((f) => f.label)), [['体重']]);
  assert.equal(result.added, 1); assert.equal(result.classesFilled, 1);
  // 「ファイルの内容に書きかえる」を選んだとき
  assert.deepEqual(result.overwritten.map((f) => f.id), ['F1', 'F2', 'F3']);
  assert.equal(result.overwritten[0].weight, '56');
  assert.equal(result.overwritten[0].photoDataUrl, original[0].photoDataUrl, 'ファイルに写真が無いときは、書きかえても前の写真のまま');
  assert.equal(result.overwritten[0].fighterClass, 'Aクラス');
  assert.equal(result.overwritten[1], original[1], 'ファイルに無い人は、書きかえても残る');
  assert.equal(JSON.stringify(original), snapshot, '今の名簿は変えない');
  assert.equal(JSON.stringify(file.fighters), fileSnapshot, 'ファイルの中身も変えない');
  assert.throws(() => mergeKeepExisting(original, [file.fighters[0], file.fighters[0]]), /同じ管理番号/);
});

/* ───────── 別の画面への「保存しました」の知らせ（BroadcastChannel）に、保存番号（updatedAt）を入れる ───────── */

/** node の上で、ブラウザの保存場所（IndexedDB）を小さくまねる。BroadcastChannel は node の本物を使う */
function fakeBrowser() {
  const rows = new Map<string, unknown>();
  const soon = (fn: () => void) => { setTimeout(fn, 0); };
  type Req = { result: unknown; error: null; transaction?: unknown; onsuccess: null | (() => void); onerror: null | (() => void); onupgradeneeded?: null | (() => void); onblocked?: null | (() => void) };
  const db = {
    close() { /* なにもしない */ },
    createObjectStore() { /* なにもしない */ },
    transaction() {
      const writes: Array<() => void> = [];
      let aborted = false, finished = false;
      const tx = { oncomplete: null as null | (() => void), onabort: null as null | (() => void), error: null, abort() { aborted = true; }, objectStore: () => objectStore };
      const finish = () => soon(() => { if (finished) return; finished = true; if (aborted) { tx.onabort?.(); return; } writes.forEach((write) => write()); tx.oncomplete?.(); });
      const request = (read: () => unknown): Req => { const req: Req = { result: undefined, error: null, transaction: tx, onsuccess: null, onerror: null }; soon(() => { req.result = read(); req.onsuccess?.(); finish(); }); return req; };
      const objectStore = {
        get: (key: string) => request(() => structuredClone(rows.get(key))),
        put: (value: unknown, key: string) => { writes.push(() => rows.set(key, structuredClone(value))); },
        delete: (key: string) => { writes.push(() => rows.delete(key)); finish(); },
      };
      return tx;
    },
  };
  const indexedDB = { open: (): Req => { const req: Req = { result: db, error: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null }; soon(() => req.onsuccess?.()); return req; } };
  const g = globalThis as unknown as Record<string, unknown>;
  const before = { window: g.window, indexedDB: g.indexedDB };
  g.window = globalThis; g.indexedDB = indexedDB;
  return { rows, restore() { g.window = before.window; g.indexedDB = before.indexedDB; if (before.window === undefined) delete g.window; if (before.indexedDB === undefined) delete g.indexedDB; } };
}

test('知らせ：保存したときは、保存番号（updatedAt）を入れて知らせる。消したときは、今までと同じ知らせ（{ type: "changed" }）', { timeout: 10_000 }, async () => {
  const browser = fakeBrowser();
  const listener = new BroadcastChannel('tournament-os-private:notice-test');
  try {
    const heard: unknown[] = [];
    const both = new Promise<void>((resolve) => { listener.onmessage = (event) => { heard.push(event.data); if (heard.length === 2) resolve(); }; });
    const saved = await writePrivateEvent({ ...emptyTournament('notice-test'), title: '架空大会', updatedAt: 100 });
    assert.deepEqual(browser.rows.get('notice-test'), saved, '保存はされている');
    await deletePrivateEvent('notice-test');
    await both;
    assert.deepEqual(heard, [{ type: 'changed', updatedAt: saved.updatedAt }, { type: 'changed' }]);
  } finally { listener.close(); browser.restore(); }
});

test('知らせを受ける：保存番号を callback に渡す。番号の無い知らせ（前の版の画面・消したとき）でも、今までどおり呼ぶ（番号なし）', { timeout: 10_000 }, async () => {
  const browser = fakeBrowser();
  const sender = new BroadcastChannel('tournament-os-private:watch-test');
  const got: unknown[] = [];
  let stop: () => void = () => undefined;
  try {
    const all = new Promise<void>((resolve) => { stop = watchPrivateEvent('watch-test', (updatedAt) => { got.push(updatedAt); if (got.length === 4) resolve(); }); });
    sender.postMessage({ type: 'changed', updatedAt: 1234 });
    sender.postMessage({ type: 'changed' });
    sender.postMessage({ type: 'changed', updatedAt: 'x' });
    sender.postMessage('changed');
    await all;
    assert.deepEqual(got, [1234, undefined, undefined, undefined]);
  } finally { stop(); sender.close(); browser.restore(); }
});

/* ───────── 8. 試合の注意を、まとめて作る（boutWarningsAll）。1試合ずつ作るのと、同じ文・同じ順 ───────── */
test('注意をまとめて作る（boutWarningsAll）：ばらばらの名簿と試合で、1試合ずつの boutWarnings と1文字もちがわない', async () => {
  const { boutWarnings, boutWarningsAll } = await import('../core/privateTournament.ts');
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = <T,>(list: T[]): T => list[Math.floor(rnd() * list.length)];
  for (let round = 0; round < 400; round++) {
    const fighters = Array.from({ length: 3 + Math.floor(rnd() * 18) }, (_, i) => ({
      id: 'F' + (rnd() < 0.05 ? 0 : i), gym: pick(['架空A', '架空Ａ', '架空B', '', ' 架空A ']), name: pick(['山田', '山田 ', '', '佐藤', 'やまだ']),
      grade: '', age: '', height: '170', weight: pick(['60', '66', '60kg', '', 'x', '5']), record: '初試合', comment: '', musicUrl: '', photoDataUrl: '',
      ...(rnd() < 0.2 ? { absent: true } : {}),
    }));
    const ids = [...fighters.map((f) => f.id), '', 'NOPE'];
    const bouts = Array.from({ length: 1 + Math.floor(rnd() * 10) }, (_, i) => ({ id: 'b' + i, redId: pick(ids), blueId: pick(ids), rule: '', weightClass: '' }));
    const one = bouts.map((bout) => boutWarnings(bout as never, fighters as never, bouts as never));
    assert.deepEqual(boutWarningsAll(fighters as never, bouts as never), one, 'round ' + round);
  }
});
