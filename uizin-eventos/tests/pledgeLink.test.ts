import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DEFAULT_CLASS_SETTINGS } from '../core/classRules.ts';
import { packPledge, PLEDGE_LIMITS, PLEDGE_LINK_KEYS, PLEDGE_POST_KEYS, unpackPledge, type PledgeConfig } from '../core/pledge.ts';
import { LINK_END_KEY, publicEntryConfig, publicEntryHash, publicEntryLinkCut, publicEntryReady, type PublicEntryConfig } from '../core/publicEntry.ts';
import { DEFAULT_WEIGHT_SETTINGS } from '../core/weightClass.ts';
import { blankPledgeAnswers, GYM_PERMISSION_LABEL, GYM_PERMISSION_NOTE, isPledgeItemKey, isPledgeKey, pledgeIssues, pledgeLockReason, pledgeOrder, pledgePlan, pledgePost, PLEDGE_BLOCKED_TEXT, type PledgeAnswers } from '../app/components/pledgeForm.ts';

/*
  誓約書：申し込みリンクの鍵（pl・plg・plm・plc・plf・plt）と、申し込みページの部品の約束。
  1つ目の塊（golden）は、誓約書が入る前のコードで書いて、そのまま通した。誓約書の設定が「なし」のときの出力は、1字も変わらない。
  この試験の文は、ぜんぶ『テスト用の文です1』のような架空の文。本物の誓約・同意の文は、ここにも無い。
*/
const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const ENDPOINT = 'https://script.google.com/macros/s/AKfycbyTEST_ONLY/exec';
const cfg: PublicEntryConfig = { endpoint: ENDPOINT, eventId: 'test-cup', title: '架空大会', organizer: '架空主催', date: '2027年10月3日', venue: '架空体育館', venueUrl: '', deadline: '2099-11-30', contact: '連絡先', music: true, grade: 'optional', age: 'optional', comment: 'optional', protocol: '3', mode: 'live' };
const HEAD = '#endpoint=https%3A%2F%2Fscript.google.com%2Fmacros%2Fs%2FAKfycbyTEST_ONLY%2Fexec&eventId=test-cup&title=%E6%9E%B6%E7%A9%BA%E5%A4%A7%E4%BC%9A&organizer=%E6%9E%B6%E7%A9%BA%E4%B8%BB%E5%82%AC&date=2027%E5%B9%B410%E6%9C%883%E6%97%A5&venue=%E6%9E%B6%E7%A9%BA%E4%BD%93%E8%82%B2%E9%A4%A8&venueUrl=&deadline=2099-11-30&contact=%E9%80%A3%E7%B5%A1%E5%85%88&music=on&grade=optional&age=optional&comment=optional';
const GOLDEN = {
  plain: HEAD + '&protocol=3&mode=live&end=1',
  weights: HEAD + '&wc=on&logo=on&protocol=3&mode=live&end=1',
  hn: HEAD + '&hn=on&protocol=3&mode=live&end=1',
  all: HEAD + '&cls=on&wc=on&logo=on&hn=on&protocol=3&mode=test&end=1',
};
const HASH = '0123456789abcdef'.repeat(4);
const HASH2 = 'fedcba9876543210'.repeat(4);
const FAKE: PledgeConfig = { items: ['テスト用の文です1', 'テスト用の文です2', 'テスト用の文です3', 'テスト用の文です4', 'テスト用の文です5'], guardian: 'テスト用の保護者の文です', gym: 'テスト用のジムの文です', mode: 'under18', gymMode: true, confirmed: true };
const withPledge: PublicEntryConfig = { ...cfg, pledge: FAKE, pledgeHash: HASH };
const KEYS = PLEDGE_LINK_KEYS as readonly string[];
const keysOf = (hash: string) => [...new URLSearchParams(hash.replace(/^#/, '')).keys()];

// ---------- golden：誓約書の設定が「なし」のとき、リンクは今までと同じ ----------
test('golden: 誓約書なしのリンクは、1字も変わらない（pl の鍵は作らない）', () => {
  assert.equal(publicEntryHash(cfg), GOLDEN.plain);
  assert.equal(publicEntryHash({ ...cfg, weights: DEFAULT_WEIGHT_SETTINGS, logo: true }), GOLDEN.weights);
  assert.equal(publicEntryHash({ ...cfg, hanamichi: true }), GOLDEN.hn);
  assert.equal(publicEntryHash({ ...cfg, classes: DEFAULT_CLASS_SETTINGS, weights: DEFAULT_WEIGHT_SETTINGS, logo: true, hanamichi: true, mode: 'test' }), GOLDEN.all);
  for (const hash of Object.values(GOLDEN)) {
    assert.ok(!KEYS.some((key) => keysOf(hash).includes(key)), 'pl の鍵が無い');
    assert.ok(!/pledge/i.test(hash), 'pledge という名前も無い');
    assert.equal(publicEntryLinkCut(hash), false, '完全なリンクは切れていない');
    assert.equal('pledge' in publicEntryConfig(hash), false, '読んだ設定に pledge の項目は無い');
    assert.equal('pledgeHash' in publicEntryConfig(hash), false);
    assert.equal(publicEntryReady(publicEntryConfig(hash)), true);
  }
  // pledge が無い・undefined・hash だけ、のときも鍵を作らない
  assert.equal(publicEntryHash({ ...cfg, pledge: undefined }), GOLDEN.plain);
  assert.equal(publicEntryHash({ ...cfg, pledgeHash: HASH }), GOLDEN.plain, 'hash だけでは作らない');
  assert.deepEqual(publicEntryConfig(GOLDEN.plain), { ...cfg, venueUrl: '' });
});

test('golden: 誓約書の鍵が無い昔のリンク（end も無い）は、切れていない。知らない鍵は無視', () => {
  const old = GOLDEN.plain.replace(/&end=1$/, '');
  assert.equal(publicEntryLinkCut(old), false);
  assert.equal(publicEntryReady(publicEntryConfig(old)), true);
  assert.equal('pledge' in publicEntryConfig(old), false);
  assert.equal(publicEntryConfig(GOLDEN.plain + '&unknown=1').title, '架空大会');
  assert.equal('pledge' in publicEntryConfig(GOLDEN.plain + '&unknown=1'), false);
});

test('golden: 申し込みページの POST の鍵は、誓約書なしなら今までと同じ（今までの並びは動かない・足すのは別の入れ物から）', () => {
  const page = read('app/apply/page.tsx');
  const post = page.slice(page.indexOf('<form ref={formRef}'), page.indexOf('</form>', page.indexOf('<form ref={formRef}')));
  assert.match(post, /photoDataUrl: photo, \.\.\.hanamichiPost \}\)\.map\(\(\[name, value\]\) => <input key=\{name\} type="hidden" name=\{name\} value=\{value\} \/>\)\}\s+\{Object\.entries\(pledgeNow\)\.map\(/, '今までの鍵は1字も動かさない。誓約書の鍵は、そのあとに別の入れ物（pledgeNow）から足す（誓約書なしなら {}）');
  assert.equal((post.match(/\bpledge\w*|gymName|gymPhone|gymPermission/g) || []).join(','), 'pledgeNow', 'フォームの行に、誓約書の鍵を直に書かない（pledgeNow 経由だけ）');
  assert.ok(/pledgePost\(plan, pa, config\.pledgeHash \?\? ''\)/.test(page), 'pledgeNow は、誓約書の部品の pledgePost が作る');
});

// ---------- リンクの鍵：pl, plg, plm, plc, plf, plt ----------
test('pl: リンクは pl・plg・plm・plc・plf・plt をこの順に、ロゴ・花道のあと・protocol のまえに足す。鍵の名前は PLEDGE_LINK_KEYS', () => {
  assert.deepEqual([...PLEDGE_LINK_KEYS], ['pl', 'plg', 'plm', 'plc', 'plf', 'plt']);
  const link = publicEntryHash(withPledge);
  const plt = packPledge(FAKE.items, FAKE.guardian, FAKE.gym);
  assert.equal(link, HEAD + '&pl=on&plg=under18&plm=on&plc=on&plf=' + HASH + '&plt=' + plt + '&protocol=3&mode=live&end=1');
  assert.ok(!/pledge/i.test(link.replace(/plt=[^&]*/, '')), '飛ばす一覧：pledge・pledgeHash という名前の鍵は、リンクに出さない');
  const all = publicEntryHash({ ...cfg, classes: DEFAULT_CLASS_SETTINGS, weights: DEFAULT_WEIGHT_SETTINGS, logo: true, hanamichi: true, pledge: FAKE, pledgeHash: HASH, mode: 'test' });
  const marks = ['&cls=on', '&wc=on', '&logo=on', '&hn=on', '&pl=on', '&plg=', '&plm=', '&plc=', '&plf=', '&plt=', '&protocol=3', '&mode=test', '&' + LINK_END_KEY + '=1'].map((key) => all.indexOf(key));
  assert.ok(marks.every((at, i) => at > 0 && (i === 0 || at > marks[i - 1])), '並び：クラス → 階級 → ロゴ → hn → pl → plg → plm → plc → plf → plt → protocol → mode → end：' + marks.join(','));
  assert.ok(all.endsWith('&end=1'), '最後は end=1');
  // 値の書き方
  const off = publicEntryHash({ ...cfg, pledge: { ...FAKE, mode: 'none', gymMode: false, confirmed: false }, pledgeHash: HASH2 });
  assert.match(off, /&pl=on&plg=none&plm=off&plc=off&plf=fedcba9876543210/);
  assert.match(publicEntryHash({ ...cfg, pledge: { ...FAKE, mode: 'all' }, pledgeHash: HASH }), /&plg=all&/);
});

test('pl: 往復（作る → 読む）。文は、ひらがな・漢字・全角・絵文字・ASCII・セル内改行・サロゲートのまま戻る。読めるのは protocol が 3 のときだけ', () => {
  const texts = ['テスト用の文です1', 'ひらがなのぶんです', '漢字と全角ＡＢＣ１２３', '絵文字😀🥋と𠮷野家', 'ASCII only: a=1&b=2?c#d%e+f', '1行目\n2行目\r\n3行目', '"引用"と\\と/'];
  for (const mode of ['under18', 'all', 'none'] as const) for (const gymMode of [true, false]) for (const confirmed of [true, false]) {
    const pledge: PledgeConfig = { items: texts, guardian: texts[3], gym: texts[5], mode, gymMode, confirmed };
    const config: PublicEntryConfig = { ...cfg, pledge, pledgeHash: HASH };
    const link = publicEntryHash(config);
    assert.deepEqual(publicEntryConfig(link), { ...config, venueUrl: '' }, mode + '/' + gymMode + '/' + confirmed);
    assert.equal(publicEntryLinkCut(link), false);
    assert.equal(publicEntryReady(publicEntryConfig(link)), true);
  }
  const link = publicEntryHash(withPledge);
  assert.equal(publicEntryConfig(link).pledge?.items.length, 5);
  assert.equal(publicEntryConfig(link).pledgeHash, HASH, 'plf はそのまま戻る（ページは作らない・計算しない）');
  const all = { ...cfg, classes: DEFAULT_CLASS_SETTINGS, weights: DEFAULT_WEIGHT_SETTINGS, logo: true, hanamichi: true, pledge: FAKE, pledgeHash: HASH };
  assert.deepEqual(publicEntryConfig(publicEntryHash(all)), { ...all, venueUrl: '' });
  // protocol が 3 でなければ無視（古い受付に誓約書の鍵は送らない）。切れではない
  assert.equal('pledge' in publicEntryConfig(link.replace('protocol=3', 'protocol=2')), false, 'protocol 2');
  assert.equal('pledge' in publicEntryConfig(link.replace('&protocol=3', '')), false, 'protocol なし');
  assert.equal(publicEntryLinkCut(link.replace('protocol=3', 'protocol=2')), false, 'protocol 2 の pl は、無視されるだけ（切れではない）');
});

test('pl: 切れ判定。6つの鍵が全部あって、どれも正しい形のときだけ。ひとつでも欠ける・読めない・end が無いは切れ', () => {
  const link = publicEntryHash(withPledge);
  assert.equal(publicEntryLinkCut(link), false);
  const swap = (key: string, value: string | null) => {
    const params = new URLSearchParams(link.replace(/^#/, ''));
    if (value === null) params.delete(key); else params.set(key, value);
    return '#' + params.toString();
  };
  // 欠けた
  for (const key of KEYS) assert.equal(publicEntryLinkCut(swap(key, null)), true, key + ' が無い');
  // pl は on だけ
  for (const bad of ['off', 'ON', 'yes', '1', 'o', '', 'true']) assert.equal(publicEntryLinkCut(swap('pl', bad)), true, 'pl=' + bad);
  for (const bad of ['', 'under', 'Under18', 'ALL', 'on', 'under18 ']) assert.equal(publicEntryLinkCut(swap('plg', bad)), true, 'plg=' + bad);
  for (const key of ['plm', 'plc']) for (const bad of ['', 'o', 'of', 'yes', 'ON', 'true', '1']) assert.equal(publicEntryLinkCut(swap(key, bad)), true, key + '=' + bad);
  // 指紋は、16進の小文字64字だけ
  for (const bad of ['', HASH.slice(1), HASH + '0', HASH.toUpperCase(), 'g'.repeat(64), HASH.slice(0, 63) + ' ']) assert.equal(publicEntryLinkCut(swap('plf', bad)), true, 'plf=' + bad.length);
  // 文が読めない
  const plt = new URLSearchParams(link.replace(/^#/, '')).get('plt') || '';
  for (const bad of ['', 'u', plt.slice(1), plt.slice(0, -1), plt.slice(0, 10), plt + 'A', 'x' + plt.slice(1), plt.replace(/.$/, '!')]) assert.equal(publicEntryLinkCut(swap('plt', bad)), true, 'plt を壊した：' + bad.slice(0, 12));
  assert.equal(publicEntryLinkCut(swap('plt', packPledge([], 'g', 'y'))), true, '項目が0個');
  assert.equal(publicEntryLinkCut(swap('plt', packPledge(Array.from({ length: PLEDGE_LIMITS.items + 1 }, (_, i) => 'テスト用の文です' + i), 'g', 'y'))), true, '項目が9個');
  // end が無い・ちがう
  assert.equal(publicEntryLinkCut(link.replace(/&end=1$/, '')), true, 'pl があるのに end=1 が無い');
  assert.equal(publicEntryLinkCut(link.replace(/&end=1$/, '&end=')), true);
  assert.equal(publicEntryLinkCut(link.replace(/&end=1$/, '&end=0')), true);
  assert.equal(publicEntryLinkCut(link.replace('&protocol=3&mode=live&end=1', '')), true, 'pl のあとが全部無い');
  assert.equal(publicEntryLinkCut(link.replace('&mode=live&end=1', '')), true, 'protocol のあとが無い');
  // 鍵が1つだけ残っても（pl が無い plg など）切れ
  assert.equal(publicEntryLinkCut(GOLDEN.plain + '&plg=under18'), true);
  assert.equal(publicEntryLinkCut(GOLDEN.plain.replace('&protocol', '&plt=' + plt + '&protocol')), true);
  // 昔のリンクは、切れではない
  assert.equal(publicEntryLinkCut(GOLDEN.plain), false);
  assert.equal(publicEntryLinkCut(GOLDEN.plain.replace(/&end=1$/, '')), false);
  // 読めない pl は、設定にも入らない（誓約書なしと読まれても、切れ検出が先に止める）
  assert.equal('pledge' in publicEntryConfig(swap('plf', HASH.slice(1))), false);
  assert.equal('pledge' in publicEntryConfig(swap('plt', 'u')), false);
});

test('pl: リンクのどこで切れても、「そのまま使える」か「止まる」かのどちらか（誓約書が黙って消えない）', () => {
  for (const [name, config] of [
    ['誓約書', withPledge],
    ['誓約書＋階級＋ロゴ', { ...cfg, weights: DEFAULT_WEIGHT_SETTINGS, logo: true, pledge: FAKE, pledgeHash: HASH }],
    ['誓約書＋花道＋クラス＋階級', { ...cfg, classes: DEFAULT_CLASS_SETTINGS, weights: DEFAULT_WEIGHT_SETTINGS, hanamichi: true, pledge: { ...FAKE, mode: 'all', gymMode: false, confirmed: false }, pledgeHash: HASH2, mode: 'test' }],
  ] as Array<[string, PublicEntryConfig]>) {
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
    assert.equal(accepted, 0, name + ': 誓約書のリンクは、完全でないものを1つも通さない（通した ' + accepted + '）');
  }
});

test('pl: 文がいちばん長いときも、リンクは4500文字をこえない（項目8個・合計700字）', () => {
  const eight = Array.from({ length: PLEDGE_LIMITS.items }, (_, i) => String(i).repeat(1) + 'あ'.repeat(PLEDGE_LIMITS.item - 1));
  // 合計700字まで：8項目×(120字)は700をこえるので、項目を切りつめて 700字ちょうどにする
  const items = eight.map((t, i) => (i < 5 ? t : t.slice(0, 20)));
  const total = items.join('').length + 'テスト用の保護者の文です'.length + 'テスト用のジムの文です'.length;
  assert.ok(total <= PLEDGE_LIMITS.total, '合計 ' + total);
  const link = publicEntryHash({ ...cfg, pledge: { ...FAKE, items }, pledgeHash: HASH });
  assert.ok(link.length <= 4500, 'リンクの長さ ' + link.length);
  assert.deepEqual(publicEntryConfig(link).pledge?.items, items);
  assert.equal(unpackPledge(packPledge(items, 'a', 'b'))?.items.length, 8);
});

test('pl: 申し込みページのソースの約束（外へ通信しない・古い Safari で読める・文を持たない）', () => {
  const page = read('app/apply/page.tsx');
  const part = read('app/components/pledgeForm.ts');
  const core = read('core/pledge.ts') + read('core/publicEntry.ts');
  assert.match(page, /config\.pledge/);
  assert.match(page, /from '\.\.\/\.\.\/core\/pledge\.ts'/);
  assert.doesNotMatch(page + part, /申込/, '「申込」ではなく「申し込み」（コメントにも書かない）');
  assert.doesNotMatch(page + part, /text-base/, '文字は17px以上');
  assert.doesNotMatch(page + part, /\bfetch\s*\(|\.at\(|Object\.hasOwn|\(\?<[=!]/, '古い Safari と、外への通信の禁止');
  const css = read('app/globals.css');
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /@layer\b/, '手書きCSSに @layer の規則を書かない（Safari 15）');
  // 誓約・同意の文は、アプリのコード（page・部品・core）に1字も無い。文の言い回しに出てくる言葉が、コードに無いこと
  // 例外：戦績の注意文は、オーナーが貼った文をそのまま使う（「虚偽」を含む）。この1文だけ、見張りから外す（ほかの文は外さない）
  const OWNER_RECORD_CAUTION = '公平で安全なマッチメイクのため、スパーリング大会を含む戦績を正確にご申告ください。戦績の過少申告や虚偽の申告はお控えください。';
  for (const [name, source] of [['page', page.split(OWNER_RECORD_CAUTION).join('')], ['pledgeForm', part], ['core', core]] as const) {
    assert.doesNotMatch(source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''), /賠償|帰属|虚偽|致します|感染症|一任|SNS/, name + ': 誓約・同意の文を持たない');
  }
  // ジム責任者の念押しのラベルだけは、操作の言葉として定数で持つ（会長が直す前提）
  assert.equal(GYM_PERMISSION_LABEL, 'ジム責任者の許可を得て、名前と電話番号を入れています');
  // 許可の□は無くした（owner 2026-10-23）。同意の□の上に、念押しの1行（操作の言葉）を出す
  assert.equal(GYM_PERMISSION_NOTE, 'ジム責任者の許可を得てから、名前と電話番号を入れて、下の□に✔を入れてください。');
  assert.match(page, /GYM_PERMISSION_NOTE/);
  assert.equal((page.match(/ジム責任者の許可を得て/g) || []).length, 0, 'page は文を直に書かず、定数を使う');
});

// ---------- 申し込みページの部品（app/components/pledgeForm.ts） ----------
const ans = (over: Partial<PledgeAnswers> = {}): PledgeAnswers => ({ ...blankPledgeAnswers(), ...over });
const allTicks = { ticks: [true, true, true, true, true] };

test('部品: 欄の鍵の判定（pledge1…は項目、ほかの5つは名前で決まる）', () => {
  for (const key of ['pledge1', 'pledge8', 'pledge12']) { assert.equal(isPledgeItemKey(key), true, key); assert.equal(isPledgeKey(key), true, key); }
  for (const key of ['pledge', 'pledge0', 'pledge01', 'pledge1a', 'pledgeX', 'f-pledge1', 'Pledge1', '']) assert.equal(isPledgeItemKey(key), false, key);
  for (const key of ['pledgeGuardian', 'gymName', 'gymPhone', 'gymPermission', 'pledgeGym']) { assert.equal(isPledgeKey(key), true, key); assert.equal(isPledgeItemKey(key), false, key); }
  for (const key of ['gym', 'name', 'consent', 'hnNameKana', 'contactPhone', 'pledge', 'pledgeItems', 'pledgeHash']) assert.equal(isPledgeKey(key), false, key);
});

test('部品: 計画。保護者の欄は年齢で、すぐ変わる。ジム責任者の欄は、ジム名では変わらない（ジムに入っていない人は、ジム名の欄で断る）', () => {
  const plan = (pledge: PledgeConfig | undefined, age: string, gym: string, mode: 'test' | 'live' | undefined = 'live') => pledgePlan(pledge, age, mode);
  assert.deepEqual(plan(undefined, '15', '架空ジム'), { on: false, n: 0, guardian: false, gym: false, blocked: false }, '誓約書なしは、ぜんぶ false');
  assert.equal(plan(FAKE, '', '架空ジム').n, 5);
  // 保護者の同意
  for (const [age, need] of [['15', true], ['17', true], ['18', false], ['45', false], ['', true], ['あ', true], ['121', true], ['0', true], ['１７', true], ['１８', false]] as const) assert.equal(plan(FAKE, age, '架空ジム').guardian, need, 'under18 age=' + age);
  assert.equal(plan({ ...FAKE, mode: 'all' }, '45', '架空ジム').guardian, true, '全員');
  assert.equal(plan({ ...FAKE, mode: 'none' }, '10', '架空ジム').guardian, false, 'なし');
  // ジム責任者の欄
  assert.equal(plan(FAKE, '15', '架空ジム').gym, true);
  assert.equal(plan({ ...FAKE, gymMode: false }, '15', '架空ジム').gym, false, 'plm=off');
  for (const name of ['', '架空ジム', '無所属', 'なし', '無 所 属']) { const p = plan(FAKE, '15', name); assert.equal(p.gym, true, name + ': ジム名では変わらない（欄は全員に出る）'); assert.ok(!('unaffiliated' in p), '無所属の印は、もう無い'); }
  // 本番で、会長がまだ確認していない
  assert.equal(plan({ ...FAKE, confirmed: false }, '15', 'x', 'live').blocked, true);
  assert.equal(plan({ ...FAKE, confirmed: false }, '15', 'x', 'test').blocked, false, 'テストは動く');
  assert.equal(pledgePlan({ ...FAKE, confirmed: false }, '15', undefined).blocked, false, 'mode が無いときは、止めない（そもそも送れないリンク）');
  assert.equal(plan(FAKE, '15', 'x', 'live').blocked, false);
});

test('部品: 欄の順と進み具合（□の✔・保護者・ジム責任者）', () => {
  const plan = pledgePlan(FAKE, '15', 'live');
  const order = pledgeOrder(plan, ans());
  // 項目の□は1つ（pledge1）。ジム責任者の許可は、同意の□といっしょ（owner 2026-10-23）
  assert.deepEqual(order.map(([key]) => key), ['pledge1', 'pledgeGuardian', 'gymName', 'gymPhone', 'pledgeGym']);
  assert.ok(order.every(([, ok]) => ok === false));
  const done = ans({ ...allTicks, guardian: true, gymName: '架空 責任者', gymPhone: '09000000000', gymPermission: true, gymConsent: true });
  assert.ok(pledgeOrder(plan, done).every(([, ok]) => ok));
  assert.equal(pledgeOrder(plan, ans({ ticks: [true, false, true] })).filter(([, ok]) => ok).length, 0, '項目の□は、全部に✔が入ったときだけ済み');
  assert.equal(pledgeOrder(plan, ans({ gymConsent: true })).find(([key]) => key === 'pledgeGym')?.[1], false, '同意だけで、許可の念押しが無ければ、まだ');
  // 携帯でない電話は「まだ」
  assert.equal(pledgeOrder(plan, ans({ gymPhone: '0312345678' })).find(([key]) => key === 'gymPhone')?.[1], false);
  assert.equal(pledgeOrder(plan, ans({ gymPhone: '05012345678' })).find(([key]) => key === 'gymPhone')?.[1], false, '050 は携帯でない');
  assert.equal(pledgeOrder(plan, ans({ gymPhone: '０９０００００００００' })).find(([key]) => key === 'gymPhone')?.[1], true, '全角でもよい');
  // 欄が出ないときは、順にも入らない
  assert.deepEqual(pledgeOrder(pledgePlan(FAKE, '45', 'live'), ans()).map(([key]) => key), ['pledge1', 'gymName', 'gymPhone', 'pledgeGym'], '18歳以上は保護者なし');
  assert.deepEqual(pledgeOrder(pledgePlan({ ...FAKE, gymMode: false }, '45', 'live'), ans()).map(([key]) => key), ['pledge1'], 'ジム責任者の同意＝なし は、ジム責任者の欄なし');
  assert.deepEqual(pledgeOrder(pledgePlan(undefined, '45', 'live'), ans()), [], '誓約書なしは空');
});

test('部品: 止める理由の数え方', () => {
  const plan = pledgePlan(FAKE, '15', 'live');
  const left = (a: PledgeAnswers) => pledgeLockReason(plan, a);
  // □は、項目の1つ・保護者・ジム責任者の同意の、3つ
  assert.equal(left(ans()), '誓約書の□が、あと3つ残っています。ジム責任者の名前と電話が、まだです');
  assert.equal(left(ans({ ticks: [true, true, false, false, false] })), '誓約書の□が、あと3つ残っています。ジム責任者の名前と電話が、まだです');
  assert.equal(left(ans({ ...allTicks, guardian: true, gymPermission: true, gymConsent: true })), 'ジム責任者の名前と電話が、まだです');
  assert.equal(left(ans({ ...allTicks, guardian: true, gymName: '架空 責任者', gymPhone: '09000000000', gymPermission: true })), '誓約書の□が、あと1つ残っています');
  assert.equal(left(ans({ ...allTicks, guardian: true, gymName: '架空 責任者', gymPhone: '09000000000', gymPermission: true, gymConsent: true })), '', 'ぜんぶ済めば止めない');
  assert.equal(left(ans({ ...allTicks, guardian: true, gymName: '架空 責任者', gymPhone: '0312345678', gymPermission: true, gymConsent: true })), 'ジム責任者の電話が、携帯電話の番号になっていません', '電話が携帯でない：入れたものを「まだです」と言わない（直してもらう）');
  // 名前が空で、電話が携帯でない：2つに言い分ける。電話が空なら、今までの言い方のまま
  assert.equal(left(ans({ ...allTicks, guardian: true, gymPhone: '0312345678', gymPermission: true, gymConsent: true })), 'ジム責任者の名前が、まだです。ジム責任者の電話が、携帯電話の番号になっていません');
  assert.equal(left(ans({ ...allTicks, guardian: true, gymName: '架空 責任者', gymPermission: true, gymConsent: true })), 'ジム責任者の名前と電話が、まだです', '電話が空');
  assert.equal(left(ans({ ...allTicks, guardian: true, gymPhone: '09000000000', gymPermission: true, gymConsent: true })), 'ジム責任者の名前と電話が、まだです', '名前が空・電話は正しい（今までの言い方）');
  assert.equal(pledgeLockReason(pledgePlan(undefined, '', 'live'), ans()), '', '誓約書なしは、止めない');
  // 保護者もジム責任者も要らないとき
  const small = pledgePlan({ ...FAKE, mode: 'none', gymMode: false }, '15', 'live');
  assert.equal(pledgeLockReason(small, ans({ ticks: [true, true, true, true, false] })), '誓約書の□が、あと1つ残っています');
  assert.equal(pledgeLockReason(small, ans(allTicks)), '');
});

test('部品: 赤い問題。✔が無い欄は empty（送ろうとしたときに赤）、長すぎは early（すぐ赤）、電話の形は文を選ぶ', () => {
  const plan = pledgePlan(FAKE, '15', 'live');
  const issues = pledgeIssues(plan, ans());
  assert.deepEqual(Object.keys(issues), ['pledge1', 'pledgeGuardian', 'gymName', 'gymPhone', 'pledgeGym']);
  assert.ok(Object.values(issues).every((issue) => issue && issue.empty && !issue.early && issue.text.length > 5));
  assert.equal(issues.pledgeGym?.text, 'ジム責任者の同意の□に、✔を入れてください。', '許可の念押しは、同意の□といっしょ');
  assert.deepEqual(pledgeIssues(plan, ans({ ...allTicks, guardian: true, gymName: '架空 責任者', gymPhone: '090-0000-0000'.replace(/-/g, ''), gymPermission: true, gymConsent: true })), {}, '問題なし');
  const longName = pledgeIssues(plan, ans({ ...allTicks, guardian: true, gymName: 'あ'.repeat(41), gymPhone: '09000000000', gymPermission: true, gymConsent: true }));
  assert.equal(longName.gymName?.early, true); assert.equal(longName.gymName?.empty, false); assert.match(longName.gymName?.text || '', /長すぎます（いま41字／40字まで）/);
  assert.deepEqual(pledgeIssues(plan, ans({ ...allTicks, guardian: true, gymName: 'あ'.repeat(40), gymPhone: '09000000000', gymPermission: true, gymConsent: true })), {}, '40字ちょうどは通る');
  const phone = (value: string) => pledgeIssues(plan, ans({ gymPhone: value })).gymPhone;
  assert.match(phone('090000')?.text || '', /携帯電話は11けたです。いま6けたです/);
  assert.match(phone('0312345678')?.text || '', /11けたです。いま10けたです/);
  assert.match(phone('05012345678')?.text || '', /070・080・090で始まる/);
  assert.match(phone('abc09000000000')?.text || '', /数字だけで/);
  assert.ok([phone('090000'), phone('05012345678'), phone('abc')].every((issue) => issue && !issue.empty && !issue.early), '電話の形は、欄を出た後に赤');
  assert.match(phone('090000')?.text || '', /例：09000000000/);
  // 欄が出ないときは、問題にも入らない
  assert.deepEqual(Object.keys(pledgeIssues(pledgePlan({ ...FAKE, gymMode: false }, '45', 'live'), ans())), ['pledge1']);
  assert.deepEqual(pledgeIssues(pledgePlan(undefined, '', 'live'), ans()), {});
});

const pick = (post: Record<string, string>) => ({ pledgeGuardianMode: post.pledgeGuardianMode, pledgeGymMode: post.pledgeGymMode });
test('部品: POST の鍵。誓約書なしは {}、ありは PLEDGE_POST_KEYS の順。要らない欄の鍵は、鍵ごと無い', () => {
  const full = pledgePlan(FAKE, '15', 'live');
  assert.deepEqual(pledgePost(pledgePlan(undefined, '15', 'live'), ans(), HASH), {}, '誓約書なしは、鍵を1つも足さない');
  const done = ans({ ...allTicks, guardian: true, gymName: '架空 責任者', gymPhone: '０９０００００００００', gymPermission: true, gymConsent: true });
  const post = pledgePost(full, done, HASH);
  assert.deepEqual(Object.keys(post), [...PLEDGE_POST_KEYS], 'この順');
  assert.deepEqual(post, { pledge: 'yes', pledgeItems: '1,2,3,4,5', pledgeGuardian: 'yes', gymName: '架空 責任者', gymPhone: '09000000000', gymPermission: 'yes', pledgeGym: 'yes', pledgeHash: HASH, pledgeGuardianMode: 'under18', pledgeGymMode: 'on' });
  // 18歳以上：保護者の鍵が無い
  assert.deepEqual(Object.keys(pledgePost(pledgePlan(FAKE, '45', 'live'), done, HASH)), ['pledge', 'pledgeItems', 'gymName', 'gymPhone', 'gymPermission', 'pledgeGym', 'pledgeHash', 'pledgeGuardianMode', 'pledgeGymMode']);
  // plm=off：ジム責任者の鍵が無い
  assert.deepEqual(Object.keys(pledgePost(pledgePlan({ ...FAKE, gymMode: false }, '15', 'live'), done, HASH)), ['pledge', 'pledgeItems', 'pledgeGuardian', 'pledgeHash', 'pledgeGuardianMode', 'pledgeGymMode']);
  assert.deepEqual(Object.keys(pledgePost(pledgePlan({ ...FAKE, gymMode: false, mode: 'none' }, '15', 'live'), done, HASH)), ['pledge', 'pledgeItems', 'pledgeHash', 'pledgeGuardianMode', 'pledgeGymMode']);
  // 最後の2つは、このリンクの設定（plg／plm）をそのまま返す。サーバーが、リンクを作ったあとの設定の変更に気づくため
  assert.deepEqual(pick(pledgePost(pledgePlan({ ...FAKE, gymMode: false, mode: 'none' }, '15', 'live'), done, HASH)), { pledgeGuardianMode: 'none', pledgeGymMode: 'off' });
  assert.deepEqual(pick(pledgePost(pledgePlan({ ...FAKE, gymMode: false, mode: 'under18' }, '45', 'live'), done, HASH)), { pledgeGuardianMode: 'under18', pledgeGymMode: 'off' }, '欄が出ない人にも、リンクの設定を返す（欄が出ない理由は、年齢とジム責任者の同意の設定）');
  // ✔した項目の番号だけ（欠けたままは送らせないが、鍵の値はうそをつかない）
  assert.equal(pledgePost(full, ans({ ticks: [true, false, true, false, true] }), HASH).pledgeItems, '1,3,5');
  assert.equal(pledgePost(full, ans(), HASH).pledgeItems, '');
  assert.equal(pledgePost(full, ans(), HASH).pledgeGuardian, 'no');
  // 指紋は、リンクのものをそのまま。無ければ鍵ごと無い
  assert.equal('pledgeHash' in pledgePost(full, done, ''), false);
  assert.equal(pledgePost(full, done, HASH2).pledgeHash, HASH2);
  // どの鍵も、PLEDGE_POST_KEYS の中
  assert.ok(Object.keys(post).every((key) => (PLEDGE_POST_KEYS as readonly string[]).includes(key)));
  assert.match(PLEDGE_BLOCKED_TEXT, /^主催者が、誓約書の文をまだ確認していません。送れません。$/);
});
