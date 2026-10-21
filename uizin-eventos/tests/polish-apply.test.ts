import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DEFAULT_CLASS_SETTINGS, parseWins, suggestClass, type ClassSettings } from '../core/classRules.ts';
import { dateDigits, formatDateInput, isCompleteDate } from '../core/dateInput.ts';
import { emailFormOk, entryErrors, lowerLinkHost, MUSIC_URL_FORM, phoneFormOk, stripInvisible, visibleTrim, type EntryFighter } from '../core/entryPackage.ts';
import { harness } from './helpers/gasV3Harness.ts';
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
  for (const path of ['app/apply/page.tsx', 'app/private/page.tsx', 'app/private/setup/page.tsx', 'app/private/entry/page.tsx']) assert.match(read(path), /data-tos-loading="1"/, path + ' の「よみこみ中」');
  assert.doesNotMatch(read('app/private/entry/page.tsx'), /id: crypto\.randomUUID\(\)/, '古い Safari に randomUUID が無くても動く');
});


/* ═══════════════ ROUND 2 (fix-apply-r2) ═══════════════ */

// ---------- r2-1 / r2-132: 「週3-4回」「空手3-4年」を勝ち負けと読まない・食いちがう文は決めない・初心者のことばを読む ----------
test('r2-1: 数字の範囲＋単位（週3-4回・3-4年・10-12歳）は勝ち負けではない。「初めて」のほうを読む', () => {
  assert.equal(parseWins('週3-4回練習しています。試合は初めてです'), 0);
  assert.equal(parseWins('空手歴3-4年・初試合'), 0);
  for (const text of ['空手3-4年', '小学5-6年生', '10-12歳', 'キック3-4年', 'ジュニア大会3-4回出場', '週3-4回練習', '体重55-60kg', '8-10級', '3-5日']) {
    const wins = parseWins(text);
    assert.ok(wins === null || wins < 3, text + ' は A クラスにしない（' + wins + '）');
    const sg = suggestClass(text, DEFAULT_CLASS_SETTINGS);
    assert.ok(!sg || sg.name === 'Bクラス', text + ' は「目安なし」か Bクラス');
  }
  // 本物の勝ち負けは、今までどおり
  assert.equal(parseWins('3-1'), 3);
  assert.equal(parseWins('3-1-0'), 3);
  assert.equal(parseWins('5-2'), 5);
  assert.equal(parseWins('2-3'), 2);
  assert.equal(parseWins('3勝0敗'), 3);
  assert.equal(parseWins('週3回練習。戦績は2-1'), 2, '単位つきの数のあとにある、本物の勝ち負けは読む');
  assert.equal(parseWins('2024-05-12'), null, '日づけは読まない');
});

test('r2-132: 0勝のことばと勝ちの数が食いちがう・これからの話は、決めない。初心者のことばは Bクラスに読む', () => {
  for (const text of ['初試合（目標3勝）', '初出場です。3勝したい', '初出場。3勝を目指します', '試合経験なし 3勝は無理', '初出場 3-1', '次は3勝が目標']) assert.equal(parseWins(text), null, text);
  for (const text of ['特になし', 'ありません', '試合経験ありません', '出場なし', '戦績:なし', '戦績：なし', '初戦', '初心者', 'デビュー戦', 'デビュー前', '試合に出たことがない', 'ナシ', 'ﾅｼ', '0 試合', '0戦', 'ゼロ']) assert.equal(parseWins(text), 0, text + ' は0勝');
  // 「3勝以上」「2勝以下」は、条件の文をそのまま書く人がいる。Aか Bか決まるときは読む（前からの動き）。決まらないとき・目標・「まで」は決めない
  assert.equal(parseWins('3勝以上'), 3);
  assert.equal(parseWins('2勝以下'), 2);
  assert.equal(parseWins('5勝以上'), 5);
  assert.equal(parseWins('3勝未満'), 2);
  assert.equal(suggestClass('3勝以上', DEFAULT_CLASS_SETTINGS)?.name, 'Aクラス');
  assert.equal(suggestClass('2勝以下', DEFAULT_CLASS_SETTINGS)?.name, 'Bクラス');
  for (const text of ['5勝以下', '2勝以上', '3勝まで', '3勝くらい', '3勝を目指します', '3勝以上と4勝以上']) assert.equal(parseWins(text), null, text + ' は決めない');
  assert.equal(parseWins('初試合ではありません'), null, '打ち消しは決めない');
  assert.equal(suggestClass('初心者', DEFAULT_CLASS_SETTINGS)?.name, 'Bクラス');
  assert.equal(parseWins('3勝2敗'), 3);
  assert.equal(parseWins('0勝'), 0);
  assert.equal(parseWins('初出場 0勝'), 0, '0勝のことばと0勝は食いちがわない');
  // 範囲の探し方に、後読み（Safari 15 で壊れる）を使わない
  assert.doesNotMatch(read('core/classRules.ts'), /\(\?<[!=]/, '正規表現の後読みを使わない');
});

// ---------- r2-22: 日づけに時刻がくっついても、別の日づけにならない ----------
test('r2-22: 日づけ＋時刻の貼り付けは、別の日づけに直さない。曜日だけなら読む', () => {
  for (const text of ['2027/10/3 10:00', '2027年10月3日(日) 10:00', '2027-10-3 12:30', '2027/1/2 10:00', '2027年10月3日(日)10時', '2027/10/3 10:00:00']) {
    assert.equal(isCompleteDate(text), false, text + ' は日づけとして読まない');
    assert.equal(formatDateInput(text), text, text + ' は、そのまま返す（勝手に直さない）');
  }
  for (const text of ['2027年10月3日', '2027/10/3', '2027-10-03', '20271003', '２０２７１００３', '2027 10 03', '2027年10月3日(日)', '2027年10月3日（日曜日）', 'abc２０２７x１００３']) {
    assert.equal(formatDateInput(text), '2027年10月3日', text);
    assert.equal(dateDigits(text), '20271003', text);
  }
  assert.equal(isCompleteDate('2027年10月31日'), true);
});

// ---------- r2-2: 見えない文字 ----------
const fighter = (over: Partial<EntryFighter> = {}): EntryFighter => ({ id: '', gym: '架空ジム', name: '架空選手', grade: '', age: '', height: '170', weight: '60', record: '初試合', comment: '', musicUrl: '', ...over });
test('r2-2: 向きの印・幅ゼロの空白は、取り除く。それだけの欄は「空」', () => {
  assert.equal(stripInvisible('\u202A090-1234-5678\u202C'), '090-1234-5678');
  assert.equal(stripInvisible('\u200B09012345678'), '09012345678');
  assert.equal(stripInvisible('a\u2066b\u2069\uFEFF\u00AD\u2060c'), 'abc');
  assert.equal(visibleTrim('\u200B'), '');
  assert.equal(visibleTrim('\u200B\u200B'), '');
  assert.equal(visibleTrim(' \u3000\u200Bあ\u200B '), 'あ');
  const errors = entryErrors(fighter({ gym: '\u200B', name: '\u200B\u200B' }), true);
  assert.ok(errors.includes('ジム名を入力してください。') && errors.includes('選手名を入力してください。'), '見えない文字だけの名前は「入っていない」');
  assert.deepEqual(entryErrors(fighter({ height: '\u200B170', weight: '\u202A60\u202C' }), true), [], '見えない文字つきの数字でも、数として読める');
});
test('必須（はじめの設定）：学年・年齢・意気込みが空だと、画面の検査が3つとも、名前を言って止める。見えない文字だけでも空。任意・なしでは止めない', () => {
  const R = { music: false, grade: 'required', age: 'required', comment: 'required' } as const;
  const empty = fighter({ grade: '', age: '', comment: '' });
  assert.deepEqual(entryErrors(empty, true, R), ['学年を入力してください。', '年齢を入力してください。', '試合への意気込みを入力してください。']);
  assert.deepEqual(entryErrors(fighter({ grade: '\u200B', age: '\u3000', comment: '\u200B\u200B' }), true, R), ['学年を入力してください。', '年齢を入力してください。', '試合への意気込みを入力してください。'], '見えない文字だけの欄は、空と同じ');
  assert.deepEqual(entryErrors(fighter({ grade: '中3', age: '15', comment: 'がんばります' }), true, R), [], '3つ入れれば通る');
  assert.deepEqual(entryErrors(fighter({ grade: '中3', age: 'abc', comment: 'がんばります' }), true, R), ['年齢を1〜120歳で入力してください。'], '必須でも、数字でない年齢は形のまちがいを言う');
  for (const mode of ['optional', 'off'] as const) assert.deepEqual(entryErrors(empty, true, { music: false, grade: mode, age: mode, comment: mode }), [], mode + '：空でも止めない');
});
test('r2-2: 申し込みページは、電話・メール・数字・リンクの前に見えない文字を取る', () => {
  const page = read('app/apply/page.tsx');
  assert.match(page, /const nfkc = \(value: string\) => stripInvisible\(value\.normalize\('NFKC'\)\);/);
  assert.match(page, /const trimAll = \(value: string\) => stripInvisible\(value\)/);
  assert.match(page, /gym: trimAll\(f\.gym\), name: trimAll\(f\.name\)/, '名前・ジム名も見えない文字を取った形で調べる');
  assert.match(page, /gym: nf\.gym, name: nf\.name/, '送る値も同じそろえかた');
  assert.match(page, /const cname = trimAll\(contactName\)/);
  assert.match(read('core/entryPackage.ts'), /INVISIBLE_CHARS = \/\[\\u00AD[^\]]*\\u202A-\\u202E[^\]]*\\uFEFF\]\/g/);
});
test('r2-2 / r2-66: Googleの受付（.gs）も、見えない文字を取り、改行を \\n にそろえる。直す所の名前を言う', () => {
  const h = harness(); h.ready();
  const code = (fn: () => unknown): { code?: string; message: string } => { try { fn(); } catch (e) { return e as never; } assert.fail('止まるはずが、止まらなかった'); };
  assert.equal(code(() => h.call('saveEntry_', h.params('test', { gym: '\u200B' }))).code, 'input', 'ジム名が見えない文字だけ');
  assert.match(code(() => h.call('saveEntry_', h.params('test', { gym: '\u200B' }))).message, /ジム名/, '直す所の名前が出る');
  assert.match(code(() => h.call('saveEntry_', h.params('test', { name: '\u200B\u200B' }))).message, /選手名/);
  assert.doesNotThrow(() => h.call('saveEntry_', h.params('test', { contactPhone: '\u202A09012345678\u202C' })), '電話番号の前後の向きの印');
  assert.doesNotThrow(() => h.call('saveEntry_', h.params('test', { contactEmail: '\u202Aa@b.com\u202C' })), 'メールの前後の向きの印');
  assert.doesNotThrow(() => h.call('saveEntry_', h.params('test', { height: '\u200B170', weight: '\u200B65' })), '身長・体重の幅ゼロ空白');
  // 意気込み：フォームの送信は改行を CRLF にする。画面が500字と数えたものは、受け付ける
  const body = 'あ'.repeat(250) + '\r\n' + 'い'.repeat(249);
  const second = h.call('saveEntry_', h.params('test', { comment: body }));
  assert.ok(second, '画面で500字の意気込み（改行1つ）が、CRLFで届いても受け付ける');
  const stored = h.rows('テスト申込').at(-1)!.join('|');
  assert.ok(stored.includes('あ'.repeat(250) + '\n' + 'い'.repeat(249)) && !stored.includes('\r'), '保存は \\n にそろっている');
  const e = code(() => h.call('saveEntry_', h.params('test', { comment: 'あ'.repeat(501) })));
  assert.equal(e.code, 'input'); assert.match(e.message, /意気込み/, '501字は止まり、どの欄かを言う');
});

// ---------- r2-6 / r2-7 / r2-8: リンク・メール・電話 ----------
test('r2-6: 入場曲のリンクは、HTTPS:// など大文字でも Apple Music／YouTube として読む。入力欄は自動大文字にしない', () => {
  for (const url of ['HTTPS://music.apple.com/jp', 'Https://Music.Apple.Com/jp/album/x', 'https://YOUTU.BE/abc']) assert.ok(MUSIC_URL_FORM.test(url), url);
  assert.equal(lowerLinkHost('HTTPS://Music.Apple.Com/jp/Album/X?i=1'), 'https://music.apple.com/jp/Album/X?i=1', '道すじ（/jp/Album/X）の大文字は、そのまま');
  assert.equal(lowerLinkHost('Https://YouTu.be/AbC'), 'https://youtu.be/AbC');
  assert.ok(!MUSIC_URL_FORM.test('http://music.apple.com/jp'), 'http:// は使えない');
  assert.ok(!MUSIC_URL_FORM.test('https://evil.example.com/music.apple.com/'), '別のサイトは使えない');
  assert.deepEqual(entryErrors(fighter({ musicUrl: 'HTTPS://music.apple.com/jp' }), true, { music: true, grade: 'optional', age: 'optional', comment: 'optional' }), []);
  const page = read('app/apply/page.tsx');
  assert.match(page, /musicUrl: lowerLinkHost\(noSpace\(nfkc\(f\.musicUrl\)\)\)/);
  assert.equal((page.match(/autoCapitalize="none" autoCorrect="off" spellCheck=\{false\}/g) || []).length, 3, '入場曲・電話・メールの3つの欄');
  assert.match(read('public/templates/Tournament_OS_Google受付_v3.gs'), /youtu\\.be\)\\\/\/i\.test\(text_\(p,'musicUrl'/, '.gs も大文字小文字を区別しない');
});
test('r2-7: メールの形。< > ( ) " \' 空白は不可・最後は英字2文字以上・ドメインの空の部分や - の始まりは不可。携帯会社の .. は止めない', () => {
  for (const bad of ['<a@b.com>', '(a@b.com)', 'a@b.c', 'a@b..com', 'a@-b.com', 'a@b-.com', 'a@b', 'a@.com', '@b.com', 'a@@b.com', 'a b@c.com', 'a@b.c0m', 'a"b@c.com', "a'b@c.com", 'a,b@c.com']) assert.equal(emailFormOk(bad), false, bad);
  for (const good of ['a@b.com', 'name.o@example.co.jp', 'taro..hanako@docomo.ne.jp', 'taro.@ezweb.ne.jp', 'a+b@example.com', 'a@xn--r8jz45g.jp', 'o.neil@example.com']) assert.equal(emailFormOk(good), true, good);
  const gs = read('public/templates/Tournament_OS_Google受付_v3.gs');
  assert.match(gs, /function emailOk_\(v\)/);
  assert.match(gs, /!emailOk_\(p\.contactEmail\)/, '受付の側も同じ決まり');
  const h = harness(); h.ready();
  for (const bad of ['<a@b.com>', 'a@b.c', 'a@b..com', 'a@-b.com']) {
    let error: { code?: string } | undefined; try { h.call('saveEntry_', h.params('test', { contactEmail: bad })); } catch (e) { error = e as never; }
    assert.equal(error?.code, 'input', bad + ' は受付でも止める');
  }
});
test('r2-8: 電話番号。「00」で始まる番号と、携帯でない11けたは使えない', () => {
  for (const bad of ['0012345678', '01234567890', '02012345678', '00012345678', '0312345', '123456789']) assert.equal(phoneFormOk(bad), false, bad);
  for (const good of ['09012345678', '08012345678', '07012345678', '05012345678', '0312345678', '0661234567', '0451234567']) assert.equal(phoneFormOk(good), true, good);
  const page = read('app/apply/page.tsx');
  assert.match(page, /「00」で始まる番号は、使えません/);
  assert.match(page, /11けたの番号は、携帯電話（050・070・080・090で始まる）だけです/);
  const h = harness(); h.ready();
  for (const bad of ['0012345678', '01234567890']) {
    let error: { code?: string } | undefined; try { h.call('saveEntry_', h.params('test', { contactPhone: bad })); } catch (e) { error = e as never; }
    assert.equal(error?.code, 'input', bad + ' は受付でも止める');
  }
});

// ---------- 文言 ----------
test('r2-3 / r2-5 / r2-10 / r2-11 / r2-12 / r2-13 / r2-14 / r2-15 / r2-80 / r2-93: 申し込みページの言い方', () => {
  const page = read('app/apply/page.tsx');
  // r2-3: 開き直したときの帯は、黄色。緑の ✓ にしない。出た方／出なかった方の両方に答える
  assert.match(page, /\{recentSent \? <Caution title="気をつけて" status/, '黄色の注意にする');
  assert.doesNotMatch(page, /\{recentSent \? <div className="tos-ok/, '緑にしない');
  assert.match(page, /受付番号の画面が出た方：<\/b>申し込み済みです。同じ人を、もう一度送らないでください。/);
  assert.match(page, /「送れませんでした」と出た方、何も出なかった方：<\/b>入れた文字と写真は、消えています。最初から入れ直して、送ってください。/);
  assert.match(page, /戻ると、入れた文字と写真が消えていることがあります。そのときは、最初から入れ直してください。/, '確認の画面でも、戻ると消えることを言う');
  // r2-13: 2つの別々の動きに、2つの別々の名前
  assert.match(page, />この表示を消す<\/button>/);
  assert.doesNotMatch(page, /別の選手を申し込む/);
  assert.equal((page.match(/別の人を申し込む（入力を消して、最初から）/g) || []).length, 1, '本当にリセットするボタンだけ「別の人を申し込む」');
  // r2-5 / r2-80
  assert.match(page, /文字や、2つ目の番号は消してください。例：09012345678/);
  assert.doesNotMatch(page, /消します。例/, 'しないことを「消します」と約束しない');
  assert.match(page, /フリーダイヤル（0120・0800）では、主催者がかけても、本人につながりません。連絡がつく携帯電話などの番号を入れてください。/);
  assert.doesNotMatch(page, /電話がつながりません/);
  // r2-10: 電波がないとき
  assert.match(page, /送れません：電波がありません。まだ送っていません。電波のある場所で、もう一度押してください。/);
  assert.doesNotMatch(page, /失敗：電波がありません/);
  assert.match(page, /reviewing\) nextKind = callFirst \? 'call' : online \? 'send' : 'none'/, '電波がないときは、黄色の「次はここ」を出さない');
  // r2-11: 直したあとは、確認の画面を通る
  assert.match(page, /confirmationPending && !changedAfterSend \? submit\(true, true\) : submit\(\)/);
  assert.match(page, /confirmationPending && !changedAfterSend \? 'もう一度送る（二重になりません）' : '入力内容を確認する →'/);
  assert.doesNotMatch(page, /'この内容で送る'/);
  // r2-12: 写真
  assert.match(page, /上の「📷 写真をえらぶ（撮る・アルバムから）」を押してください。/);
  assert.match(page, /photo: 'ここを押して写真をえらぶ'/);
  assert.doesNotMatch(page, /ここを押して写真を選ぶ/, '「選ぶ」と「えらぶ」を混ぜない');
  // r2-14 / r2-15
  assert.match(page, /weight: \{ hint: '試合に出る体重（kg）です。わからない時は、今の体重を入れてください。'/);
  assert.doesNotMatch(page, /試合に出る体重です（わからない時は、今の体重）/, '同じ説明を2回出さない');
  assert.match(page, /通っているジム・道場の名前です。通っていない時は「無所属」と入れてください。/);
  // r2-93: 「使い道」は見出しとして実在する
  assert.match(page, /<Fold id="privacy-fold" title="使い道" sub="どんな情報を、何のために使いますか？">/);
  assert.match(page, /下の「使い道」と「困ったとき」も、読んでください/);
  // r2-88: 🔒 は「押せない理由」だけ
  assert.doesNotMatch(page, /🔒 主催者|>🔒 /, '申し込みページの🔒は、押せない理由（LockReason）だけ');
  assert.match(page, /もう一度、見くらべてください/);
  assert.doesNotMatch(page, /読み合わせ/);
});

test('r2-4: クラスの目安（黄）と ちがい（赤）は、2つのカードの上に出す。確認の画面に「クラスを選び直す」', () => {
  const page = read('app/apply/page.tsx');
  const suggest = page.indexOf('{classSuggest ? <Caution title="目安"');
  const mismatch = page.indexOf('{classMismatchText ? <><ErrorLine status icon="⚠"');
  const cards = page.indexOf('{sides.map(([key, side])');
  assert.ok(suggest > 0 && mismatch > suggest && cards > mismatch, '目安 → ちがい → カード の順');
  assert.match(page, /onClick=\{\(\) => fix\('fighterClass'\)\} className=\{greyBtn \+ ' mt-2 w-full'\}>クラスを選び直す<\/button>/);
});

test('r2-16 / r2-17 / r2-104 / r2-115 / r2-122: 押す大きさ・フォーカス・ハイコントラスト・タイトル・古いSafari', () => {
  const page = read('app/apply/page.tsx');
  assert.match(page, /rel="noreferrer" className="inline-flex min-h-12 items-center underline underline-offset-4"/, '地図のリンクは48px');
  assert.match(page, /onClick=\{closeMessage\}/);
  assert.match(page, /\(keys\[0\]\?\.el \?\? document\.getElementById\('f-gym'\)\)\?\.focus\(\{ preventScroll: true \}\)/, '閉じたら、まちがいの最初の欄へ');
  const css = read('app/globals.css');
  assert.match(css, /@media \(forced-colors:active\)\{\.tos-apply input:focus-visible,\.tos-apply textarea:focus-visible/, 'ハイコントラストでも文字欄に輪郭');
  assert.match(css, /\.tos-apply\{min-height:100vh;min-height:100dvh\}/, '@layer の外の規則で dvh（読めないブラウザでは捨てられ、main の min-h-screen の 100vh が残る）');
  assert.match(css, /\.tos-apply-wrap\{overflow-wrap:break-word;overflow-wrap:anywhere;word-break:break-word;word-break:auto-phrase\}/, '古い Safari 向けの折り返し');
  assert.match(page, /<main className="tos-apply min-h-screen bg-slate-50/, '100vh は main の min-h-screen（古い Safari の保険）');
  assert.doesNotMatch(page, /\[min-height:100dvh\]/, 'dvh は（utility ではなく）.tos-apply で決める。utility どうしを競わせない');
  const layout = read('app/apply/layout.tsx');
  assert.match(layout, /title: '大会の申し込み'/);
  assert.match(layout, /description: '選手の申し込みページです。'/);
  assert.doesNotMatch(layout, /robots:/, '検索に出さない設定は大元から引き継ぐ');
  assert.match(read('app/private/page.tsx'), /useState<'wait' \| 'yes' \| 'no'>\('wait'\)/, '古いブラウザの判定は、画面ができてから');
});

test('r2-34 / r2-88 / r2-90 / r2-91: 準備の画面（消す・直す の後のフォーカス、🔒、ことば、重なる緑）', () => {
  const prep = read('app/private/page.tsx');
  assert.match(prep, /focusSoon\(left <= 0 \? 'add-bout' : 'bout-' \+ Math\.min\(index, left - 1\) \+ '-red', 'add-bout'\)/, '試合を消したら、近くの試合へ');
  assert.match(prep, /focusSoon\('fighter-note', 'add-bout'\)/, '選手を消したら、結果の緑の行へ');
  assert.match(prep, /focusSoon\('edit-note-' \+ original\.id, 'edit-btn-' \+ original\.id\)/, '直したら、結果の行へ');
  assert.match(prep, /id="fighter-note" tabIndex=\{-1\}/);
  assert.doesNotMatch(prep, /🔒 <\/span>(?:安心のしくみ|電話番号)/, 'プライバシーの文に🔒を使わない');
  assert.doesNotMatch(read('app/private/setup/page.tsx'), /🔒 <\/span>入れた文字は/);
  assert.match(read('app/private/setup/page.tsx'), /URL ＝ インターネットの住所の文字です。https:\/\/ で始まります/);
  assert.doesNotMatch(read('app/private/entry/page.tsx'), /CSVと写真/);
  assert.doesNotMatch(read('app/private/normalize.ts'), /の https:\/\/ から始まるリンクだけ/);
  assert.doesNotMatch(read('app/private/setup/page.tsx'), /✓ 進めます。/, '手順2の緑は1つ');
  assert.doesNotMatch(read('app/private/setup/page.tsx'), /つながりました（URLは正しいです）/);
  assert.doesNotMatch(prep, /<Caution className="mt-2">このパソコンでだけ使えます/, '黄色の「この保存はこのパソコンだけ」は1つ');
});
