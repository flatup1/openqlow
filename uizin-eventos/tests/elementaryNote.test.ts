import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { noClassReviewValue, NO_CLASS_NOTE, NO_CLASS_NOTE_APPLY } from '../core/weightClass.ts';

/*
  小学生（階級のない区分）の説明文。オーナーの言葉のまま、定数1つ（core/weightClass.ts の NO_CLASS_NOTE）から出す。
  出す場所は4つ：申込ページの灰色の説明／申込ページの送る前の確認の「階級」の行／準備の画面（cards.tsx）／ほかのジム用の画面（entry/page.tsx）。
  この試験は、文の中身（オーナーの文のまま・文の数・言ってはいけない言葉）と、4つの場所が手書きでなく定数から出ていることを調べる。
*/

const OWNER_NOTE = 'この区分には階級がありません。小学生の試合は、申し込みの体重を目安に、近い学年（1〜2年の差）・近い体重（2〜3kgの差）の選手どうしで組みます。目安なので、ちがうこともあります。';
const OWNER_BODY = '小学生の試合は、申し込みの体重を目安に、近い学年（1〜2年の差）・近い体重（2〜3kgの差）の選手どうしで組みます。目安なので、ちがうこともあります。';
const src = (path: string): string => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('小学生の文: オーナーの文のまま。文頭は今までと同じ（古い試験が文頭で調べる）', () => {
  assert.equal(NO_CLASS_NOTE, OWNER_NOTE);
  assert.ok(NO_CLASS_NOTE.startsWith('この区分には階級がありません。'));
  assert.ok(NO_CLASS_NOTE.endsWith('。'));
});

test('小学生の文: 3文（「。」が3つ。文の途中に「。」や改行がない）', () => {
  assert.equal(NO_CLASS_NOTE.split('。').length - 1, 3);
  assert.deepEqual(NO_CLASS_NOTE.split('。').filter(Boolean), [
    'この区分には階級がありません',
    '小学生の試合は、申し込みの体重を目安に、近い学年（1〜2年の差）・近い体重（2〜3kgの差）の選手どうしで組みます',
    '目安なので、ちがうこともあります',
  ]);
  assert.ok(!/[\r\n]/.test(NO_CLASS_NOTE), '1つの段落');
});

test('小学生の文: 約束に読める言葉を書かない（必ず・保証・安全・ケガ・勝て・同じ体重・同じ学校・友だち・希望の相手）。「目安」と「ちがうこともあります」は残す', () => {
  for (const word of ['必ず', '保証', '安全', 'ケガ', '勝て', '同じ体重', '同じ学校', '友だち', '希望の相手']) {
    assert.ok(!NO_CLASS_NOTE.includes(word), '「' + word + '」が入っている');
    assert.ok(!noClassReviewValue().includes(word), '確認の行に「' + word + '」が入っている');
  }
  assert.ok(NO_CLASS_NOTE.includes('目安'));
  assert.ok(NO_CLASS_NOTE.includes('ちがうこともあります'));
});

test('小学生の文: クラスは本人が選ぶ決まりと矛盾しない（「クラスは会長が」などと読める言い方がない）。「案」「仮」の字も出さない', () => {
  assert.ok(!NO_CLASS_NOTE.includes('クラス'), 'クラスの話は、この文に入れない（クラス分けなしの大会でも、同じ文でよい）');
  for (const bad of ['クラスは会長', 'クラスは主催者', 'クラスを決め', '会長が', '主催者が']) assert.ok(!NO_CLASS_NOTE.includes(bad), '「' + bad + '」が入っている');
  assert.ok(!/案|仮/.test(NO_CLASS_NOTE), '画面に「案」「仮」の字を出さない');
});

test('小学生の文: 送る前の確認の行は、定数のうしろ2文を「なし（ ）」で包んだ形。階級の行に、先頭の文はくり返さない', () => {
  assert.equal(noClassReviewValue(), 'なし（' + OWNER_BODY + '）');
  assert.ok(NO_CLASS_NOTE.endsWith(OWNER_BODY), '確認の行の中身は、定数のうしろ2文と同じ');
  assert.ok(!noClassReviewValue().includes('この区分には階級がありません'));
});

test('小学生の文: 4つの場所が、定数1つから出している（手書きの古い文が残っていない）', () => {
  const apply = src('app/apply/page.tsx');
  const cards = src('app/private/cards.tsx');
  const entry = src('app/private/entry/page.tsx');
  // 読み込み：4つのファイルとも、core/weightClass.ts から取る
  const importsFrom = (source: string, name: string): boolean => new RegExp('import\\s*\\{[^}]*\\b' + name + '\\b[^}]*\\}\\s*from\\s*\'[^\']*core/weightClass\\.ts\'').test(source);
  // 1) 申込ページの灰色の説明（id f-weightClass-none）。見出しが「出場区分」になったので、同じ文の「この区分には」だけを「この出場区分には」にした定数（NO_CLASS_NOTE_APPLY。文の元は NO_CLASS_NOTE の1つ）
  assert.ok(importsFrom(apply, 'NO_CLASS_NOTE_APPLY'));
  assert.ok(/<Note id="f-weightClass-none"[^>]*>\{NO_CLASS_NOTE_APPLY\}<\/Note>/.test(apply), '申込ページの灰色の説明は NO_CLASS_NOTE_APPLY');
  assert.equal(NO_CLASS_NOTE_APPLY, NO_CLASS_NOTE.replace('この区分には', 'この出場区分には'), '直したのは「区分」の言い方だけ');
  assert.equal(NO_CLASS_NOTE_APPLY.replace('この出場区分には', 'この区分には'), NO_CLASS_NOTE, 'それ以外の字は、オーナーの文のまま');
  // 2) 申込ページの送る前の確認の「階級」の行
  assert.ok(importsFrom(apply, 'noClassReviewValue'));
  assert.ok(/\['階級', noClass \? noClassReviewValue\(\)/.test(apply), '確認の「階級」の行は noClassReviewValue()');
  // 3) 準備の画面（cards.tsx の divSetting && wcList.length === 0 の行）
  assert.ok(importsFrom(cards, 'NO_CLASS_NOTE'));
  assert.ok(/divSetting && wcList\.length === 0 \? <Soft className="mt-1">\{NO_CLASS_NOTE\}<\/Soft>/.test(cards), '準備の画面は NO_CLASS_NOTE');
  // 4) ほかのジム用の画面（entry/page.tsx の entry-weightClass-none）。選手に見える画面なので、申込ページと同じ「出場区分」の言い方
  assert.ok(importsFrom(entry, 'NO_CLASS_NOTE_APPLY'));
  assert.ok(/id="entry-weightClass-none"[^>]*>\{NO_CLASS_NOTE_APPLY\}<\/p>/.test(entry), 'ほかのジム用の画面も、選手に見える画面なので NO_CLASS_NOTE_APPLY（見出し「出場区分」と合わせる）');
  // 手書きの文が、どこにも残っていない（古い文も、新しい文の手書きも）
  for (const [name, source] of [['apply', apply], ['cards', cards], ['entry', entry]] as const) {
    assert.ok(!source.includes('この区分には階級がありません'), name + ' に、手書きの文が残っている');
    assert.ok(!source.includes('体重が近い人どうしで組みます'), name + ' に、古い文が残っている');
    assert.ok(!source.includes('近い学年（1〜2年の差）'), name + ' に、新しい文が手書きされている');
  }
  // 定数は、core/weightClass.ts の1か所だけで書く
  const core = src('core/weightClass.ts');
  assert.equal(core.split('この区分には階級がありません').length - 1, 1, '文は core/weightClass.ts に1回だけ');
  assert.equal(core.split('近い学年（1〜2年の差）').length - 1, 1);
});
