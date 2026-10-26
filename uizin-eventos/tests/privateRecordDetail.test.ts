import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { emptyTournament, importFighters, isLocalTournament, type LocalFighter, type LocalTournament } from '../core/privateTournament.ts';
import { RECORD_DETAIL_HEADERS, type RecordDetail } from '../core/recordDetail.ts';
import { decryptBackup, encryptBackup, preparePrivateEventSave } from '../app/lib/privateStore.ts';
import {
  isRecordsCsvName, mergeKeepExisting, pickZipRoster, recordDetailLines, readRecordDetails, recordDetailOnFighters, recordDetailsFromCsv, recordsCsvEntry, RECORDS_CSV_MAX_BYTES, sameExceptProgress, zipEntryName,
} from '../app/private/logic.ts';

const fighter = (id: string, over: Partial<LocalFighter> = {}): LocalFighter => ({ id, gym: 'テストジム', name: '架空' + id, grade: '', age: '', height: '170', weight: '60', record: '初試合', comment: '', musicUrl: '', photoDataUrl: '', ...over });
const base = (over: Partial<LocalTournament> = {}): LocalTournament => ({ ...emptyTournament('record-test'), title: '架空大会', fighters: [fighter('R-001'), fighter('R-002')], ...over });

/* records.csv の見出し（この順・この字）。core の決まりと同じであることも確かめる */
const HEAD = '受付番号,申込日時,種類,競技名・大会名,試合数,勝ち,負け,引き分け,勝敗なし,獲得年,階級,タイトル名・入賞成績';
const COLS = ['受付番号', '申込日時', '種類', '競技名・大会名', '試合数', '勝ち', '負け', '引き分け', '勝敗なし', '獲得年', '階級', 'タイトル名・入賞成績'];
/** 1行を、見出しの順に並べる（書かなかった欄は空） */
const rec = (receipt: string, cells: Record<string, string | number>): string => COLS.map((col) => (col === '受付番号' ? receipt : String(cells[col] ?? ''))).join(',');
const csvOf = (...rows: string[]): string => '﻿' + [HEAD, ...rows].join('\r\n') + '\r\n';
const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text);

const detail: RecordDetail = {
  v: 1,
  kick: { games: 4, win: 3, loss: 1, draw: 0 },
  others: [{ sport: 'ムエタイ', games: 2, win: 1, loss: 0, draw: 0, noResult: 1 }],
  titles: [{ event: '架空カップ', year: 2026, class: 'ライト級', result: '優勝' }],
};
const detailRows = [
  rec('R-001', { 申込日時: '2026-10-01 10:00', 種類: 'キック', '競技名・大会名': 'キックボクシング', 試合数: 4, 勝ち: 3, 負け: 1, 引き分け: 0 }),
  rec('R-001', { 申込日時: '2026-10-01 10:00', 種類: '他の格闘技', '競技名・大会名': 'ムエタイ', 試合数: 2, 勝ち: 1, 負け: 0, 引き分け: 0, 勝敗なし: 1 }),
  rec('R-001', { 申込日時: '2026-10-01 10:00', 種類: 'タイトル・入賞', '競技名・大会名': '架空カップ', 獲得年: 2026, 階級: 'ライト級', 'タイトル名・入賞成績': '優勝' }),
];

test('records.csv の見出しは、core の決まり（RECORD_DETAIL_HEADERS）と同じ字・同じ順', () => {
  assert.equal(RECORD_DETAIL_HEADERS.join(','), HEAD);
});

test('records.csv: 正しい見出しで、受付ごとに「キック1行・他の格闘技・タイトル」を読む（BOM・CRLFつき）', () => {
  const kickOnly = rec('R-002', { 申込日時: '2026-10-01 10:05', 種類: 'キック', '競技名・大会名': 'キックボクシング', 試合数: 2, 勝ち: 1, 負け: 1, 引き分け: 0 });
  const found = recordDetailsFromCsv(bytesOf(csvOf(...detailRows, kickOnly)));
  assert.deepEqual([...found.keys()].sort(), ['R-001', 'R-002']);
  assert.deepEqual(found.get('R-001'), detail);
  assert.deepEqual(found.get('R-002'), { v: 1, kick: { games: 2, win: 1, loss: 1, draw: 0 }, others: [], titles: [] });
});

test('records.csv: 見出しが違うときは、ぜんぶ読まない（エラーにもしない）', () => {
  assert.equal(recordDetailsFromCsv(bytesOf('受付番号,種類\r\nR-001,キック\r\n')).size, 0);
  assert.equal(recordDetailsFromCsv(bytesOf([HEAD.replace('勝ち', '勝'), ...detailRows].join('\r\n'))).size, 0, '見出しの1字がちがえば、読まない（行があっても）');
  assert.equal(recordDetailsFromCsv(bytesOf([HEAD.split(',').reverse().join(','), ...detailRows].join('\r\n'))).size, 0, '並びがちがえば、読まない');
  assert.equal(recordDetailsFromCsv(Uint8Array.from([0xff, 0xfe, 0x00, 0x41])).size, 0, '文字が読めなければ、何も付けない');
  assert.equal(recordDetailsFromCsv(undefined).size, 0, 'records.csv が無いとき');
  assert.equal(recordDetailsFromCsv(bytesOf('')).size, 0, '空のファイル');
});

test('records.csv: 壊れた行がある受付は、その受付だけ付けない（一部だけ出さない）。ほかの受付は読む', () => {
  const found = recordDetailsFromCsv(bytesOf(csvOf(
    rec('R-010', { 申込日時: 'x', 種類: 'キック', '競技名・大会名': 'キックボクシング', 試合数: 3, 勝ち: 2, 負け: 1, 引き分け: 0 }),
    rec('R-010', { 申込日時: 'x', 種類: '他の格闘技', '競技名・大会名': 'ムエタイ', 試合数: 'abc', 勝ち: 1, 負け: 0, 引き分け: 0, 勝敗なし: 0 }),
    rec('R-011', { 申込日時: 'x', 種類: 'キック', '競技名・大会名': 'キックボクシング', 試合数: 2, 勝ち: 1, 負け: 0, 引き分け: 0 }),
    rec('R-012', { 申込日時: 'x', 種類: '他の格闘技', '競技名・大会名': 'ムエタイ', 試合数: 1, 勝ち: 1, 負け: 0, 引き分け: 0, 勝敗なし: 0 }),
    rec('R-013', { 申込日時: 'x', 種類: 'キック', '競技名・大会名': 'キックボクシング', 試合数: 0, 勝ち: 0, 負け: 0, 引き分け: 0 }),
  )));
  assert.equal(found.has('R-010'), false, '数が読めない行がある');
  assert.equal(found.has('R-011'), false, 'キックの勝ち負けの合計が試合数と合わない');
  assert.equal(found.has('R-012'), false, 'キックの1行が無い（未経験と読まない）');
  assert.deepEqual(found.get('R-013'), { v: 1, kick: { games: 0, win: 0, loss: 0, draw: 0 }, others: [], titles: [] }, '未経験（試合数0）は正しく読む');
});

test('records.csv: 読めなかった・付けなかった数を、取り込みの知らせのために数える（読めた分は、そのまま）', () => {
  const kick = (receipt: string, games: number, win: number, loss: number) => rec(receipt, { 申込日時: 'x', 種類: 'キック', '競技名・大会名': 'キックボクシング', 試合数: games, 勝ち: win, 負け: loss, 引き分け: 0 });
  assert.deepEqual(readRecordDetails(undefined), { details: new Map(), unreadable: false, skipped: 0 }, 'records.csv が無い：知らせは要らない');
  const wrongHead = readRecordDetails(bytesOf('受付番号,種類\r\nR-001,キック\r\n'));
  assert.equal(wrongHead.unreadable, true, '見出しが違う：読めなかった');
  assert.equal(wrongHead.details.size, 0);
  const ok = readRecordDetails(bytesOf(csvOf(kick('R-001', 3, 2, 1), kick('R-002', 2, 1, 0), kick('R-003', 1, 1, 0))));
  assert.equal(ok.unreadable, false);
  assert.deepEqual([...ok.details.keys()], ['R-001', 'R-003'], '合計が合わない R-002 だけ付けない');
  assert.equal(ok.skipped, 1, '付けなかった受付の数');
  assert.equal(readRecordDetails(bytesOf(csvOf(...detailRows))).skipped, 0, 'ぜんぶ読めたときは 0');
  assert.equal(recordDetailsFromCsv(bytesOf(csvOf(kick('R-001', 3, 2, 1)))).size, 1, 'recordDetailsFromCsv は、読めた分だけ返す（今までどおり）');
});

test('records.csv: 受付番号が名簿と一致しない行は、誰にも付かない。前後の空白は無視して付く', () => {
  const details = recordDetailsFromCsv(bytesOf(csvOf(...detailRows)));
  const plain = [fighter('ZZ-9'), fighter('R-002')];
  const same = recordDetailOnFighters(plain, details);
  assert.equal(same[0], plain[0], '一致しない人は、同じ物のまま');
  assert.equal(same[1], plain[1]);
  assert.equal(same.some((f) => 'recordDetail' in f), false);
  const padded = recordDetailOnFighters([fighter(' R-001 ')], details);
  assert.deepEqual(padded[0].recordDetail, detail);
});

test('records.csv の場所: 名簿と同じフォルダ・大文字小文字・Windows の区切りを見つける。ほかのフォルダのものは使わない', () => {
  assert.equal(isRecordsCsvName('records.csv'), true); assert.equal(isRecordsCsvName('選手名簿/RECORDS.CSV'), true);
  assert.equal(isRecordsCsvName('a/b/records.csv'), false); assert.equal(isRecordsCsvName('records.txt'), false); assert.equal(isRecordsCsvName('players.csv'), false);
  assert.equal(recordsCsvEntry([['players.csv', 'players.csv'], ['records.csv', 'records.csv']], 'players.csv'), 'records.csv');
  assert.equal(recordsCsvEntry([['A/players.csv', 'A/players.csv'], ['A/records.csv', 'A/records.csv'], ['B/records.csv', 'B/records.csv']], 'A/players.csv'), 'A/records.csv');
  assert.equal(recordsCsvEntry([['players.csv', 'players.csv'], ['A/records.csv', 'A/records.csv']], 'players.csv'), null, '名簿が外にあるときは、フォルダの中の records.csv を使わない');
  assert.equal(recordsCsvEntry([['A\\records.csv', 'A/records.csv']], 'A\\players.csv'), 'A\\records.csv', 'Windows の区切りも読む');
  assert.equal(recordsCsvEntry([['A/players.csv', 'A/players.csv']], 'A/players.csv'), null, 'records.csv が無いとき');
  assert.equal(RECORDS_CSV_MAX_BYTES, 5 * 1024 * 1024);
});

test('ZIPに records.csv が無いときも、今までどおり選手が読める（読みの結果は同じ）', () => {
  const players = '管理番号,選手名,ジム名,体重,戦績\nR-001,架空の選手A,テストジム,60,3勝1敗\nR-002,架空の選手B,テストジム,58,初試合\n';
  const zip = zipSync({ '架空大会/players.csv': strToU8(players) });
  const unpacked = unzipSync(zip);
  const entries = Object.keys(unpacked).map((raw) => [raw, zipEntryName(raw)] as const);
  const found = pickZipRoster(entries)!;
  assert.equal(found.csv, '架空大会/players.csv');
  assert.equal(recordsCsvEntry(entries, found.csv), null);
  const fighters = recordDetailOnFighters(importFighters(new TextDecoder().decode(unpacked[found.csv])).fighters, recordDetailsFromCsv(undefined));
  assert.deepEqual(fighters, importFighters(players).fighters);
  assert.equal(fighters.some((f) => 'recordDetail' in f), false);
});

test('ZIP（名簿と records.csv の両方）: 管理番号で選手に付き、戦績の一行（record）は変わらない', () => {
  const players = '管理番号,選手名,ジム名,体重,戦績\nR-001,架空の選手A,テストジム,60,3勝1敗\nR-002,架空の選手B,テストジム,58,初試合\n';
  const zip = zipSync({ '架空大会/players.csv': strToU8(players), '架空大会/records.csv': strToU8(csvOf(...detailRows)) });
  const unpacked = unzipSync(zip);
  const entries = Object.keys(unpacked).map((raw) => [raw, zipEntryName(raw)] as const);
  const found = pickZipRoster(entries)!;
  const recordsRaw = recordsCsvEntry(entries, found.csv);
  assert.equal(recordsRaw, '架空大会/records.csv');
  const fighters = recordDetailOnFighters(importFighters(new TextDecoder().decode(unpacked[found.csv])).fighters, recordDetailsFromCsv(unpacked[recordsRaw!]));
  assert.deepEqual(fighters[0].recordDetail, detail);
  assert.equal(fighters[0].record, '3勝1敗', '戦績の一行は、そのまま');
  assert.equal('recordDetail' in fighters[1], false, '付かなかった人には、何も付けない');
  assert.deepEqual(fighters[1], importFighters(players).fighters[1]);
});

test('古い選手（くわしい戦績が無い人）の表示に使う値は、今までと同じ', () => {
  const old = fighter('R-001', { record: '2勝1敗', weight: '60', gym: 'テストジム' });
  const [same] = recordDetailOnFighters([old], new Map());
  assert.equal(same, old, '同じ物のまま');
  assert.deepEqual(Object.keys(same).sort(), Object.keys(fighter('R-001')).sort(), '欄が増えない');
  assert.equal(same.name, '架空R-001'); assert.equal(same.record, '2勝1敗'); assert.equal(same.weight, '60'); assert.equal(same.gym, 'テストジム');
});

test('くわしい戦績の文: キックは必ず1行（未経験は「試合数 0」）。他の格闘技・タイトルは、あるものだけ。出すのは試合数と勝ち、引き分けはあるときだけ（負け・勝敗なしは出さない）', () => {
  const lines = recordDetailLines(detail);
  assert.equal(lines.kick, 'キックボクシング：試合数 4・勝ち 3');
  assert.deepEqual(lines.others, ['ムエタイ（他の格闘技）：試合数 2・勝ち 1']);
  assert.deepEqual(lines.titles, ['タイトル・入賞：架空カップ（2026年・ライト級）・優勝']);
  assert.deepEqual(recordDetailLines({ v: 1, kick: { games: 0, win: 0, loss: 0, draw: 0 }, others: [], titles: [] }), { kick: 'キックボクシング：未経験（試合数 0）', others: [], titles: [] });
  const drawn = recordDetailLines({ v: 1, kick: { games: 5, win: 3, loss: 1, draw: 1 }, others: [{ sport: '空手', games: 4, win: 1, loss: 0, draw: 2, noResult: 1 }], titles: [] });
  assert.equal(drawn.kick, 'キックボクシング：試合数 5・勝ち 3・引き分け 1', '引き分けがあれば出す（2026-10-25 owner）');
  assert.deepEqual(drawn.others, ['空手（他の格闘技）：試合数 4・勝ち 1・引き分け 2'], '勝敗なしは出さない');
});

test('保存して読み直しても、くわしい戦績が消えない（保存データの形・バックアップのどちらも）', async () => {
  const value = base({ fighters: [fighter('R-001', { recordDetail: detail }), fighter('R-002')] });
  assert.equal(isLocalTournament(value), true);
  const saved = preparePrivateEventSave(value, undefined, Date.now());
  const reread = structuredClone(saved) as LocalTournament;
  assert.equal(isLocalTournament(reread), true);
  assert.deepEqual(reread.fighters[0].recordDetail, detail);
  assert.equal('recordDetail' in reread.fighters[1], false);
  const password = 'テスト用の十文字以上のパスワード';
  const back = await decryptBackup(await encryptBackup(value, password), password);
  assert.deepEqual(back.fighters[0].recordDetail, detail);
});

test('古い保存の形（くわしい戦績の欄が無い）は、今までどおり読める。壊れた戦績は、読み込みで断る', () => {
  assert.equal(isLocalTournament(base()), true);
  const bad = { v: 1, kick: { games: 'x', win: 0, loss: 0, draw: 0 }, others: [], titles: [] } as unknown as RecordDetail;
  assert.equal(isLocalTournament(base({ fighters: [fighter('R-001', { recordDetail: bad })] })), false);
  assert.equal(isLocalTournament(base({ fighters: [fighter('R-001', { recordDetail: detail })] })), true);
});

test('進み具合だけのちがいか: くわしい戦績がちがうときは、「同じ」と言わない', () => {
  const a = base();
  const b = base({ fighters: [fighter('R-001', { recordDetail: detail }), fighter('R-002')] });
  assert.equal(sameExceptProgress(a, b), false);
  assert.equal(sameExceptProgress(b, { ...b, currentBout: 0, updatedAt: b.updatedAt + 3 }), true);
});

test('名簿の再取り込み: くわしい戦績が無い人には足し、ちがうときは「ちがい」に出し、書きかえは押したときだけ', () => {
  const other: RecordDetail = { v: 1, kick: { games: 1, win: 1, loss: 0, draw: 0 }, others: [], titles: [] };
  const fill = mergeKeepExisting([fighter('R-001')], [fighter('R-001', { recordDetail: detail })]);
  assert.equal(fill.recordsFilled, 1); assert.equal(fill.changed, true); assert.deepEqual(fill.merged[0].recordDetail, detail); assert.deepEqual(fill.differs, []);

  const clash = mergeKeepExisting([fighter('R-001', { recordDetail: detail })], [fighter('R-001', { recordDetail: other })]);
  assert.deepEqual(clash.merged[0].recordDetail, detail, '前の分のまま');
  assert.deepEqual(clash.differs[0].fields, [{ label: 'くわしい戦績', from: 'あり', to: '別の内容' }]);
  assert.deepEqual(clash.overwritten[0].recordDetail, other, '書きかえを選んだときだけ、ファイルの分');
  assert.equal(clash.recordsFilled, 0);

  const gone = mergeKeepExisting([fighter('R-001', { recordDetail: detail })], [fighter('R-001')]);
  assert.deepEqual(gone.overwritten[0].recordDetail, detail, 'ファイルに無い人は、前の分を消さない');
  assert.equal(gone.differs.length, 0);

  const same = mergeKeepExisting([fighter('R-001', { recordDetail: detail })], [fighter('R-001', { recordDetail: detail })]);
  assert.equal(same.changed, false); assert.equal(same.differs.length, 0);
});

test('画面: くわしい戦績は、戦績がある人の行だけに出る。折りたたみ（details）で、はみ出さない文字の決まり', () => {
  const page = readFileSync(new URL('../app/private/page.tsx', import.meta.url), 'utf8');
  const cards = readFileSync(new URL('../app/private/cards.tsx', import.meta.url), 'utf8');
  // 行の中（選手の名前・写真のある箱の下）。くわしい戦績が無い人には、何も出さない
  assert.match(page, /\{fighter\.recordDetail \? <RecordDetailFold detail=\{fighter\.recordDetail\} \/> : null\}/);
  // 折りたたみの中身（幅 320px でも、横にはみ出さない：長い文字は折り返す。固定の幅・改行禁止の指定を使わない）
  const start = cards.indexOf('export function RecordDetailFold');
  assert.ok(start > 0, '部品がある');
  const body = cards.slice(start, cards.indexOf('\n}', start) + 2);
  assert.match(body, /<summary[^>]*>くわしい戦績<\/summary>/);
  assert.match(body, /\[overflow-wrap:anywhere\]/);
  assert.match(body, /min-w-0/);
  assert.doesNotMatch(body, /whitespace-nowrap|w-\[|h-\[/);
  // 記録が読めた人だけ、読み込みの知らせに数を出す（画面の言い方は既存に合わせる）
  assert.match(page, /くわしい戦績が' \+ withRecords \+ '人分あります。/);
});

test('画面: ZIPの数え方は、records.csv も数と大きさに数える（上限を通りぬけさせない）。大きすぎるときは読まないだけ。名簿（players.csv）と写真の読みは変えない', () => {
  const page = readFileSync(new URL('../app/private/page.tsx', import.meta.url), 'utf8');
  const countAt = page.indexOf('fileCount++; unpackedBytes += entry.originalSize;');
  const recordsAt = page.indexOf('if (isRecordsCsvName(name)) {');
  assert.ok(countAt > 0 && recordsAt > 0, '数える所と、records.csv の決まり');
  assert.ok(countAt < recordsAt, 'records.csv を分ける前に、数と大きさに数える');
  assert.ok(page.indexOf("throw new ImportProblem('too-many-files')") < recordsAt && page.indexOf("unpackedBytes > 100 * 1024 * 1024") < recordsAt, '数の上限・大きさの上限の検査が、records.csv より先');
  assert.match(page, /return entry\.originalSize <= RECORDS_CSV_MAX_BYTES;/);
  // 大きすぎて読まなかった知らせは、名簿と同じフォルダの records.csv のときだけ（ほかのフォルダのものは、もともと使わない）
  assert.match(page, /if \(recordsCsvEntry\(bigRecords\.map\(\(name\) => \[name, name\] as const\), found\.csv\)\) recordsNotes\.push\('records\.csv が大きすぎる/);
  assert.match(page, /return isRosterCsvName\(name\) \|\| isPhotoName\(name\);/);
  assert.match(page, /const found = pickZipRoster\(entries\);/);
  assert.match(page, /recordDetailOnFighters\(tidied\.fighters, details\)/);
});

test('画面: 直す（この内容で直す）で、くわしい戦績を消さない', () => {
  const page = readFileSync(new URL('../app/private/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /\.\.\.\(original\.recordDetail \? \{ recordDetail: original\.recordDetail \} : \{\}\)/);
});
