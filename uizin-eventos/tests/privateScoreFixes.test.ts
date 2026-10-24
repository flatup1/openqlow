// 準備の画面（/private/）と試合当日の画面：採点（3-ux / 5-perf / 6-security / 7-code / 9-errors）で見つかった問題の直しを守るテスト
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sameFighterKey, type LocalBout, type LocalFighter } from '../core/privateTournament.ts';
import {
  boutPlaces, fighterOptionLabels, firstOtherBout, importErrorParts, isBlankFighterForm, isSafariBrowser, isSamplePassword, mapLimit, nextAction, OFFLINE_IMPORT,
  personBoutCounts, photosById, pickMarker, rosterOnlyFromZip, saveLine, type MarkerInput, type NextActionState, type PendingInput,
} from '../app/private/logic.ts';
import { shorten } from '../app/private/normalize.ts';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const src = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const fighter = (id: string, over: Partial<LocalFighter> = {}): LocalFighter => ({ id, gym: 'ジム' + id, name: '選手' + id, grade: '', age: '', height: '170', weight: '60', record: '初試合', comment: '', musicUrl: '', photoDataUrl: '', ...over });
const bout = (id: string, redId: string, blueId: string): LocalBout => ({ id, redId, blueId, className: '', rule: '' });

/* ───────── 3-ux：直している途中・追加する前の入力があるのに、黄色が「開く」を指していた ───────── */

const base: NextActionState = { titleReal: true, dateOk: true, fighters: 4, nonBlankBouts: 2, halfIndex: -1, dirty: false, everSaved: true, problems: 0, opened: false, saveState: 'idle', conflict: false };
const markerOf = (over: Partial<NextActionState> = {}, extra: Partial<MarkerInput> = {}) => {
  const state = { ...base, ...over };
  return pickMarker({ conflict: state.conflict, asking: false, chooseFirst: false, follow: null, na: nextAction(state), saveState: state.saveState, blankIndex: -1, halfIndex: state.halfIndex, halfSide: 'blue', fix: null, titleMissing: !state.titleReal, ...extra });
};
const EDIT: PendingInput = { kind: 'edit', id: 'F01' };
const MANUAL: PendingInput = { kind: 'manual' };

test('黄色：直している途中の内容があるときは、「開く」「保存」「開いたあと」より先に「この内容で直す」を指す', () => {
  for (const over of [{}, { dirty: true }, { everSaved: false }, { opened: true }, { problems: 1 }] as Array<Partial<NextActionState>>) {
    const m = markerOf(over, { pending: EDIT });
    assert.deepEqual([m.where, m.id, m.label], ['edit', 'F01', '「この内容で直す」を押す'], JSON.stringify(over));
    assert.equal(m.barLabel, '直している所へ行く');
  }
  // 空の試合カードが待っていても、先に直している途中の内容（開くと古い内容のまま開くため）
  assert.equal(markerOf({}, { pending: EDIT, blankIndex: 2 }).where, 'edit');
});

test('黄色：「1人ずつ入れる」に追加する前の入力があるときは、「この選手を追加」（いらないときは消す）を指す', () => {
  const m = markerOf({}, { pending: MANUAL });
  assert.deepEqual([m.where, m.label], ['manual', '「この選手を追加」を押す（いらないときは、入れた内容を消す）']);
  assert.equal(markerOf({ opened: true }, { pending: MANUAL }).where, 'manual');
  assert.equal(markerOf({ dirty: true }, { pending: MANUAL }).where, 'manual');
});

test('黄色：途中の入力があっても、前の手順・食いちがい・確認の箱・保存の失敗は、今までどおり先', () => {
  assert.equal(markerOf({ titleReal: false }, { pending: EDIT }).where, 'title');
  assert.equal(markerOf({ fighters: 0, nonBlankBouts: 0 }, { pending: MANUAL }).where, 'file');
  assert.equal(markerOf({ nonBlankBouts: 0 }, { pending: EDIT }).where, 'add-bout');
  assert.equal(markerOf({ halfIndex: 1, dirty: true }, { pending: EDIT }).where, 'bout');
  assert.equal(markerOf({ conflict: true }, { pending: EDIT }).where, 'conflict');
  assert.equal(markerOf({}, { pending: EDIT, asking: true }).where, 'none');
  assert.equal(markerOf({ saveState: 'failed', dirty: true }, { pending: EDIT }).where, 'bar-copy');
  assert.equal(markerOf({}, { pending: EDIT, follow: { kind: 'photo', id: 'F02' } }).where, 'photo');
});

test('黄色：途中の入力が無いときは、何も変わらない', () => {
  for (const over of [{}, { dirty: true }, { opened: true }, { problems: 1 }, { titleReal: false }, { nonBlankBouts: 0 }] as Array<Partial<NextActionState>>) {
    assert.deepEqual(markerOf(over, { pending: null }), markerOf(over), JSON.stringify(over));
  }
  assert.deepEqual([markerOf({ opened: true }).where, markerOf({ opened: true }).label], ['bar', '当日は、開いた画面で試合を進める']);
});

test('状態ライン：直している途中のときは「追加」と言わない', () => {
  const s = { conflict: false, saveState: 'idle' as const, dirty: false, everSaved: true, savedClock: '14:03' };
  assert.equal(saveLine({ ...s, pending: 'edit' }).text, '● 未保存（直している途中の内容が、まだ入っていません）');
  assert.equal(saveLine({ ...s, pending: 'manual' }).text, '● 未保存（選手の入力が、まだ追加されていません）');
  assert.equal(saveLine({ ...s, pending: true }).text, '● 未保存（選手の入力が、まだ追加されていません）', '前の呼び方（true）も同じ');
  assert.equal(saveLine({ ...s, pending: false }).text, '✓ 保存済み 14:03');
  assert.equal(saveLine({ ...s, pending: 'edit', dirty: true }).text, '● 未保存（入れた内容は、まだ保存していません）', '未保存の変更があるときは、今までの文');
});

test('画面：途中の入力があるうちは、試合当日の画面も一覧表も開かない。その場所へ移り、先に押すボタンを言う', () => {
  const page = src('app/private/page.tsx');
  const open = page.slice(page.indexOf('async function openLive()'), page.indexOf('/** A3の対戦一覧表を'));
  const sheet = page.slice(page.indexOf('async function openSheet()'), page.indexOf('/** この大会を、このパソコンから消す'));
  assert.match(open, /if \(stopForPending\(\)\) return;/);
  assert.ok(open.indexOf('stopForPending()') < open.indexOf("window.open('', '_blank')"), '新しい画面を開く前に止める');
  assert.match(sheet, /if \(stopForPending\(\)\) return;/);
  assert.ok(sheet.indexOf('stopForPending()') < sheet.indexOf("window.open('', '_blank')"));
  assert.match(page, /先に「この内容で直す」を押します（直している途中の内容が、まだ入っていません）。/);
  assert.match(page, /先に「この選手を追加」を押します（いらないときは、入れた内容を消します）。/);
  // 黄色の枠は「この内容で直す」と「この選手を追加」のボタンに付く。下の帯のボタンは、そこへ行く
  assert.match(page, /<NextSlot active=\{here === 'edit' && marker\.id === fighter\.id\} label=\{marker\.label\}>\s*<button id=\{'edit-apply-' \+ fighter\.id\}/);
  assert.match(page, /<NextSlot active=\{here === 'manual'\} label=\{marker\.label\}[^>]*>\s*<button id="manual-add"/);
  assert.match(page, /case 'edit': goEdit\(\); return;/); assert.match(page, /case 'manual': goManual\(\); return;/);
  assert.match(page, /pickMarker\(\{[\s\S]{0,600}pending,\s*\}\)/, '黄色を決めるときに、途中の入力を渡す');
  assert.match(page, /pending: pending\?\.kind \?\? false/, '状態ラインにも、どちらの途中かを渡す');
});

/* ───────── 7-code：「手入力の欄に何か入れてあるか」は1つの関数。クラス・区分・階級も見る ───────── */

test('手入力の欄：クラス・区分・階級だけを選んでも「入力あり」。画面は logic.ts の1つの関数を使う', () => {
  const blank = fighter('X', { gym: '', name: '', height: '', weight: '', record: '' });
  assert.equal(isBlankFighterForm(blank), true);
  assert.equal(isBlankFighterForm({ ...blank, fighterClass: 'Aクラス' }), false);
  assert.equal(isBlankFighterForm({ ...blank, division: '中学生男子' }), false);
  assert.equal(isBlankFighterForm({ ...blank, weightClass: '45kg以下' }), false);
  assert.equal(isBlankFighterForm({ ...blank, fighterClass: ' ', division: '', weightClass: '' }), true, '空白だけは空');
  const page = src('app/private/page.tsx');
  assert.ok(!page.includes('isBlankFighterFormLocal'), '画面の中の写しは消した');
  assert.match(page, /const manualDirty = !isBlankFighterForm\(manual\);/);
});

/* ───────── 5-perf：試合カードの選択肢・注意の数え直し ───────── */

/** 前の BoutCard の中の計算（そのままの写し）。カードごとに、名簿全員の文字・ほかの試合・同じ人の試合数を作っていた */
const oldLabel = (fighters: LocalFighter[], f: LocalFighter): string => {
  const kg = (v: string) => v.trim() ? v.trim().replace(/kg$/i, '') + 'kg' : '体重未入力';
  const baseLabel = (x: LocalFighter) => `${x.fighterClass ? x.fighterClass + ' ' : ''}${kg(x.weight)} ${x.name}${x.gym.trim() ? '（' + x.gym.trim() + '）' : ''}`;
  const labelKey = (x: LocalFighter) => baseLabel(x).normalize('NFKC').replace(/\s+/g, '');
  const labelCount = new Map<string, number>();
  for (const x of fighters) labelCount.set(labelKey(x), (labelCount.get(labelKey(x)) ?? 0) + 1);
  const twin = (labelCount.get(labelKey(f)) ?? 0) > 1 ? `（番号 ${shorten(f.id, 10)}）` : '';
  return baseLabel(f) + twin + (f.absent === true ? '（欠場）' : '');
};
const oldElsewhere = (bouts: LocalBout[], index: number): Map<string, number> => {
  const elsewhere = new Map<string, number>();
  bouts.forEach((other, at) => { if (at === index) return; for (const id of [other.redId, other.blueId]) if (id && !elsewhere.has(id)) elsewhere.set(id, at); });
  return elsewhere;
};
const oldPersonBouts = (fighters: LocalFighter[], bouts: LocalBout[], f: LocalFighter): number => {
  const byId = new Map(fighters.map((x) => [x.id, x]));
  const key = sameFighterKey(f);
  return bouts.filter((other) => [other.redId, other.blueId].some((id) => {
    if (!id) return false;
    if (id === f.id) return true;
    const person = key ? byId.get(id) : undefined;
    return !!person && sameFighterKey(person) === key;
  })).length;
};
let seed = 11;
const rnd = (): number => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = <T,>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)];
const randomEvent = () => {
  const fighters = Array.from({ length: 3 + Math.floor(rnd() * 25) }, (_, i) => fighter('F' + i, {
    gym: pick(['Aジム', 'Ａジム', ' Aジム ', 'Bジム', '']), name: pick(['山田 太郎', '山田　太郎', '佐藤', '', '鈴木']), weight: pick(['60', '６０', '61kg', '', '六十']),
    ...(rnd() < 0.3 ? { fighterClass: pick(['Aクラス', 'Ａクラス', 'Bクラス']) } : {}), ...(rnd() < 0.2 ? { absent: true } : {}),
  }));
  const ids = [...fighters.map((f) => f.id), '', '', 'NOPE'];
  const bouts = Array.from({ length: 1 + Math.floor(rnd() * 12) }, (_, i) => { const red = pick(ids); return bout('b' + i, red, rnd() < 0.15 ? red : pick(ids)); });
  return { fighters, bouts };
};

test('試合カードの選択肢：1回だけ作る文字・試合の表・人数の表は、前のカードごとの計算と同じ答え（ばらばらの名簿 300 とおり）', () => {
  const kg = (v: string) => v.trim() ? v.trim().replace(/kg$/i, '') + 'kg' : '体重未入力';
  const base = (x: LocalFighter) => `${x.fighterClass ? x.fighterClass + ' ' : ''}${kg(x.weight)} ${x.name}${x.gym.trim() ? '（' + x.gym.trim() + '）' : ''}`;
  for (let round = 0; round < 300; round++) {
    const { fighters, bouts } = randomEvent();
    const labels = fighterOptionLabels(fighters, base);
    for (const f of fighters) assert.equal(labels.get(f.id), oldLabel(fighters, f), 'round ' + round + ' ' + f.id);
    const places = boutPlaces(bouts);
    for (let index = 0; index < bouts.length; index++) {
      const elsewhere = oldElsewhere(bouts, index);
      for (const f of fighters) assert.equal(firstOtherBout(places, f.id, index), elsewhere.get(f.id), 'round ' + round + ' bout ' + index + ' ' + f.id);
    }
    const placed = new Map<string, number>();
    for (const b of bouts) new Set([b.redId, b.blueId].filter(Boolean)).forEach((id) => placed.set(id, (placed.get(id) ?? 0) + 1));
    for (const [id, count] of placed) assert.equal(places.get(id)?.length, count, '試合の数（前の placed と同じ）');
    const counts = personBoutCounts(fighters, bouts);
    for (const f of fighters) assert.equal(counts.get(f.id), oldPersonBouts(fighters, bouts, f), 'round ' + round + ' person ' + f.id);
  }
});

test('試合カード：選択肢の文字・試合の表は、画面が1回だけ作って渡す（カードごとに名簿全員を数え直さない）。注意の数は、赤・青か名簿が変わったときだけ数える', () => {
  const cards = src('app/private/cards.tsx'), page = src('app/private/page.tsx');
  const card = cards.slice(cards.indexOf('export const BoutCard = memo('), cards.indexOf('export const fieldLabel'));
  assert.ok(card.length > 1000);
  assert.ok(!/labelCount|labelKey|baseLabel\(/.test(card), 'カードの中で、名簿全員の文字を作り直さない');
  assert.ok(!/bouts\.(forEach|filter)\(/.test(card), 'カードの中で、全部の試合を見まわさない');
  assert.match(card, /const options = useMemo\(\(\) => \{[\s\S]*\}, \[groups, labels, places, index, bout\.redId, bout\.blueId\]\);/, '選択肢は、関係のある値が変わったときだけ作り直す');
  assert.match(page, /const labels = useMemo\(\(\) => optionLabels\(data\.fighters\), \[data\.fighters\]\);/);
  assert.match(page, /const places = useMemo\(\(\) => \{\s*const map = boutPlaces\(data\.bouts\);/);
  assert.match(page, /const personCount = useMemo\(\(\) => \{\s*const map = personBoutCounts\(data\.fighters, data\.bouts\);/);
  assert.match(page, /labels=\{labels\} places=\{places\} personCount=\{personCount\}/);
  assert.match(page, /nextLabel=\{marked \? marker\.label : ''\}/, '黄色の札の文は、そのカードにだけ渡す');
  assert.match(page, /targetId=\{target !== null && target\.startsWith\('bout-' \+ index \+ '-'\) \? target : null\}/, '太い枠も、そのカードにだけ渡す');
  // 注意の数：描くたびに数えない
  // 全部の試合の注意を、まとめて1回で作る（core の boutWarningsAll。答えは boutWarnings と同じ：dataScoreFixes.test.ts で比べる）
  assert.match(page, /const boutWarnN = useMemo\(\(\) => boutWarningsAll\(data\.fighters, boutsRef\.current\)\.map\(\(warnings\) => warnings\.length\), \[data\.fighters, pairKey\]\);/);
  assert.match(page, /const pairKey = data\.bouts\.map\(\(bout\) => bout\.redId \+ '\\u0000' \+ bout\.blueId\)/);
  const render = page.slice(page.indexOf('/* ───── 計算 ───── */'));
  assert.ok(!render.includes('boutWarnings('), '描くたびに通る所では、boutWarnings を呼ばない');
});

/* ───────── 5-perf：名簿ZIPの写真は、多くても4枚ずつ。名前→写真の表は1回だけ。読めなかった枚数を知らせる ───────── */

test('mapLimit：並びを変えず、いちどに動くのは多くても limit 個', async () => {
  let running = 0, most = 0;
  const out = await mapLimit(Array.from({ length: 23 }, (_, i) => i), 4, async (n, i) => {
    running++; most = Math.max(most, running);
    await new Promise((resolve) => setTimeout(resolve, (n * 7) % 5));
    running--;
    return n * 10 + (i === n ? 0 : 1000);
  });
  assert.deepEqual(out, Array.from({ length: 23 }, (_, i) => i * 10));
  assert.ok(most <= 4, 'いちどに ' + most + ' 個');
  assert.ok(most >= 2, '1つずつ待たずに、少しずつ並べて動く');
  assert.deepEqual(await mapLimit([], 4, async (n: number) => n), []);
});

test('photosById：管理番号 → 写真の表。同じ番号が2つあるときは、先のもの（前の探し方と同じ）', () => {
  const map = photosById({ 'photos/R-001.jpg': 1, 'photos/R-002.png': 2, 'photos/R-001.webp': 3, 'photos/a.b.jpg': 4 });
  assert.deepEqual(map.get('R-001'), ['photos/R-001.jpg', 1]);
  assert.deepEqual(map.get('R-002'), ['photos/R-002.png', 2]);
  assert.deepEqual(map.get('a.b'), ['photos/a.b.jpg', 4], '最後の . のうしろだけを、種類として外す');
  assert.equal(map.size, 3);
  const page = src('app/private/page.tsx');
  assert.ok(!page.includes('Object.entries(photos).find('), '選手ごとに、全部の写真を探し直さない');
  assert.ok(!/await Promise\.all\(recordDetailOnFighters/.test(page), '写真を全部いっしょに読みはじめない');
  assert.match(page, /await mapLimit\(recordDetailOnFighters\(tidied\.fighters, details\), 4,/);
  assert.match(page, /catch \{ badPhotos\+\+; return fighter; \}/);
  assert.match(page, /読めなかった写真が\{importNote\.badPhotos\}枚あります/);
});

/* ───────── 3-ux：ZIPの中の players.csv だけを選んだとき ───────── */

test('players.csv だけを選んだように見えるときは、「写真は、あとでOK」と言わず、ZIPを選び直すと写真と戦績が入ると言う', () => {
  assert.equal(rosterOnlyFromZip('players.csv', '選手名\nA'), true);
  assert.equal(rosterOnlyFromZip('PLAYERS.CSV', '選手名\nA'), true, '大文字・小文字は気にしない');
  assert.equal(rosterOnlyFromZip('名簿.csv', '﻿"管理番号","ジム名","選手名"\n"R-1","A","B"'), true, '見出しに管理番号（④や、他のジムのZIPの名簿と同じ形）');
  assert.equal(rosterOnlyFromZip('名簿.csv', '選手名,ジム名\nA,B'), false, '自分で作った名簿（管理番号なし）は、今までどおり');
  assert.equal(rosterOnlyFromZip('名簿.csv', '選手名\nA,管理番号'), false, '1行目だけを見る');
  const page = src('app/private/page.tsx');
  assert.match(page, /zipHint: kind === 'csv' && rosterOnlyFromZip\(file\.name, csv\) \? true : undefined/);
  assert.match(page, /ZIPの中の players\.csv だけを選んだようです。写真とくわしい戦績は入っていません。シートの④で作ったZIPを、開かずに、もう一度選ぶと入ります（前からいる人は変わりません）。/);
  assert.match(page, /\{importNote\.zipHint \? <>写真がない選手：\{importNote\.noPhoto\}人<\/> : <>写真がない選手：\{importNote\.noPhoto\}人（写真は、あとでOKです）<\/>\}/);
});

/* ───────── 9-errors：電波が無いだけなのに「開き直して（F5）」と言っていた ───────── */

test('読み込み部品が開けないとき：ネットが切れていれば「開き直さないで、つながってから選び直す」。つながっていれば今までどおり', () => {
  const chunk = new Error('Failed to fetch dynamically imported module: https://x/_next/static/chunks/a.js');
  const offline = importErrorParts(chunk, 'a.zip', [], true);
  assert.deepEqual([offline.head, offline.detail], [OFFLINE_IMPORT.head, OFFLINE_IMPORT.detail]);
  assert.equal(offline.head, 'ネットにつながっていません');
  assert.match(offline.detail, /^つながってから、もう一度ファイルを選びます（開き直さないでください。/);
  assert.ok(!offline.detail.includes('F5'));
  assert.equal(importErrorParts(chunk, 'a.zip', [], false).head, 'この画面が古くなっています', 'つながっているときは、今までどおり');
  assert.equal(importErrorParts(new Error('Invalid zip data'), 'a.zip', [], true).head, '「a.zip」はこわれているようです。別のファイルを選びます', 'ほかのまちがいは、ネットに関係なく今までどおり');
  const page = src('app/private/page.tsx');
  assert.match(page, /const offline = importProblemKind\(error\) === 'stale' && typeof navigator !== 'undefined' && navigator\.onLine === false;/);
  assert.match(page, /const stale = importProblemKind\(error\) === 'stale' && !offline;/);
  assert.match(page, /setFollow\(stale \? \{ kind: 'reload' \} : \{ kind: 'refile', file: fileKind \|\| undefined \}\);/, 'ネットが切れているときの黄色は「ファイルを選び直す」');
  assert.match(page, /\{importNote\.stale \? <NextSlot active=\{here === 'reload'\}/, '「開き直す」のボタンは、ネットがあるときだけ');
});

/* ───────── 9-errors：ブラウザの中の保存が消されないように頼む・Safari の7日の決まり ───────── */

test('保存：はじめて保存できたとき、1回だけ「消さないで」と頼む（答えは見ない・止めない）。Safari には7日の注意', () => {
  const page = src('app/private/page.tsx');
  const ask = page.slice(page.indexOf('const askKeepStorage = () => {'), page.indexOf('const save = (source'));
  assert.match(ask, /if \(persistAskedRef\.current\) return;\s*persistAskedRef\.current = true;/);
  assert.match(ask, /storage\?\.persisted\?\.\(\)/); assert.match(ask, /storage\?\.persist\?\.\(\)/);
  assert.match(ask, /\.catch\(\(\) => undefined\)/); assert.match(ask, /try \{[\s\S]*\} catch \{/);
  const run = page.slice(page.indexOf('const runSave = async'), page.indexOf('/** 別の画面で保存された内容を、いまの画面にする */'));
  assert.ok(run.indexOf('askKeepStorage();') > run.indexOf('await commit(base, source)'), '保存できたあとに頼む');
  assert.equal(isSafariBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'), true);
  assert.equal(isSafariBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'), true);
  assert.equal(isSafariBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'), false, 'Chrome');
  assert.equal(isSafariBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0'), false, 'Edge');
  assert.equal(isSafariBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1'), false, 'iPhone の Chrome');
  assert.equal(isSafariBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0'), false, 'Firefox');
  assert.match(page, /\{safari \? <span className="mt-1 block">Safariは、この画面を7日ほど開かないと、保存を消すことがあります。コピーのファイルを作っておくか、Chromeを使います。<\/span> : null\}/);
});

/* ───────── 9-errors：コピーのファイル。保存できたか分からないのに「保存しました」と言っていた ───────── */

test('コピーのファイル：「保存を始めました。ダウンロードの中に…があるか、見ます」。消す前に、ファイルを見たと✔する', () => {
  const page = src('app/private/page.tsx');
  assert.match(page, /'保存を始めました。ダウンロードの中に「' \+ name \+ '」があるか、見ます。'/);
  assert.ok(!page.includes("'ファイルを保存しました：'"), '分からないのに「保存しました」と言わない');
  // 消す確認の箱：✔するまで、消さない
  assert.match(page, /<input id="copy-seen" type="checkbox" checked=\{copySeen\}/);
  assert.match(page, /ダウンロードの中に「\{backupFileName\(data\.eventId, data\.date\)\}」があるのを見た/);
  const yes = page.slice(page.indexOf("if (ask.kind === 'delete-event') {"), page.indexOf("if (ask.kind === 'move')"));
  assert.match(yes, /if \(!copySeen\) \{ setCopySeenErr\(true\); document\.getElementById\('copy-seen'\)\?\.focus\(\); return; \}/);
  assert.ok(yes.indexOf('if (!copySeen)') < yes.indexOf('removeThisEvent()'), '✔を見てから消す');
  assert.match(page, /setCopySeen\(false\); setCopySeenErr\(false\); setAsk\(\{ kind: 'delete-event'/, '箱を開くたびに、✔は外れた所から');
  // 前の決まり（押せる条件・箱の言葉）は、そのまま
  assert.match(page, /const deleteReady = everSaved && !dirty && backupAt > 0 && !backupStale;/);
  assert.match(page, /dangerLabel="この大会を、このパソコンから消す"/);
});

/* ───────── 6-security：見本のパスワードのままでは、コピーを作らない ───────── */

test('見本のパスワード（hanabi2027x）のままでは、新しいコピーを作らない。戻すときは止めない', () => {
  for (const pw of ['hanabi2027x', 'HANABI2027X', ' ｈａｎａｂｉ２０２７ｘ ', 'Hanabi2027x']) assert.equal(isSamplePassword(pw), true, pw);
  for (const pw of ['hanabi2027x-fake', 'hanabi2027', 'sakura-haru-2027', '']) assert.equal(isSamplePassword(pw), false, pw);
  const page = src('app/private/page.tsx');
  assert.match(page, /isSamplePassword\(pwNorm\) \? '見本のままです。自分の言葉に変えてください'/);
  const restore = page.slice(page.indexOf('const restore = async (file?: File)'), page.indexOf('/** 確認の箱の「今の内容を消して、コピーに戻す」を押したあと'));
  assert.ok(!restore.includes('isSamplePassword') && !restore.includes('passwordProblem'), '戻すときは、見本のパスワードでも戻せる（前に作ったコピー）');
});

/* ───────── 5-perf：「変わりました」の知らせに保存の番号があり、それが持っているデータと同じなら、読み直さない ───────── */

test('知らせの保存の番号（updatedAt）が、いま持っているデータと同じなら、読み直さない（番号が無い知らせは、今までどおり読み直す）', () => {
  const live = src('app/private/live/page.tsx');
  assert.match(live, /watchPrivateEvent\(eventId,\(updatedAt\?:number\)=>\{ if\(typeof updatedAt==='number'&&updatedAt===seenAtRef\.current\)return; load\(true\); \}\)/);
  assert.match(live, /seenAtRef\.current=value\?value\.updatedAt:null;/);
  assert.match(live, /const saved=await writePrivateEvent\(next\);curRef\.current=saved\.currentBout;setData\(saved\);seenAtRef\.current=saved\.updatedAt;/);
  const page = src('app/private/page.tsx');
  assert.match(page, /watchPrivateEvent\(eventId, \(updatedAt\?: number\) => \{\s*(?:\/\/[^\n]*\n\s*)*if \(typeof updatedAt === 'number' && updatedAt === savedRef\.current\?\.updatedAt\) return;/);
});
