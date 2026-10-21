import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyTournament, importFighters, type LocalBout, type LocalFighter, type LocalTournament } from '../core/privateTournament.ts';
import { DEFAULT_ENTRY_CONFIG, entryConfigFromSearch, entryConfigSearch } from '../core/entryPackage.ts';
import { DEFAULT_WEIGHT_SETTINGS, weightSettingsToParam, type WeightSettings } from '../core/weightClass.ts';
import {
  describeWeightChange, entryConfigFromHash, entryConfigKey, hasWeightTag, mergeKeepExisting, normalizeImported, overwriteBoxText, overwriteConfirmText, restoreConfirmText,
  sameEntryConfig, sameExceptProgress, sameWeightText, tidyWeight, weightChanged, weightChoiceTrouble, weightColumnNote, weightIssue, weightIssueText, weightMixAt, weightMixIndexes, weightMixText,
} from '../app/private/logic.ts';

/* 架空の名前だけ。区分・階級（階級分け）の、準備の画面まわりの小さな計算 */
const fighter = (id: string, over: Partial<LocalFighter> = {}): LocalFighter => ({ id, gym: 'テストジム', name: '架空' + id, grade: '', age: '', height: '', weight: '60', record: '', comment: '', musicUrl: '', photoDataUrl: '', ...over });
const bout = (id: string, redId = '', blueId = ''): LocalBout => ({ id, redId, blueId, className: '', rule: '' });
const W: WeightSettings = DEFAULT_WEIGHT_SETTINGS;
const read = (path: string): string => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('区分・階級: 文字を整える（空の項目は無くす・40文字まで）。区分も階級も無い人は、そのまま', () => {
  const plain = fighter('A');
  assert.deepEqual(tidyWeight(plain), plain, '無い人は何も足さない');
  assert.equal('division' in tidyWeight(fighter('A', { division: '  ', weightClass: '' })), false, '空の文字は項目ごと無くす');
  const done = tidyWeight(fighter('A', { division: ' 中学生男子\u200B ', weightClass: ' 37kg以下 ' }));
  assert.equal(done.division, '中学生男子'); assert.equal(done.weightClass, '37kg以下');
  assert.equal(tidyWeight(fighter('A', { division: 'あ'.repeat(60) })).division?.length, 40, '保存の検査（40文字）を超えない');
  assert.equal(tidyWeight(fighter('A', { division: '中学生男子', fighterClass: 'Aクラス' })).fighterClass, 'Aクラス', 'クラスには触らない');
});

test('区分・階級: 変わったか／直した所の言い方（クラスと同じ書き方）', () => {
  const a = fighter('A', { division: '中学生男子', weightClass: '37kg以下' });
  assert.equal(weightChanged(a, { ...a }), false);
  assert.equal(weightChanged(fighter('A'), fighter('A', { division: '' })), false, '項目が無いのと空は同じ');
  assert.equal(weightChanged(a, { ...a, weightClass: '40kg以下' }), true);
  assert.equal(describeWeightChange(a, { ...a }), '');
  assert.equal(describeWeightChange(fighter('A'), a), '区分 （空） → 中学生男子、階級 （空） → 37kg以下');
  assert.equal(describeWeightChange(a, { ...a, division: '中学生女子', weightClass: '' }), '区分 中学生男子 → 中学生女子、階級 37kg以下 → （空）');
  assert.equal(hasWeightTag(fighter('A')), false); assert.equal(hasWeightTag(fighter('A', { weightClass: '無差別' })), true);
  assert.equal(sameWeightText('中学生男子', ' 中学生男子 '), true); assert.equal(sameWeightText('中学生男子', '中学生女子'), false);
});

test('区分・階級: 入れかたの黄色の一文は、入っていない／設定にない値のときだけ。設定が無い大会は何も言わない', () => {
  assert.equal(weightIssue(fighter('A'), undefined), null, '階級分けをしない大会');
  assert.equal(weightIssue(fighter('A'), W), 'blank-all');
  assert.equal(weightIssue(fighter('A', { weightClass: '37kg以下' }), W), 'blank-division');
  assert.equal(weightIssue(fighter('A', { division: '中学生男子' }), W), 'blank-class');
  assert.equal(weightIssue(fighter('A', { division: '中学生男子', weightClass: '37kg以下' }), W), null);
  assert.equal(weightIssue(fighter('A', { division: '中学生男子', weightClass: '-37' }), W), null, '書き方のちがいは同じ階級');
  assert.equal(weightIssue(fighter('A', { division: '中学生男子', weightClass: '99kg以下' }), W), 'unknown-class');
  assert.equal(weightIssue(fighter('A', { division: '高校生一般男子', weightClass: '50kg以下' }), W), 'unknown-division');
  assert.equal(weightIssue(fighter('A', { division: '小学生以下' }), W), null, '階級のない区分は、階級が空でよい');
  assert.equal(weightIssue(fighter('A', { division: '小学生以下', weightClass: '30kg以下' }), W), 'extra-class');
  const text = (kind: NonNullable<ReturnType<typeof weightIssue>>, over: Partial<LocalFighter> = {}) => weightIssueText(kind, fighter('A', over));
  assert.match(text('blank-all'), /区分・階級が入っていません。なくても保存できます/);
  assert.match(text('blank-class', { division: '中学生男子' }), /階級が入っていません/);
  assert.match(text('unknown-division', { division: '高校生一般男子' }), /区分「高校生一般男子」は、設定にある区分ではありません/);
  assert.match(text('unknown-class', { division: '中学生男子', weightClass: '99kg以下' }), /階級「99kg以下」は、この区分の階級にありません/);
  assert.match(text('extra-class', { division: '小学生以下', weightClass: '30kg以下' }), /この区分には階級がありません/);
  for (const kind of ['blank-all', 'blank-division', 'blank-class', 'unknown-division', 'unknown-class', 'extra-class'] as const) assert.ok(!/止め|できません。$/.test(text(kind, { division: 'x', weightClass: 'y' })), '止めるのではなく、やさしく');
});

test('区分・階級: 名簿の黄色の数え方（名前の無い行は数えない）', () => {
  const list = [
    fighter('ok', { division: '中学生男子', weightClass: '37kg以下' }),
    fighter('blank'), fighter('half', { division: '中学生女子' }), fighter('odd', { division: '高校生一般男子', weightClass: '50kg以下' }),
    fighter('noname', { name: '' }),
  ];
  const r = weightChoiceTrouble(list, W);
  assert.deepEqual(r.blank.map((f) => f.id), ['blank', 'half']);
  assert.deepEqual(r.unknown.map((f) => f.id), ['odd']);
  assert.deepEqual(weightChoiceTrouble(list, undefined), { blank: [], unknown: [] }, '階級分けをしない大会は、いつも空');
});

test('区分・階級: 赤と青がちがう試合を数える（どちらかが空なら数えない）', () => {
  const fighters = [
    fighter('a', { division: '中学生男子', weightClass: '37kg以下' }), fighter('b', { division: '中学生男子', weightClass: '37kg以下' }),
    fighter('c', { division: '中学生男子', weightClass: '40kg以下' }), fighter('d', { division: '中学生女子', weightClass: '37kg以下' }), fighter('e'),
  ];
  const bouts = [bout('1', 'a', 'b'), bout('2', 'a', 'c'), bout('3', 'a', 'd'), bout('4', 'a', 'e'), bout('5', 'a')];
  assert.deepEqual(weightMixIndexes(bouts, fighters), [1, 2]);
  const byId = new Map(fighters.map((f) => [f.id, f]));
  assert.equal(weightMixAt(bouts[0], byId), false); assert.equal(weightMixAt(bouts[2], byId), true);
  assert.deepEqual(weightMixIndexes(bouts.map((b) => b), fighters.map((f) => ({ id: f.id, gym: f.gym, name: f.name, grade: '', age: '', height: '', weight: '60', record: '', comment: '', musicUrl: '', photoDataUrl: '' }))), [], '区分・階級の無い大会は、今までどおり何も数えない');
  assert.equal(weightMixText([1, 2]), '区分・階級がちがう組が2つあります（第2・第3試合）。ふつうは同じ区分・階級の人どうしで組みます。');
});

test('区分・階級: 取り込みは、設定の名前にそろえる。設定にない名前は消さずに持つ。直した数はクラスと同じ言い方', () => {
  const list = [
    fighter('A', { division: '高校生・一般男子', weightClass: '-62' }),
    fighter('B', { division: '高校生一般男子', weightClass: '62kg以下' }),
    fighter('C', { division: '見たことのない区分', weightClass: '-62' }),
    fighter('D', { division: '中学生男子', weightClass: '37kg以下' }),
    fighter('E'),
  ];
  const r = normalizeImported(list, undefined, W);
  assert.equal(r.fighters[0].weightClass, '62kg以下'); assert.equal(r.fighters[0].division, '高校生・一般男子');
  assert.equal(r.fighters[1].division, '高校生・一般男子', '「・」の有る無しは同じ区分'); assert.equal(r.fighters[1].weightClass, '62kg以下');
  assert.equal(r.fighters[2].division, '見たことのない区分', '設定にない区分は、そのまま持つ'); assert.equal(r.fighters[2].weightClass, '62kg以下');
  assert.deepEqual(r.fighters[3], list[3], '正しい人は変えない'); assert.deepEqual(r.fighters[4], list[4]);
  assert.equal(r.fixedPeople, 3); assert.ok(r.fixed >= 3);
  assert.ok(r.examples.some((e) => e.startsWith('階級 ')) && r.examples.length <= 3);
  const long = normalizeImported([fighter('L', { division: 'あ'.repeat(60) })], undefined, W).fighters[0];
  assert.equal(long.division?.length, 40, '40文字まで（保存の検査を通る）');
  // 設定が無い大会（階級分けをしない）でも、区分・階級の無い人は今までと完全に同じ
  const plain = [fighter('P', { weight: '６５kg', fighterClass: 'Ａクラス' })];
  assert.deepEqual(normalizeImported(plain), normalizeImported(plain, undefined, undefined));
  assert.equal(normalizeImported(plain).fighters[0].division, undefined);
});

test('区分・階級: 取り込みの結果から、列があるかが分かる（列が無いファイルでは、今の区分・階級を消さない）', () => {
  const cur = [fighter('A', { division: '中学生男子', weightClass: '37kg以下' })];
  const noCols = importFighters('管理番号,ジム名,選手名,体重\nA,テストジム,架空A,60');
  assert.equal(noCols.hasDivisionColumn, false); assert.equal(noCols.hasWeightClassColumn, false);
  const m = mergeKeepExisting(cur, noCols.fighters, { hasClassColumn: noCols.hasClassColumn, hasDivisionColumn: noCols.hasDivisionColumn, hasWeightClassColumn: noCols.hasWeightClassColumn });
  assert.equal(m.differs.length, 0, '列が無いなら、比べない'); assert.equal(m.weightsFilled, 0); assert.equal(m.merged[0].division, '中学生男子');
  assert.equal(m.overwritten[0].division, '中学生男子', '書きかえても、列が無いなら消さない'); assert.equal(m.overwritten[0].weightClass, '37kg以下');
  assert.equal(weightColumnNote(cur, false, false), 'このファイルには区分・階級の列が無いので、今の区分・階級はそのままです。');
  assert.equal(weightColumnNote(cur, true, false), 'このファイルには階級の列が無いので、今の階級はそのままです。');
  assert.equal(weightColumnNote(cur, true, true), '');
  assert.equal(weightColumnNote([fighter('Z')], false, false), '', '今の名簿に区分・階級が無いなら、言わない');
  // 列はあるが空欄（クラスと同じ扱い）：前に入っている人は、「取り込む」では消さずに、「ちがい」として見せる。「書きかえる」を押したときだけ、空になる
  const emptyCols = importFighters('管理番号,ジム名,選手名,クラス,区分,階級\nA,G,架空A,,,');
  assert.equal(emptyCols.hasDivisionColumn, true); assert.equal(emptyCols.hasWeightClassColumn, true);
  const blank = mergeKeepExisting(cur, emptyCols.fighters, { hasClassColumn: emptyCols.hasClassColumn, hasDivisionColumn: emptyCols.hasDivisionColumn, hasWeightClassColumn: emptyCols.hasWeightClassColumn });
  assert.equal(blank.merged[0].division, '中学生男子', '取り込むだけなら、前の区分は消えない'); assert.equal(blank.merged[0].weightClass, '37kg以下');
  assert.deepEqual(blank.differs[0].fields.map((f) => f.label).filter((l) => l === '区分' || l === '階級').sort(), ['区分', '階級'], '空欄との「ちがい」として見せる');
  assert.equal(blank.overwritten[0].division, undefined, '「書きかえる」を押したときだけ、空になる');
});

test('区分・階級: 再取り込みは、前が空ならファイルの値を足し、ちがうなら前のまま「ちがい」に出す（クラスと同じ）', () => {
  const file = (over: Partial<LocalFighter>) => [fighter('A', over)];
  const fill = mergeKeepExisting([fighter('A')], file({ division: '中学生男子', weightClass: '37kg以下' }));
  assert.equal(fill.weightsFilled, 1); assert.equal(fill.merged[0].division, '中学生男子'); assert.equal(fill.merged[0].weightClass, '37kg以下'); assert.equal(fill.changed, true); assert.equal(fill.differs.length, 0);
  const same = mergeKeepExisting([fighter('A', { division: '中学生男子', weightClass: '37kg以下' })], file({ division: '中学生男子', weightClass: '37kg以下' }));
  assert.equal(same.weightsFilled, 0); assert.equal(same.changed, false); assert.equal(same.differs.length, 0);
  const clash = mergeKeepExisting([fighter('A', { division: '中学生男子', weightClass: '37kg以下' })], file({ division: '中学生男子', weightClass: '40kg以下' }));
  assert.equal(clash.merged[0].weightClass, '37kg以下', '前のまま'); assert.deepEqual(clash.differs[0].fields, [{ label: '階級', from: '37kg以下', to: '40kg以下' }]);
  assert.equal(clash.overwritten[0].weightClass, '40kg以下', '書きかえを押したときだけ、ファイルの値');
  // 区分がちがう人に、階級だけを足すと、別の区分の階級が混ざる。足さずに、ちがいとして出す
  const mixed = mergeKeepExisting([fighter('A', { division: '中学生女子' })], file({ division: '中学生男子', weightClass: '37kg以下' }));
  assert.equal(mixed.merged[0].division, '中学生女子'); assert.equal(mixed.merged[0].weightClass, undefined); assert.equal(mixed.weightsFilled, 0);
  assert.deepEqual(mixed.differs[0].fields.map((f) => f.label), ['区分', '階級']);
  // 区分・階級を使わない大会は、今までと完全に同じ
  const old = mergeKeepExisting([fighter('A')], [fighter('A'), fighter('B')]);
  assert.equal(old.weightsFilled, 0); assert.equal(old.differs.length, 0); assert.equal(old.added, 1);
});

test('区分・階級: 書きかえの確認の文に、区分・階級が変わる人を、人ごとに1行で出す（クラスの次）', () => {
  const differs = [
    { name: '架空A', fields: [{ label: 'クラス', from: 'Aクラス', to: 'Bクラス' }, { label: '区分', from: '中学生女子', to: '中学生男子' }, { label: '階級', from: '37kg以下', to: '40kg以下' }] },
    { name: '架空B', fields: [{ label: '体重', from: '60', to: '61' }] },
  ];
  const lines = overwriteBoxText(differs).lines;
  assert.equal(lines[0], 'クラス Aクラス→Bクラス：架空A');
  assert.equal(lines[1], '区分 中学生女子→中学生男子：架空A'); assert.equal(lines[2], '階級 37kg以下→40kg以下：架空A');
  assert.ok(lines.some((l) => l.startsWith('架空B 体重 60→61')));
  assert.ok(!lines.some((l) => l.startsWith('架空A ') && l.includes('区分 ')), '同じ所を、人の行で2回言わない');
  assert.match(overwriteConfirmText(differs), /区分 中学生女子→中学生男子：架空A/);
  const many = Array.from({ length: 7 }, (_, i) => ({ name: '架空' + i, fields: [{ label: '階級', from: '37kg以下', to: '40kg以下' }] }));
  assert.ok(overwriteBoxText(many).lines.includes('区分・階級が変わる所は、ほか2か所'));
  // クラスだけの今までの文は変わらない
  assert.deepEqual(overwriteBoxText([{ name: '架空A', fields: [{ label: 'クラス', from: 'Aクラス', to: 'Bクラス' }] }]).lines, ['クラス Aクラス→Bクラス：架空A']);
});

test('区分・階級: コピーから戻す前の警告（階級分けの設定・人数・ロゴが消える／減る）と、保存の比べ方', () => {
  const withW = (over: Partial<LocalTournament> = {}): LocalTournament => ({ ...emptyTournament('weight-test'), title: '架空大会', ...over });
  const current = withW({ entryConfig: { ...DEFAULT_ENTRY_CONFIG, weights: W, logo: true }, fighters: [fighter('A', { division: '中学生男子', weightClass: '37kg以下' }), fighter('B')] });
  const restored = withW({ fighters: [fighter('A'), fighter('B')] });
  const text = restoreConfirmText({ restored, current, dirty: false, everSaved: true });
  assert.match(text, /⚠ 消えます：階級分けの設定（区分と階級の表）/); assert.match(text, /⚠ 減ります：区分・階級が入っている選手が1人から0人になります/); assert.match(text, /⚠ 消えます：ロゴの設定/);
  const quiet = restoreConfirmText({ restored: current, current, dirty: false, everSaved: true });
  assert.ok(!/区分・階級が入っている選手|階級分けの設定|ロゴの設定/.test(quiet), '同じなら言わない');
  assert.ok(!/区分|階級|ロゴ/.test(restoreConfirmText({ restored: withW({ fighters: [fighter('A')] }), current: withW({ fighters: [fighter('A')] }), dirty: false, everSaved: true })), '階級分けをしない大会の文は、今までと同じ');
  // 別の画面が区分・階級だけを変えたら、「進み具合だけの変化」とは見なさない
  const a = withW({ fighters: [fighter('A', { division: '中学生男子' })] });
  assert.equal(sameExceptProgress(a, { ...a, fighters: [fighter('A', { division: '中学生男子' })] }), true);
  assert.equal(sameExceptProgress(a, { ...a, fighters: [fighter('A', { division: '中学生女子' })] }), false);
  assert.equal(sameExceptProgress(a, { ...a, fighters: [fighter('A', { division: '中学生男子', weightClass: '37kg以下' })] }), false);
  assert.equal(sameExceptProgress(a, { ...a, entryConfig: { ...DEFAULT_ENTRY_CONFIG, weights: W } }), false, '設定が変わったら、ちがう');
});

test('区分・階級: 受付をつくる画面から来るリンク（#ws=・#logo=on）を読む。無いリンクは今までと同じ', () => {
  const none = entryConfigFromHash('#m=on&g=optional');
  assert.equal(none?.weights, undefined); assert.equal(none?.logo, undefined); assert.equal('weights' in (none ?? {}), false, '項目ごと無い');
  const h = '#m=off&ws=' + encodeURIComponent(weightSettingsToParam(W)) + '&logo=on';
  const cfg = entryConfigFromHash(h);
  assert.deepEqual(cfg?.weights, W); assert.equal(cfg?.logo, true);
  assert.equal(entryConfigFromHash('#ws=' + encodeURIComponent(weightSettingsToParam(W)))?.weights?.divisions.length, W.divisions.length, 'ws だけでも使える');
  assert.equal(entryConfigFromHash('#logo=on')?.logo, true);
  assert.equal(entryConfigFromHash('#ws=%5B%5B%22%22%5D%5D'), null, '読めない表は、使わない');
  assert.equal(entryConfigFromHash('#logo=off'), null);
});

test('区分・階級: 他のジム用のリンクにも、階級分けとロゴが入る（準備の画面が作るリンクは entryConfigSearch のまま）', () => {
  const cfg = { ...DEFAULT_ENTRY_CONFIG, weights: W, logo: true };
  const back = entryConfigFromSearch(entryConfigSearch(cfg));
  assert.deepEqual(back.weights, W); assert.equal(back.logo, true);
  assert.ok(!entryConfigSearch(DEFAULT_ENTRY_CONFIG).includes('ws=') && !entryConfigSearch(DEFAULT_ENTRY_CONFIG).includes('logo='), '階級分けをしない大会のリンクは、今までと同じ');
  const page = read('app/private/page.tsx');
  assert.match(page, /entryConfigSearch\(linkClasses \? \{ \.\.\.entryConfig, classes: linkClasses \} : entryConfig\)/, '設定ぜんたい（階級分け・ロゴも）を渡す');
});

test('区分・階級: 公開した申込ページ（シート）と今の設定が同じか。並びがちがっても、中身が同じなら同じ', () => {
  const a = { ...DEFAULT_ENTRY_CONFIG, weights: W, logo: true };
  const sameButReordered = { logo: true, weights: W, comment: a.comment, age: a.age, grade: a.grade, music: a.music };
  assert.equal(sameEntryConfig(a, sameButReordered), true);
  assert.equal(sameEntryConfig(a, { ...a, logo: false }), false, 'ロゴがちがう');
  assert.equal(sameEntryConfig(a, { ...DEFAULT_ENTRY_CONFIG, logo: true }), false, '階級分けがちがう');
  assert.equal(sameEntryConfig(a, { ...a, weights: { enabled: true, divisions: [{ name: '小学生以下', classes: [] }] } }), false, '表の中身がちがう');
  assert.equal(sameEntryConfig(undefined, DEFAULT_ENTRY_CONFIG), true, '保存が無い大会は、初期の設定と同じ');
  assert.equal(sameEntryConfig({ ...DEFAULT_ENTRY_CONFIG, music: true }, DEFAULT_ENTRY_CONFIG), false);
  assert.equal(sameEntryConfig({ ...DEFAULT_ENTRY_CONFIG, logo: false }, DEFAULT_ENTRY_CONFIG), true, 'ロゴ false と無いのは同じ');
  assert.equal(entryConfigKey(undefined), entryConfigKey(DEFAULT_ENTRY_CONFIG));
});

test('区分・階級: 画面の目印（id・role・⚠）と、階級分けが無い大会で出さないこと', () => {
  const cards = read('app/private/cards.tsx'), page = read('app/private/page.tsx');
  // 手で足す／直すフォーム
  assert.match(cards, /const divId = prefix \+ '-division', wcId = prefix \+ '-weightClass'/);
  assert.match(cards, /<select id=\{divId\}/); assert.match(cards, /<select id=\{wcId\}/);
  assert.match(cards, /weights && onWeightChange \? <div/, '設定が無い大会には、欄を出さない');
  assert.match(cards, /onWeightChange\(e\.target\.value, ''\)/, '区分を変えたら、階級は空に戻す');
  assert.match(cards, /<Caution className="mt-2" role="status">\{weightIssueText\(wIssue, value\)\}<\/Caution>/);
  assert.ok(!/aria-required|required=/.test(cards.slice(cards.indexOf('const weightBlock'), cards.indexOf('return <div className="grid gap-4 sm:grid-cols-2">'))), '必須にはしない');
  // 試合カード
  assert.match(cards, /boutWeightWarning\(red, blue\)/);
  assert.match(cards, /<ErrorLine role="status" mark="⚠ " className="\[overflow-wrap:anywhere\]">\{weightWarn\}<\/ErrorLine>/, '赤い箱に ⚠（止めない）');
  assert.match(cards, /data-weight-tag=\{side\}/); assert.match(cards, /区分・階級：\{weightTag\(f\)\}/);
  assert.ok(!/weightWarn[^\n]*disabled|weightWarn[^\n]*aria-disabled/.test(cards), '区分・階級のちがいで、ボタンを止めない');
  assert.match(cards, /\{classWarn && classMix && blue \?/, 'クラスのちがいの箱は、そのまま');
  // 名簿・一覧・おすすめ・取り込み・保存
  assert.match(page, /区分・階級：\{weightTag\(fighter\)\}/); assert.match(page, /⚠ 区分・階級がちがいます/);
  assert.match(page, /weightMixText\(suggestNote\.weightMix\)/); assert.match(page, /区分・階級がちがう試合へ/);
  assert.match(page, /normalizeImported\(result\.fighters, data\.entryConfig\?\.classes, data\.entryConfig\?\.weights\)/);
  assert.match(page, /hasDivisionColumn: result\.hasDivisionColumn, hasWeightClassColumn: result\.hasWeightClassColumn/);
  assert.match(page, /tidyWeight\(tidyClass\(result\.fighter\)\)/); assert.match(page, /tidyWeight\(tidyClass\(\{ \.\.\.result\.fighter/);
  assert.match(page, /\+ \(weightMix\(bout\) \? 1 : 0\), 0\)/, '警告の数に入れる'); assert.match(page, /classMixAt\(bout\) \|\| weightMix\(bout\)\)/, '「最初の警告へ」にも');
  assert.match(page, /weights=\{weights\}/); assert.match(page, /onWeightChange=\{\(d, w\) => setDraft/);
});
