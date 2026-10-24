// 採点者が見つけた、申し込みページ（app/apply/page.tsx）の6つの問題の直しを確かめる試験。
//   1. 誓約書の文（plt）を書きかえたリンク：指紋（plf）と合わなければ、切れたリンクと同じに止める（Googleの受付と同じ作り方の SHA-256）
//   2. 送る瞬間の下書きは「送った控え」へ移す（受付番号が出なかったときだけ、手で戻す）
//   3. くわしい戦績で、入れたのにまちがっているときは、箱を出たあと「戦績を直す」
//   4. 「入力は全部で◯個」が、区分を選ぶと変わるリンクは、そう言う
//   5. 下書きの「消す」は、10秒だけ「消しました（元にもどす）」で戻せる
//   6. 送る隠し欄と、送り直しの見張り（payloadKey）は、1つの並び（postFields）から作る。送る中身（鍵・順・値）は、今までと1字も変えない
// 画面のコードは TSX なので、ここでは読めない。画面の決まった1行（式）を取り出して、node:vm で本当に計算する（3・4・6）。動きは scripts/test-*.mjs（本物の Chromium）が確かめる。
// 人の名前・電話・メール・誓約の文は、ぜんぶ『架空』『テスト用』の値。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { harness } from './helpers/gasV3Harness.ts';
import { entryConfigFromPing, parsePing } from '../core/setupV3.ts';
import { pledgeLinkGenuine, publicEntryConfig, publicEntryHash, publicEntryLinkCut, publicEntryReady, type PublicEntryConfig } from '../core/publicEntry.ts';
import { hexOfBytes, packPledge, pledgeCanon, pledgeHashMatches, type PledgeConfig } from '../core/pledge.ts';
import { DEFAULT_CLASS_SETTINGS } from '../core/classRules.ts';
import { DEFAULT_WEIGHT_SETTINGS } from '../core/weightClass.ts';
import { HANAMICHI_KEYS, isHanamichiDivision } from '../core/hanamichi.ts';
import { packRecordDetail } from '../core/recordDetail.ts';
import { blankPledgeAnswers, pledgePlan, pledgePost } from '../app/components/pledgeForm.ts';
import { detailFromText, recordIsWrong, recordProblems } from '../app/components/recordDetailText.ts';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const PAGE = read('app/apply/page.tsx');
const PAGE_CODE = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
const PARTS = read('app/components/RecordDetailFields.tsx');
/** 画面の「const 名前 = 式;」（1行）の式だけを取り出す。型の注釈（: Array<…>）は飛ばす */
function expressionOf(name: string): string {
  const line = PAGE.split('\n').find((l) => l.trimStart().startsWith('const ' + name + ' =') || l.trimStart().startsWith('const ' + name + ':'));
  assert.ok(line, name + ' の行がある');
  const body = line!.slice(line!.indexOf(' = ') + 3).trim();
  assert.ok(body.endsWith(';'), name + ' は1行の式');
  return body.slice(0, -1);
}
const run = (expression: string, scope: Record<string, unknown>): any => vm.runInNewContext('(' + expression + ')', { ...scope });

/* ───────── 1. 誓約書の文と指紋 ───────── */

const ENDPOINT = 'https://script.google.com/macros/s/AKfycbyTEST_ONLY/exec';
const cfg: PublicEntryConfig = { endpoint: ENDPOINT, eventId: 'test-cup', title: '架空大会', organizer: '架空主催', date: '2027年10月3日', venue: '架空体育館', venueUrl: '', deadline: '2099-11-30', contact: '連絡先', music: false, grade: 'optional', age: 'required', comment: 'optional', protocol: '3', mode: 'live' };
const TEXTS = { items: ['テスト用の文です1', '絵文字😀🥋と𠮷野家', 'ASCII only: a=1&b=2?c#d%e+f', '"引用"と\\と/', '1行目\n2行目'], guardian: 'テスト用の保護者の文です', gym: 'テスト用のジムの文です' };
const PLEDGE: PledgeConfig = { ...TEXTS, mode: 'under18', gymMode: true, confirmed: true };
/** Googleの受付と同じ作り方（JSON の文字 → UTF-8 → SHA-256 → 16進の小文字）を、core を使わずに Node で作る */
const realHash = (t: { items: string[]; guardian: string; gym: string }) => createHash('sha256').update(JSON.stringify({ items: t.items, guardian: t.guardian, gym: t.gym }), 'utf8').digest('hex');
const swap = (link: string, key: string, value: string) => { const params = new URLSearchParams(link.replace(/^#/, '')); params.set(key, value); return '#' + params.toString(); };

test('1 本物の受付（.gs）の ping から作ったリンク：文と指紋が合う（いままでどおり使える）', async () => {
  const h = harness();
  h.ready({ 誓約書: 'あり' });
  h.book.getSheetByName('誓約書').rows = [['誓約書の項目', '保護者の文', 'ジムの文'], ...TEXTS.items.map((t, i) => [t, i === 0 ? TEXTS.guardian : '', i === 0 ? TEXTS.gym : ''])];
  h.setSetting('誓約書の文の確認', '済み');
  h.call('openEntries');
  const ping = parsePing(JSON.parse(h.call('doGet', { parameter: { action: 'ping' } }).text));
  const link = publicEntryHash(entryConfigFromPing(ping, ENDPOINT, 'live'));
  const config = publicEntryConfig(link);
  assert.ok(config.pledge && config.pledgeHash, 'リンクに誓約書がある');
  assert.equal(publicEntryLinkCut(link), false);
  assert.equal(pledgeCanon(config.pledge!), h.call('pledgeCanon_', h.call('S_')), '文のひとまとめは、受付の pledgeCanon_ と1字も同じ');
  assert.equal(config.pledgeHash, h.call('pledgeHash_', h.call('S_')), 'リンクの指紋は、受付の指紋');
  assert.equal(await pledgeLinkGenuine(config), true, '正しいリンクは、確かめを通る');
  // 受付の hex_（Apps Script のバイトは -128〜127）と、core の hexOfBytes は同じ形
  const signed = [0, 1, 15, 16, 127, -128, -1];
  assert.equal(hexOfBytes(signed.map((b) => b & 255)), h.call('hex_', signed));
});

test('1 リンクの中で文（plt）を書きかえ、指紋（plf）はそのまま：形は正しいので「切れていない」と読めるが、指紋の確かめで止まる', async () => {
  const link = publicEntryHash({ ...cfg, pledge: PLEDGE, pledgeHash: realHash(TEXTS) });
  assert.equal(await pledgeLinkGenuine(publicEntryConfig(link)), true, '書きかえる前は、合う');
  const forged = [
    { ...TEXTS, items: ['書きかえた文です', ...TEXTS.items.slice(1)] }, // 項目の数は同じまま、1項目目だけ
    { ...TEXTS, items: [...TEXTS.items].reverse() }, // 並びだけ変える
    { ...TEXTS, guardian: 'テスト用の保護者の文です（書きかえ）' },
    { ...TEXTS, gym: '' },
    { ...TEXTS, items: TEXTS.items.slice(0, 4) },
  ];
  for (const texts of forged) {
    const bad = swap(link, 'plt', packPledge(texts.items, texts.guardian, texts.gym));
    const config = publicEntryConfig(bad);
    assert.equal(publicEntryLinkCut(bad), false, '形の検査（同期）だけでは、気づけない＝これが直す前の穴');
    assert.equal(publicEntryReady(config), true);
    assert.deepEqual(config.pledge?.items, texts.items, '画面には、書きかえた文が出る');
    assert.equal(config.pledgeHash, realHash(TEXTS), '送る指紋は、元の文のもの');
    assert.equal(await pledgeLinkGenuine(config), false, '書きかえた文は、指紋の確かめで止まる：' + texts.items[0]);
  }
  // 指紋のほうを、別の正しい形の値にしても止まる
  assert.equal(await pledgeLinkGenuine(publicEntryConfig(swap(link, 'plf', 'f'.repeat(64)))), false);
});

test('1 指紋の確かめ：誓約書の無いリンクは何もしない（true）。crypto.subtle が無い・失敗するブラウザでは、確かめられないので今までどおり（true）。16進は小文字64字だけ', async () => {
  assert.equal(await pledgeLinkGenuine(publicEntryConfig(publicEntryHash(cfg))), true);
  const config = publicEntryConfig(publicEntryHash({ ...cfg, pledge: PLEDGE, pledgeHash: 'f'.repeat(64) }));
  assert.equal(await pledgeLinkGenuine(config), false);
  assert.equal(await pledgeLinkGenuine(config, null), true, 'crypto.subtle が無い（http の画面など）');
  assert.equal(await pledgeLinkGenuine(config, { digest: () => Promise.reject(new Error('x')) } as unknown as SubtleCrypto), true, '計算に失敗した');
  const digest = Buffer.from(realHash(TEXTS), 'hex');
  assert.equal(pledgeHashMatches(digest, realHash(TEXTS)), true);
  assert.equal(pledgeHashMatches(digest, realHash(TEXTS).toUpperCase()), false);
  assert.equal(pledgeHashMatches(digest, realHash(TEXTS).slice(1)), false);
  assert.equal(pledgeHashMatches(digest.subarray(1), realHash(TEXTS).slice(2)), false);
});

test('1 画面：リンクを読むたびに確かめ、合わなければ「切れたリンク」と同じ道（linkCut）で止める。確かめの間は送らない。古いリンクの答えは使わない', () => {
  const apply = PAGE_CODE.slice(PAGE_CODE.indexOf('const applyConfig = '), PAGE_CODE.indexOf('useEffect(() => {', PAGE_CODE.indexOf('const applyConfig = ')));
  assert.match(apply, /setLinkCut\(publicEntryLinkCut\(hash\)\);/);
  assert.match(apply, /const run = \+\+pledgeRunRef\.current;\s*pledgeCheckingRef\.current = Boolean\(next\.pledge\);/);
  assert.match(apply, /if \(next\.pledge\) void pledgeLinkGenuine\(next\)\.then\(\(ok\) => \{ if \(run !== pledgeRunRef\.current\) return; pledgeCheckingRef\.current = false; if \(!ok\) setLinkCut\(true\); \}\);/);
  const submit = PAGE_CODE.slice(PAGE_CODE.indexOf('const submit = '), PAGE_CODE.indexOf('const choosePhoto = '));
  const gate = submit.indexOf('if (confirmed && pledgeCheckingRef.current)');
  assert.ok(gate > 0 && gate < submit.indexOf('setSending(true)') && gate < submit.indexOf('sendingRef.current = true'), '送る前に止める');
  assert.match(PAGE_CODE, /const endpointReady = publicEntryReady\(config\) && !linkCut;/, '止まったリンクは、切れたリンクと同じ赤い案内・送れない');
});

/* ───────── 2. 送った控え ───────── */

test('2 画面：送る瞬間に、下書きを「送った控え」へ移す（消す前に書く）。自動では戻さない。戻すボタンは「さっき送りました」の注意の中の灰色の副ボタン', () => {
  const save = PAGE_CODE.slice(PAGE_CODE.indexOf('saveNextRef.current = () => {'), PAGE_CODE.indexOf('const dropSentCopy'));
  const write = save.indexOf('safeSet(store, copyKey(storeLink), copy)');
  assert.ok(write > 0 && write < save.indexOf('safeRemove(store, draftKey(storeLink))'), '控えを書いてから、下書きを消す');
  assert.match(save, /const copy = packCopy\(draftSrc, Date\.now\(\), storeLink\);/, '控えの中身は、下書きと同じ draftSrc（写真・連絡先は入らない）');
  const load = PAGE_CODE.slice(PAGE_CODE.indexOf('const copyRaw = '), PAGE_CODE.indexOf('const raw = safeGet(store, draftKey(storeLink));'));
  assert.match(load, /if \(copy\) setSentCopy\(copy\); else safeRemove\(store, copyKey\(storeLink\)\);/, '読み込んだときは、ボタンを出すだけ（入力には入れない）');
  assert.doesNotMatch(load, /fillDraftFields|setFighter/);
  const notice = PAGE.slice(PAGE.indexOf('{recentSent ? <Caution'), PAGE.indexOf('</Caution> : null}', PAGE.indexOf('{recentSent ? <Caution')));
  assert.match(notice, /受付番号の画面が出た方：<\/b>申し込み済みです。同じ人を、もう一度送らないでください。/, '二重に送らない注意は、そのまま');
  assert.match(notice, /\{storeLink && sentCopy && !draftOffer \? <button type="button" onClick=\{restoreSentCopy\} className=\{greyBtn \+ ' mt-2 w-full'\}>受付番号が出なかったときだけ：さっきの選手の入力を戻す（写真は選び直し）<\/button> : null\}/);
  assert.match(notice, /onClick=\{\(\) => \{ setRecentSent\(false\); dropSentCopy\(\); \}\} className=\{greyBtn \+ ' mt-2 w-full'\}>この表示を消す<\/button>/, '「この表示を消す」で、控えも消す');
  assert.doesNotMatch(notice, /NextBox|tos-main|👉/, '黄色の「次はここ」・主ボタンにしない');
  // 控えを消す：「別の人を申し込む」・戻したとき
  assert.match(PAGE_CODE.slice(PAGE_CODE.indexOf('const resetAthlete = () => {'), PAGE_CODE.indexOf('const restoreDraft = () => {')), /dropSentCopy\(\);/);
  const restore = PAGE_CODE.slice(PAGE_CODE.indexOf('const restoreSentCopy = () => {'), PAGE_CODE.indexOf('const discardDraft = () => {'));
  assert.match(restore, /fillDraftFields\(copy\.fields\);\s*dropSentCopy\(\);/);
  assert.match(restore, /写真は、もう一度えらんでください。/);
  assert.match(PAGE_CODE, /const dropSentCopy = \(\) => \{ if \(storeLink\) safeRemove\(tabStorage\(\), copyKey\(storeLink\)\); setSentCopy\(null\); \};/);
});

/* ───────── 3. くわしい戦績の「直す」 ───────── */

test('3 くわしい戦績：入れたのにまちがい（勝ち＞試合数 など）のときだけ、戦績の箱を出たあとに「直す」の赤を返す。空・入力の途中・箱の中にいる間は、赤にしない', () => {
  const line = PAGE.split('\n').find((l) => l.includes("if (key === 'record' && recordOn) return "));
  assert.ok(line, 'live() の中の1行');
  const live = (key: string, kick: { games: string; win: string }, touched: boolean, recordOn = true) => {
    const msgs = recordProblems(kick, [], []);
    return vm.runInNewContext('(function () { ' + line!.trim() + " return 'ふつうの欄の検査へ'; })()", { key, recordOn, recordWrong: recordOn && recordIsWrong(kick, [], []), touched: { record: touched }, recordMessages: msgs });
  };
  assert.equal(live('record', { games: '3', win: '5' }, true), 'キックボクシングの勝ちが、試合数（3）より多くなっています。', '箱を出たあと：直す');
  assert.equal(live('record', { games: '3', win: '5' }, false), '', '箱の中にいる間（まだ出ていない）は、赤にしない');
  assert.equal(live('record', { games: '3', win: '' }, true), '', '入力の途中（勝ちがまだ）は、赤にしない');
  assert.equal(live('record', { games: '', win: '' }, true), '', '空は、赤にしない（足りない所として数える）');
  assert.equal(live('record', { games: 'あ', win: '' }, true), 'キックボクシングの試合数を、数字で入れてください（未経験は「0」）。');
  assert.equal(live('record', { games: '3', win: '2' }, true), '', '正しい戦績');
  assert.equal(live('record', { games: '3', win: '5' }, true, false), 'ふつうの欄の検査へ', '1行の戦績のリンクは、今までどおり');
  assert.equal(detailFromText({ games: '3', win: '5' }, [], []).kick.games, 3);
  // 箱を出たとき：箱の中の欄どうしで移るときは呼ばない。画面は、ほかの欄と同じ「欄を出た時」（leaveSoon）にする
  assert.match(PARTS, /onLeave\?: \(\) => void;/);
  assert.match(PARTS, /<div id="f-record" tabIndex=\{-1\} className="min-w-0 space-y-6 outline-none" onBlur=\{\(e\) => \{ if \(p\.onLeave && !e\.currentTarget\.contains\(e\.relatedTarget as Node \| null\)\) p\.onLeave\(\); \}\}>/);
  assert.match(PAGE, /problems=\{attempted \? recordMessages : \[\]\} onLeave=\{\(\) => leaveSoon\('record'\)\} \/>/, '箱の中の赤い一覧は、今までどおり送ろうとしたあとだけ');
  // 「直す」になると、黄色の札は「戦績を直す」、下の「直す所」にも入る（どちらも live を使う、今までの決まり）
  assert.match(PAGE_CODE, /return !empty && shown\(key\) \? `\$\{SHORT\[key\]\}を直す` : NEXT_LABEL\[key\];/);
  assert.match(PAGE_CODE, /\.filter\(\(key\) => live\(key\)\);/);
});

/* ───────── 4. 入力の数が、区分で変わるリンク ───────── */

test('4 区分を選ぶと入力の数が変わるリンク（階級の欄が出る・大人の区分では学年を聞かない・花道の質問・花道のルールでクラスを聞かない）だけ、「出場区分によって…」を出す', () => {
  const kidsLine = PAGE.split('\n').find((l) => l.startsWith('const isKidsDivision = '))!;
  const isKidsDivision = vm.runInNewContext('(' + kidsLine.replace(/^const isKidsDivision = \(name: string\): boolean => /, '(name) => ').replace(/;$/, '') + ')');
  const may = (config: Partial<PublicEntryConfig>, weights: unknown) => run(expressionOf('divisionMayChange'), { weights, config: { grade: 'optional', ...config }, isHanamichiDivision, isKidsDivision });
  const noClasses = (names: string[]) => ({ enabled: true, divisions: names.map((name) => ({ name, classes: [] })) });
  assert.equal(may({}, DEFAULT_WEIGHT_SETTINGS), true, '採点の例：階級のある区分を選ぶと「階級」が1つ増える（13→14）');
  assert.equal(may({}, undefined), false, '階級分けの無いリンク：区分の欄が無い');
  assert.equal(may({}, noClasses(['一般男子', '小学生'])), false, '階級の無い区分だけ・学年は任意：数は変わらない');
  assert.equal(may({ grade: 'required' }, noClasses(['一般男子', '小学生'])), true, '学年が必須：大人の区分では学年を聞かない（1つ減る）');
  assert.equal(may({ grade: 'required' }, noClasses(['小学生', '中学生'])), false, '子どもの区分だけなら、学年はいつも聞く');
  assert.equal(may({ hanamichi: true }, noClasses(['花道男子', '一般男子'])), true, '花道の質問が出る');
  assert.equal(may({}, noClasses(['花道男子', '一般男子'])), false, '花道の質問なし・花道のルールなし');
  assert.equal(may({ classes: DEFAULT_CLASS_SETTINGS, hanamichiRule: '花道のルールの1行' }, noClasses(['花道男子', '一般男子'])), true, '花道のルール：花道の区分ではクラスを聞かない（1つ減る）');
  assert.equal(may({ classes: DEFAULT_CLASS_SETTINGS }, noClasses(['花道男子', '一般男子'])), false);
  // 言い方は今までのまま：『出場区分によって、入力の数が変わることがあります。』（年齢の理由と並ぶときは「出場区分・年齢」）
  assert.match(PAGE, /\{countMayChange\}によって、入力の数が変わることがあります。/);
});

/* ───────── 5. 下書きの「消す」を元にもどす ───────── */

test('5 下書きの「消す」：消した中身を ref に10秒だけ持ち、「消しました（元にもどす）」の灰色の副ボタンで、案内の枠（戻す／消す）に戻せる', () => {
  const discard = PAGE_CODE.slice(PAGE_CODE.indexOf('const discardDraft = () => {'), PAGE_CODE.indexOf('const undoDiscard = () => {'));
  assert.match(discard, /discardedRef\.current = draftOffer;/);
  assert.match(discard, /setTimeout\(\(\) => \{ undoTimerRef\.current = null; discardedRef\.current = null; setDraftUndo\(false\); \}, 10000\)/, '10秒で消える');
  assert.match(discard, /safeRemove\(tabStorage\(\), draftKey\(storeLink\)\);/, '入れ物からは、すぐ消す（今までどおり）');
  const undo = PAGE_CODE.slice(PAGE_CODE.indexOf('const undoDiscard = () => {'), PAGE_CODE.indexOf('const changeNext = () => {'));
  assert.match(undo, /const packed = packDraft\(saved\.fields, saved\.savedAt, storeLink\);\s*if \(packed !== null\) safeSet\(tabStorage\(\), draftKey\(storeLink\), packed\);/, '保存した時刻のまま、入れ物に戻す');
  assert.match(undo, /draftOfferRef\.current = true;\s*setDraftOffer\(saved\);/, '案内の枠（戻す／消す）が、また出る');
  assert.doesNotMatch(undo, /fillDraftFields/, '入力には、まだ入れない');
  const note = PAGE.slice(PAGE.indexOf('<Note id="draft-undo"'), PAGE.indexOf('</Note>', PAGE.indexOf('<Note id="draft-undo"')));
  assert.match(PAGE, /\{storeLink && draftUndo && !draftOffer \? <Note id="draft-undo" status className="mt-4">/);
  assert.match(note, /<button type="button" onClick=\{undoDiscard\} className=\{greyBtn\}>消しました（元にもどす）<\/button>/);
  assert.doesNotMatch(note, /NextBox|data-tos-next|tos-next|👉|次はここ|role="alert"/, '静かな案内（黄色の「次はここ」にしない）');
  assert.match(PAGE_CODE, /useEffect\(\(\) => \(\) => \{ if \(undoTimerRef\.current\) clearTimeout\(undoTimerRef\.current\); \}, \[\]\);/);
});

/* ───────── 6. 送る中身は1つの並びから ───────── */

/** 直す前の form の隠し欄（3つの並びを、この順に出していた）。app/apply/page.tsx の前の版から1字も変えずに写した */
const OLD_FORM = "[...Object.entries({ protocol: config.protocol === '3' ? '3' : '2', entryKey: config.entryKey || '', mode: config.mode || '', website: '', eventId: config.eventId, requestId, gym: nf.gym, name: nf.name, grade: postGrade, age: postAge, height: nf.height.replace(/cm$/i, ''), weight: nf.weight.replace(/kg$/i, ''), record: nf.record, fighterClass: classes ? chosenClass : '', ...(weights ? { division, weightClass: needClass ? weightClass : '' } : {}), comment: postComment, musicUrl: config.music ? nf.musicUrl : '', contactName: cname, contactPhone: phone, contactEmail: email, consent: consent ? 'yes' : 'no', photoDataUrl: photo, ...hanamichiPost }).map(([name, value]) => ({ name, value })), ...Object.entries(pledgeNow).map(([name, value]) => ({ name, value })), ...Object.entries(recordPost).map(([name, value]) => ({ name, value }))]";
const FAKE_PLEDGE: PledgeConfig = { items: ['テスト用の文です1', 'テスト用の文です2'], guardian: 'テスト用の保護者の文です', gym: 'テスト用のジムの文です', mode: 'under18', gymMode: true, confirmed: true };
function scope(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    config: { protocol: '3', entryKey: '', mode: 'live', eventId: 'test-cup', music: false }, requestId: 'r'.repeat(32),
    nf: { gym: '架空ジム', name: '架空 選手', height: '170', weight: '65', record: '初試合', musicUrl: '' }, postGrade: '中2', postAge: '14', postComment: 'がんばります',
    classes: undefined, chosenClass: '', weights: undefined, division: '', needClass: false, weightClass: '',
    cname: '架空 連絡', phone: '09000000000', email: 'kakuu@example.com', consent: true, photo: 'data:image/jpeg;base64,AAAA', hanamichiPost: {}, pledgeNow: {}, recordPost: {}, ...over,
  };
}
const ANSWERS = { ...blankPledgeAnswers(), ticks: [true, true], guardian: true, gymName: '架空 責任者', gymPhone: '09000000000', gymPermission: true, gymConsent: true };
const VARIANTS: Array<[string, Record<string, unknown>]> = [
  ['ふつう（何もなし）', {}],
  ['入場曲・クラス分け・階級分け', { config: { protocol: '3', entryKey: '', mode: 'test', eventId: 'test-cup', music: true }, nf: { gym: '架空ジム', name: '架空 選手', height: '170', weight: '65', record: '3勝1敗', musicUrl: 'https://music.apple.com/jp/album/x/1' }, classes: DEFAULT_CLASS_SETTINGS, chosenClass: 'upper', weights: DEFAULT_WEIGHT_SETTINGS, division: '中学生男子', needClass: true, weightClass: '37kg以下' }],
  ['階級の無い区分', { weights: DEFAULT_WEIGHT_SETTINGS, division: '小学生以下', needClass: false, weightClass: '' }],
  ['古い受付（protocol 2）', { config: { protocol: '2', entryKey: 'k'.repeat(40), mode: 'live', eventId: 'test-cup', music: false } }],
  ['花道', { weights: DEFAULT_WEIGHT_SETTINGS, division: '花道・男子（40歳以上）', needClass: true, weightClass: '-70', hanamichiPost: Object.fromEntries(HANAMICHI_KEYS.map((key, i) => [key, '架空' + i])) }],
  ['誓約書', { pledgeNow: pledgePost(pledgePlan(FAKE_PLEDGE, '14', 'live'), ANSWERS, 'f'.repeat(64)) }],
  ['くわしい戦績', { nf: { gym: '架空ジム', name: '架空 選手', height: '170', weight: '65', record: '5戦3勝2敗', musicUrl: '' }, recordPost: { recordDetail: packRecordDetail(detailFromText({ games: '5', win: '3' }, [{ sport: '空手', games: '2', win: '1' }], [])) } }],
  ['ぜんぶ', { weights: DEFAULT_WEIGHT_SETTINGS, division: '花道・男子（40歳以上）', needClass: true, weightClass: '-70', classes: DEFAULT_CLASS_SETTINGS, chosenClass: 'lower', hanamichiPost: Object.fromEntries(HANAMICHI_KEYS.map((key) => [key, '架空'])), pledgeNow: pledgePost(pledgePlan(FAKE_PLEDGE, '45', 'live'), ANSWERS, 'e'.repeat(64)), recordPost: { recordDetail: packRecordDetail(detailFromText({ games: '0', win: '' }, [], [])) } }],
];

test('6 送る隠し欄：新しい1つの並び（postFields）は、直す前の form と、鍵・順・値が1字も同じ（ふつう・花道・誓約書・くわしい戦績・ぜんぶ）', () => {
  const now = expressionOf('postFields');
  for (const [label, over] of VARIANTS) {
    const s = scope(over);
    const before = run(OLD_FORM, s) as Array<{ name: string; value: string }>;
    const after = (run(now, s) as Array<[string, string]>).map(([name, value]) => ({ name, value }));
    assert.deepEqual(JSON.parse(JSON.stringify(after)), JSON.parse(JSON.stringify(before)), label);
    assert.ok(before.length >= 21, label + '：' + before.length + '個');
  }
  // form は、その並びの隠し欄だけを出す（ほかの隠し欄を直に書かない）
  const form = PAGE.slice(PAGE.indexOf('<form ref={formRef}'), PAGE.indexOf('</form>', PAGE.indexOf('<form ref={formRef}')));
  assert.equal((form.match(/<input /g) || []).length, 1);
  assert.match(form, /\{postFields\.map\(\(\[name, value\]\) => <input key=\{name\} type="hidden" name=\{name\} value=\{value\} \/>\)\}/);
});

test('6 送り直しの見張り（payloadKey）は、送る並びから控え番号（requestId）だけを除いたもの。送るどの欄を変えても変わる（足し忘れが起きない）', () => {
  const fields = expressionOf('postFields'), key = expressionOf('payloadKey');
  const keyOf = (s: Record<string, unknown>) => run(key, { ...s, postFields: run(fields, s) }) as string;
  assert.doesNotMatch(PAGE_CODE.slice(PAGE_CODE.indexOf('const payloadKey ='), PAGE_CODE.indexOf('const contactNow')), /fighter\.|nf\.|contactName/, '手で並べた一覧ではない');
  for (const [label, over] of VARIANTS) {
    const s = scope(over);
    const list = run(fields, s) as Array<[string, string]>;
    assert.equal(keyOf({ ...s, requestId: 'x'.repeat(32) }), keyOf(s), label + '：控え番号だけが変わっても、同じ中身');
    assert.deepEqual(JSON.parse(keyOf(s)), JSON.parse(JSON.stringify(list.filter(([name]) => name !== 'requestId'))), label);
    // 送る欄を1つずつ変える：見張りの答えが、かならず変わる
    for (const [name] of list) {
      if (name === 'requestId') continue;
      const changed = list.map(([n, v]) => [n, n === name ? v + '（直した）' : v]);
      assert.notEqual(run(key, { postFields: changed }), keyOf(s), label + '：' + name + ' を直したら、新しい控え番号で送る');
    }
  }
});
