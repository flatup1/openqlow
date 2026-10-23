// 誓約書：設定の画面（/private/setup/）と、Google の受付（.gs）・申し込みページ（リンク・POST の鍵）・core/pledge.ts の「つなぎ目」。
// 本物の .gs（ハーネス）が返した ping → 設定の画面が読む（parsePing）→ 選手に渡すリンク → 申し込みページの部品 → POST → 本物の .gs が保存、の鎖で確かめる。
// 文は『テスト用の文です1』のような架空の文だけ。実名・本物の電話番号は使わない。「なし」の動きは tests/pledgeGolden.test.ts・tests/pledgeLink.test.ts が固定している。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness, script } from './helpers/gasV3Harness.ts';
import { GYM_NAME_MAX, PLEDGE_LIMITS, PLEDGE_LINK_KEYS, PLEDGE_POST_KEYS, packPledge, type GuardianMode } from '../core/pledge.ts';
import { publicEntryConfig, publicEntryHash, publicEntryLinkCut, publicEntryReady } from '../core/publicEntry.ts';
import { diagnose, entryConfigFromPing, entryConfigProblem, EXPECTED_RECEPTION_BUILD, parsePing, PLEDGE_UNCONFIRMED_ADVICE, pledgeDiagnosis, settingLines, supportsPledge, type Ping } from '../core/setupV3.ts';
import { blankPledgeAnswers, GYM_PERMISSION_LABEL, pledgeIssues, pledgeLockReason, pledgePlan, pledgePost, PLEDGE_BLOCKED_TEXT, PLEDGE_PERMISSION_TEXT, type PledgeAnswers, type PledgePlan } from '../app/components/pledgeForm.ts';

const read = (path: string): string => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const PAGE = read('app/private/setup/page.tsx');
const ENDPOINT = 'https://script.google.com/macros/s/AKfycbxFAKE0123456789_-/exec';
const R = { pledge: '誓約書', guardian: '保護者の同意', gym: 'ジム責任者の同意', confirm: '誓約書の文の確認' };
const TAB = '誓約書', REC = '誓約記録', REC_TEST = 'テスト誓約記録';
const TAB_HEADINGS = ['誓約書の項目（原本のとおりに、1項目ずつ。1マス＝1項目）', '保護者（連帯責任者）の同意の文', '団体・ジム責任者の同意の文'];
const ITEMS = ['テスト用の文です1', 'テスト用の文です2', 'テスト用の文です3', 'テスト用の文です4', 'テスト用の文です5'];
const G = 'テスト用の文です保護者', Y = 'テスト用の文ですジム';
const GYM_NAME = '架空責任者', GYM_PHONE = '09011112222';

type H = ReturnType<typeof harness>;
const json = (value: unknown) => JSON.parse(JSON.stringify(value));
const pingOf = (h: H) => JSON.parse(h.call('doGet', { parameter: { action: 'ping' } }).text);
const thrown = (fn: () => unknown): any => { try { fn(); } catch (e) { return e; } assert.fail('投げなかった'); };
const fillTab = (h: H, items: string[] = ITEMS, guardian = G, gym = Y) => {
  const rows: string[][] = [[...TAB_HEADINGS]];
  for (let i = 0; i < Math.max(items.length, 1); i++) rows.push([items[i] ?? '', i === 0 ? guardian : '', i === 0 ? gym : '']);
  h.book.getSheetByName(TAB).rows = rows;
};
/** 誓約書＝あり の大会。文は架空に入れかえ、確認＝済み（confirm=false なら まだ）、受付中 */
const live = (over: Record<string, string> = {}, confirm = true): H => {
  const h = harness(); h.ready({ [R.pledge]: 'あり', ...over });
  fillTab(h); if (confirm) h.setSetting(R.confirm, '済み');
  h.call('openEntries'); return h;
};
/** 設定の画面が読む ping（本物の .gs が返したもの）と、そこから作る選手に渡すリンク（# のあと） */
const readPing = (h: H): Ping => parsePing(pingOf(h));
const hashOf = (h: H, mode: 'test' | 'live' = 'live'): string => publicEntryHash(entryConfigFromPing(readPing(h), ENDPOINT, mode));

/** 申し込みページが、全部✔・入力ずみにした答え（plan が求める欄だけ） */
const complete = (plan: PledgePlan): PledgeAnswers => ({ ticks: Array.from({ length: plan.n }, () => true), guardian: plan.guardian, gymName: plan.gym ? GYM_NAME : '', gymPhone: plan.gym ? GYM_PHONE : '', gymPermission: plan.gym, gymConsent: plan.gym });

/* ───────── 鎖：本物の Google → 設定の画面 → リンク → 申し込みページ → POST → 本物の Google ───────── */

test('鎖: ping の6つの鍵 → 設定の画面が読む → リンクの pl・plg・plm・plc・plf・plt（この順。protocol のまえ）→ 申し込みページが読む。リンクは切れていない。指紋は ping と同じ', () => {
  const h = live({ 階級分け: 'あり', 花道の追加情報: 'あり' });
  const body = pingOf(h), ping = parsePing(body);
  assert.equal(ping.pledgeMode, true); assert.equal(supportsPledge(ping), true);
  const hash = hashOf(h);
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const keys = [...params.keys()];
  assert.deepEqual(keys.slice(keys.indexOf('pl')), [...PLEDGE_LINK_KEYS, 'protocol', 'mode', 'end'], '誓約書の鍵は、protocol・mode・end のまえにこの順で並ぶ');
  assert.ok(keys.indexOf('hn') < keys.indexOf('pl'), '花道のあと');
  assert.deepEqual([params.get('pl'), params.get('plg'), params.get('plm'), params.get('plc'), params.get('plf')], ['on', 'under18', 'on', 'on', body.pledgeHash]);
  assert.equal(params.get('plt'), packPledge(ITEMS, G, Y));
  assert.equal(publicEntryLinkCut(hash), false); assert.equal(publicEntryReady(publicEntryConfig(hash)), true);
  const config = publicEntryConfig(hash);
  assert.deepEqual(json(config.pledge), { items: ITEMS, guardian: G, gym: Y, mode: 'under18', gymMode: true, confirmed: true });
  assert.equal(config.pledgeHash, body.pledgeHash, '申し込みページは、指紋を作らず・計算せず、リンクのものをそのまま持つ');
  assert.equal(params.get('end'), '1');
});

test('鎖: 3つの設定（保護者の同意・ジム責任者の同意・確認）が、そのままリンクの plg・plm・plc に写る。テスト用のリンクも同じ文・同じ指紋', () => {
  for (const [guardian, mode] of [['18歳未満のみ', 'under18'], ['全員', 'all'], ['なし', 'none']] as [string, GuardianMode][]) {
    for (const [gym, gymOn] of [['あり', 'on'], ['なし', 'off']]) {
      for (const [confirm, confirmed] of [[true, 'on'], [false, 'off']] as [boolean, string][]) {
        const h = live({ [R.guardian]: guardian, [R.gym]: gym }, confirm);
        const p = new URLSearchParams(hashOf(h).replace(/^#/, '')), t = new URLSearchParams(hashOf(h, 'test').replace(/^#/, ''));
        assert.deepEqual([p.get('plg'), p.get('plm'), p.get('plc')], [mode, gymOn, confirmed], guardian + gym + confirm);
        assert.equal(p.get('mode'), 'live'); assert.equal(t.get('mode'), 'test');
        for (const key of ['plg', 'plm', 'plc', 'plf', 'plt']) assert.equal(t.get(key), p.get(key), key + ' は本番とテストで同じ');
      }
    }
  }
});

test('鎖（全部の組み合わせ）: 申し込みページの plan が「全部✔・入力ずみ」と言うとき、本物の .gs は保存する。記録の「保護者の同意」「ジム責任者」「許可の念押し」は、ページの plan と同じ', () => {
  const ages = ['17', '18', '1', '120', ''];
  const gyms = ['架空ジムA', '無所属', 'ﾑｼｮｿﾞｸ', '　所属　なし　', 'なし'];
  let saved = 0;
  for (const guardian of ['18歳未満のみ', '全員', 'なし']) {
    for (const gymSetting of ['あり', 'なし']) {
      for (const age of ages) {
        for (const gym of gyms) {
          const h = live({ 年齢: '任意', [R.guardian]: guardian, [R.gym]: gymSetting });
          const config = publicEntryConfig(hashOf(h));
          const plan = pledgePlan(config.pledge, age, gym, config.mode);
          const answers = complete(plan);
          assert.equal(pledgeLockReason(plan, answers), '', '全部✔なら止めない');
          const label = [guardian, gymSetting, age, gym].join(' / ');
          const receipt = h.call('saveEntry_', { ...h.params('live', { age, gym }), ...pledgePost(plan, answers, config.pledgeHash!) });
          assert.ok(receipt, label); saved++;
          const row = json(h.rows(REC).at(-1));
          assert.equal(row[0], receipt);
          assert.equal(row[4], plan.guardian ? 'はい' : '不要', label + '：保護者の同意はページの plan と同じ');
          assert.equal(row[5], plan.gym ? GYM_NAME : plan.unaffiliated ? '（無所属）' : '', label + '：ジム責任者の名前');
          assert.equal(row[6], plan.gym ? GYM_PHONE : '', label + '：ジム責任者の電話');
          assert.equal(row[7], plan.gym ? 'はい' : '不要', label + '：許可の念押し');
          assert.equal(row[9], config.pledgeHash, label + '：記録の指紋はリンクの指紋');
        }
      }
    }
  }
  assert.equal(saved, 3 * 2 * 5 * 5);
});

test('鎖（止まる側）: 申し込みページが「🔒 止める」と言う状態（✔の漏れ・保護者・責任者の名前・携帯の形・許可・同意）では、そのまま送られても本物の .gs は保存しない。どの鍵が足りないかで、コードも合う', () => {
  type Case = [string, (a: PledgeAnswers, plan: PledgePlan) => PledgeAnswers, (plan: PledgePlan) => boolean, string];
  const cases: Case[] = [
    ['最初の項目の✔が無い', (a) => ({ ...a, ticks: a.ticks.map((t, i) => (i === 0 ? false : t)) }), () => true, 'pledge'],
    ['最後の項目の✔が無い', (a) => ({ ...a, ticks: a.ticks.map((t, i) => (i === a.ticks.length - 1 ? false : t)) }), () => true, 'pledge'],
    ['全部の✔が無い', (a) => ({ ...a, ticks: a.ticks.map(() => false) }), () => true, 'pledge'],
    ['保護者の✔が無い', (a) => ({ ...a, guardian: false }), (plan) => plan.guardian, 'pledge'],
    ['責任者の同意の✔が無い', (a) => ({ ...a, gymConsent: false }), (plan) => plan.gym, 'gym'],
    ['責任者の名前が空', (a) => ({ ...a, gymName: '' }), (plan) => plan.gym, 'gym'],
    ['責任者の名前が41字', (a) => ({ ...a, gymName: 'あ'.repeat(GYM_NAME_MAX + 1) }), (plan) => plan.gym, 'gym'],
    ['携帯が050（IP電話）', (a) => ({ ...a, gymPhone: '05011112222' }), (plan) => plan.gym, 'gym'],
    ['携帯が10けた（固定電話）', (a) => ({ ...a, gymPhone: '0311112222' }), (plan) => plan.gym, 'gym'],
    ['携帯が空', (a) => ({ ...a, gymPhone: '' }), (plan) => plan.gym, 'gym'],
    ['許可の念押しの✔が無い', (a) => ({ ...a, gymPermission: false }), (plan) => plan.gym, 'permission'],
  ];
  let ran = 0;
  for (const [label, damage, applies, code] of cases) {
    for (const [age, gym] of [['17', '架空ジムA'], ['20', '架空ジムA'], ['', '架空ジムA'], ['17', '無所属']]) {
      const h = live({ 年齢: '任意', [R.guardian]: '全員' });
      h.setSetting(R.guardian, age === '20' ? '18歳未満のみ' : '全員');
      const config = publicEntryConfig(hashOf(h));
      const plan = pledgePlan(config.pledge, age, gym, config.mode);
      if (!applies(plan)) continue;
      const answers = damage(complete(plan), plan);
      // ページが止める道は2つ：押せない（🔒＋理由）か、押すと赤い✕が欄を指す（長すぎは、入れたすぐあとに赤い）。どちらもあれば、送られない
      assert.ok(pledgeLockReason(plan, answers) !== '' || Object.keys(pledgeIssues(plan, answers)).length > 0, label + '：ページは止める');
      const before = JSON.stringify([...h.book.sheets.entries()].map(([n, s]: [string, any]) => [n, s.rows]));
      const error = thrown(() => h.call('saveEntry_', { ...h.params('live', { age, gym }), ...pledgePost(plan, answers, config.pledgeHash!) }));
      assert.equal(error.code, code, label + '（' + age + '・' + gym + '）：' + error.message); assert.equal(error.retryable, false);
      assert.equal(JSON.stringify([...h.book.sheets.entries()].map(([n, s]: [string, any]) => [n, s.rows])), before, label + '：何も書かれない');
      ran++;
    }
  }
  assert.ok(ran >= 30, '十分な数を確かめた（' + ran + '）');
});

test('鎖: 会長の確認が「まだ」→ ping の pledgeChecked が false → リンクの plc=off。本番のページは止まる（plan.blocked）・テスト用は止まらない。本物の .gs も 本番だけ pledgeconfirm で断る。同じ文', () => {
  const h = live({}, false);
  assert.equal(pingOf(h).pledgeChecked, false);
  const liveConfig = publicEntryConfig(hashOf(h, 'live')), testConfig = publicEntryConfig(hashOf(h, 'test'));
  assert.equal(liveConfig.pledge!.confirmed, false);
  const livePlan = pledgePlan(liveConfig.pledge, '20', '架空ジムA', 'live'), testPlan = pledgePlan(testConfig.pledge, '20', '架空ジムA', 'test');
  assert.equal(livePlan.blocked, true); assert.equal(testPlan.blocked, false);
  const error = thrown(() => h.call('saveEntry_', { ...h.params('live', { age: '20' }), ...pledgePost(livePlan, complete(livePlan), liveConfig.pledgeHash!) }));
  assert.equal(error.code, 'pledgeconfirm'); assert.equal(error.retryable, false);
  assert.equal(error.message, PLEDGE_BLOCKED_TEXT, 'ページの赤い✕の文と、Google の断りの文は、同じ');
  assert.equal(error.message, '主催者が、誓約書の文をまだ確認していません。送れません。');
  assert.ok(h.call('saveEntry_', { ...h.params('test', { age: '20' }), ...pledgePost(testPlan, complete(testPlan), testConfig.pledgeHash!) }), 'テスト用は動く');
  assert.equal(h.rows(REC_TEST).length, 3, '自動テストの1件と、いまのテストの1件');
  // 会長が「済み」にして、新しいリンクを作ると、本番も通る
  h.setSetting(R.confirm, '済み');
  const fresh = publicEntryConfig(hashOf(h, 'live')), plan = pledgePlan(fresh.pledge, '20', '架空ジムA', 'live');
  assert.equal(plan.blocked, false);
  assert.ok(h.call('saveEntry_', { ...h.params('live', { age: '20' }), ...pledgePost(plan, complete(plan), fresh.pledgeHash!) }));
});

test('鎖: 会長が「誓約書」タブの文を直すと、指紋が変わる。古いリンクの指紋では本物の .gs が pledgeold で断る（保存しない）。新しいリンクなら通る', () => {
  const h = live();
  const oldConfig = publicEntryConfig(hashOf(h)), oldHash = pingOf(h).pledgeHash;
  fillTab(h, [...ITEMS.slice(0, 4), 'テスト用の文です5（直した）']);
  assert.notEqual(pingOf(h).pledgeHash, oldHash);
  const plan = pledgePlan(oldConfig.pledge, '20', '架空ジムA', 'live');
  const before = JSON.stringify([...h.book.sheets.entries()].map(([n, s]: [string, any]) => [n, s.rows]));
  const error = thrown(() => h.call('saveEntry_', { ...h.params('live', { age: '20' }), ...pledgePost(plan, complete(plan), oldConfig.pledgeHash!) }));
  assert.equal(error.code, 'pledgeold'); assert.equal(error.message, '誓約書の文が、リンクを作ったあとで変わりました。主催者から、新しい申し込みリンクをもらってください。');
  assert.equal(JSON.stringify([...h.book.sheets.entries()].map(([n, s]: [string, any]) => [n, s.rows])), before);
  const fresh = publicEntryConfig(hashOf(h));
  assert.equal(fresh.pledgeHash, pingOf(h).pledgeHash); assert.equal(fresh.pledge!.items[4], 'テスト用の文です5（直した）');
  const plan2 = pledgePlan(fresh.pledge, '20', '架空ジムA', 'live');
  assert.ok(h.call('saveEntry_', { ...h.params('live', { age: '20' }), ...pledgePost(plan2, complete(plan2), fresh.pledgeHash!) }));
});

test('鎖: ページが送る鍵は、core の PLEDGE_POST_KEYS の順の部分集合で、本物の .gs がぜんぶ読む鍵。「なし」のリンクでは、ページは鍵を1つも足さない', () => {
  const h = live();
  const config = publicEntryConfig(hashOf(h)), plan = pledgePlan(config.pledge, '17', '架空ジムA', 'live');
  const keys = Object.keys(pledgePost(plan, complete(plan), config.pledgeHash!));
  assert.deepEqual(keys, [...PLEDGE_POST_KEYS], '保護者もジム責任者も要るときは10こ全部、この順');
  const needLess = pledgePlan(config.pledge, '20', '無所属', 'live');
  const less = Object.keys(pledgePost(needLess, complete(needLess), config.pledgeHash!));
  assert.deepEqual(less, ['pledge', 'pledgeItems', 'pledgeHash', 'pledgeGuardianMode', 'pledgeGymMode'], '要らない欄の鍵は、鍵ごと無い（リンクの設定を返す2つは、いつも付く）');
  for (const key of PLEDGE_POST_KEYS) assert.ok(script.includes("'" + key + "'"), key + ' は .gs の鍵の一覧にある');
  const off = harness(); off.ready({ 階級分け: 'あり' }); off.call('openEntries');
  const offConfig = publicEntryConfig(publicEntryHash(entryConfigFromPing(readPing(off), ENDPOINT, 'live')));
  assert.equal(offConfig.pledge, undefined); assert.equal(offConfig.pledgeHash, undefined);
  assert.deepEqual(pledgePost(pledgePlan(offConfig.pledge, '17', '架空ジムA', 'live'), blankPledgeAnswers(), ''), {});
});

test('鎖: 「なし」（初期値）→ ping に鍵が無い → リンクに pl で始まる鍵が無い → 診断に何も足さない。誓約書の記録のタブも無い', () => {
  const h = harness(); h.ready({ 階級分け: 'あり' }); h.call('openEntries');
  const body = pingOf(h), ping = parsePing(body);
  for (const key of ['pledgeMode', 'pledgeCanon', 'pledgeHash', 'guardianMode', 'gymMode', 'pledgeChecked']) assert.ok(!(key in body) && !(key in ping), key);
  const config = entryConfigFromPing(ping, ENDPOINT, 'live');
  assert.ok(!('pledge' in config) && !('pledgeHash' in config));
  assert.ok(![...new URLSearchParams(publicEntryHash(config).replace(/^#/, '')).keys()].some((k) => k.startsWith('pl')));
  assert.equal(pledgeDiagnosis(ping), undefined); assert.equal(entryConfigProblem(ping, ENDPOINT), '');
  assert.equal(h.book.getSheetByName(TAB), null); assert.equal(h.book.getSheetByName(REC), null);
});

test('鎖: この版が対応していない（古い build）のシートから、偽の誓約書の印が来ても、リンクにも診断にも出さない', () => {
  const h = live();
  const old = parsePing({ ...pingOf(h), build: '3.20261019.6' });
  assert.equal(old.pledgeMode, true); assert.equal(supportsPledge(old), false);
  assert.ok(![...new URLSearchParams(publicEntryHash(entryConfigFromPing(old, ENDPOINT, 'live')).replace(/^#/, '')).keys()].some((k) => k.startsWith('pl')));
  assert.equal(pledgeDiagnosis(old), undefined);
  assert.equal(supportsPledge(null), false); assert.equal(supportsPledge(undefined), false);
});

/* ───────── 設定の画面の診断 ───────── */

test('診断の1行: 誓約書：あり（N項目・保護者の同意：…・ジム責任者：…）・会長の確認：まだ／済み。本物の .gs の ping から、全部の組み合わせで、決まった文になる', () => {
  for (const [guardian, mode] of [['18歳未満のみ', '18歳未満のみ'], ['全員', '全員'], ['なし', 'なし']]) {
    for (const gym of ['あり', 'なし']) {
      for (const confirm of [true, false]) {
        const h = live({ [R.guardian]: guardian, [R.gym]: gym }, confirm);
        const diag = pledgeDiagnosis(readPing(h))!;
        assert.equal(diag.line, '誓約書：あり（5項目・保護者の同意：' + mode + '・ジム責任者：' + gym + '）・会長の確認：' + (confirm ? '済み' : 'まだ'));
        assert.equal(diag.confirmed, confirm);
      }
    }
  }
  // 項目の数は、「誓約書」タブの項目の数（空のマスは飛ばす）
  const h = live(); fillTab(h, ['テスト用の文です1', 'テスト用の文です2', 'テスト用の文です3']);
  assert.match(pledgeDiagnosis(readPing(h))!.line, /^誓約書：あり（3項目・/);
  fillTab(h, Array.from({ length: PLEDGE_LIMITS.items }, (_, i) => 'テスト用の文です' + i));
  assert.match(pledgeDiagnosis(readPing(h))!.line, /^誓約書：あり（8項目・/);
});

test('診断: 診断の段階（受付できます）は変えない。「まだ」でも URL は出る（止めるのはページと .gs）。赤い✕の文は、操作の言葉だけで、会長の確認のしかたを言う', () => {
  const h = live({}, false);
  const ping = readPing(h);
  assert.equal(diagnose(ping).stage, 'ready'); assert.equal(diagnose(ping).ok, true);
  assert.equal(entryConfigProblem(ping, ENDPOINT), '', '直しものではない＝URLは出る');
  assert.equal(PLEDGE_UNCONFIRMED_ADVICE, '会長が原本と見比べて、設定タブの「誓約書の文の確認」を「済み」にするまで、本番のURLは選手に送らないでください。');
  // 画面の言葉は、シートにある行の名前・選択肢と同じ
  assert.ok(script.includes("'誓約書の文の確認'") && script.includes("['まだ', '済み']"));
  assert.ok(PLEDGE_UNCONFIRMED_ADVICE.includes('「' + R.confirm + '」') && PLEDGE_UNCONFIRMED_ADVICE.includes('「済み」'));
});

test('診断: 文が読めない（pledgeMode だけ来て、文・指紋・決まりのどれかが壊れている）→ 赤い直しもの1文。診断の1行は出さない。リンクは作らない', () => {
  const h = live(); const body = pingOf(h);
  const broken: Array<[string, Record<string, unknown>]> = [
    ['文が壊れている', { pledgeCanon: '{' }], ['項目が0個', { pledgeCanon: JSON.stringify({ items: [], guardian: G, gym: Y }) }], ['9個', { pledgeCanon: JSON.stringify({ items: Array.from({ length: 9 }, (_, i) => 'テスト用の文です' + i), guardian: G, gym: Y }) }],
    ['指紋が64字でない', { pledgeHash: 'abc' }], ['指紋が無い', { pledgeHash: undefined }], ['保護者の決まりが読めない', { guardianMode: 'x' }], ['ジム責任者の決まりが無い', { gymMode: undefined }],
  ];
  for (const [label, over] of broken) {
    const ping = parsePing({ ...body, ...over });
    assert.equal(ping.pledgeMode, true, label);
    const problem = entryConfigProblem(ping, ENDPOINT);
    assert.match(problem, /^誓約書が「あり」ですが、「誓約書」タブの文を読めませんでした（/, label);
    assert.ok(!problem.slice(0, -1).includes('。'), label + '：1文（文の中に「。」なし）'); assert.ok(problem.endsWith('。'));
    assert.ok(problem.includes('8個まで') && problem.includes('120文字まで') && problem.includes('700文字まで'), '上限を言う');
    assert.equal(pledgeDiagnosis(ping), undefined, label);
    assert.throws(() => entryConfigFromPing(ping, ENDPOINT, 'live'), /誓約書が「あり」ですが/);
    const lines = settingLines('シートの「設定」タブを直してください。' + problem);
    assert.equal(lines.length, 1, label + '：画面では1文として出る');
  }
});

test('診断: リンクが4500字をこえるとき → 赤い直しもの1文。いちばん長いのが誓約書なら「誓約書の文が長すぎて…」。ほかの欄のほうが長ければ、その欄を言う', () => {
  const h = live(); const body = pingOf(h);
  // 8項目・合計700字ちょうどの文
  const items = Array.from({ length: 8 }, (_, i) => String(i) + 'あ'.repeat(77));
  const guardian = 'い'.repeat(38), gym = 'う'.repeat(38);
  assert.equal(items.reduce((n, t) => n + t.length, 0) + guardian.length + gym.length, PLEDGE_LIMITS.total);
  const canon = JSON.stringify({ items, guardian, gym });
  const longTexts = { title: 'あ'.repeat(150), venue: 'い'.repeat(150), organizer: 'う'.repeat(150), contact: 'え'.repeat(150) };
  const ping = parsePing({ ...body, ...longTexts, pledgeCanon: canon });
  assert.ok(publicEntryHash(entryConfigFromPing(parsePing({ ...body, pledgeCanon: canon }), ENDPOINT, 'live')).length <= 4500, '文だけなら、リンクに入る');
  const problem = entryConfigProblem(ping, ENDPOINT);
  assert.equal(problem, '誓約書の文が長すぎて、選手に渡すURLに入りません。「誓約書」タブの項目を、減らすか短くしてください。');
  assert.ok(problem.startsWith('誓約書の文が長すぎ'));
  const lines = settingLines('シートの「設定」タブを直してください。' + problem);
  assert.equal(lines.length, 1); assert.equal(lines[0].fixes[0], problem, '1つの文のまま出る');
  assert.equal(diagnose(ping).stage, 'ready', '診断の段階そのものは変えない（画面が、直しものとして赤く出す）');
  // ほかの欄のほうが長い：大会名が300字
  const other = entryConfigProblem(parsePing({ ...body, title: 'あ'.repeat(300), venue: 'い'.repeat(300), pledgeCanon: JSON.stringify({ items: ITEMS, guardian: G, gym: Y }) }), ENDPOINT);
  assert.match(other, /^文が長すぎて、選手に渡すURLに入りません。「(大会名|会場)」/); assert.ok(!other.includes('誓約書'));
  // 誓約書がなし：今までの文のまま
  const off = harness(); off.ready(); off.call('openEntries');
  assert.match(entryConfigProblem(parsePing({ ...pingOf(off), title: 'あ'.repeat(300), venue: 'い'.repeat(300), organizer: 'う'.repeat(300) }), ENDPOINT), /^文が長すぎて、選手に渡すURLに入りません。/);
});

test('settingLines: 誓約書の4つの行の「どれかにしてください」には、場所（A列が行の名前の行のB列）を足す。ほかの問題の文はそのまま（場所を文の中で言っている）', () => {
  const h = live();
  h.setSetting(R.pledge, 'たぶん');
  const read = (hh: H) => settingLines('シートの「設定」タブを直してください。' + hh.call('settingsProblems_', hh.call('S_')).join('。'));
  assert.deepEqual(json(read(h).map((l) => l.fixes)), [['「誓約書」は、あり／なしのどれかにしてください（「設定」タブの、A列が「誓約書」の行のB列。▼から選び直す）']]);
  const h2 = live(); h2.setSetting(R.guardian, 'x'); h2.setSetting(R.gym, 'x'); h2.setSetting(R.confirm, 'x');
  const fixes = read(h2).map((l) => l.fixes[0]);
  assert.deepEqual(fixes, [
    '「保護者の同意」は、18歳未満のみ／全員／なしのどれかにしてください（「設定」タブの、A列が「保護者の同意」の行のB列。▼から選び直す）',
    '「ジム責任者の同意」は、あり／なしのどれかにしてください（「設定」タブの、A列が「ジム責任者の同意」の行のB列。▼から選び直す）',
    '「誓約書の文の確認」は、まだ／済みのどれかにしてください（「設定」タブの、A列が「誓約書の文の確認」の行のB列。▼から選び直す）',
  ]);
  for (const f of fixes) assert.ok(!/B\d{2}|セル/.test(f), 'セルの番号は言わない（区分の行を増やすと動くため）');
  // 文の中に場所がある問題は、そのまま（1文）
  const h3 = live(); fillTab(h3, [], '', ''); h3.setSetting('年齢', 'なし');
  const lines = read(h3);
  assert.equal(lines.length, 4);
  for (const line of lines) assert.equal(line.fixes.length, 1);
  assert.ok(lines.some((l) => l.fixes[0].startsWith('「誓約書」タブのA列（A2〜A9）に、誓約の項目が1つもありません')));
  assert.ok(lines.some((l) => l.fixes[0].includes('B2（保護者の同意の文）が空です')) && lines.some((l) => l.fixes[0].includes('C2（ジム責任者の同意の文）が空です')));
});

/* ───────── 設定の画面（app/private/setup/page.tsx）：ソースの約束 ───────── */

test('設定の画面: 診断の1行は、core の pledgeDiagnosis から出す（この画面は文を作らない）。まだ→赤い✕＋ADVICE／済み→緑の✓。直しものがあるときは出さない。「なし」では何も足さない', () => {
  assert.match(PAGE, /const pledgeDiag = pledgeDiagnosis\(ping\)/);
  assert.match(PAGE, /pledgeDiag && !configProblem \? \(pledgeDiag\.confirmed \? <OkLine>\{pledgeDiag\.line\}。<\/OkLine> : <ErrorLine id="pledge-unconfirmed-note">\{pledgeDiag\.line\}。<span className="mt-1 block">\{PLEDGE_UNCONFIRMED_ADVICE\}<\/span><\/ErrorLine>\) : null/);
  assert.match(PAGE, /id="read-pledge"/);
  // ping が「なし」なら pledgeDiag は undefined。この画面は、誓約書の語を「あり」の枝の中にしか持たない
  assert.doesNotMatch(PAGE, /pledgeMode|guardianMode|gymMode|pledgeChecked|pledgeCanon/, 'ping の鍵は core が読む。この画面は読まない');
  assert.doesNotMatch(PAGE, /pl=on|plg=|plt=|['"]pl['"]/, 'リンクの鍵は core が付ける。この画面は書かない');
});

test('設定の画面: 作業2に、誓約書の説明（id=pledge-howto）と、絵の4行。場所は A列が「誓約書」の行のB列。文は原本から写した文字で、会長が見比べて直す、と書く。実名・電話番号を入れない', () => {
  const how = PAGE.slice(PAGE.indexOf('<p id="pledge-howto">'), PAGE.indexOf('</p>', PAGE.indexOf('<p id="pledge-howto">')));
  assert.ok(how.includes('A列が「誓約書」の行のB列') && how.includes('「誓約書」というタブ') && how.includes('原本から写した文字') && how.includes('原本と見比べて'));
  assert.ok(how.includes('「誓約書の文の確認」を「済み」') && how.includes('本番の申し込みは受け付けません'));
  for (const row of ['誓約書', '保護者の同意', 'ジム責任者の同意', '誓約書の文の確認']) assert.ok(PAGE.includes("['" + row + "', '', 'skip',"), row + ' の絵の行');
  assert.doesNotMatch(how, /\d{2,4}-\d{2,4}-\d{3,4}|\b0\d{9,10}\b|山田|田中|佐藤|鈴木|高橋/);
  // 絵の「書く」印は6つのまま（誓約書の行は、会長が必ず書く行ではない）
  assert.equal((PAGE.match(/, 'write', /g) ?? []).length, 6);
});

test('設定の画面: 公開前の検査に当たる書き方を増やしていない（text-base・Object.hasOwn・.at(・後読み・@layer）', () => {
  for (const [name, source] of [['設定の画面', PAGE], ['core/setupV3.ts', read('core/setupV3.ts')]] as const) {
    assert.doesNotMatch(source, /\btext-base\b/, name); assert.doesNotMatch(source, /Object\.hasOwn/, name);
    assert.doesNotMatch(source, /\.at\(/, name); assert.doesNotMatch(source, /\(\?<[=!]/, name); assert.doesNotMatch(source, /@layer/, name);
  }
});

/* ───────── 3つの場所（ページ・.gs・core）の言葉が1字も違わない ───────── */

test('言葉: ページの赤い✕・許可の文は、本物の .gs の断りの文と1字も違わない。ジム責任者の名前の上限・項目の上限も同じ', () => {
  assert.ok(script.includes(PLEDGE_BLOCKED_TEXT), 'pledgeconfirm の文');
  assert.ok(script.includes(PLEDGE_PERMISSION_TEXT), 'permission の文');
  assert.equal(script.match(/PLEDGE_GYM_NAME_MAX_ = (\d+)/)![1], String(GYM_NAME_MAX));
  assert.deepEqual(json(script.match(/PLEDGE_LIMITS_ = \{ items: (\d+), item: (\d+), total: (\d+) \}/)!.slice(1).map(Number)), [PLEDGE_LIMITS.items, PLEDGE_LIMITS.item, PLEDGE_LIMITS.total]);
  assert.ok(GYM_PERMISSION_LABEL.length > 0 && !script.includes(GYM_PERMISSION_LABEL), '念押しの文は、ページが持つ操作の言葉（.gs に写さない）');
  // 結果の画面の「送れませんでした」と言い切るコード（5つ）と、core の一覧
  for (const code of ['pledge', 'pledgeconfirm', 'pledgeold', 'gym', 'permission']) assert.ok(script.includes("'" + code + "'"), code);
});

/* ───────── 文書（会長の手順・決定ログ・ひな形の手順書） ───────── */

test('文書: 説明書に、会長の手順（3-3の手順13の4）と、選手の画面（4-3の4）がある。もくじにもある。設定タブの行の数は34行（B2〜B35）に直してある', () => {
  const manual = read('docs/TOURNAMENT_OS_使い方マニュアル.md');
  const part = (from: string, to: string): string => { const a = manual.indexOf(from), b = manual.indexOf(to, a + from.length); assert.ok(a >= 0 && b > a, from); return manual.slice(a, b); };
  const steps = part('**手順13の4：', '**手順14：「選手の受付をつくる」');
  assert.ok(steps.includes('A列が「誓約書」の行の、B列の小さな▼から、「あり」を選びます'));
  // 会長の順番：あり → ① → 見くらべ → 済み → 新しいURL（番号つき6つ）
  const order = ['「誓約書」を『あり』にします', '「① 最初の設定」を押します', '原本の紙と見くらべます', '▼から『済み』にします', '選手に渡すURLを、新しく作って送ります'].map((w) => steps.indexOf(w));
  assert.ok(order.every((n) => n >= 0) && order.every((n, i) => i === 0 || n > order[i - 1]), '順番どおりに書いてある：' + order.join(','));
  // 文は owner が原本から貼った文字。AI は書いていない・直していない。3番の「帰属することし」を見くらべる所として言う
  for (const word of ['オーナー（owner）', '原本から貼った文字', '2026年10月22日', 'AIは、誓約・同意の文を書いていません', '『帰属することし』', '会長さんが決めます', '「誓約記録」', '「テスト誓約記録」']) assert.ok(steps.includes(word), word);
  // 決まり：署名なし・保護者の同意は✔だけ・ジム責任者は名前＋携帯＋許可の念押し
  assert.ok(steps.includes('署名（手書きの名前）の欄は、ありません'));
  assert.match(manual, /保護者（連帯責任者）の同意の□を、だれに出すか/); assert.match(manual, /ジム責任者のお名前・携帯電話・許可の確認/);
  // 画面の赤い✕の文は、core の定数と1字も違わない
  assert.ok(steps.includes(PLEDGE_UNCONFIRMED_ADVICE) && steps.includes(PLEDGE_BLOCKED_TEXT));
  const player = part('### 4-3の4　誓約書の□に✔を入れる', '### 4-4　');
  for (const word of ['それぞれの□に、✔を入れてください。ぜんぶ入れないと、先へ進めません。', '無所属', '許可の□', PLEDGE_BLOCKED_TEXT, '「誓約記録」', '全部の□に✔を入れるまで、先へ進めません']) assert.ok(player.includes(word), word);
  assert.ok(manual.includes('  - 4-3の4　誓約書の□に✔を入れる\n'), 'もくじ');
  assert.equal((manual.match(/^### 4-3の4　/gm) ?? []).length, 1);
  assert.ok(manual.includes('B2からB35まで、**34行**') && !/B2からB30まで|\*\*29行\*\*|A列に29行/.test(manual), '設定タブの行の数');
  // 新しく書いた所に、実名・電話番号らしい文字列を入れない（花道の節と同じ決まり）
  const fresh = steps + '\n' + player;
  assert.doesNotMatch(fresh, /\d{2,4}-\d{2,4}-\d{3,4}|\b0\d{9,10}\b/, '電話番号らしい文字列');
  assert.doesNotMatch(fresh, /山田|田中|佐藤|鈴木|高橋|伊藤|渡辺/, '実名らしい名前');
  // 画面の文字（「」）は、画面にある：設定の行の名前は .gs に、タブの名前も .gs に
  for (const word of ['誓約書', '保護者の同意', 'ジム責任者の同意', '誓約書の文の確認', '誓約記録', 'テスト誓約記録']) assert.ok(script.includes(word) && steps.includes('「' + word + '」'), word);
});

test('文書: 追加要件02の決定ログに、署名なし・保護者の同意は✔だけ・ジム責任者は名前＋携帯電話＋許可の念押し・会長の手順・セットアップ画面の診断が、1か所に書いてある。「会長が確認ずみ」とは書かない', () => {
  const doc = read('docs/追加要件_02_誓約書の掲載と同意必須.md');
  const log = doc.slice(doc.indexOf('## 決定ログ（2026-10-22）'));
  assert.ok(log.length > 1000);
  for (const word of ['署名は作らない', '保護者の同意は、チェックだけ', 'ジム責任者は、名前＋携帯電話＋「許可をとっている」念押しのチェック', '会長の確認ゲート', 'owner が原本から貼った文字', '「帰属することし」', '会長の手順', '説明書 3-3 の手順13の4', 'セットアップ画面（/private/setup/）の診断', '会長が原本と見比べて、設定タブの「誓約書の文の確認」を「済み」にするまで、本番のURLは選手に送らないでください。', 'pledgeDiagnosis', 'GYM_PERMISSION_LABEL']) assert.ok(log.includes(word), word);
  assert.doesNotMatch(log, /会長が確認(?:ずみ|済み)(?!」とは)/, '「会長が確認ずみ」と言い切らない（「…とは書かない」は良い）');
  // 追加要件00・階級分けの手順書も、同じことを言う
  assert.match(read('docs/追加要件_00_一覧と順番.md'), /説明書 3-3 の手順13の4/);
  const guide = read('docs/階級分け_設定の入れ方.md');
  assert.ok(guide.includes('## 誓約書（使うときだけ）') && guide.includes('owner が原本から貼った文字です（2026-10-22）') && guide.includes('「帰属することし」') && guide.includes('必ず新しいURLを作って送り直します'));
  for (const row of ['誓約書', '保護者の同意', 'ジム責任者の同意', '誓約書の文の確認']) assert.ok(guide.includes('| ' + row), row + ' の行');
});
