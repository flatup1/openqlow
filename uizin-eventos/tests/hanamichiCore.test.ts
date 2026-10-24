// 花道の追加情報の「画面にも Google にも共通の決まり」（core/hanamichi.ts）と、core/setupV3.ts の花道の部分。
// 実名は使わない。DOM・ネットワーク・時計に頼らない（今日の日付は、引数で渡す）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HANAMICHI_BAD_MESSAGE, HANAMICHI_ERROR_CODE, HANAMICHI_ITEMS, HANAMICHI_KEYS, HANAMICHI_MIN_BIRTH_YEAR, HANAMICHI_MISSING_MESSAGE, HANAMICHI_NUMBER_MAX, HANAMICHI_SHEET_HEADERS, HANAMICHI_WORD, hanamichiBirthText, hanamichiClean, hanamichiText, isHanamichiDivision, isRealPastDate, validateHanamichi } from '../core/hanamichi.ts';
import { ACCEPTED_RECEPTION_BUILDS, EXPECTED_RECEPTION_BUILD, entryConfigFromPing, parsePing, supportsHanamichi, supportsWeightClasses } from '../core/setupV3.ts';
import { publicEntryConfig, publicEntryHash } from '../core/publicEntry.ts';

const NOW = Date.parse('2026-10-22T03:00:00Z'); // 日本時間 2026-10-22 12:00
/** 架空の答え（実名ではない） */
const GOOD: Record<string, string> = { hnNameKana: 'カクウハナミチイチロウ', hnGymKana: 'カクウジムエー', hnRing: '架空の花', hnRingKana: 'カクウノハナ', hnBirth: '1975-04-05', hnKickYears: '3', hnPerWeek: '2', hnOther: '空手', hnJob: '会社員', hnHobby: '釣り', hnReason: '健康のため', hnMessage: 'リングで会いましょう' };
const ok = (values: Record<string, unknown>) => validateHanamichi(values, NOW);

test('項目の表: 12項目。鍵・見出し・必須／任意・文字数・種類が、決まった順に並ぶ', () => {
  assert.deepEqual(HANAMICHI_ITEMS.map((i) => [i.key, i.label, i.required, i.max, i.kind]), [
    ['hnNameKana', '氏名のフリガナ', true, 60, 'kana'], ['hnGymKana', '所属ジムのフリガナ', true, 60, 'kana'], ['hnRing', 'リングネーム', true, 60, 'text'], ['hnRingKana', 'リングネームのフリガナ', true, 60, 'kana'],
    ['hnBirth', '生年月日', true, 10, 'date'], ['hnKickYears', 'キック歴（年）', true, 2, 'number'], ['hnPerWeek', '練習頻度（週に何回）', true, 2, 'number'],
    ['hnOther', '他格闘歴', false, 60, 'text'], ['hnJob', '職業', false, 60, 'text'], ['hnHobby', '趣味・特技', true, 60, 'text'], ['hnReason', '始めた理由・良かった所', true, 300, 'longtext'], ['hnMessage', 'メッセージ', true, 300, 'longtext'],
  ]);
  assert.deepEqual(HANAMICHI_ITEMS.filter((i) => !i.required).map((i) => i.key), ['hnOther', 'hnJob'], '任意は、他格闘歴と職業だけ');
  assert.deepEqual(HANAMICHI_ITEMS.filter((i) => i.needs).map((i) => [i.key, i.needs]), [['hnRingKana', 'hnRing']], 'リングネームが空なら、そのフリガナは要らない');
  assert.deepEqual([...HANAMICHI_KEYS], ['hnNameKana', 'hnGymKana', 'hnRing', 'hnRingKana', 'hnBirth', 'hnKickYears', 'hnPerWeek', 'hnOther', 'hnJob', 'hnHobby', 'hnReason', 'hnMessage']);
  assert.deepEqual([...HANAMICHI_KEYS], HANAMICHI_ITEMS.map((i) => i.key), '鍵の一覧は表から作る');
  assert.equal(new Set(HANAMICHI_KEYS).size, 12); assert.equal(new Set(HANAMICHI_ITEMS.map((i) => i.label)).size, 12);
  for (const key of HANAMICHI_KEYS) assert.match(key, /^hn[A-Z]\w+$/);
  assert.deepEqual([...HANAMICHI_SHEET_HEADERS], ['受付番号', '申込日時', '所属ジム', '選手名', '氏名のフリガナ', '所属ジムのフリガナ', 'リングネーム', 'リングネームのフリガナ', '生年月日', 'キック歴（年）', '練習頻度（週に何回）', '他格闘歴', '職業', '趣味・特技', '始めた理由・良かった所', 'メッセージ']);
  assert.equal(HANAMICHI_ERROR_CODE, 'hanamichi'); assert.equal(HANAMICHI_WORD, '花道'); assert.equal(HANAMICHI_NUMBER_MAX, 99); assert.equal(HANAMICHI_MIN_BIRTH_YEAR, 1900);
});

test('項目の表: 本体の申し込みと重なる項目（所属ジム・氏名・身長・体重・戦績）は、表に無い（二重に聞かない）', () => {
  const labels = HANAMICHI_ITEMS.map((i) => i.label);
  for (const word of ['所属ジム', '氏名', '身長', '体重', '戦績']) assert.ok(!labels.includes(word), word + ' は聞かない');
  assert.ok(!HANAMICHI_ITEMS.some((i) => /年齢|電話|メール|住所/.test(i.label)), '年齢・連絡先・住所は聞かない');
});

test('isHanamichiDivision: 区分の名前に「花道」が入っているか（全角・半角・空白・見えない文字のちがいは見ない）', () => {
  for (const name of ['花道', '花道・男子（40歳以上）', '花道・女子(40歳以上)', ' 花道 ', '花 道', '花\u200B道', 'CKA花道部門', '階級：花道', '一般・花道']) assert.equal(isHanamichiDivision(name), true, name);
  for (const name of ['中学生男子', '小学生以下', '高校生・一般男子', '華道', '花', '道', '', '  ', '花の道']) assert.equal(isHanamichiDivision(name), false, JSON.stringify(name));
  for (const value of [undefined, null, 1, {}, ['花道']]) assert.equal(isHanamichiDivision(value), false, String(value));
});

test('isRealPastDate: 実在する日で、今日（日本時間）より後でなければ true。2月30日・未来・1900年より前・整数でない値は false', () => {
  for (const [y, m, d] of [[1975, 4, 5], [2000, 2, 29], [1904, 2, 29], [1900, 1, 1], [2026, 10, 22], [1926, 12, 31], [2010, 12, 31]]) assert.equal(isRealPastDate(y, m, d, NOW), true, [y, m, d].join('-'));
  for (const [y, m, d] of [[1975, 2, 30], [1975, 2, 29], [1900, 2, 29], [1999, 2, 29], [1975, 4, 31], [1975, 13, 1], [1975, 0, 1], [1975, 1, 0], [1975, 1, 32], [2026, 10, 23], [2027, 1, 1], [2999, 1, 1], [1899, 12, 31], [99, 1, 1], [0, 1, 1], [-1975, 1, 1]]) assert.equal(isRealPastDate(y, m, d, NOW), false, [y, m, d].join('-'));
  for (const bad of [1.5, NaN, Infinity]) { assert.equal(isRealPastDate(bad, 1, 1, NOW), false); assert.equal(isRealPastDate(1975, bad, 1, NOW), false); assert.equal(isRealPastDate(1975, 1, bad, NOW), false); }
  assert.equal(isRealPastDate(Number('abc'), 1, 1, NOW), false);
});

test('isRealPastDate: 今日の境目は日本時間の0時（UTCではない）', () => {
  const at = (iso: string) => Date.parse(iso);
  assert.equal(isRealPastDate(2026, 10, 22, at('2026-10-22T14:59:59Z')), true, '日本時間 10/22 23:59:59');
  assert.equal(isRealPastDate(2026, 10, 23, at('2026-10-22T14:59:59Z')), false, 'UTCではもう23日でも、日本はまだ22日');
  assert.equal(isRealPastDate(2026, 10, 23, at('2026-10-22T15:00:00Z')), true, '日本時間 10/23 0:00');
  assert.equal(isRealPastDate(2026, 10, 24, at('2026-10-22T15:00:00Z')), false);
  assert.equal(isRealPastDate(2024, 2, 29, at('2024-02-28T15:00:00Z')), true, 'うるう日の当日');
  assert.equal(isRealPastDate(2024, 2, 29, at('2024-02-28T14:59:59Z')), false, 'うるう日の前日');
});

test('hanamichiBirthText: 年・月・日の3つの選ぶ欄から yyyy-mm-dd を作る。どれかが空なら空', () => {
  assert.equal(hanamichiBirthText('1975', '4', '5'), '1975-04-05'); assert.equal(hanamichiBirthText(1975, 12, 31), '1975-12-31'); assert.equal(hanamichiBirthText('1975', '04', '05'), '1975-04-05');
  for (const args of [['', '4', '5'], ['1975', '', '5'], ['1975', '4', ''], ['', '', ''], [' ', '4', '5']] as [string, string, string][]) assert.equal(hanamichiBirthText(...args), '', JSON.stringify(args));
  assert.equal(validateHanamichi({ ...GOOD, hnBirth: hanamichiBirthText('1975', '4', '5') }, NOW).ok, true);
});

test('hanamichiText / hanamichiClean: 見えない文字・改行・前後の空白をそろえる。数字は半角。リングネームが空ならフリガナも空。知らない鍵は捨てる', () => {
  assert.equal(hanamichiText('  あ\u200Bい\r\nう\rえ  '), 'あい\nう\nえ');
  assert.equal(hanamichiText('１２', 'number'), '12'); assert.equal(hanamichiText(' １９７５－０４－０５ ', 'date'), '1975-04-05'); assert.equal(hanamichiText('ＡＢ'), 'ＡＢ', '文字の項目は、全角のまま');
  assert.equal(hanamichiText(undefined), ''); assert.equal(hanamichiText(null), ''); assert.equal(hanamichiText(5, 'number'), '5');
  const clean = hanamichiClean({ ...GOOD, hnRing: ' \u200B ', hnRingKana: 'ゴミ', hnKickYears: '３', extra: 'x', website: 'spam' } as Record<string, unknown>);
  assert.deepEqual(Object.keys(clean), [...HANAMICHI_KEYS]);
  assert.equal(clean.hnRing, ''); assert.equal(clean.hnRingKana, '', 'リングネームが空なら、フリガナも空'); assert.equal(clean.hnKickYears, '3');
  assert.equal(hanamichiClean({}).hnBirth, '');
});

test('validateHanamichi: 全部入っていれば ok。errors は空', () => {
  const r = ok(GOOD);
  assert.deepEqual(r, { ok: true, errors: {} });
  assert.equal(ok({ ...GOOD, hnOther: '', hnJob: '' }).ok, true, '職業と他格闘歴は空でよい');
  assert.equal(ok({ ...GOOD, hnOther: undefined, hnJob: undefined }).ok, true);
  assert.equal(validateHanamichi(GOOD).ok, true, '今日を渡さなくても動く');
});

test('validateHanamichi: 必須が空（空白・見えない文字だけも空）→ その鍵だけに文が付く。文は短くて、値を含まない', () => {
  for (const item of HANAMICHI_ITEMS.filter((i) => i.required)) for (const empty of ['', '  ', '\u200B\u3000', undefined, null]) {
    const r = ok({ ...GOOD, [item.key]: empty });
    assert.equal(r.ok, false, item.key);
    assert.ok(r.errors[item.key], item.key + ' に文がある');
    assert.deepEqual(Object.keys(r.errors).filter((k) => k !== item.key && !(item.key === 'hnRing' && k === 'hnRingKana')), [], item.key + ' 以外にはつかない');
    assert.ok(r.errors[item.key].length <= 40, '短い文');
  }
  assert.equal(ok({ ...GOOD, hnBirth: '' }).errors.hnBirth, '年・月・日の3つを選んでください');
  assert.equal(ok({ ...GOOD, hnKickYears: '' }).errors.hnKickYears, '数字で入れてください');
  assert.equal(ok({ ...GOOD, hnHobby: '' }).errors.hnHobby, '入れてください');
  const all = ok({});
  assert.deepEqual(Object.keys(all.errors), HANAMICHI_ITEMS.filter((i) => i.required && !i.needs).map((i) => i.key), '何も入れないと、必須の項目だけが並ぶ（リングネームが空ならフリガナは要らないので、フリガナは入らない）');
});

test('validateHanamichi: リングネームのフリガナは、リングネームが空でないときだけ要る', () => {
  const r = ok({ ...GOOD, hnRingKana: '' });
  assert.deepEqual(Object.keys(r.errors), ['hnRingKana']);
  // リングネームも空 → リングネームの方が必須の失敗。フリガナの失敗は付かない
  assert.deepEqual(Object.keys(ok({ ...GOOD, hnRing: '', hnRingKana: '' }).errors), ['hnRing']);
});

test('validateHanamichi: 文字数の上限（60／300）。ちょうどは通り、1字多いと失敗。改行（CRLF）は1字。前後の空白は数えない', () => {
  for (const item of HANAMICHI_ITEMS.filter((i) => i.kind === 'text' || i.kind === 'kana' || i.kind === 'longtext')) {
    assert.equal(ok({ ...GOOD, [item.key]: 'あ'.repeat(item.max) }).ok, true, item.key + ' ' + item.max);
    const r = ok({ ...GOOD, [item.key]: 'あ'.repeat(item.max + 1) });
    assert.equal(r.ok, false, item.key); assert.equal(r.errors[item.key], item.max + '文字までにしてください');
  }
  assert.equal(ok({ ...GOOD, hnMessage: 'あ\r\n'.repeat(149) + 'あ' }).ok, true, '299字');
  assert.equal(ok({ ...GOOD, hnMessage: 'あ\r\n'.repeat(150) + 'あ' }).ok, false, '301字');
  assert.equal(ok({ ...GOOD, hnMessage: ' ' + 'あ'.repeat(300) + ' ' }).ok, true, '前後の空白は数えない');
});

test('validateHanamichi: キック歴・練習頻度は 0〜99 の整数。全角は半角として読む。小数・文字・負の数・3けたは失敗', () => {
  for (const key of ['hnKickYears', 'hnPerWeek']) {
    for (const v of ['0', '1', '10', '99', '０', '１２', ' 5 ']) assert.equal(ok({ ...GOOD, [key]: v }).ok, true, key + ' ' + v);
    for (const v of ['100', '-1', '+3', '1.5', '1,2', 'abc', '半年', '3年', '1e1', '００１']) { const r = ok({ ...GOOD, [key]: v }); assert.equal(r.ok, false, key + ' ' + v); assert.equal(r.errors[key], '0から99までの数字で入れてください'); }
  }
});

test('validateHanamichi: 生年月日は yyyy-mm-dd の実在する過去の日。実在しない日・未来・形がちがう → 失敗。年齢は確かめない（若くても、高齢でも通る）', () => {
  for (const v of ['1975-04-05', '2000-02-29', '1900-01-01', '2026-10-22', '2010-06-01', '1926-01-01', '１９７５－０４－０５']) assert.equal(ok({ ...GOOD, hnBirth: v }).ok, true, v);
  for (const v of ['1975-02-30', '1975-13-01', '1975-00-10', '1975-04-00', '2026-10-23', '2999-01-01', '1899-12-31', '1975-4-5', '1975/04/05', '19750405', '昭和50年4月5日', 'abc', '1975-04-05x', '0000-00-00']) {
    const r = ok({ ...GOOD, hnBirth: v });
    assert.equal(r.ok, false, v); assert.equal(r.errors.hnBirth, v === '1975-4-5' || v === '1975/04/05' || v === '19750405' || v === '昭和50年4月5日' || v === 'abc' || v === '1975-04-05x' ? '年・月・日の3つを選んでください' : '正しい日ではありません。年・月・日を選び直してください', v);
  }
  // 若い選手（15歳）も、とても高齢の選手も、ここでは止めない
  assert.equal(ok({ ...GOOD, hnBirth: '2011-10-22' }).ok, true); assert.equal(ok({ ...GOOD, hnBirth: '1926-10-22' }).ok, true);
  assert.ok(!/年齢|歳/.test(readFileSync(new URL('../core/hanamichi.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), '年齢を見る処理は、コードに無い');
});

test('メッセージ: サーバーの2つの文は決まった言葉。画面と Google で同じ', () => {
  assert.equal(HANAMICHI_MISSING_MESSAGE, '花道の追加の質問に、答えていない所があります。申込ページにもどって、入れてから、もう一度送ってください。');
  assert.equal(HANAMICHI_BAD_MESSAGE, '花道の追加の質問に、まちがいがある所があります。申込ページにもどって、直してから、もう一度送ってください。');
});

test('core/hanamichi.ts: 画面（DOM）・通信・時計に頼らない。公開前の検査に当たる書き方を使わない。実名・電話番号らしい文字列が無い', () => {
  const src = readFileSync(new URL('../core/hanamichi.ts', import.meta.url), 'utf8');
  for (const word of ['document.', 'window.', 'localStorage', 'sessionStorage', 'navigator', 'fetch(', 'XMLHttpRequest', 'require(']) assert.ok(!src.includes(word), word);
  assert.ok(!/^import\s/m.test(src) && !/^export \* from/m.test(src), '他のファイルを読み込まない（純粋・単独で動く）');
  assert.ok(!/\.at\(/.test(src) && !src.includes('Object.hasOwn') && !src.includes('text-base') && !src.includes('@layer') && !src.includes(">🔒 '"));
  assert.ok(!/\(\?<[=!]/.test(src), '正規表現の後読みを使わない（Safari 15）');
  assert.ok(!/\b0\d{1,3}-?\d{2,4}-?\d{3,4}\b/.test(src), '電話番号らしい文字列を置かない');
  assert.ok(!/@\w+\.\w+/.test(src), 'メールアドレスらしい文字列を置かない');
  // 今日は引数で渡せる（試験で動かせる）。既定だけ Date.now
  assert.equal((src.match(/Date\.now\(\)/g) ?? []).length, (src.match(/now: number = Date\.now\(\)/g) ?? []).length, '時計を読むのは、引数の既定値だけ');
});

/* ───────── core/setupV3.ts ───────── */

test('版: EXPECTED は 3.20261024.2。古い5つも受け付け続ける（古い順）', () => {
  assert.equal(EXPECTED_RECEPTION_BUILD, '3.20261024.2');
  assert.deepEqual([...ACCEPTED_RECEPTION_BUILDS], ['3.20261004.4', '3.20261010.5', '3.20261019.6', '3.20261022.7', '3.20261024.1', '3.20261024.2']);
  const gs = readFileSync(new URL('../public/templates/Tournament_OS_Google受付_v3.gs', import.meta.url), 'utf8');
  assert.ok(gs.includes("const RECEPTION_BUILD = '3.20261024.2';"));
});

test('supportsWeightClasses / supportsHanamichi: 受け付ける版の一覧の中の「位置」で比べる。新しい版を足しても、前の版が「古い」に変わらない', () => {
  const sw = (build: string) => supportsWeightClasses({ build }), sh = (build: string) => supportsHanamichi({ build });
  assert.deepEqual(['3.20261004.4', '3.20261010.5', '3.20261019.6', '3.20261022.7'].map(sw), [false, false, true, true], '階級分け・ロゴ：3.20261019.6 以降');
  assert.deepEqual(['3.20261004.4', '3.20261010.5', '3.20261019.6', '3.20261022.7'].map(sh), [false, false, false, true], '花道：3.20261022.7 以降');
  for (const build of ['', '3.0.0', '3.20261019.5', '3.20261022.6', '3.20261022.8', '9.9.9', '3.20261022.7 ', 'x']) { assert.equal(sw(build), false, JSON.stringify(build)); assert.equal(sh(build), false, JSON.stringify(build)); }
  for (const f of [supportsWeightClasses, supportsHanamichi]) { assert.equal(f(null), false); assert.equal(f(undefined), false); }
});

const BASE = { app: 'tournament-os', protocol: 3, build: EXPECTED_RECEPTION_BUILD, ready: true, accepting: true, eventId: 'tos-0123456789', testComplete: true, settingsProblem: '', title: '架空テスト大会', date: '2099-12-01', venue: '架空体育館', venueUrl: '', organizer: '架空主催', contact: '0200000000', deadline: '2099-11-30', music: false, grade: 'optional', age: 'optional', comment: 'optional' };
const ENDPOINT = 'https://script.google.com/macros/s/AKfycbyTEST_ONLY/exec';

test('parsePing: hanamichiMode は true のときだけ読む。それ以外（false・文字・数・個人情報の鍵）は、鍵ごと捨てる。「なし」では鍵が増えない', () => {
  assert.equal(parsePing({ ...BASE, hanamichiMode: true }).hanamichiMode, true);
  for (const v of [false, 'true', 'on', 1, 0, null, undefined, {}, []]) assert.equal('hanamichiMode' in parsePing({ ...BASE, hanamichiMode: v }), false, JSON.stringify(v));
  assert.equal('hanamichiMode' in parsePing(BASE), false);
  assert.deepEqual(Object.keys(parsePing({ ...BASE, hanamichiMode: true })).filter((k) => !(k in parsePing(BASE))), ['hanamichiMode'], '増えるのは1つだけ');
  const leaked = parsePing({ ...BASE, hanamichiMode: true, hnRing: '架空', hnBirth: '1975-04-05', hanamichiItems: ['a'], profileTab: '花道プロフィール' }) as unknown as Record<string, unknown>;
  for (const k of ['hnRing', 'hnBirth', 'hanamichiItems', 'profileTab']) assert.equal(leaked[k], undefined, k + ' は受け取らない');
});

test('entryConfigFromPing: 対応した版が hanamichiMode: true を返したときだけ、hanamichi: true が付く（リンクは hn=on）。なし・古い版・偽の印では付かない', () => {
  const on = entryConfigFromPing(parsePing({ ...BASE, hanamichiMode: true }), ENDPOINT, 'live');
  assert.equal(on.hanamichi, true);
  assert.ok(/[#&]hn=on(?:&|$)/.test(publicEntryHash(on)), 'リンクに hn=on');
  assert.equal(publicEntryConfig(publicEntryHash(on)).hanamichi, true);
  const off = entryConfigFromPing(parsePing(BASE), ENDPOINT, 'live');
  assert.equal('hanamichi' in off, false); assert.ok(!/hn=/.test(publicEntryHash(off)), 'なしでは hn を作らない');
  assert.deepEqual(Object.keys(on).filter((k) => !(k in off)), ['hanamichi']);
  // 古い版（花道に対応していない版）が印を返しても、リンクは作らない（印は信じない）
  for (const build of ['3.20261019.6', '3.20261010.5', '3.20261004.4']) assert.equal('hanamichi' in entryConfigFromPing(parsePing({ ...BASE, build, hanamichiMode: true }), ENDPOINT, 'live'), false, build);
  // テスト用のリンクにも付く（mode は別）
  assert.equal(entryConfigFromPing(parsePing({ ...BASE, hanamichiMode: true }), ENDPOINT, 'test').hanamichi, true);
});

test('entryConfigFromPing: 花道のリンクも、他の設定（クラス・階級・ロゴ）といっしょに、4500文字以内。ふつうのリンクの先頭は変わらない', () => {
  const weights = { enabled: true, divisions: [{ name: '花道・男子（40歳以上）', classes: ['55kg以下', '無差別'] }, { name: '中学生男子', classes: ['37kg以下'] }] };
  const on = entryConfigFromPing(parsePing({ ...BASE, hanamichiMode: true, weightMode: true, weights, logo: true }), ENDPOINT, 'live');
  const off = entryConfigFromPing(parsePing({ ...BASE, weightMode: true, weights, logo: true }), ENDPOINT, 'live');
  assert.ok(publicEntryHash(on).length <= 4500);
  assert.equal(publicEntryHash(on).replace('&hn=on', ''), publicEntryHash(off), 'hn=on 以外は、1字も変わらない');
});
