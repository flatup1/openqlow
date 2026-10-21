import assert from 'node:assert/strict';
import test from 'node:test';
import { A3_MM, DEFAULT_SHOW, PER_PAGE, ROW_GAP_MM, buildSheet, clampPerPage, columnsOf, fitCenter, fitNameMm, fitSide, fitTitleMm, sideHeightMm, textWidthEm, pageCount, paginate, pagesIfTarget, parseSheetOptions, parseSheetPrefs, perPageForPages, perPageLimit, rangeText, resolvePerPage, rowsOf, sheetBouts, sheetMetrics, sheetNotes, sheetSide, suggestPerPage, type SheetBout } from '../core/boutSheet.ts';
import { emptyTournament, isLocalTournament, mergeFighters, type LocalBout, type LocalFighter, type LocalTournament } from '../core/privateTournament.ts';
import { mergeKeepExisting, restoreConfirmText, sameExceptProgress } from '../app/private/logic.ts';
import { buildRow, nowModel, summarizeMusic } from '../app/private/live/listLogic.ts';

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
const fighter = (id: string, over: Partial<LocalFighter> = {}): LocalFighter => ({ id, gym: '架空ジム' + id, name: '架空' + id, grade: '中1', age: '13', height: '150', weight: '45', record: '2勝1敗', comment: 'がんばります', musicUrl: '', photoDataUrl: PHOTO, ...over });
const bout = (id: string, redId: string, blueId: string, over: Partial<LocalBout> = {}): LocalBout => ({ id, redId, blueId, className: '', rule: '', ...over });
/** 試合 n 個。選手は 2n 人（r1,b1,r2,b2…） */
function tournament(n: number, over: Partial<LocalTournament> = {}): LocalTournament {
  const fighters: LocalFighter[] = [], bouts: LocalBout[] = [];
  for (let i = 1; i <= n; i++) { fighters.push(fighter('r' + i), fighter('b' + i)); bouts.push(bout('m' + i, 'r' + i, 'b' + i)); }
  return { ...emptyTournament('sheet-test'), title: '千葉県キックボクシング協会アマチュア大会', fighters, bouts, ...over };
}

test('試合番号の言い方：1つなら「第3試合」、いくつかなら「第1〜8試合」', () => {
  assert.equal(rangeText(3, 3), '第3試合');
  assert.equal(rangeText(1, 8), '第1〜8試合');
});

test('A3の寸法と、向きごとの段の数（縦は1列、横は2列で、左の列を先に埋める）', () => {
  assert.deepEqual(A3_MM, { short: 297, long: 420 });
  assert.equal(columnsOf('portrait'), 1); assert.equal(columnsOf('landscape'), 2);
  assert.equal(rowsOf(8, 'portrait'), 8); assert.equal(rowsOf(9, 'landscape'), 5);
});

test('1ページの試合数：範囲に収める。数でないときは自動の下限', () => {
  assert.equal(clampPerPage(0, 'portrait'), PER_PAGE.portrait.min);
  assert.equal(clampPerPage(99, 'portrait'), PER_PAGE.portrait.max);
  assert.equal(clampPerPage(7.9, 'portrait'), 7);
  assert.equal(clampPerPage('x', 'portrait'), PER_PAGE.portrait.auto[0]);
  assert.equal(clampPerPage(NaN, 'landscape'), PER_PAGE.landscape.auto[0]);
  assert.equal(clampPerPage(1, 'landscape'), PER_PAGE.landscape.min, '横は2列なので、最低2試合');
});

test('ページ数：A3を4枚に合わせたいとき、試合数÷4。小さい大会は下限、大きい大会は上限', () => {
  assert.equal(pageCount(0, 5), 0);
  assert.equal(pageCount(10, 4), 3);
  assert.equal(pageCount(8, 4), 2);
  assert.equal(suggestPerPage(30, 'portrait'), 8, '30試合 → 4枚 → 8試合');
  assert.equal(suggestPerPage(3, 'portrait'), 4, '小さい大会は、1ページの下限（4）');
  assert.equal(suggestPerPage(100, 'portrait'), 12, '大きい大会は、上限（12）。ページ数は4をこえる');
  assert.equal(pageCount(100, suggestPerPage(100, 'portrait')), 9);
  assert.equal(suggestPerPage(30, 'landscape'), 8);
  assert.equal(perPageForPages(30, 3, 'portrait'), 10);
  assert.equal(perPageForPages(30, 4, 'portrait'), 8);
  assert.equal(perPageForPages(0, 4, 'portrait'), 1);
  assert.equal(pageCount(30, perPageForPages(30, 3, 'portrait')), 3);
});

test('ページ分け：試合順のまま、1試合は1ページの中だけ。各ページに範囲・ページ番号・全ページ数', () => {
  const bouts = sheetBouts(tournament(10), DEFAULT_SHOW);
  const pages = paginate(bouts, 4);
  assert.deepEqual(pages.map((p) => [p.number, p.total, p.from, p.to, p.range, p.bouts.length]), [[1, 3, 1, 4, '第1〜4試合', 4], [2, 3, 5, 8, '第5〜8試合', 4], [3, 3, 9, 10, '第9〜10試合', 2]]);
  const flat = pages.flatMap((p) => p.bouts.map((b) => b.number));
  assert.deepEqual(flat, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], '抜けも、重なりもない');
  for (const page of pages) assert.ok(page.bouts.length <= 4, '1ページの試合数をこえない');
  assert.deepEqual(paginate([], 4), [], '試合が0なら、ページなし');
  assert.equal(paginate(bouts.slice(0, 1), 4)[0].range, '第1試合');
  assert.equal(paginate(bouts, 0).length, 10, '0以下は1として扱う（止まらない）');
});

test('個人情報は通さない：電話・生年月日・健康・同意・メール・年齢・身長・体重・戦績・意気込みは、一覧表のデータに入らない', () => {
  const secret = fighter('r1', { name: '山田', gym: '架空ジム', comment: '090-1111-2222 に電話ください', record: '3勝0敗', age: '15', height: '171', weight: '61.5' }) as LocalFighter & Record<string, unknown>;
  secret.phone = '09011112222'; secret.contactPhone = '09033334444'; secret.contactEmail = 'taro@example.com'; secret.birthday = '2011-02-03'; secret.health = '持病あり'; secret.consent = 'yes'; secret.consentAt = '2026-10-01T00:00:00Z'; secret.guardian = '保護者名';
  const data = { ...tournament(1), fighters: [secret, fighter('b1')] };
  const json = JSON.stringify(buildSheet(data, { perPage: 4, orientation: 'portrait', show: { photo: true, gym: true, classLine: true, rule: true } }));
  for (const word of ['09011112222', '09033334444', 'taro@example.com', '2011-02-03', '持病', 'consent', '保護者名', '090-1111-2222', '3勝0敗', '171', '61.5', '中1']) assert.ok(!json.includes(word), word + ' が一覧表に入っています');
  assert.deepEqual(Object.keys(sheetSide(secret, DEFAULT_SHOW)).sort(), ['gym', 'name', 'photo', 'state', 'tag'], '載せてよい項目だけ');
  assert.deepEqual(Object.keys(sheetBouts(data, DEFAULT_SHOW)[0]).sort(), ['blue', 'classLine', 'label', 'number', 'red', 'rule'].sort());
});

test('載せる項目：写真・所属ジム・クラス/階級・ルールは、会長が決める。氏名はいつも載る', () => {
  const f = fighter('r1', { fighterClass: 'Aクラス', division: '中学生男子', weightClass: '37kg以下' });
  const all = sheetSide(f, DEFAULT_SHOW);
  assert.deepEqual(all, { state: 'ok', name: '架空r1', gym: '架空ジムr1', photo: PHOTO, tag: 'Aクラス　中学生男子・37kg以下' });
  const none = sheetSide(f, { photo: false, gym: false, classLine: false, rule: false });
  assert.deepEqual(none, { state: 'ok', name: '架空r1', gym: '', photo: '', tag: '' }, '氏名だけは残る');
  const data = tournament(1); data.bouts[0] = bout('m1', 'r1', 'b1', { className: '60kg', rule: '首相撲あり' });
  assert.equal(sheetBouts(data, DEFAULT_SHOW)[0].classLine, '60kg');
  assert.equal(sheetBouts(data, DEFAULT_SHOW)[0].rule, '', 'ルールは、はじめは載せない');
  assert.equal(sheetBouts(data, { ...DEFAULT_SHOW, rule: true })[0].rule, '首相撲あり');
  assert.equal(sheetBouts(data, { ...DEFAULT_SHOW, classLine: false })[0].classLine, '');
});

test('写真がなくても、文字だけで出せる。欠場の人は写真を出さず「欠場」。選手が決まっていない側は「未定」', () => {
  assert.equal(sheetSide(fighter('r1', { photoDataUrl: '' }), DEFAULT_SHOW).photo, '');
  assert.equal(sheetSide(fighter('r1', { photoDataUrl: '' }), DEFAULT_SHOW).name, '架空r1');
  const absent = sheetSide(fighter('r1', { absent: true }), DEFAULT_SHOW);
  assert.deepEqual([absent.state, absent.photo, absent.name], ['absent', '', '架空r1']);
  assert.deepEqual(sheetSide(undefined, DEFAULT_SHOW), { state: 'empty', name: '', gym: '', photo: '', tag: '' });
  assert.equal(sheetSide(fighter('r1', { name: '   ' }), DEFAULT_SHOW).name, '名前未入力', '空の名前は、ほかの画面と同じ言葉');
  const data = tournament(2); data.bouts[1] = bout('m2', '', 'b2');
  const [first, second] = sheetBouts(data, DEFAULT_SHOW);
  assert.equal(first.red.state, 'ok'); assert.equal(second.red.state, 'empty'); assert.equal(second.blue.state, 'ok');
});

test('印刷の前の確かめごと：未定・欠場・名前なし・同じ人・2試合に入る人・写真なしの人数', () => {
  const data = tournament(5);
  data.bouts[1] = bout('m2', '', 'b2');
  data.fighters[4] = fighter('r3', { absent: true, photoDataUrl: '' });
  data.fighters[6] = fighter('r4', { name: '' });
  data.bouts[4] = bout('m5', 'r5', 'r5');
  data.bouts.push(bout('m6', 'r1', 'b3'));
  data.fighters[8] = fighter('r5', { photoDataUrl: '' });
  const notes = sheetNotes(data);
  assert.deepEqual(notes.empty, [2]);
  assert.deepEqual(notes.absent, [3]);
  assert.deepEqual(notes.noName, [4]);
  assert.deepEqual(notes.same, [5]);
  assert.deepEqual(notes.twice.sort(), ['架空b3', '架空r1', '架空r5'].sort());
  assert.equal(notes.noPhoto, 1, '欠場の人の写真なしは、数えない');
});

test('buildSheet：大会名（空なら名前未設定）・ロゴ・ページ。向きを横にすると、1ページの下限が変わる', () => {
  const data = tournament(12);
  const sheet = buildSheet(data, { perPage: 4, orientation: 'portrait', show: DEFAULT_SHOW });
  assert.equal(sheet.title, '千葉県キックボクシング協会アマチュア大会'); assert.equal(sheet.logo, false); assert.equal(sheet.totalBouts, 12);
  assert.deepEqual(sheet.pages.map((p) => p.range), ['第1〜4試合', '第5〜8試合', '第9〜12試合']);
  assert.equal(buildSheet({ ...data, title: '  ' }, { perPage: 4, orientation: 'portrait', show: DEFAULT_SHOW }).title, '大会名未設定');
  assert.equal(buildSheet({ ...data, entryConfig: { music: false, grade: 'required', age: 'required', comment: 'required', logo: true } as never }, { perPage: 4, orientation: 'portrait', show: DEFAULT_SHOW }).logo, true);
  assert.equal(buildSheet(data, { perPage: 1, orientation: 'landscape', show: DEFAULT_SHOW }).pages[0].bouts.length, 2, '横は、最低2試合');
  assert.equal(buildSheet(tournament(0), { perPage: 4, orientation: 'portrait', show: DEFAULT_SHOW }).pages.length, 0);
});


test('設定の読み戻し：壊れた文字・変な値は、自動の値にする。保存した値は、範囲に収めて読む', () => {
  assert.deepEqual(parseSheetOptions(null, 30), { perPage: 8, orientation: 'portrait', show: DEFAULT_SHOW });
  assert.deepEqual(parseSheetOptions('{oops', 30), { perPage: 8, orientation: 'portrait', show: DEFAULT_SHOW });
  assert.deepEqual(parseSheetOptions('"x"', 30).show, DEFAULT_SHOW);
  assert.deepEqual(parseSheetOptions(JSON.stringify({ perPage: 99, orientation: 'landscape', show: { photo: false, rule: true, gym: 'yes' } }), 30), { perPage: 24, orientation: 'landscape', show: { photo: false, gym: true, classLine: true, rule: true } });
  assert.equal(parseSheetOptions(JSON.stringify({ perPage: 'a' }), 30).perPage, 8, '数でない値は、自動');
  assert.equal(parseSheetOptions(JSON.stringify({ orientation: 'sideways', perPage: 6 }), 30).orientation, 'portrait');
});

test('欠場（absent）：保存の検査を通る。真偽以外は断る。名簿の取り込みでも消えない', () => {
  const ok = tournament(1); ok.fighters[0] = fighter('r1', { absent: true });
  assert.equal(isLocalTournament(ok), true);
  const bad = tournament(1); (bad.fighters[0] as unknown as Record<string, unknown>).absent = 'yes';
  assert.equal(isLocalTournament(bad), false);
  const merged = mergeFighters([fighter('r1', { absent: true })], [fighter('r1', { name: '新しい名前' })]);
  assert.equal(merged[0].name, '新しい名前'); assert.equal(merged[0].absent, true);
  const result = mergeKeepExisting([fighter('r1', { absent: true })], [fighter('r1', { name: '別の名前' })]);
  assert.equal(result.merged[0].absent, true, '前からいる人は、黙って変えない');
  assert.equal(result.overwritten[0].name, '別の名前'); assert.equal(result.overwritten[0].absent, true, '書きかえても、欠場は消えない');
});

test('試合順のまま：入れ替えたら、一覧表の番号と並びが変わる（同じ選手の情報を、もう一度入れなくてよい）', () => {
  const data = tournament(3);
  const before = sheetBouts(data, DEFAULT_SHOW).map((b: SheetBout) => b.red.name);
  const swapped = { ...data, bouts: [data.bouts[2], data.bouts[0], data.bouts[1]] };
  const after = sheetBouts(swapped, DEFAULT_SHOW);
  assert.deepEqual(before, ['架空r1', '架空r2', '架空r3']);
  assert.deepEqual(after.map((b) => [b.number, b.red.name]), [[1, '架空r3'], [2, '架空r1'], [3, '架空r2']]);
});

test('寸法：段の数×枠の高さ＋すき間が、紙の中に収まる。選手の幅×2＋番号の列が、枠の幅になる。写真は枠に入り、写真のとなりに氏名の場所が残る', () => {
  for (const orientation of ['portrait', 'landscape'] as const) {
    for (let perPage = PER_PAGE[orientation].min; perPage <= PER_PAGE[orientation].max; perPage++) {
      const m = sheetMetrics(perPage, orientation, true);
      assert.ok(m.cellH * m.rows + ROW_GAP_MM * (m.rows - 1) + 20 + 22 <= m.pageH + 0.6, orientation + ' ' + perPage + ': 高さが紙に収まる');
      assert.ok(m.cellW * m.columns + 6 * (m.columns - 1) + 20 <= m.pageW + 0.6, orientation + ' ' + perPage + ': 幅が紙に収まる');
      assert.ok(Math.abs(m.sideW * 2 + m.centerW - m.cellW) < 0.3);
      assert.ok(m.photoH <= m.cellH, '写真は枠の高さに入る');
      assert.ok(m.photoW <= m.sideW * 0.3 + 0.1, '写真の幅は、選手の場所の3割まで（' + m.photoW + ' / ' + m.sideW + '）');
      assert.ok(m.sideW - m.photoW - 9 >= 38, orientation + ' ' + perPage + ': 写真のとなりに、氏名の場所（38mm以上）が残る（' + (m.sideW - m.photoW - 9).toFixed(1) + '）');
    }
  }
  assert.equal(sheetMetrics(8, 'portrait', false).photoW, 0, '写真を載せないときは、写真の場所を取らない');
  assert.ok(sheetMetrics(4, 'portrait', true).name > sheetMetrics(14, 'portrait', true).name, '試合が少ないほど、氏名が大きい');
});

test('氏名の大きさ：まず1行に入れる（上限の75%以上なら）。それより小さくなるときだけ2行。下限は3.2mm', () => {
  assert.equal(fitNameMm('山田太郎', 12, 90), 12);
  assert.ok(fitNameMm('あ'.repeat(30), 12, 90) < 12);
  assert.ok(fitNameMm('あ'.repeat(200), 12, 90) >= 3.2);
  assert.equal(fitNameMm('', 12, 90), 12);
  // 横A3・1ページ8試合（30試合の自動）：4〜5文字の名前は、最後の1文字だけが次の行に落ちない（1行で入る）
  const landscape = sheetMetrics(8, 'landscape', true);
  for (const name of ['山田太郎', '田中太郎丸', '佐藤 花子']) {
    const fit = fitSide({ state: 'ok', name, gym: 'FLATUP GYM', tag: 'Aクラス　中学生男子・37kg以下' }, landscape, true);
    assert.equal(fit.nameLines, 1, name + '：1行');
    assert.ok(fit.name >= landscape.name * 0.75, name + '：上限の75%以上（' + fit.name + ' / ' + landscape.name + '）');
  }
  // 縦A3・1ページ8試合：7文字のカタカナも1行
  assert.equal(fitSide({ state: 'ok', name: 'アレクサンダー', gym: '', tag: '' }, sheetMetrics(8, 'portrait', true), true).nameLines, 1);
});

test('文字の幅の見つもり：全角は1、半角の英数字は0.58', () => {
  assert.equal(textWidthEm('山田太郎'), 4);
  assert.ok(Math.abs(textWidthEm('FLATUP') - 6 * 0.58) < 1e-9);
  assert.ok(Math.abs(textWidthEm('A山') - 1.58) < 1e-9);
  assert.equal(textWidthEm(''), 0);
});

test('文字が枠に入る（選手の側）：どの向き・どの試合数・写真あり/なしでも、長い氏名・ジム・札・欠場を入れて、見つもりの高さが枠の高さ以内。行数は2以内', () => {
  const longSide = { state: 'ok' as const, name: '架空太郎左衛門ひろし・ジュニア・サード', gym: '千葉県の本当に長い名前のキックボクシングジムと仲間たち', tag: 'Aクラス　高校生・一般男子・無差別' };
  const shortSide = { state: 'ok' as const, name: '山田 太郎', gym: 'FLATUP GYM', tag: 'Bクラス　中学生男子・37kg以下' };
  const over: string[] = [];
  for (const orientation of ['portrait', 'landscape'] as const) {
    for (let perPage = PER_PAGE[orientation].min; perPage <= PER_PAGE[orientation].max; perPage++) {
      for (const withPhoto of [true, false]) {
        const m = sheetMetrics(perPage, orientation, withPhoto);
        for (const side of [longSide, shortSide, { ...longSide, state: 'absent' as const }, { ...shortSide, state: 'absent' as const }]) {
          const fit = fitSide(side, m, withPhoto);
          const high = sideHeightMm(side.state, fit);
          if (high > m.cellH - 2.4 + 0.05) over.push(orientation + ' ' + perPage + ' photo=' + withPhoto + ' ' + side.state + ' ' + side.name.slice(0, 4) + ' (' + high.toFixed(1) + '/' + (m.cellH - 2.4).toFixed(1) + ')');
          assert.ok(fit.nameLines <= 2 && fit.gymLines <= 2 && fit.tagLines <= 2);
          assert.ok(fit.name >= 3.2 && fit.gym >= 2.6 && fit.tag >= 2.4, '下限より小さくしない');
        }
      }
    }
  }
  assert.deepEqual(over, [], '枠の高さをこえる組み合わせ：' + over.slice(0, 6).join(' | '));
  assert.equal(fitSide({ state: 'empty', name: '', gym: '', tag: '' }, sheetMetrics(8, 'portrait', true), true).nameLines, 1, '「未定」は1行');
});

test('文字が枠に入る（まん中の列）：どの向き・どの試合数でも、必ず枠に入る。入らないときは、1行にまとめる→ルールを省く→試合を見分ける文字も省く（番号は、いつも出す）', () => {
  const longClass = 'キックボクシング Aクラス 中学生男子 -45kg';
  const rule = 'キックボクシング 2分2R／首相撲5秒／ワンマッチは顔面への膝蹴り禁止';
  const seen = { compact: 0, droppedRule: 0, droppedClass: 0, stacked: 0 };
  for (const orientation of ['portrait', 'landscape'] as const) {
    for (let perPage = PER_PAGE[orientation].min; perPage <= PER_PAGE[orientation].max; perPage++) {
      const m = sheetMetrics(perPage, orientation, true);
      for (const [classLine, rl, number] of [['60kg契約', '', 8], ['60kg契約', rule, 8], [longClass, rule, 8], [longClass, rule, 120], [longClass, '', 1000], ['', '', 8], ['', rule, 8]] as const) {
        const fit = fitCenter({ number, classLine, rule: rl }, m);
        const used = (fit.compact ? fit.no * 1.15 : fit.word * 1.1 * 2 + fit.no) + (fit.classLines ? 1 + fit.classLines * fit.classLine * 1.25 : 0) + (fit.ruleLines ? 0.8 + fit.ruleLines * fit.rule * 1.25 : 0);
        const label = orientation + ' ' + perPage + ' ' + classLine.slice(0, 4) + '/' + (rl ? 'rule' : '-') + ' #' + number;
        assert.ok(used <= m.cellH - 4.4 + 0.05, '枠の高さに入る：' + label + ' (' + used.toFixed(1) + '/' + (m.cellH - 4.4).toFixed(1) + ')');
        assert.ok(fit.no >= (fit.compact ? 6 : 7) && fit.word >= 2.6 && fit.classLine >= 2.6 && fit.rule >= 2.4, '下限より小さくしない：' + label);
        assert.equal(fit.classLines === 0, !classLine || fit.droppedClass, '試合を見分ける文字は、省いたときだけ0行：' + label);
        assert.equal(fit.ruleLines === 0, !rl || fit.droppedRule, 'ルールは、省いたときだけ0行：' + label);
        if (fit.droppedClass && rl) assert.ok(fit.droppedRule, 'ルールのほうを先に省く：' + label);
        if (fit.compact) seen.compact++; else seen.stacked++;
        if (fit.droppedRule) seen.droppedRule++;
        if (fit.droppedClass) seen.droppedClass++;
        assert.ok(fit.no > 0, '番号は、いつも出す');
      }
    }
  }
  assert.ok(seen.stacked > 0 && seen.compact > 0 && seen.droppedRule > 0, 'ゆとりがあれば積む／せまければ1行／それでも入らなければルールを省く、のどれも起こる：' + JSON.stringify(seen));
  const roomy = fitCenter({ number: 3, classLine: '60kg契約', rule: '' }, sheetMetrics(4, 'portrait', true));
  assert.equal(roomy.classLines, 1); assert.equal(roomy.compact, false); assert.equal(roomy.no, sheetMetrics(4, 'portrait', true).no, 'ゆとりがあれば、番号は大きいまま');
  assert.ok(fitCenter({ number: 3, classLine: longClass, rule }, sheetMetrics(14, 'portrait', true)).classLines <= 3);
  // いちばん詰まった枠（横24）でも、ふつうの長さの「60kg契約」は省かれない
  const dense = fitCenter({ number: 12, classLine: '60kg契約', rule: '' }, sheetMetrics(24, 'landscape', true));
  assert.equal(dense.droppedClass, false, '横24でも、短い契約体重は載る');
});

test('1ページの試合数の限度と、「A3を○枚にする」の実際の枚数：限度にぶつかると、○枚にならない', () => {
  assert.deepEqual(perPageLimit('portrait'), { min: 1, max: 14 });
  assert.deepEqual(perPageLimit('landscape'), { min: 2, max: 24 });
  assert.equal(pagesIfTarget(30, 3, 'portrait'), 3);
  assert.equal(pagesIfTarget(30, 4, 'portrait'), 4);
  assert.equal(pagesIfTarget(9, 4, 'portrait'), 3, '9試合を4枚にはできない（3試合ずつで3枚）');
  assert.equal(pagesIfTarget(60, 3, 'portrait'), 5, '60試合は、縦では3枚にならない（14試合ずつで5枚）');
  assert.equal(pagesIfTarget(60, 3, 'landscape'), 3, '横にすれば、3枚になる（24試合ずつ）');
});

test('設定の読み戻し：壊れた文字・変な値は、自動の値にする。「3枚／4枚」は、試合数が変わっても、その枚数に合わせ直す', () => {
  assert.deepEqual(parseSheetPrefs(null), { orientation: 'portrait', show: DEFAULT_SHOW, count: null, pages: null });
  assert.deepEqual(parseSheetPrefs('[1,2]'), { orientation: 'portrait', show: DEFAULT_SHOW, count: null, pages: null }, '配列は設定ではない');
  assert.deepEqual(parseSheetPrefs(JSON.stringify({ pages: 3, perPage: 7 })), { orientation: 'portrait', show: DEFAULT_SHOW, count: null, pages: 3 }, '3枚／4枚があれば、数は使わない');
  assert.equal(parseSheetPrefs(JSON.stringify({ pages: 5 })).pages, null, '3と4以外は捨てる');
  assert.equal(resolvePerPage({ orientation: 'portrait', count: null, pages: 3 }, 30), 10);
  assert.equal(resolvePerPage({ orientation: 'portrait', count: null, pages: 3 }, 24), 8, '試合が減っても、3枚に合わせ直す');
  assert.equal(resolvePerPage({ orientation: 'portrait', count: 6, pages: null }, 24), 6);
  assert.equal(resolvePerPage({ orientation: 'landscape', count: null, pages: null }, 100), 16);
});

test('見出しの大きさ：1行で5mm以上に入れば1行（上限8mm）。入らなければ2行（上限6.8mm）。下限3.2mm', () => {
  const short = fitTitleMm('千葉県キックボクシング協会アマチュア大会', 191);
  assert.deepEqual(short, { size: 8, lines: 1 });
  const long = fitTitleMm('あ'.repeat(60), 191);
  assert.equal(long.lines, 2);
  assert.ok(long.size <= 6.8 && long.size >= 3.2, '2行のときの上限と下限：' + long.size);
  assert.ok(fitTitleMm('あ'.repeat(400), 191).size >= 3.2);
  assert.ok(fitTitleMm('', 191).size <= 8);
});

test('欠場の流れ：画面の自動取り込みは欠場の変化を見のがさない。コピーから戻して欠場が減るときは警告する。曲の数えと「いま」の表示は欠場を言う', () => {
  const base = tournament(3);
  const absent = { ...base, fighters: base.fighters.map((f) => f.id === 'r2' ? { ...f, absent: true } : f) };
  assert.equal(sameExceptProgress(base, base), true);
  assert.equal(sameExceptProgress(base, absent), false, '欠場だけが違っても、「同じ」とは言わない（静かに取り込まない）');
  assert.equal(sameExceptProgress(absent, { ...absent, currentBout: 2 }), true, '試合の進み具合だけなら、同じ');
  const text = restoreConfirmText({ restored: base, current: absent, dirty: false, everSaved: true });
  assert.match(text, /欠場にしている選手が1人から0人/);
  assert.doesNotMatch(restoreConfirmText({ restored: absent, current: base, dirty: false, everSaved: true }), /欠場にしている選手が/, '増えるときは警告しない');
  // 曲の数え：欠場の選手は数えない
  const withMusic = { ...absent, fighters: absent.fighters.map((f) => ({ ...f, musicUrl: '' })) };
  const all = summarizeMusic({ bouts: base.bouts, fighters: base.fighters.map((f) => ({ ...f, musicUrl: '' })) }, true);
  const skipped = summarizeMusic(withMusic, true);
  assert.equal(all.fighters, 6);
  assert.equal(skipped.fighters, 5, '欠場の1人は、数えない');
  // 「いま」と一覧の読み上げ
  assert.match(nowModel({ ...absent, currentBout: 1 })?.text ?? '', /架空r2（欠場）/);
  const byId = new Map(absent.fighters.map((f) => [f.id, f]));
  assert.match(buildRow(absent.bouts[1], 1, byId, false, 0).openLabel, /赤コーナー 架空r2（欠場）/);
  assert.doesNotMatch(buildRow(absent.bouts[0], 0, byId, false, 0).openLabel, /欠場/);
});
