import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { HANAMICHI_ITEMS } from '../core/hanamichi.ts';

/*
  花道の追加の質問：点検で見つかった5つの直しの、ソースの約束。
  画面のふるまい（黄色の場所・札の行数・帯の下に出るか）は scripts/test-hanamichi-apply.mjs の N と、scripts/test-weight-class.mjs の F8 が、本物のブラウザで確かめる。
  ここでは、直した所が元にもどらないよう、ソースの形を固定する。
*/
const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const PAGE = read('app/apply/page.tsx');
const SETUP = read('app/private/setup/page.tsx');

test('直し1: 設定の画面は、古い版（3.20261019.6 など）に、花道のための ⚠ も黄色の注意も出さない（使わない大会にも出てしまうため）', () => {
  assert.doesNotMatch(SETUP, /hanamichiCaution|hanamichiPossible|isHanamichiDivision/, '区分に「花道」があるだけで出る注意を持たない');
  assert.doesNotMatch(SETUP, /Googleのプログラムが古いです|花道の追加情報に対応していません/);
  const at = SETUP.indexOf('const hanamichiRowText = ');
  const block = SETUP.slice(at, SETUP.indexOf(';\n', at) + 2);
  assert.match(block, /ping\?\.hanamichiMode && supportsHanamichi\(ping\)/, '「あり」と読むのは、新しい版が鍵を返したときだけ');
  assert.doesNotMatch(block, /!supportsHanamichi/, '古い版を別の言葉にしない（前と同じ「なし」）');
  assert.equal((SETUP.match(/\{classCaution \?\? weightCaution\}/g) ?? []).length, 2, '黄色の注意は、前と同じ2つの並びだけ');
});

test('直し2: 任意の項目（職業・他格闘歴）に赤いまちがいが出たら、黄色の「次はここ」はそこへ行く。入力 N/M の数は変えない', () => {
  const todo = PAGE.slice(PAGE.indexOf('const hnTodoOrder'), PAGE.indexOf(';\n', PAGE.indexOf('const hnTodoOrder')) + 2);
  assert.match(todo, /item\.required \? Boolean\(hnNf\[item\.key\]\) : true/, '任意の項目は、空でも「できた」。まちがいが出たときだけ、黄色が行く');
  assert.match(todo, /!item\.required \|\| /, '任意の項目は、いつも順番に入る');
  assert.match(PAGE, /\.\.\.hnTodoOrder,\s*\n\s*\['contactName'/, '「次はここ」を決める順番(order)には、任意も入れる');
  const info = PAGE.slice(PAGE.indexOf('const infoItems'), PAGE.indexOf('const contactItems'));
  assert.match(info, /\.\.\.hnOrder\.map/, '入力 N/M の数は、必須だけの hnOrder のまま');
  assert.doesNotMatch(info, /hnTodoOrder/);
  const optional = HANAMICHI_ITEMS.filter((item) => !item.required).map((item) => item.key);
  assert.deepEqual(optional, ['hnOther', 'hnJob'], '任意は、この2つ（表を変えたら、この試験と画面の試験 N を見直す）');
});

test('直し3: 「次はここ」の札は、320pxで2行におさまる長さ。長い名前（リングネームのフリガナ）だけ短くする。見出しとほかの文は、そのまま', () => {
  const map = PAGE.match(/const HN_MARK_NAME[^=]*= \{([^}]*)\}/);
  assert.ok(map, 'HN_MARK_NAME がある');
  const pairs = [...map![1].matchAll(/(hn\w+): '([^']+)'/g)].map((m) => [m[1], m[2]] as const);
  assert.deepEqual(pairs.map(([key]) => key), ['hnRingKana']);
  const short = new Map<string, string>(pairs);
  // 320pxで実際に測った（scripts/test-hanamichi-apply.mjs の N2 が、ぜんぶの札を本物のブラウザで測る）：「リングネームのフリガナを入れる／直す」だけが3行（90px）。ほかは2行（62px）以下
  const ring = HANAMICHI_ITEMS.find((item) => item.key === 'hnRingKana')!;
  const name = short.get('hnRingKana')!;
  assert.ok(name.length < ring.label.length, '短い名前にしてある');
  assert.ok((name + 'を入れる').length <= 10 && (name + 'を直す').length <= 10, '短い名前なら、どちらの言い方も2行に楽におさまる: ' + name);
  assert.equal(ring.label, 'リングネームのフリガナ', '欄の見出しと、シートの見出しは、短くしない');
  // 見出し（欄の名前）と、赤い帯の「直す所：…」は、短くしない
  assert.match(PAGE, /const SHORT: Record<Key, string> = \{ \.\.\.HN_SHORT,/);
  assert.match(PAGE, /return !empty && shown\(key\) \? `\$\{SHORT\[key\]\}を直す` : NEXT_LABEL\[key\];/, '前からの「直す」の行は、そのまま');
  assert.match(PAGE, /if \(isHnKey\(key\) && HN_MARK_NAME\[key\] && !empty && shown\(key\)\) return `\$\{HN_MARK_NAME\[key\]\}を直す`;/);
});

test('直し4: focusField は、花道の欄では、入力欄でなく見出しから下の箱の頭を、帯の下にそろえる。花道でない欄の動きは、そのまま', () => {
  const at = PAGE.indexOf('const focusField = ');
  const block = PAGE.slice(at, PAGE.indexOf('\n  };', at));
  assert.match(block, /if \(isHnKey\(key\)\) \{[\s\S]*?closest\('div\.relative'\)[\s\S]*?\} else if \(rect\.height > window\.innerHeight \* 0\.45\)/, '花道の欄だけ、別の合わせ方');
  assert.match(block, /window\.scrollTo\(\{ top: Math\.max\(0, window\.scrollY \+ rect\.top - bar - 150\) \}\);/, '花道でない欄の合わせ方（入力欄から150px上）は、そのまま');
  assert.match(block, /Math\.min\(window\.innerHeight \* 0\.35, 160\) \+ 16/, 'ふつうの欄の帯の高さの見積もりは、そのまま');
  assert.match(block, /Math\.min\(window\.innerHeight \* 0\.35, 190\) \+ 16/, '花道の欄は、帯が35%まで伸びることも見込む');
});

// 変えた理由：R6a-6/7（採点からの最適化。owner 回答：花道の答えはすべてアナウンスで使う）。見る人は「主催者と運営スタッフだけ」にそろえ、花道の1行は「アナウンスで読み上げることがある」とはっきり書く
test('直し5: 「使い道」の中の言い方を1つにそろえる。見る人は1つ（主催者と運営スタッフだけ）。花道の答えも「集めるもの」に入れる', () => {
  assert.doesNotMatch(PAGE, /主催者だけが見ます/);
  assert.match(PAGE, /<li>集めるもの：選手の情報・顔写真・連絡先（名前・電話・メール・写真）\{hanamichiOn \? '、花道の追加の質問の答え（生年月日・職業など）' : null\}<\/li>/);
  assert.match(PAGE, /<li>見る人：申し込みの元データは、主催者と運営スタッフだけが見ます<\/li>/);
  assert.match(PAGE, /\{hanamichiOn \? <li>花道の質問の答え（フリガナ・リングネーム・生年月日・キック歴・練習頻度・他格闘歴・職業・趣味・始めた理由・メッセージ）は、会場のアナウンスで読み上げることがあります。会場の画面や掲示する表には、出ません。<\/li> : null\}/);
  // 同意の文と、この「使い道」は、同じことを言う（花道の答えも集める）
  assert.match(PAGE, /花道の追加の質問の答え（生年月日・職業など）も、集めます。/);
});
