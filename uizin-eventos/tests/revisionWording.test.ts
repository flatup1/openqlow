// 修正願（owner 2026-10-22）の言葉の約束を、ソースを読んで確かめる試験。
//   R1 選手に見える「区分」は「出場区分」。会長側の画面（準備・当日・A3・セットアップ）と、保存される値・列見出しは「区分」のまま
//   R2 学年の例は 小5 を先頭に（小5／中2／高1／社会人）。「任意」は禁止しない（古いシートの「任意」はそのまま動く）
//   R4 入場曲は、新しい設定タブではじめから「なし」
// 画面に出る文字そのものは、scripts/test-weight-class.mjs・test-polish-apply.mjs などの本物の Chromium で確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness } from './helpers/gasV3Harness.ts';
import { DIVISION_LABEL, DEFAULT_WEIGHT_SETTINGS, isDivisionError, NO_CLASS_NOTE, NO_CLASS_NOTE_APPLY, weightChoiceError, type WeightSettings } from '../core/weightClass.ts';
import { entryWeightError, ENTRY_HEADERS_WITH_WEIGHT, DEFAULT_ENTRY_CONFIG } from '../core/entryPackage.ts';

const read = (path: string): string => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
// コメントを取りのぞく（行のコメントと、ブロックのコメント。URL の https:// は残す）。画面に出る文字だけを調べるため
const noComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
/** 「出場区分」の一部ではない「区分」の場所（前後の文字つき） */
const standalone = (text: string): string[] => Array.from(text.matchAll(/(?<!出場)区分/g), (m) => text.slice(Math.max(0, m.index - 12), m.index + 14));
const SELECT_WEIGHT: WeightSettings = { enabled: true, divisions: DEFAULT_WEIGHT_SETTINGS.divisions };

/* ───────── R1 ───────── */

test('R1 申し込みページ：コードに「区分」だけの文字が残っていない（見出し・ヒント・次はここ・進み具合・確認の行・赤い文は、すべて DIVISION_LABEL＝出場区分 から作る）', () => {
  const page = noComments(read('app/apply/page.tsx'));
  assert.deepEqual(standalone(page), [], 'コメント以外に「区分」だけの文字がある');
  assert.equal(DIVISION_LABEL, '出場区分');
  for (const piece of ["division: DIVISION_LABEL, weightClass: '階級'", "division: DIVISION_LABEL + 'を選ぶ'", "label={DIVISION_LABEL + ' 必須'}", "[DIVISION_LABEL, division]"]) assert.ok(page.includes(piece), piece);
  // ヒントも「出場区分」から作る
  assert.match(page, /hint=\{DIVISION_LABEL \+ 'を選んでください。' \+ DIVISION_LABEL \+ 'によって、選べる階級（体重で分けたグループ）がちがいます。'\}/);
});

test('R1 罠：エラー文の頭の言葉で赤を出す欄を決める所（picked.startsWith）は、文字の置き換えではなく、文の元（DIVISION_LABEL）から決める', () => {
  const page = noComments(read('app/apply/page.tsx'));
  assert.doesNotMatch(page, /picked\.startsWith\(/, '頭の言葉を手で書いて比べない');
  assert.match(page, /put\(isDivisionError\(picked\) \? 'division' : 'weightClass', picked\)/);
  // 本物の文で確かめる：区分の文は区分の欄、階級の文は階級の欄
  const messages = [weightChoiceError('', '', SELECT_WEIGHT), weightChoiceError('宇宙人', '37kg以下', SELECT_WEIGHT), weightChoiceError('中学生男子', '', SELECT_WEIGHT), weightChoiceError('中学生男子', '99kg以下', SELECT_WEIGHT)];
  assert.deepEqual(messages, ['出場区分を選んでください。', '出場区分は、えらべるものから選んでください。', '階級を選んでください。', '階級は、えらべるものから選んでください。']);
  for (const message of messages) assert.deepEqual(standalone(message), [], message);
});

test('R1 選手に見える文（core）：選んでください系・確認の文・案内の文に「区分」だけの言い方が無い。/private/entry/（ほかのジム用の入力画面）も、同じ「出場区分」', () => {
  assert.deepEqual(standalone(NO_CLASS_NOTE_APPLY), []);
  assert.ok(NO_CLASS_NOTE_APPLY.startsWith('この出場区分には階級がありません。'));
  assert.equal(NO_CLASS_NOTE_APPLY.replace('この出場区分には', 'この区分には'), NO_CLASS_NOTE, 'オーナーの文の、区分の言い方だけを直した');
  // ほかのジム用の画面（/private/entry/）：見出し・ラベル・説明・灰色の文・赤い文は、DIVISION_LABEL（出場区分）の1つの元から作る。「区分」だけの見出しや文が残っていない
  const entry = read('app/private/entry/page.tsx');
  assert.deepEqual(standalone(noComments(entry)), [], '/private/entry/ のコードに、「区分」だけの文字が残っている');
  assert.ok(entry.includes('{DIVISION_LABEL}・階級 必須') && entry.includes('先に{DIVISION_LABEL}を選ぶと') && /text-lg font-bold">\{DIVISION_LABEL\}<\/label>/.test(entry), '見出し・説明・ラベルは DIVISION_LABEL から');
  assert.ok(entry.includes('{NO_CLASS_NOTE_APPLY}') && !entry.includes('{NO_CLASS_NOTE}'), '階級のない区分の灰色の文は、申し込みページと同じ（NO_CLASS_NOTE_APPLY）');
  const fighter = { id: '1', gym: '', name: '', grade: '', age: '', height: '', weight: '', record: '', comment: '', musicUrl: '' };
  const config = { ...DEFAULT_ENTRY_CONFIG, weights: SELECT_WEIGHT };
  assert.equal(entryWeightError(fighter, config), '出場区分を選んでください。', '赤い文も「出場区分」');
  assert.equal(entryWeightError({ ...fighter, division: '宇宙人' }, config), '出場区分は、えらべるものから選んでください。');
  assert.ok(entry.includes('isDivisionError(first)') && !entry.includes("startsWith('区分')"), 'その画面が赤を出す欄を探す所も、文と同じ元（isDivisionError）を見る');
  assert.ok(isDivisionError(entryWeightError(fighter, config)), '出場区分の文は、出場区分の欄へ');
  assert.ok(!isDivisionError(entryWeightError({ ...fighter, division: SELECT_WEIGHT.divisions[0].name }, config)), '階級の文は、階級の欄へ');
});

test('R1 変えない物：保存される値・列見出し・OS取込用（「区分」）／リンクの鍵／.gs の列見出し', () => {
  assert.deepEqual([...ENTRY_HEADERS_WITH_WEIGHT].slice(-2), ['区分', '階級'], '取り込み用CSVの列見出し');
  const gs = read('public/templates/Tournament_OS_Google受付_v3.gs');
  assert.match(gs, /const PRIVATE_HEADERS = \[[^\]]*'クラス','区分','階級'\]/);
  assert.match(gs, /const OS_HEADERS = \[[^\]]*'クラス','区分','階級'\]/);
  assert.match(gs, /division: *d\.name/, '保存する値は設定タブの区分の名前のまま');
  const pe = read('core/publicEntry.ts');
  assert.ok(!pe.includes('出場区分'), 'リンクの鍵・作り方は無変更');
});

test('R1 .gs が選手に見せる断り文：「出場区分が選ばれていません」（頭の「出場」を含む。区分だけの言い方は無い）', () => {
  const gs = read('public/templates/Tournament_OS_Google受付_v3.gs');
  const sentences = gs.match(/entryError_\('weight','[^']*'/g) ?? [];
  assert.equal(sentences.length, 2, '階級分けの断り文は2つ（出場区分・階級）');
  assert.ok(sentences[0].includes('出場区分が選ばれていません。申込ページを開き直して、出場区分を選んでから送ってください。'));
  for (const sentence of sentences) assert.deepEqual(standalone(sentence), [], sentence);
  // 結果画面の文字（FIELD_JA_）に、区分の欄は無い（無変更）
  assert.doesNotMatch(gs, /FIELD_JA_=\{[^}]*区分/);
});

test('R1 会長側の画面は変えない：準備・当日・A3・セットアップ・取り込み。「出場区分」という言葉を持ち込まない', () => {
  for (const path of ['app/private/page.tsx', 'app/private/cards.tsx', 'app/private/logic.ts', 'app/private/live/page.tsx', 'app/private/live/ListView.tsx', 'app/private/live/listLogic.ts', 'app/private/sheet/page.tsx', 'app/private/setup/page.tsx', 'core/boutSheet.ts', 'core/boutSuggest.ts', 'core/setupV3.ts']) {
    assert.ok(!read(path).includes('出場区分'), path + ' に「出場区分」が入っている（会長側の画面は「区分」のまま）');
  }
  // 準備の画面の見出し・当日の画面の注意は、今のまま
  assert.match(read('app/private/cards.tsx'), /className="text-lg font-bold">区分<\/label>/);
  assert.match(read('core/weightClass.ts'), /'区分がちがいます（赤：' \+ rd/);
  // 取り込みが読む列の見出し（「出場区分」も、昔から読める）
  assert.match(read('core/privateTournament.ts'), /DIVISION_HEADERS = \['区分', 'division', '出場区分', '申込区分'\]/);
});

/* ───────── R2 ───────── */

test('R2 学年の例：小5を先頭に ［小5／中2／高1／社会人］。ヒントは小学生は小5・中学生は中2・社会人は社会人。空のときの文は「例：小5／中2」', () => {
  const page = noComments(read('app/apply/page.tsx'));
  assert.ok(page.includes("grade: { hint: '小学生は「小5」、中学生は「中2」のように書いてください。社会人の方は「社会人」と書いてください。30文字までです。', example: ['小5', '中2', '高1', '社会人'] },"));
  assert.ok(page.includes("case 'grade': return '学年がまだです。入力してください。例：小5／中2';"));
  assert.ok(!page.includes('例：中2'), '「例：中2」だけの言い方は残っていない');
  assert.ok(!page.includes("['中2', '高1', '社会人']"), '古い例の並びは残っていない');
  // 準備の画面の「1人ずつ入れる」の、学年が空のときの文も同じ形（会長側の画面だが、同じ「学年が空のときの文」）。説明書の画面の一覧表（No.330）も同じ文
  const normalize = noComments(read('app/private/normalize.ts'));
  assert.ok(normalize.includes("bad('grade', '学年：入れてください。例：小5／中2')"));
  assert.ok(!normalize.includes('例：中2'), '準備の画面にも「例：中2」だけの言い方は残っていない');
  assert.ok(read('app/private/cards.tsx').includes("grade: '小5／中2／社会人'") && !read('app/private/cards.tsx').includes('小6／中2'), '準備の画面の入力欄の見本も、小5を先頭に');
  assert.ok(read('docs/TOURNAMENT_OS_使い方マニュアル.md').includes('学年：入れてください。例：小5／中2／年齢：入れてください。例：15'), '説明書の画面の一覧表（No.330）も同じ');
});

test('R2 「任意」は禁止しない：学年・年齢・意気込みの初期値は「必須」。「任意」「なし」も▼から選べる。空のマスは必須あつかい（聞きもれがない）', () => {
  const h = harness(); h.call('onOpen');
  const rows = h.rows('設定');
  for (const name of ['学年', '年齢', '意気込み']) {
    const row = rows.find((r) => r[0] === name)!;
    assert.equal(row[1], '必須', name + ' の初期値');
    assert.match(String(row[2]), /はじめは「必須」/); assert.match(String(row[2]), /書かなくてもよいときは「任意」/);
    h.setSetting(name, '任意');
  }
  for (const [name, value] of Object.entries({ 大会名: 'テスト大会', 開催日: '2099-12-01', 会場: '体育館', 主催者名: '主催ジム', 問い合わせ先: '0200000000', 申込締切: '2099-11-30' })) h.setSetting(name, value);
  h.call('setupTournament');
  const status = h.call('statusInfo_');
  assert.equal(status.settingsProblem, '', '「任意」でも設定の問題にならない');
  const ping = JSON.parse(h.call('doGet', { parameter: { action: 'ping' } }).text);
  assert.deepEqual([ping.grade, ping.age, ping.comment], ['optional', 'optional', 'optional'], '古いシートの「任意」は、そのまま動く');
  const fresh = harness(); fresh.ready();
  const freshPing = JSON.parse(fresh.call('doGet', { parameter: { action: 'ping' } }).text);
  assert.deepEqual([freshPing.grade, freshPing.age, freshPing.comment], ['required', 'required', 'required'], '新しい設定タブは、はじめから必須');
});

/* ───────── R4 ───────── */

test('R4 入場曲：新しい設定タブではじめから「なし」（黄色の「ここに書く」の印は付かない）。▼は あり／なし のまま', () => {
  const h = harness(); h.call('onOpen');
  const rows = h.rows('設定'), index = rows.findIndex((r) => r[0] === '入場曲');
  assert.equal(index + 1, 9, 'B9');
  assert.equal(rows[index][1], 'なし');
  assert.equal(h.settingsSheet().backgrounds.get((index + 1) + ':2'), undefined, '色は付けない');
  assert.equal(JSON.stringify(h.settingsSheet().validations.get((index + 1) + ':2').list), JSON.stringify(['あり', 'なし']));
  const gs = read('public/templates/Tournament_OS_Google受付_v3.gs');
  assert.match(gs, /const WRITE_LABELS = \['大会名', '開催日', '会場', '主催者名', '問い合わせ先', '申込締切'\];/);
});

/* ───────── 追加（owner 2026-10-23）：エントリーは本名だけ。あだ名は無し ───────── */

test('本名だけ：選手名の説明は「本名で入れてください。あだ名・リングネームは、入れないでください。」。「あだ名でもOK」は、どこにも残らない（花道のリングネーム欄の説明は別）', () => {
  const page = read('app/apply/page.tsx');
  assert.ok(page.includes("name: { hint: '本名を入れてください。', example: ['山田 太郎'] },"));
  assert.ok(!/試合で呼ばれる名前です。本名でも、あだ名でもOK/.test(page), '選手名の古い説明が残っていない');
  const manual = read('docs/TOURNAMENT_OS_使い方マニュアル.md');
  assert.ok(manual.includes('選手名（本名を入れてください。例：山田 太郎）'));
  assert.ok(!manual.includes('選手名（試合で呼ばれる名前です'), '説明書の選手名の説明も新しい文');
});
