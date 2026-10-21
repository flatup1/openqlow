import test from 'node:test';
import assert from 'node:assert/strict';
import {
  boutWeightWarning, canonWeightClass, cleanDivisionName, DEFAULT_DIVISIONS, DEFAULT_WEIGHT_SETTINGS, divisionHasClasses, divisionNameProblem, findDivision, isDefaultWeightSettings,
  normalizeDivision, normalizeDivisionLoose, normalizeWeightClass, normalizeWeightClassLoose, parseClassList, parseWeightClass, parseWeightSettings, weightChoiceError, weightClassLabel,
  weightClassToken, weightSettingsToParam, weightsFromParam, weightTag, WEIGHT_LIMITS, type WeightSettings,
} from '../core/weightClass.ts';
import { publicEntryConfig, publicEntryHash, publicEntryLinkCut, type PublicEntryConfig } from '../core/publicEntry.ts';
import { DEFAULT_ENTRY_CONFIG, entryConfigFromSearch, entryConfigSearch, entryCsv, entryWeightError, ENTRY_HEADERS_WITH_WEIGHT } from '../core/entryPackage.ts';
import { entryConfigFromPing, parsePing, supportsWeightClasses, EXPECTED_RECEPTION_BUILD } from '../core/setupV3.ts';
import { emptyTournament, importFighters, isLocalTournament, type LocalFighter } from '../core/privateTournament.ts';
import { suggestBouts } from '../core/boutSuggest.ts';

const S = DEFAULT_WEIGHT_SETTINGS;
const fighter = (over: Partial<LocalFighter> = {}): LocalFighter => ({ id: 'F1', gym: 'ジムA', name: '甲', grade: '', age: '', height: '170', weight: '60', record: '初出場', comment: '', musicUrl: '', photoDataUrl: '', ...over });

test('階級: 書き方がちがっても、保存する形（先頭に記号が付かない）にそろう', () => {
  const cases: [string, string][] = [
    ['-37', '37kg以下'], ['−37kg', '37kg以下'], ['-37ｋｇ', '37kg以下'], ['37kg以下', '37kg以下'], ['37キロ以下', '37kg以下'], ['37kgまで', '37kg以下'], ['-37kg級', '37kg以下'], [' - 37 ', '37kg以下'],
    ['62kg級', '62kg以下'], ['62キロ級', '62kg以下'],
    ['+60', '60kgをこえる'], ['＋60kg', '60kgをこえる'], ['60kgをこえる', '60kgをこえる'], ['60kg超', '60kgをこえる'], ['60kgを超える', '60kgをこえる'],
    ['-37.5', '37.5kg以下'], ['無差別', '無差別'], ['無差別級', '無差別'],
  ];
  for (const [raw, canon] of cases) assert.equal(canonWeightClass(raw), canon, raw);
  assert.equal(canonWeightClass('フリー'), '無差別', '「フリー」も無差別（長音の記号が「-」にならない）');
  assert.equal(canonWeightClass('オープン'), '無差別');
  assert.equal(canonWeightClass('ライト級'), 'ライト級', '数字のない名前は、そのまま');
  for (const raw of ['-37', '+60', '＋60kg', '−37kg', '無差別', 'フリー', 'ライト級', '62kg級']) assert.ok(!/^[=+\-@]/.test(canonWeightClass(raw)), raw + ' の保存する形は、記号で始まらない');
});

test('階級: 読めないものは空（数字だけ・式・0・大きすぎる・数字がまじる読めない文字・長すぎる名前）', () => {
  for (const bad of ['', '  ', '37', '37kg', '=1+1', '-0', '-300', '-1000', 'abc1', '37kg未満', '-37kg以上', '＠ライト', 'あ'.repeat(17)]) assert.equal(canonWeightClass(bad), '', JSON.stringify(bad));
  assert.equal(parseWeightClass('-37')?.kind, 'max'); assert.equal(parseWeightClass('+60')?.kind, 'over'); assert.equal(parseWeightClass('無差別')?.kind, 'open'); assert.equal(parseWeightClass('ライト級')?.kind, 'text');
});

test('階級: 選ぶ画面の見出しは「記号と言葉」を並べる', () => {
  assert.equal(weightClassLabel('37kg以下'), '-37kg（37kg以下）');
  assert.equal(weightClassLabel('60kgをこえる'), '+60kg（60kgをこえる）');
  assert.equal(weightClassLabel('無差別'), '無差別（体重の制限なし）');
  assert.equal(weightClassLabel('ライト級'), 'ライト級');
  assert.equal(weightClassLabel('37.5kg以下'), '-37.5kg（37.5kg以下）');
  assert.equal(weightClassToken('37kg以下'), '-37'); assert.equal(weightClassToken('60kgをこえる'), '+60'); assert.equal(weightClassToken('無差別'), '無差別');
});

test('階級のならび: 区切りいろいろ・全角・「なし」・まちがいの言い方', () => {
  assert.deepEqual(parseClassList('-37、-40, -43\n+60 無差別').classes, ['37kg以下', '40kg以下', '43kg以下', '60kgをこえる', '無差別']);
  assert.deepEqual(parseClassList('－37，－40／＋60').classes, ['37kg以下', '40kg以下', '60kgをこえる']);
  const none = parseClassList('なし'); assert.deepEqual([none.classes, none.none, none.problems], [[], true, []]);
  assert.equal(parseClassList('なし（階級を選ばない）').none, true);
  const blank = parseClassList(''); assert.equal(blank.none, false); assert.match(blank.problems[0], /「なし」と書いてください/);
  const bad = parseClassList('37, -37, -37kg, ほげ1');
  assert.match(bad.problems[0], /「37」は、以下なら「-37」、こえるなら「\+37」と書いてください/);
  assert.ok(bad.problems.some((p) => /同じ階級が2回あります（37kg以下）/.test(p)));
  assert.ok(bad.problems.some((p) => /「ほげ1」は、階級として読めません/.test(p)));
  const many = parseClassList(Array.from({ length: 21 }, (_, i) => '-' + (30 + i)).join('、')); assert.ok(many.problems.some((p) => /多すぎます/.test(p)));
});

test('初期の表は、CKA Vol.6の要項どおり（7区分）', () => {
  assert.deepEqual(DEFAULT_DIVISIONS.map((d) => d.name), ['小学生以下', '中学生女子', '中学生男子', '高校生・一般女子', '高校生・一般男子', '花道・女子（40歳以上）', '花道・男子（40歳以上）']);
  const tokens = (name: string) => findDivision(name, S)!.classes.map(weightClassToken).join(',');
  assert.equal(tokens('小学生以下'), '');
  assert.equal(tokens('中学生女子'), '-37,-40,-43,-46,-49,-52,-55,-58'); assert.equal(tokens('中学生男子'), '-37,-40,-43,-46,-49,-52,-55,-58');
  assert.equal(tokens('高校生・一般女子'), '-40,-43,-46,-50,-53,-56,-59,-62,-65');
  assert.equal(tokens('高校生・一般男子'), '-50,-53,-56,-59,-62,-65,-68,-71,-74,-77,-80,-85,無差別');
  assert.equal(tokens('花道・女子（40歳以上）'), '-40,-45,-50,-55,-60,+60'); assert.equal(tokens('花道・男子（40歳以上）'), '-55,-60,-65,-70,-75,-80,-85,無差別');
  assert.equal(divisionHasClasses('小学生以下', S), false); assert.equal(divisionHasClasses('中学生男子', S), true);
  assert.equal(isDefaultWeightSettings(S), true);
});

test('設定の読み取り：リンク・pingの入れ物から、正しいものだけ。半分だけは使わない', () => {
  const param = weightSettingsToParam(S);
  assert.ok(param.length < 400, '初期の表のリンクの文字は短い（' + param.length + '）');
  assert.deepEqual(weightsFromParam(param), S);
  assert.deepEqual(parseWeightSettings({ enabled: true, divisions: [{ name: '男子', classes: ['-60', '＋60'] }] }), { enabled: true, divisions: [{ name: '男子', classes: ['60kg以下', '60kgをこえる'] }] });
  assert.deepEqual(parseWeightSettings({ enabled: true, divisions: [['小学生以下', '']] }), { enabled: true, divisions: [{ name: '小学生以下', classes: [] }] });
  assert.deepEqual(parseWeightSettings({ enabled: true, divisions: [['小学生以下', 'なし']] }), { enabled: true, divisions: [{ name: '小学生以下', classes: [] }] });
  for (const bad of [null, undefined, 5, 'x', {}, { enabled: false, divisions: [] }, { enabled: true, divisions: [] }, { enabled: true, divisions: 'x' }, { enabled: true, divisions: [{ name: '', classes: [] }] },
    { enabled: true, divisions: [{ name: '=男子', classes: [] }] }, { enabled: true, divisions: [{ name: 'あ'.repeat(21), classes: [] }] },
    { enabled: true, divisions: [{ name: 'A', classes: [] }, { name: ' ａ ', classes: [] }] }, { enabled: true, divisions: [{ name: 'A', classes: ['37'] }] }, { enabled: true, divisions: [{ name: 'A', classes: ['-37', '37kg以下'] }] },
    { enabled: true, divisions: Array.from({ length: WEIGHT_LIMITS.divisions + 1 }, (_, i) => ({ name: '区分' + i, classes: [] })) }, { enabled: true, divisions: [{ name: 'A', classes: 5 }] }, { enabled: true, divisions: [7] }]) {
    assert.equal(parseWeightSettings(bad), undefined, JSON.stringify(bad));
  }
  const long = JSON.stringify(Array.from({ length: 12 }, (_, i) => ['区分' + i, Array.from({ length: 20 }, (_, k) => 'あいうえおかきくけこ' + String.fromCharCode(0x3041 + k)).join(',')]));
  assert.ok(long.length > 3000 && parseWeightSettings({ enabled: true, divisions: JSON.parse(long) }), '長い表は、それだけなら正しい表（' + long.length + '字）');
  assert.equal(weightsFromParam(long), undefined, 'リンクで運ぶ表は3000字まで（それより長いものは、使わない）');
  assert.equal(weightsFromParam('これはJSONではない'), undefined); assert.equal(weightsFromParam(''), undefined); assert.equal(weightsFromParam(null), undefined);
  assert.equal(divisionNameProblem('中学生男子'), ''); assert.match(divisionNameProblem('-男子'), /始めないで/); assert.equal(cleanDivisionName(' 中学生\u200B 男子\n'), '中学生 男子');
});

test('選びかたの検査：区分が先、階級はその区分のものだけ。階級のない区分は階級を問わない', () => {
  assert.equal(weightChoiceError('', '', S), '区分を選んでください。');
  assert.equal(weightChoiceError('宇宙人', '37kg以下', S), '区分は、えらべるものから選んでください。');
  assert.equal(weightChoiceError('中学生男子', '', S), '階級を選んでください。');
  assert.equal(weightChoiceError('中学生男子', '99kg以下', S), '階級は、えらべるものから選んでください。');
  assert.equal(weightChoiceError('中学生男子', '37kg以下', S), '');
  assert.equal(weightChoiceError('中学生男子', '-37', S), '', '書き方がちがっても読める');
  assert.equal(weightChoiceError('小学生以下', '', S), '');
  assert.equal(weightChoiceError('小学生以下', '37kg以下', S), '', '階級のない区分は、階級が入っていても問わない');
  assert.equal(weightChoiceError('高校生・一般男子', '無差別', S), ''); assert.equal(weightChoiceError('高校生・一般女子', '無差別', S), '階級は、えらべるものから選んでください。', '女子の表には、無差別がない');
  assert.equal(weightChoiceError('', '', undefined), ''); assert.equal(weightChoiceError('', '', null), '');
  assert.equal(normalizeDivision(' 中学生　男子 ', S), '中学生男子'); assert.equal(normalizeDivision('ちゅうがくせい', S), '');
  assert.equal(normalizeWeightClass('中学生男子', '-37', S), '37kg以下'); assert.equal(normalizeWeightClass('中学生男子', '-99', S), ''); assert.equal(normalizeWeightClass('小学生以下', '-37', S), '');
});

test('取り込みのゆるい読み：区分は「・」の有る無しを問わない。階級は書き方を問わず、読めない名前はそのまま', () => {
  assert.equal(normalizeDivisionLoose('高校生一般男子', S), '高校生・一般男子'); assert.equal(normalizeDivisionLoose('高校生・一般男子', S), '高校生・一般男子');
  assert.equal(normalizeDivisionLoose('ちがう区分', S), 'ちがう区分'); assert.equal(normalizeDivisionLoose('  X\u200B ', S), 'X'); assert.equal(normalizeDivisionLoose('中学生男子', null), '中学生男子');
  assert.equal(normalizeWeightClassLoose('中学生男子', '-37', S), '37kg以下'); assert.equal(normalizeWeightClassLoose('中学生男子', 'ライト級', S), 'ライト級'); assert.equal(normalizeWeightClassLoose('中学生男子', '99', S), '99');
});

test('区分・階級の表示と、試合の赤と青のちがいの注意', () => {
  assert.equal(weightTag(fighter({ division: '中学生男子', weightClass: '37kg以下' })), '中学生男子・37kg以下');
  assert.equal(weightTag(fighter({ division: '小学生以下' })), '小学生以下'); assert.equal(weightTag(fighter()), ''); assert.equal(weightTag(undefined), '');
  const a = fighter({ division: '中学生男子', weightClass: '37kg以下' });
  assert.equal(boutWeightWarning(a, fighter({ id: 'F2', division: '中学生男子', weightClass: '37kg以下' })), '', '同じなら何も言わない');
  assert.equal(boutWeightWarning(a, fighter({ id: 'F2', division: '中学生男子', weightClass: ' 37kg以下 ' })), '');
  assert.match(boutWeightWarning(a, fighter({ id: 'F2', division: '中学生男子', weightClass: '40kg以下' })), /^階級がちがいます（赤：37kg以下／青：40kg以下）。/);
  assert.match(boutWeightWarning(a, fighter({ id: 'F2', division: '中学生女子', weightClass: '37kg以下' })), /^区分がちがいます（赤：中学生男子／青：中学生女子）。/);
  assert.equal(boutWeightWarning(a, fighter({ id: 'F2' })), '', 'どちらかが空なら言わない（入っていない人を責めない）');
  assert.equal(boutWeightWarning(undefined, a), ''); assert.equal(boutWeightWarning(a, undefined), '');
  assert.equal(boutWeightWarning(fighter({ division: '小学生以下' }), fighter({ id: 'F2', division: '小学生以下' })), '', '階級のない区分どうしは、区分が同じなら何も言わない');
});

test('おすすめの組み合わせは、同じ区分・階級を先に選ぶ（強制ではない）', () => {
  const fs = [
    fighter({ id: 'a', name: 'a', weight: '40', gym: 'A', division: '中学生男子', weightClass: '40kg以下' }),
    fighter({ id: 'b', name: 'b', weight: '41', gym: 'B', division: '中学生女子', weightClass: '43kg以下' }),
    fighter({ id: 'c', name: 'c', weight: '42', gym: 'C', division: '中学生男子', weightClass: '40kg以下' }),
    fighter({ id: 'd', name: 'd', weight: '43', gym: 'D', division: '中学生女子', weightClass: '43kg以下' }),
  ];
  let n = 0;
  const bouts = suggestBouts(fs, [], () => 'B' + (++n));
  assert.deepEqual(bouts.map((b) => [b.redId, b.blueId].sort().join('')), ['ac', 'bd'], '体重が近い順ではなく、同じ区分・階級どうし');
  // 男子と女子が、同じ階級の名前を使う（-37 など）：区分がちがえば、組まない
  const sameClassName = [
    fighter({ id: 'a', name: 'a', weight: '40', gym: 'A', division: '中学生男子', weightClass: '37kg以下' }), fighter({ id: 'b', name: 'b', weight: '41', gym: 'B', division: '中学生女子', weightClass: '37kg以下' }),
    fighter({ id: 'c', name: 'c', weight: '42', gym: 'C', division: '中学生男子', weightClass: '37kg以下' }), fighter({ id: 'd', name: 'd', weight: '43', gym: 'D', division: '中学生女子', weightClass: '37kg以下' }),
  ];
  assert.deepEqual(suggestBouts(sameClassName, [], () => 'x').map((b) => [b.redId, b.blueId].sort().join('')), ['ac', 'bd'], '階級が同じでも、区分がちがえば組まない');
  // 同じ区分で、階級がちがう
  const sameDivision = [
    fighter({ id: 'a', name: 'a', weight: '40', gym: 'A', division: '中学生男子', weightClass: '40kg以下' }), fighter({ id: 'b', name: 'b', weight: '41', gym: 'B', division: '中学生男子', weightClass: '43kg以下' }),
    fighter({ id: 'c', name: 'c', weight: '42', gym: 'C', division: '中学生男子', weightClass: '40kg以下' }), fighter({ id: 'd', name: 'd', weight: '43', gym: 'D', division: '中学生男子', weightClass: '43kg以下' }),
  ];
  assert.deepEqual(suggestBouts(sameDivision, [], () => 'y').map((b) => [b.redId, b.blueId].sort().join('')), ['ac', 'bd'], '区分が同じでも、階級がちがえば、同じ階級を先に組む');
  // 同じ組の相手が5kgより遠い：体重の近い人と組む（組めずに残さない）
  const far = [fighter({ id: 'a', name: 'a', weight: '40', gym: 'A', division: '中学生男子', weightClass: '40kg以下' }), fighter({ id: 'b', name: 'b', weight: '41', gym: 'B', division: '中学生女子', weightClass: '40kg以下' }), fighter({ id: 'c', name: 'c', weight: '50', gym: 'C', division: '中学生男子', weightClass: '40kg以下' })];
  assert.deepEqual(suggestBouts(far, [], () => 'z').map((b) => [b.redId, b.blueId].sort().join('')), ['ab'], '同じ組の相手が遠いときは、体重の近い人と');
  // 区分のない人は、これまでどおり（体重の近い順）
  const plain = suggestBouts([fighter({ id: 'a', gym: 'A', weight: '40' }), fighter({ id: 'b', gym: 'B', weight: '41' }), fighter({ id: 'c', gym: 'C', weight: '60' }), fighter({ id: 'd', gym: 'D', weight: '61' })], [], () => 'x');
  assert.deepEqual(plain.map((b) => [b.redId, b.blueId].join('')), ['ab', 'cd']);
  // 近い（5kg以内）同じ組の相手がいなければ、体重の近い人と組む（割り切れず残さない）
  const lone = suggestBouts([fighter({ id: 'a', gym: 'A', weight: '40', division: '中学生男子', weightClass: '40kg以下' }), fighter({ id: 'b', gym: 'B', weight: '41', division: '中学生女子', weightClass: '40kg以下' })], [], () => 'y');
  assert.equal(lone.length, 1);
});

const BASE: PublicEntryConfig = { endpoint: 'https://script.google.com/macros/s/TEST_ONLY/exec', eventId: 'tos-1234567890', title: '第1回', organizer: 'ジム', date: '2027-10-03', venue: '体育館', venueUrl: '', deadline: '2027-09-20', contact: '09012345678', music: false, grade: 'optional', age: 'optional', comment: 'optional', protocol: '3', mode: 'live' };

test('申込リンク：初期の表なら短い（wc=on だけ）、変えた表は wd で運ぶ。ロゴは logo=on', () => {
  const plain = publicEntryHash(BASE);
  assert.ok(!/wc=|wd=|logo=/.test(plain), '使わないときは、今までと同じリンク');
  assert.equal(publicEntryLinkCut(plain), false);
  const withDefault = publicEntryHash({ ...BASE, weights: S });
  assert.match(withDefault, /wc=on/); assert.ok(!/wd=/.test(withDefault)); assert.equal(withDefault.length - plain.length, '&wc=on'.length);
  assert.deepEqual(publicEntryConfig(withDefault).weights, S);
  const custom: WeightSettings = { enabled: true, divisions: [{ name: '男子', classes: ['60kg以下', '60kgをこえる'] }, { name: '小学生', classes: [] }] };
  const link = publicEntryHash({ ...BASE, weights: custom, logo: true });
  assert.match(link, /wc=on/); assert.match(link, /wd=/); assert.match(link, /logo=on/);
  assert.deepEqual(publicEntryConfig(link).weights, custom); assert.equal(publicEntryConfig(link).logo, true);
  assert.equal(publicEntryConfig(plain).logo, undefined); assert.equal(publicEntryConfig(plain).weights, undefined);
  assert.equal(publicEntryLinkCut(link), false); assert.equal(publicEntryLinkCut(withDefault), false);
  assert.ok(link.indexOf('wc=on') < link.indexOf('protocol=3') && link.indexOf('logo=on') < link.indexOf('mode=live') && link.endsWith('end=1'), '階級・ロゴは、protocol・mode・end より前（切れたら後ろから無くなる）');
});

test('申込リンクが途中で切れたら、切れたと分かる（階級・ロゴの項目でも）', () => {
  const link = publicEntryHash({ ...BASE, weights: { enabled: true, divisions: [{ name: '男子', classes: ['60kg以下'] }] }, logo: true });
  for (const cut of ['&end=1', '&mode=live&end=1', '&protocol=3&mode=live&end=1']) assert.ok(publicEntryLinkCut(link.replace(cut, '')), cut + ' が無い');
  assert.ok(publicEntryLinkCut(link.slice(0, link.indexOf('wd=') + 12)), 'wd の途中で切れた');
  // 初期の表のリンク（wd なし）：wc が途中で切れた／end だけ欠けた
  const dflt = publicEntryHash({ ...BASE, weights: S });
  assert.equal(publicEntryLinkCut(dflt), false);
  assert.ok(publicEntryLinkCut(dflt.replace('wc=on', 'wc=o')), 'wc=o（切れた）');
  assert.ok(publicEntryLinkCut(dflt.replace('&end=1', '')), '初期の表のリンクで、end が無い');
  // ロゴだけのリンク（階級・クラスなし）：end・mode が欠ければ、切れている
  const logoOnly = publicEntryHash({ ...BASE, logo: true });
  assert.equal(publicEntryLinkCut(logoOnly), false);
  assert.ok(publicEntryLinkCut(logoOnly.replace('&protocol=3&mode=live&end=1', '')), 'ロゴだけのリンクで、後ろが全部無い');
  assert.ok(publicEntryLinkCut(logoOnly.replace('&end=1', '')), 'ロゴだけのリンクで、end だけ無い');
  assert.equal(publicEntryLinkCut(link.replace('wc=on', 'wc=off').replace(/&wd=[^&]*/, '')), false, 'wc=off だけなら、使わないだけ（切れてはいない）');
  assert.ok(publicEntryLinkCut(link.replace('wc=on', 'wc=off')), 'wc=off なのに表（wd）がある：つぎはぎのリンクは、使わない');
  assert.ok(publicEntryLinkCut(link.replace(/wd=[^&]*/, 'wd=%5B')), 'wd が壊れている（wc=on）');
  assert.ok(publicEntryLinkCut(link.replace('&wc=on', '')), 'wd だけで wc が無い');
  assert.ok(publicEntryLinkCut(link.replace(/&end=1$/, '')), 'end が無い');
  assert.equal(publicEntryConfig(link.replace('logo=on', 'logo=o')).logo, undefined, '切れた logo は、出さない');
});

test('他ジム入力画面のリンク（ws・logo）と、名簿ZIPの列', () => {
  const config = { ...DEFAULT_ENTRY_CONFIG, weights: S, logo: true };
  const search = entryConfigSearch(config);
  assert.deepEqual(entryConfigFromSearch(search), config);
  assert.deepEqual(entryConfigFromSearch(entryConfigSearch(DEFAULT_ENTRY_CONFIG)), DEFAULT_ENTRY_CONFIG, '使わないときは、今までと同じ');
  assert.equal(entryConfigFromSearch('music=off&grade=optional&age=optional&comment=optional&ws=%5B').weights, undefined, 'こわれた ws は、使わない');
  assert.equal(entryWeightError({ id: '1', gym: '', name: '', grade: '', age: '', height: '', weight: '', record: '', comment: '', musicUrl: '' }, DEFAULT_ENTRY_CONFIG), '');
  assert.equal(entryWeightError({ id: '1', gym: '', name: '', grade: '', age: '', height: '', weight: '', record: '', comment: '', musicUrl: '', division: '中学生男子' }, config), '階級を選んでください。');
  const csv = entryCsv([{ id: 'E1', gym: 'ジム', name: '甲', grade: '', age: '', height: '170', weight: '60', record: '初', comment: '', musicUrl: '', fighterClass: 'Aクラス', division: '中学生男子', weightClass: '37kg以下' }], true, true);
  const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
  assert.deepEqual(lines[0].split(',').map((c) => c.slice(1, -1)), [...ENTRY_HEADERS_WITH_WEIGHT]);
  assert.deepEqual(lines[1].split(',').slice(-3).map((c) => c.slice(1, -1)), ['Aクラス', '中学生男子', '37kg以下']);
  // クラスを使わず、階級分けだけの大会（いちばん多い形）：「クラス」の列は空で付く。列の数は、見出しと同じ
  const noClassCsv = entryCsv([{ id: 'E2', gym: 'ジム', name: '乙', grade: '', age: '', height: '170', weight: '60', record: '初', comment: '', musicUrl: '', division: '中学生男子', weightClass: '37kg以下' }], false, true);
  const noClassLines = noClassCsv.replace(/^\uFEFF/, '').split('\r\n');
  assert.deepEqual(noClassLines[0].split(',').map((c) => c.slice(1, -1)), [...ENTRY_HEADERS_WITH_WEIGHT]);
  assert.deepEqual(noClassLines[1].split(',').slice(-3).map((c) => c.slice(1, -1)), ['', '中学生男子', '37kg以下']);
  assert.equal(noClassLines[1].split(',').length, noClassLines[0].split(',').length);
  const back = importFighters(csv);
  assert.equal(back.hasDivisionColumn, true); assert.equal(back.hasWeightClassColumn, true); assert.equal(back.hasClassColumn, true);
  assert.deepEqual([back.fighters[0].fighterClass, back.fighters[0].division, back.fighters[0].weightClass], ['Aクラス', '中学生男子', '37kg以下']);
});

test('取り込み：区分・階級の列を読む。-37 と書いてあっても保存する形にそろう。列が無い古いファイルは、無いと分かる', () => {
  const csv = '\uFEFF管理番号,選手名,ジム名,区分,階級\r\nE1,甲,ジムA,中学生男子,\'-37\r\nE2,乙,ジムB,小学生以下,\r\nE3,丙,ジムC,高校生・一般男子,無差別\r\n';
  const r = importFighters(csv);
  assert.equal(r.hasDivisionColumn, true); assert.equal(r.hasWeightClassColumn, true); assert.equal(r.hasClassColumn, false);
  assert.deepEqual(r.fighters.map((f) => [f.division, f.weightClass]), [['中学生男子', '37kg以下'], ['小学生以下', undefined], ['高校生・一般男子', '無差別']]);
  assert.deepEqual(r.unreadHeaders, [], '区分・階級は、読めない列として言わない');
  const old = importFighters('管理番号,選手名,ジム名\r\nE1,甲,ジムA\r\n');
  assert.equal(old.hasDivisionColumn, false); assert.equal(old.hasWeightClassColumn, false); assert.equal(old.fighters[0].division, undefined);
  // 区分の列があっても、中身が A／B だけなら、これまでどおりクラスの列（古い手作りの表）
  const ab = importFighters('管理番号,選手名,ジム名,区分\r\nE1,甲,ジムA,Aクラス\r\nE2,乙,ジムB,B\r\n');
  assert.equal(ab.hasClassColumn, true); assert.equal(ab.hasDivisionColumn, false); assert.deepEqual(ab.fighters.map((f) => [f.fighterClass, f.division]), [['Aクラス', undefined], ['B', undefined]], 'A・B の頭文字は、取り込みの整えで Aクラス・Bクラス にそろう');
  // クラスの列と区分の列が両方ある（今のZIP）：区分はクラスにならない
  const both = importFighters('管理番号,選手名,ジム名,クラス,区分,階級\r\nE1,甲,ジムA,Bクラス,中学生女子,-40\r\n');
  assert.deepEqual([both.fighters[0].fighterClass, both.fighters[0].division, both.fighters[0].weightClass], ['Bクラス', '中学生女子', '40kg以下']);
  assert.equal(importFighters('管理番号,選手名,ジム名,階級\r\nE1,甲,ジムA,ライト級\r\n').fighters[0].weightClass, 'ライト級');
});

test('保存データの検査：階級分けの設定・ロゴ・区分・階級の形がおかしいものは断る。古いデータは通す', () => {
  const base = { ...emptyTournament('tos-test-1'), title: 'テスト' };
  assert.equal(isLocalTournament(base), true);
  const withSettings = { ...base, entryConfig: { ...DEFAULT_ENTRY_CONFIG, weights: S, logo: true }, fighters: [fighter({ division: '中学生男子', weightClass: '37kg以下' })] };
  assert.equal(isLocalTournament(withSettings), true);
  assert.equal(isLocalTournament({ ...withSettings, entryConfig: { ...DEFAULT_ENTRY_CONFIG, weights: { enabled: true, divisions: [] } } }), false);
  assert.equal(isLocalTournament({ ...withSettings, entryConfig: { ...DEFAULT_ENTRY_CONFIG, logo: 'yes' } }), false);
  // 保存するのは、画面が読む形だけ（ゆるい書き方・余分な項目・正規の形でない階級は、断る。通すと、準備画面が読めずに止まる）
  for (const loose of [[['A', '-37,-40']], { enabled: true, divisions: [{ name: 'A', classes: '-37,-40' }] }, { enabled: true, divisions: [{ name: 'A', classes: ['-37'] }] }, { enabled: true, divisions: [{ name: 'A', classes: [], junk: 'x'.repeat(1000) }] }, { enabled: true, junk: 1, divisions: [{ name: 'A', classes: [] }] }]) {
    assert.equal(isLocalTournament({ ...withSettings, entryConfig: { ...DEFAULT_ENTRY_CONFIG, weights: loose } }), false, JSON.stringify(loose).slice(0, 60));
  }
  assert.equal(isLocalTournament({ ...withSettings, fighters: [{ ...fighter(), division: 5 }] }), false);
  assert.equal(isLocalTournament({ ...withSettings, fighters: [{ ...fighter(), weightClass: 'あ'.repeat(41) }] }), false);
});

test('pingの読み取りとリンクづくり：階級・ロゴ。読めない表は、直す場所つきで止める', () => {
  const ready = { app: 'tournament-os', protocol: 3, build: EXPECTED_RECEPTION_BUILD, ready: true, accepting: true, eventId: 'tos-1234567890', testComplete: true, title: '第1回', date: '2099-12-01', venue: '体育館', organizer: 'ジム', contact: '0200000000', deadline: '2099-11-30', music: false, grade: 'optional', age: 'optional', comment: 'optional' };
  const on = parsePing({ ...ready, weightMode: true, weights: { enabled: true, divisions: [{ name: '男子', classes: ['37kg以下', '無差別'] }] }, logo: true });
  assert.equal(on.weightMode, true); assert.equal(on.logo, true); assert.deepEqual(on.weights, { enabled: true, divisions: [{ name: '男子', classes: ['37kg以下', '無差別'] }] });
  const config = entryConfigFromPing(on, 'https://script.google.com/macros/s/TEST_ONLY/exec', 'live');
  assert.deepEqual(config.weights, on.weights); assert.equal(config.logo, true);
  const off = parsePing(ready);
  assert.equal(off.weightMode, undefined); assert.equal(off.weights, undefined); assert.equal(off.logo, undefined);
  const plain = entryConfigFromPing(off, 'https://script.google.com/macros/s/TEST_ONLY/exec', 'live');
  assert.equal('weights' in plain, false); assert.equal('logo' in plain, false);
  const broken = parsePing({ ...ready, weightMode: true, weights: { enabled: true, divisions: [] } });
  assert.equal(broken.weights, undefined);
  assert.throws(() => entryConfigFromPing(broken, 'https://script.google.com/macros/s/TEST_ONLY/exec', 'live'), /階級分けが「あり」ですが、区分と階級の表を読めませんでした/);
  assert.equal(parsePing({ ...ready, weightRows: false }).weightRows, false); assert.equal(parsePing({ ...ready, weightRows: true }).weightRows, undefined);
  assert.equal(supportsWeightClasses(off), true); assert.equal(supportsWeightClasses({ build: '3.20261010.5' }), false); assert.equal(supportsWeightClasses(null), false);
  // 表が長くて、リンクに入らない
  const huge = parsePing({ ...ready, weightMode: true, weights: { enabled: true, divisions: Array.from({ length: 12 }, (_, i) => ({ name: '区分あいうえおかきくけこ' + i, classes: Array.from({ length: 20 }, (_, k) => 'ライト級' + String.fromCharCode(0x3042 + k)) })) } });
  assert.throws(() => entryConfigFromPing(huge, 'https://script.google.com/macros/s/TEST_ONLY/exec', 'live'), /階級の表（区分と階級）が長すぎて/);
});

test('おすすめの組み合わせ：区分・階級のある人と無い人が混ざっても、無い人を別あつかいしない（A/Bクラスだけの大会も同じ）', () => {
  const mixed = [
    fighter({ id: 'a', name: 'a', weight: '40', gym: 'A' }), fighter({ id: 'b', name: 'b', weight: '41', gym: 'B', division: '中学生男子', weightClass: '40kg以下' }),
    fighter({ id: 'c', name: 'c', weight: '42', gym: 'C' }), fighter({ id: 'd', name: 'd', weight: '43', gym: 'D', division: '中学生男子', weightClass: '40kg以下' }),
  ];
  assert.deepEqual(suggestBouts(mixed, [], () => 'm').map((b) => [b.redId, b.blueId].sort().join('')), ['ab', 'cd'], '体重の近い順のまま');
  const abOnly = [
    fighter({ id: 'a', name: 'a', weight: '40', gym: 'A' }), fighter({ id: 'b', name: 'b', weight: '41', gym: 'B', fighterClass: 'Aクラス' }),
    fighter({ id: 'c', name: 'c', weight: '42', gym: 'C' }), fighter({ id: 'd', name: 'd', weight: '43', gym: 'D', fighterClass: 'Aクラス' }),
  ];
  assert.deepEqual(suggestBouts(abOnly, [], () => 'n').map((b) => [b.redId, b.blueId].sort().join('')), ['ab', 'cd']);
});

test('初期の表の判定と、設定の読み取りのすみ：1つ直した表は「初期の表」ではない（リンクに wd が入る）。enabled:false は読まない', () => {
  const edited: WeightSettings = { enabled: true, divisions: DEFAULT_DIVISIONS.map((d, i) => (i === 3 ? { name: d.name, classes: d.classes.slice(0, -1) } : d)) };
  assert.equal(isDefaultWeightSettings(edited), false);
  assert.match(publicEntryHash({ ...BASE, weights: edited }), /wd=/);
  assert.deepEqual(publicEntryConfig(publicEntryHash({ ...BASE, weights: edited })).weights, edited);
  assert.equal(isDefaultWeightSettings({ enabled: true, divisions: DEFAULT_DIVISIONS.map((d) => ({ name: d.name, classes: d.classes.slice() })) }), true);
  assert.equal(parseWeightSettings({ enabled: false, divisions: [{ name: 'A', classes: [] }] }), undefined);
  assert.equal(parseWeightSettings({ enabled: true, divisions: [{ name: 'A', classes: Array.from({ length: 21 }, (_, i) => 'ライト' + String.fromCharCode(0x3042 + i)) }] }), undefined, '階級は20こまで');
});

test('取り込み：「区分」「階級」の見出しの別の言い方は、1つずつ読める。区分は40文字で切る', () => {
  for (const head of ['区分', 'division', '出場区分', '申込区分']) assert.equal(importFighters('選手名,ジム名,' + head + '\n甲,G,中学生男子').fighters[0].division, '中学生男子', head);
  for (const head of ['階級', 'weight_class', 'weightclass', '体重階級', '体重別階級', '出場階級', '申込階級']) assert.equal(importFighters('選手名,ジム名,' + head + '\n甲,G,-37').fighters[0].weightClass, '37kg以下', head);
  assert.equal(importFighters('選手名,ジム名,区分\n甲,G,' + 'あ'.repeat(60)).fighters[0].division?.length, 40);
  // 読まない見出し（別の意味のことが多い）は、読めなかった列として知らせる
  assert.deepEqual(importFighters('選手名,ジム名,カテゴリ\n甲,G,x').unreadHeaders, ['カテゴリ']);
});
