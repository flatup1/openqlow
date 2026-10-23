import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DEFAULT_CLASS_SETTINGS } from '../core/classRules.ts';
import { LINK_END_KEY, publicEntryConfig, publicEntryHash, publicEntryLinkCut, publicEntryReady, type PublicEntryConfig } from '../core/publicEntry.ts';
import { DEFAULT_WEIGHT_SETTINGS } from '../core/weightClass.ts';

/*
  花道の追加の質問：申し込みリンクの鍵（hn=on）と、申し込みページの「設定なし」の約束。
  1つ目の塊（golden）は、花道が入る前のコードで書いて、そのまま通した。設定が「なし」のときの出力は、1字も変わらない。
*/
const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const ENDPOINT = 'https://script.google.com/macros/s/AKfycbyTEST_ONLY/exec';
const cfg: PublicEntryConfig = { endpoint: ENDPOINT, eventId: 'test-cup', title: '架空大会', organizer: '架空主催', date: '2027年10月3日', venue: '架空体育館', venueUrl: '', deadline: '2099-11-30', contact: '連絡先', music: true, grade: 'optional', age: 'optional', comment: 'optional', protocol: '3', mode: 'live' };

const HEAD = '#endpoint=https%3A%2F%2Fscript.google.com%2Fmacros%2Fs%2FAKfycbyTEST_ONLY%2Fexec&eventId=test-cup&title=%E6%9E%B6%E7%A9%BA%E5%A4%A7%E4%BC%9A&organizer=%E6%9E%B6%E7%A9%BA%E4%B8%BB%E5%82%AC&date=2027%E5%B9%B410%E6%9C%883%E6%97%A5&venue=%E6%9E%B6%E7%A9%BA%E4%BD%93%E8%82%B2%E9%A4%A8&venueUrl=&deadline=2099-11-30&contact=%E9%80%A3%E7%B5%A1%E5%85%88&music=on&grade=optional&age=optional&comment=optional';
const GOLDEN = {
  plain: HEAD + '&protocol=3&mode=live&end=1',
  weights: HEAD + '&wc=on&logo=on&protocol=3&mode=live&end=1',
  classes: HEAD + '&cls=on&protocol=3&mode=live&end=1',
  all: HEAD + '&cls=on&wc=on&logo=on&protocol=3&mode=test&end=1',
};

// ---------- golden：花道の設定が「なし」のとき、リンクは今までと同じ ----------
test('golden: 花道なしのリンクは、1字も変わらない（鍵 hn は作らない）', () => {
  assert.equal(publicEntryHash(cfg), GOLDEN.plain);
  assert.equal(publicEntryHash({ ...cfg, weights: DEFAULT_WEIGHT_SETTINGS, logo: true }), GOLDEN.weights);
  assert.equal(publicEntryHash({ ...cfg, classes: DEFAULT_CLASS_SETTINGS }), GOLDEN.classes);
  assert.equal(publicEntryHash({ ...cfg, classes: DEFAULT_CLASS_SETTINGS, weights: DEFAULT_WEIGHT_SETTINGS, logo: true, mode: 'test' }), GOLDEN.all);
  for (const hash of Object.values(GOLDEN)) {
    assert.ok(!/[#&]hn=|hanamichi/.test(hash), 'hn も hanamichi も無い');
    assert.equal(publicEntryLinkCut(hash), false, '完全なリンクは切れていない');
    assert.equal('hanamichi' in publicEntryConfig(hash), false, '読んだ設定に hanamichi の項目は無い');
    assert.equal(publicEntryReady(publicEntryConfig(hash)), true);
  }
  assert.deepEqual(publicEntryConfig(GOLDEN.plain), { ...cfg, venueUrl: '' });
});

test('golden: hn の無い昔のリンク（end も無い）は、切れていない。これまでの往復は変わらない', () => {
  const old = GOLDEN.plain.replace(/&end=1$/, '');
  assert.equal(publicEntryLinkCut(old), false);
  assert.equal(publicEntryConfig(old).hanamichi, undefined);
  assert.equal(publicEntryReady(publicEntryConfig(old)), true);
  assert.deepEqual(publicEntryConfig(publicEntryHash(cfg)), { ...cfg, venueUrl: '' });
  assert.equal(publicEntryConfig(publicEntryHash(cfg) + '&unknown=1').title, '架空大会', '知らない項目は無視');
  assert.equal('hanamichi' in publicEntryConfig(publicEntryHash(cfg) + '&unknown=1'), false);
});

test('golden: 申し込みページの POST の鍵は、花道なしなら今までと同じ（鍵の一覧と並びを固定）', () => {
  const page = read('app/apply/page.tsx');
  const post = page.slice(page.indexOf('<form ref={formRef}'), page.indexOf('</form>', page.indexOf('<form ref={formRef}')));
  // 花道の鍵は、ぜんぶ ...(花道のとき) の中に入っていて、ふつうの鍵の並びは動かない
  assert.match(post, /\{ protocol: config\.protocol === '3' \? '3' : '2', entryKey: config\.entryKey \|\| '', mode: config\.mode \|\| '', website: '', eventId: config\.eventId, requestId, gym: nf\.gym, name: nf\.name, grade: postGrade, age: postAge, height: nf\.height\.replace\(\/cm\$\/i, ''\), weight: nf\.weight\.replace\(\/kg\$\/i, ''\), record: nf\.record, fighterClass: classes \? chosenClass : '', \.\.\.\(weights \? \{ division, weightClass: needClass \? weightClass : '' \} : \{\}\), comment: postComment, musicUrl: config\.music \? nf\.musicUrl : '', contactName: cname, contactPhone: phone, contactEmail: email, consent: consent \? 'yes' : 'no', photoDataUrl: photo(?: \}|, \.\.\.hanamichiPost \})/, '花道より前の鍵の並びは、そのまま');
  assert.equal((post.match(/\bhn[A-Z]\w+/g) || []).length, 0, 'フォームの行に、花道の鍵を直に書かない（hanamichiPost 経由だけ）');
});

// ---------- hn=on ----------
const withHn: PublicEntryConfig = { ...cfg, hanamichi: true };

test('hn: リンクは hn=on を、階級・ロゴのあと・protocol のまえに足す。false や無しでは作らない', () => {
  const link = publicEntryHash(withHn);
  assert.equal(link, GOLDEN.plain.replace('&protocol=3', '&hn=on&protocol=3'), '既存のキーのあとに hn=on（ほかは1字も変わらない）');
  assert.equal(publicEntryHash({ ...cfg, hanamichi: false }), GOLDEN.plain, 'false なら作らない（hanamichi=off も出さない）');
  assert.ok(!/hanamichi/.test(link), '飛ばす一覧：hanamichi という名前の鍵は、リンクに出さない');
  const all = publicEntryHash({ ...cfg, classes: DEFAULT_CLASS_SETTINGS, weights: DEFAULT_WEIGHT_SETTINGS, logo: true, hanamichi: true, mode: 'test' });
  assert.equal(all, GOLDEN.all.replace('&protocol=3', '&hn=on&protocol=3'));
  const order = ['&cls=on', '&wc=on', '&logo=on', '&hn=on', '&protocol=3', '&mode=test', '&' + LINK_END_KEY + '=1'].map((key) => all.indexOf(key));
  assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), '並び：クラス → 階級 → ロゴ → hn → protocol → mode → end：' + order.join(','));
  assert.ok(all.endsWith('&end=1'), '最後は end=1');
  assert.ok(publicEntryHash({ ...cfg, classes: { ...DEFAULT_CLASS_SETTINGS, upper: { ...DEFAULT_CLASS_SETTINGS.upper, name: 'あ'.repeat(12) } }, weights: DEFAULT_WEIGHT_SETTINGS, logo: true, hanamichi: true }).length <= 4500, 'hn を足しても、4500文字をこえない');
});

test('hn: 往復（作る → 読む）。読めるのは protocol が 3 のときだけ', () => {
  const link = publicEntryHash(withHn);
  assert.deepEqual(publicEntryConfig(link), { ...withHn, venueUrl: '' });
  assert.equal(publicEntryConfig(link).hanamichi, true);
  assert.equal(publicEntryReady(publicEntryConfig(link)), true);
  const all = { ...cfg, classes: DEFAULT_CLASS_SETTINGS, weights: DEFAULT_WEIGHT_SETTINGS, logo: true, hanamichi: true };
  assert.deepEqual(publicEntryConfig(publicEntryHash(all)), { ...all, venueUrl: '' });
  // protocol が 3 でなければ無視（古い受付に花道の鍵は送らない）
  assert.equal('hanamichi' in publicEntryConfig(link.replace('protocol=3', 'protocol=2')), false, 'protocol 2');
  assert.equal('hanamichi' in publicEntryConfig(link.replace('&protocol=3', '')), false, 'protocol なし');
  assert.equal('hanamichi' in publicEntryConfig('#hn=on'), false);
  // hn は on だけ有効
  for (const bad of ['off', 'ON', 'On', 'yes', '1', 'o', '', 'true']) assert.equal('hanamichi' in publicEntryConfig(link.replace('hn=on', 'hn=' + bad)), false, 'hn=' + bad + ' は読まない');
});

test('hn: 切れ判定。hn は on だけ有効、ほかの値は切れ。end が無ければ切れ。hn の無い昔のリンクは切れではない', () => {
  const link = publicEntryHash(withHn);
  assert.equal(publicEntryLinkCut(link), false);
  for (const bad of ['off', 'ON', 'yes', '1', 'o', '', 'true']) assert.equal(publicEntryLinkCut(link.replace('hn=on', 'hn=' + bad)), true, 'hn=' + bad + ' は切れ');
  assert.equal(publicEntryLinkCut(link.replace(/&end=1$/, '')), true, 'hn があるのに end=1 が無い');
  assert.equal(publicEntryLinkCut(link.replace(/&end=1$/, '&end=')), true);
  assert.equal(publicEntryLinkCut(link.replace('&hn=on', '')), false, 'hn の無い（昔の）リンクは、切れではない');
  assert.equal(publicEntryLinkCut(link.replace('&hn=on', '').replace(/&end=1$/, '')), false, 'hn も end も無い昔のリンク');
  assert.equal(publicEntryLinkCut(link.replace('&protocol=3&mode=live&end=1', '')), true, 'hn のあとが全部無い');
  assert.equal(publicEntryLinkCut(link.replace('&mode=live&end=1', '')), true, 'protocol のあとが無い');
  assert.equal(publicEntryLinkCut(link.replace('&end=1', '')), true, 'end だけ無い');
  assert.equal(publicEntryLinkCut(link.replace('protocol=3', 'protocol=2')), false, 'protocol 2 の hn は、無視されるだけ（切れではない）');
});

test('hn: リンクのどこで切れても、「そのまま使える」か「止まる」かのどちらか（hn が黙って消えない）', () => {
  for (const [name, config] of [['花道', withHn], ['花道＋階級＋ロゴ', { ...cfg, weights: DEFAULT_WEIGHT_SETTINGS, logo: true, hanamichi: true }], ['花道＋クラス＋階級', { ...cfg, classes: DEFAULT_CLASS_SETTINGS, weights: DEFAULT_WEIGHT_SETTINGS, hanamichi: true, mode: 'test' }]] as Array<[string, PublicEntryConfig]>) {
    const full = publicEntryHash(config);
    const fullConfig = publicEntryConfig(full);
    assert.equal(publicEntryLinkCut(full), false, name);
    assert.equal(publicEntryReady(fullConfig), true, name);
    let accepted = 0;
    for (let n = 0; n < full.length; n++) {
      const prefix = full.slice(0, n);
      if (publicEntryLinkCut(prefix) || !publicEntryReady(publicEntryConfig(prefix))) continue; // 止まる（赤い箱）
      accepted++;
      assert.deepEqual(publicEntryConfig(prefix), fullConfig, name + ': 長さ' + n + 'で使えるとされたのに、設定が欠けている');
    }
    assert.equal(accepted, 0, name + ': 花道のリンクは、完全でないものを1つも通さない（通した ' + accepted + '）');
  }
});

test('hn: 申し込みページは hn を、花道の区分を選んだときだけ使う。ソースの約束', () => {
  const page = read('app/apply/page.tsx');
  assert.match(page, /isHanamichiDivision\(/, '区分の名前に「花道」が入っているかは、core の1か所で決める');
  assert.match(page, /config\.hanamichi/);
  assert.doesNotMatch(page, /申込/, '「申込」ではなく「申し込み」（コメントにも書かない）');
  assert.doesNotMatch(page, /text-base/, '文字は17px以上');
  assert.doesNotMatch(page, /\bfetch\s*\(|\.at\(|Object\.hasOwn|\(\?<[=!]/, '古い Safari と、外への通信の禁止');
  assert.doesNotMatch(page, /placeholder="[^"]*(山田|田中|佐藤)/, '入力欄の例に、実名らしい名前を置かない');
  const css = read('app/globals.css');
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /@layer\b/, '手書きCSSに @layer の規則を書かない（Safari 15。コメントの中の言葉は、かまわない）');
  const birth = css.split('\n').filter((line) => line.includes('.tos-birth'));
  assert.ok(birth.length >= 2, '生年月日の3つの欄の並べ方は、globals.css の手書きの規則で決める');
  assert.ok(birth.every((line) => !/@layer|color-mix|oklch|:has\(/.test(line)), '古い Safari で読めない書き方を使わない');
});
