import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DEFAULT_CLASS_SETTINGS, parseWins, suggestClass, type ClassSettings } from '../core/classRules.ts';
import { LINK_END_KEY, publicEntryConfig, publicEntryHash, publicEntryLinkCut, publicEntryReady, type PublicEntryConfig } from '../core/publicEntry.ts';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const ENDPOINT = 'https://script.google.com/macros/s/AKfycbyTEST_ONLY/exec';
const cfg: PublicEntryConfig = { endpoint: ENDPOINT, eventId: 'test-cup', title: '架空大会', organizer: '架空主催', date: '2027年10月3日', venue: '架空体育館', venueUrl: '', deadline: '2099-11-30', contact: '連絡先', music: true, grade: 'optional', age: 'optional', comment: 'optional', protocol: '3', mode: 'live' };
const custom: ClassSettings = { enabled: true, upper: { name: '上級クラス', condition: '5勝以上（例：5勝0敗）', rule: '首相撲あり／膝蹴りあり／蹴り足キャッチ' }, lower: { name: '初級クラス', condition: '4勝以下（例：初出場）', rule: 'パンチとキックのみ' }, upperMinWins: 5 };
const longest: ClassSettings = { ...DEFAULT_CLASS_SETTINGS, upper: { name: '！'.repeat(12), condition: '！'.repeat(60), rule: '！'.repeat(80) }, lower: { name: '？'.repeat(12), condition: '？'.repeat(60), rule: '？'.repeat(80) } };

// ---------- S-2 / r1-130 / r1-144: a very long record never makes parseWins slow ----------
test('S-2 parseWins: 長い数字の貼り付けでも、すぐ終わる（先頭300文字だけ読む）', () => {
  for (const text of ['1'.repeat(30000), '0'.repeat(30000) + '勝', '9'.repeat(100) + '勝', '3勝' + '1'.repeat(30000), ('1' + ' ').repeat(15000) + '勝', '2-' + '3'.repeat(30000), '一'.repeat(30000) + '勝']) {
    const t0 = performance.now();
    parseWins(text);
    suggestClass(text, DEFAULT_CLASS_SETTINGS);
    const ms = performance.now() - t0;
    assert.ok(ms < 200, 'おそい: ' + ms.toFixed(0) + 'ms / ' + text.slice(0, 12));
  }
  assert.equal(parseWins('3勝' + 'あ'.repeat(200)), 3, '短めの戦績は、ふつうに読める');
  assert.equal(parseWins('3勝' + 'あ'.repeat(5000)), null, '長すぎる文字は読まない（目安を出さない）');
  const t0 = performance.now();
  parseWins('1'.repeat(399)); parseWins(('1 ').repeat(199) + '勝'); parseWins('0'.repeat(398) + '勝');
  assert.ok(performance.now() - t0 < 100, '上限ぎりぎりの長さでも、すぐ終わる');
  assert.equal(parseWins('2勝1敗'), 2);
  assert.equal(parseWins('9'.repeat(100) + '勝'), null, '大きすぎる数は読まない');
});

// ---------- S-3 / r1-1 / r1-63 / r1-79 / r1-107 / r1-145: a cut link is never accepted silently ----------
const links: Array<[string, PublicEntryConfig]> = [
  ['クラスなし', cfg],
  ['クラスなし・テスト', { ...cfg, mode: 'test' }],
  ['既定のクラス', { ...cfg, classes: DEFAULT_CLASS_SETTINGS }],
  ['自分で決めたクラス', { ...cfg, classes: custom }],
  ['いちばん長いクラス', { ...cfg, classes: longest }],
  ['昔の protocol 2', { ...cfg, protocol: '2', entryKey: 'k'.repeat(40), classes: custom }],
];

test('B2: リンクのどこで切れても、「そのまま使える」か「切れている」かのどちらか（クラスや mode が黙って消えない）', () => {
  for (const [name, config] of links) {
    const full = publicEntryHash(config);
    const fullConfig = publicEntryConfig(full);
    assert.equal(publicEntryLinkCut(full), false, name + ': 完全なリンクは切れていない');
    assert.equal(publicEntryReady(fullConfig), true, name + ': 完全なリンクは使える');
    let accepted = 0;
    for (let n = 0; n < full.length; n++) {
      const prefix = full.slice(0, n);
      const cut = publicEntryLinkCut(prefix);
      const parsed = publicEntryConfig(prefix);
      if (cut || !publicEntryReady(parsed)) continue; // 止まる（赤い箱）
      accepted++;
      // 使えるとされた短いリンクは、完全なリンクと同じ設定を持っていなければならない
      assert.deepEqual(parsed, fullConfig, name + ': 長さ' + n + 'で使えるとされたのに、設定が欠けている: …' + prefix.slice(-30));
      assert.ok(!config.classes || prefix.includes('cls=on'), name + ': クラスがあるのに、cls=on が欠けたリンクを通した');
    }
    // クラスなしのリンクは、最後の「&end=1」だけが欠けても同じ設定なので使える（昔のリンクと同じ）。クラスありは1つも通さない
    if (config.classes) assert.equal(accepted, 0, name + ': クラスありのリンクは、完全でないものを1つも通さない');
    else assert.ok(accepted <= '&end=1'.length, name + ': 通したのは末尾の目印の分だけ (' + accepted + ')');
  }
});

test('B2: 並び順は「ふつうの項目 → クラス → protocol → mode → end=1」。mode の途中切れは live に読まない', () => {
  const hash = publicEntryHash({ ...cfg, classes: custom });
  assert.ok(hash.endsWith('&' + LINK_END_KEY + '=1'), '最後は end=1');
  assert.ok(hash.indexOf('&cls=on') < hash.indexOf('&protocol=') && hash.indexOf('&protocol=') < hash.indexOf('&mode=') && hash.indexOf('&mode=') < hash.indexOf('&end='), '順番');
  assert.equal(publicEntryConfig('#' + 'endpoint=' + encodeURIComponent(ENDPOINT) + '&protocol=3&mode=te').mode, undefined, 'mode=te は live ではない');
  assert.equal(publicEntryConfig('#protocol=3&mode=').mode, undefined);
  assert.equal(publicEntryConfig('#protocol=3&mode=TEST').mode, undefined);
  assert.equal(publicEntryConfig('#protocol=3&mode=live').mode, 'live');
  assert.equal(publicEntryConfig('#protocol=3&mode=test').mode, 'test');
  const testLink = publicEntryHash({ ...cfg, mode: 'test' });
  const te = testLink.slice(0, testLink.indexOf('mode=te') + 7);
  assert.equal(publicEntryReady(publicEntryConfig(te)), false, 'テスト用リンクが切れて、本番の申し込みページとして開くことはない');
});

test('S-3: cls=on なのに読めないクラス（同じ名前など）は、切れたリンクとして止める', () => {
  const plain = publicEntryHash(cfg);
  const withEnd = (extra: string) => plain.replace(/&end=1$/, '') + extra + '&end=1';
  assert.equal(publicEntryLinkCut(withEnd('&cls=on&cuN=' + encodeURIComponent('同') + '&clN=' + encodeURIComponent('同'))), true, '同じ名前');
  assert.equal(publicEntryLinkCut(withEnd('&cls=on&cuN=' + encodeURIComponent('Bクラス'))), true, '上の名前が下と同じ');
  assert.equal(publicEntryLinkCut(withEnd('&cls=yes')), true, 'cls=yes');
  assert.equal(publicEntryLinkCut(withEnd('&cls=o')), true, 'cls=o（途中で切れた）');
  assert.equal(publicEntryLinkCut(withEnd('&cls=off')), false, 'cls=off は、クラスなしの印');
  assert.equal(publicEntryLinkCut(withEnd('&cls=on')), false, '既定のクラス');
  assert.equal(publicEntryLinkCut(withEnd('&cls=on&cw=0')), false, '勝ち数が読めなくても、既定の3勝で使える');
  assert.equal(publicEntryLinkCut(plain.replace(/&end=1$/, '') + '&cls=on'), true, 'クラスがあるのに end=1 が無い');
  assert.equal(publicEntryLinkCut(plain.replace(/&end=1$/, '&end=')), true, 'end= だけ');
  // 昔のリンク（end も クラスも無い）と、空のハッシュは、そのまま
  assert.equal(publicEntryLinkCut(plain.replace(/&end=1$/, '')), false, '昔のリンク');
  assert.equal(publicEntryLinkCut(''), false);
  assert.equal(publicEntryLinkCut('#'), false);
  // 必須の項目が欠けたら、切れている
  assert.equal(publicEntryLinkCut('#endpoint=x&eventId=a&title=t&contact=c&music=on'), true, 'comment が無い');
  assert.equal(publicEntryLinkCut('#endpoint=x&title=t&contact=c&music=on&comment=off'), true, 'eventId が無い');
});

test('B2: 並べ直しても、今までの往復（作る → 読む）は変わらない', () => {
  for (const [name, config] of links) {
    assert.deepEqual(publicEntryConfig(publicEntryHash(config)), { ...config, venueUrl: '' }, name);
  }
  const worst = publicEntryHash({ ...cfg, classes: longest });
  assert.ok(worst.length <= 4500, '一番長くても4500文字以内 (' + worst.length + ')');
});

// ---------- r1-2 / r1-3 / r1-4 / r1-5 / r1-6 / r1-7 ...: the page source keeps the rules (the browser checks are in scripts/test-polish-apply.mjs) ----------
test('apply: 送ったあとの戻る・タイマー・メッセージの置き場所', () => {
  const page = read('app/apply/page.tsx');
  assert.match(page, /if \(resultTimerRef\.current\) \{ clearTimeout\(resultTimerRef\.current\); resultTimerRef\.current = null; \}/, 'bfcache で戻ったら 30 秒の保険タイマーを止める');
  assert.match(page, /resultTimerRef\.current = null;\s+if \(!sendingRef\.current\) return;/, 'タイマーが鳴っても、送っていなければ何もしない');
  assert.match(page, /if \(changedSince\) setRequestId\(/, '中身を変えたら新しい番号');
  assert.doesNotMatch(page, /この新しい内容で送る|別の人の申し込みになります|同じ人の申し込みなら、変えないでください/, '直すのを止める言い方をしない');
  assert.match(page, /受付番号が出なかった方は、直して送って大丈夫です。/);
  assert.match(page, /受付番号が出た方は、もう申し込み済みです。同じ人を、もう一度送らないでください。/);
  assert.match(page, /id="f-submit"/, '押すボタンに目印');
  assert.match(page, /document\.getElementById\('f-submit'\)[\s\S]{0,200}scrollIntoView\(\{ block: 'center' \}\)[\s\S]{0,100}focus\(/, '送れたか分からないとき、押すボタンを真ん中に出して合わせる');
  assert.match(page, /max-h-\[35vh\]/, '上の帯は画面の35%まで');
  assert.match(page, /messageBox\(false\)/, '送れなかったときのメッセージは、ボタンのすぐ上');
});

test('apply: 入力の途中で「直す」と言わない・押した所が動かない・メールと電話の言い方', () => {
  const page = read('app/apply/page.tsx');
  assert.match(page, /return !empty && shown\(key\) \? `\$\{SHORT\[key\]\}を直す` : NEXT_LABEL\[key\];/, '「直す」は、何か入っていて赤い文が出ているときだけ');
  assert.match(page, /pointerDownRef/, '押している間は自動なおしを待つ');
  assert.match(page, /onBlur=\{\(\) => leaveSoon\(/, '欄を出た時の処理は leaveSoon 経由');
  assert.doesNotMatch(page, /onBlur=\{\(\) => leave\(/, 'leave を直接呼ばない');
  assert.match(page, /const normalizeEmail = \(value: string\) => trimAll\(/, 'メールは前後の空白だけ消す');
  assert.doesNotMatch(page, /normalizeEmail = \(value: string\) => noSpace/, '真ん中の空白を黙って消さない');
  assert.match(page, /メールアドレスの途中に空白があります/);
  assert.match(page, /\{note && !error \?/, '赤い文があるときは、緑の「自動で直しました」を出さない');
  assert.match(page, /\(\\d\)\\1\{7\}\$/, '後ろに同じ数字が8つ以上ならぶ電話番号');
  assert.ok(page.indexOf('/^0(120|800)/') > 0 && page.indexOf('/^0(120|800)/') < page.indexOf('/^0[5789]0/'), 'フリーダイヤルは、携帯のけた数より先に調べる');
  assert.match(page, /身長と体重が、逆ではありませんか？/, '身長と体重が逆かもしれないとき、黄色の質問');
  assert.doesNotMatch(page, /前の写真は そのまま/, '余分な空白');
  assert.doesNotMatch(page, /先に答えます|読んでね/, 'ふしぜんな言い方');
  assert.doesNotMatch(page, /申込/, '「申込」ではなく「申し込み」');
  assert.doesNotMatch(page, /自分で決めてかまいません/);
  assert.doesNotMatch(page, /'👉 いまここ|>👉 いまここ|stepLine = <span aria-hidden="true">👉/, '👉 は「次はここ」だけ');
  assert.doesNotMatch(page, /text-base/, '文字は17px以上');
});

test('apply: 入力を消したあとの案内・電波が戻ったとき・確認の箱', () => {
  const page = read('app/apply/page.tsx');
  assert.match(page, /say\('入力を消しました。次の人の申し込みを、始められます。', 'ok'\)/);
  assert.match(page, /window\.scrollTo\(\{ top: 0 \}\);\s+document\.getElementById\('f-gym'\)\?\.focus/);
  assert.match(page, /offlineMsgRef\.current = true/);
  assert.match(page, /if \(now && offlineMsgRef\.current\) \{ offlineMsgRef\.current = false; setMessage\(''\); \}/);
  assert.match(page, /window\.addEventListener\('keydown', onKey\)/, '確認の箱の Escape は window で聞く');
  assert.match(page, /aria-describedby="danger-confirm-lines"/);
  assert.match(page, /rounded-2xl px-3 py-0\.5/, '締切の札は卵形にしない');
  assert.match(page, /tos-apply /, '申し込みページ用のフォーカス輪郭');
  assert.doesNotMatch(page, /✕ とじる/, '閉じるボタンに ✕ を付けない（✕ は まちがい の印）');
});

// ---------- r1-127 / r1-19: old Safari and no-JS ----------
test('r1-127: 古い Safari（iOS 15）向けの書き出し', () => {
  const pkg = JSON.parse(read('package.json')) as { browserslist?: string[] };
  assert.ok(Array.isArray(pkg.browserslist) && pkg.browserslist.some((q) => /^safari >= 1[0-5](\.\d)?$/.test(q)), 'browserslist に safari >= 15 以下');
  assert.ok(pkg.browserslist!.some((q) => /^ios_saf >= 1[0-5](\.\d)?$/.test(q)), 'browserslist に ios_saf');
  const check = read('scripts/check-private-build.mjs');
  assert.match(check, /ClassStaticBlockDeclaration/, '公開前の検査が、static ブロックを探す');
  assert.match(check, /正規表現の後読み/);
});

test('r1-19: どの画面にも noscript と、古いブラウザの黄色い案内がある', () => {
  const layout = read('app/layout.tsx');
  assert.match(layout, /<noscript>/);
  assert.match(layout, /JavaScript を「オン」にしてください/);
  assert.match(layout, /ブラウザが古いかもしれません/);
  assert.match(layout, /data-tos-loading/);
  assert.match(layout, /data-theme','light'/, '申し込みページは最初から明るい');
  for (const path of ['app/apply/page.tsx', 'app/private/page.tsx', 'app/private/setup/page.tsx', 'app/private/entry/page.tsx', 'app/private/google-setup/page.tsx']) assert.match(read(path), /data-tos-loading="1"/, path + ' の「よみこみ中」');
  assert.doesNotMatch(read('app/private/entry/page.tsx'), /id: crypto\.randomUUID\(\)/, '古い Safari に randomUUID が無くても動く');
});
