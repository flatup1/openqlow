// core/pledge.ts：誓約書の入れ物の形・リンクへの詰め方・保護者の同意の判定・携帯電話・無所属。
// 文は1字も持たない決まりなので、試験の文も『テスト用の文です1』のような架空の文だけ。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { checkPledgeTexts, GYM_NAME_MAX, guardianNeeded, gymPhoneNormal, gymPhoneOk, isUnaffiliated, packPledge, parsePledgeCanon, PLEDGE_ERROR_CODES, PLEDGE_LIMITS, PLEDGE_LINK_KEYS, PLEDGE_POST_KEYS, UNAFFILIATED_NAMES, UNAFFILIATED_PHRASES, UNAFFILIATED_TEXT, unpackPledge, type GuardianMode, type PledgeConfig } from '../core/pledge.ts';

const ITEMS = ['テスト用の文です1', 'テスト用の文です2', 'テスト用の文です3'];
/** 文字列を、packPledge と同じ詰め方（'u' + base64url(UTF-16BE)）にする。Node の道具で作るので、core の実装とは別の道 */
const rawPack = (text: string): string => 'u' + Buffer.from(text, 'utf16le').swap16().toString('base64url');
const json = (value: unknown) => JSON.parse(JSON.stringify(value));

test('定数: 上限は 項目8・1項目120・合計700。リンクの鍵はこの順。POST の鍵・エラーコード・ジム責任者の名前の上限', () => {
  assert.deepEqual({ ...PLEDGE_LIMITS }, { items: 8, item: 120, total: 700 });
  assert.deepEqual([...PLEDGE_LINK_KEYS], ['pl', 'plg', 'plm', 'plc', 'plf', 'plt']);
  assert.deepEqual([...PLEDGE_POST_KEYS], ['pledge', 'pledgeItems', 'pledgeGuardian', 'gymName', 'gymPhone', 'gymPermission', 'pledgeGym', 'pledgeHash', 'pledgeGuardianMode', 'pledgeGymMode']);
  assert.deepEqual([...PLEDGE_ERROR_CODES], ['pledge', 'pledgeconfirm', 'pledgeold', 'gym', 'permission']);
  assert.equal(GYM_NAME_MAX, 40);
  const config: PledgeConfig = { items: ITEMS, guardian: 'テスト用の文です保護者', gym: 'テスト用の文ですジム', mode: 'under18', gymMode: true, confirmed: false };
  assert.equal(config.items.length, 3);
});

test('詰め方: 先頭は u、あとは base64url（英数字と - _ だけ。= は付かない）。Node の道具で作った UTF-16BE の base64url と1字も違わない', () => {
  for (const [items, guardian, gym] of [[ITEMS, 'テスト用の文です保護者', 'テスト用の文ですジム'], [['a'], '', ''], [['あ'.repeat(120)], '', ''], [['x', 'yy', 'zzz', 'wwww'], 'g', 'h']] as [string[], string, string][]) {
    const packed = packPledge(items, guardian, gym);
    assert.match(packed, /^u[A-Za-z0-9_-]+$/);
    assert.equal(packed, rawPack(JSON.stringify({ items, guardian, gym })));
    assert.equal(Buffer.from(packed.slice(1), 'base64url').swap16().toString('utf16le'), JSON.stringify({ items, guardian, gym }), 'もどすと JSON');
  }
});

test('往復: ひらがな・漢字・全角・絵文字・ASCII・セルの中の改行・サロゲートペア・記号が、そのままもどる', () => {
  const samples: string[][] = [
    ['ひらがなだけの文です', '漢字の文章を試します', 'ＡＢＣ１２３\u3000全角の文です'],
    ['😀 絵文字の文です 👨\u200D👩\u200D👧', '𠮷野家の𠮷（サロゲートペア）', 'ASCII only: abc DEF 123 !"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'],
    ['1行目\n2行目\n\n4行目', '改行のあとに空白  \n  を含む', '\t tab と "引用" と \\ バックスラッシュ'],
    ['<script>alert(1)</script>', '=1+1', '＝全角'],
    ['a'],
  ];
  for (const items of samples) {
    for (const [guardian, gym] of [['', ''], ['保護者の文😀\n2行', 'ジムの文 ABC ａｂｃ'], ['g', 'h']]) {
      const packed = packPledge(items, guardian, gym);
      assert.deepEqual(json(unpackPledge(packed)), { items, guardian, gym });
    }
  }
  // 長さ0〜5・長い文でも往復する（base64 の余りが 0・1・2 バイトのどれでも）
  for (let n = 1; n <= 7; n++) assert.deepEqual(json(unpackPledge(packPledge(['あ'.repeat(n)], 'x'.repeat(n), ''))), { items: ['あ'.repeat(n)], guardian: 'x'.repeat(n), gym: '' }, n + '字');
});

test('往復: 上限ちょうど（8項目・1項目120字・合計700字）は通り、1つこえると undefined', () => {
  const eight = Array.from({ length: 8 }, (_, i) => String(i + 1));
  assert.deepEqual(json(unpackPledge(packPledge(eight, '', ''))), { items: eight, guardian: '', gym: '' });
  assert.equal(unpackPledge(packPledge([...eight, '9'], '', '')), undefined, '9項目');
  assert.equal(unpackPledge(packPledge([], '', '')), undefined, '0項目');
  assert.equal(unpackPledge(packPledge(['a', ''], '', '')), undefined, '空の項目');
  assert.ok(unpackPledge(packPledge(['あ'.repeat(120)], '', '')));
  assert.equal(unpackPledge(packPledge(['あ'.repeat(121)], '', '')), undefined, '1項目121字');
  // 合計：項目 + 保護者の文 + ジム責任者の文
  const six = Array.from({ length: 5 }, () => 'あ'.repeat(120)); // 600
  assert.ok(unpackPledge(packPledge(six, 'い'.repeat(50), 'う'.repeat(50))), '合計700ちょうど');
  assert.equal(unpackPledge(packPledge(six, 'い'.repeat(51), 'う'.repeat(50))), undefined, '合計701');
  assert.equal(unpackPledge(packPledge(['a'], 'い'.repeat(700), '')), undefined, '保護者の文だけで700をこえる（項目とあわせて701）');
  assert.ok(unpackPledge(packPledge(['a'], 'い'.repeat(699), '')), '合計700');
  // 長さは length（UTF-16 の単位）で数える：絵文字は2
  assert.ok(unpackPledge(packPledge(['😀'.repeat(60)], '', '')), '120単位');
  assert.equal(unpackPledge(packPledge(['😀'.repeat(61)], '', '')), undefined, '122単位');
});

test('往復: 壊れた入力は undefined（投げない）：先頭・文字・長さ・バイト・サロゲート・形・余分な鍵', () => {
  const good = packPledge(ITEMS, '保護者', 'ジム');
  assert.ok(unpackPledge(good));
  const bad: [string, unknown][] = [
    ['空', ''], ['先頭が u でない', 'x' + good.slice(1)], ['先頭だけ', 'u'], ['大文字の U', 'U' + good.slice(1)], ['undefined', undefined], ['数', 5], ['null', null], ['配列', [good]],
    ['= の詰め物', good + '='], ['+ を含む', good.slice(0, 10) + '+' + good.slice(11)], ['/ を含む', good.slice(0, 10) + '/' + good.slice(11)], ['空白を含む', good.slice(0, 10) + ' ' + good.slice(10)], ['改行を含む', good + '\n'], ['全角', good.slice(0, 10) + 'Ａ' + good.slice(11)],
    ['長さが 4n+1', good + 'A'], ['末尾を1字欠く', good.slice(0, -1)], ['前半だけ', good.slice(0, 40)],
    ['余りのビットが0でない（末尾を別の字に）', good.slice(0, -1) + (good.at(-1) === 'B' ? 'C' : 'B')],
    ['バイトが奇数（UTF-16 でない）', 'u' + Buffer.from('{"items":["a"],"guardian":"","gym":""}').toString('base64url')],
    ['バイトが奇数（1バイト足りない）', 'u' + Buffer.from(JSON.stringify({ items: ['a'], guardian: '', gym: '' }), 'utf16le').swap16().subarray(0, -1).toString('base64url')],
    ['JSON でない', rawPack('これは JSON ではない')], ['空の JSON', rawPack('')], ['null', rawPack('null')], ['配列', rawPack('[]')], ['文字', rawPack('"abc"')], ['数', rawPack('5')],
    ['items が配列でない', rawPack('{"items":"x","guardian":"","gym":""}')], ['items が入れ子', rawPack('{"items":[["x"]],"guardian":"","gym":""}')], ['items に数', rawPack('{"items":[1],"guardian":"","gym":""}')], ['items が null', rawPack('{"items":null,"guardian":"","gym":""}')],
    ['guardian が数', rawPack('{"items":["a"],"guardian":1,"gym":""}')], ['gym が null', rawPack('{"items":["a"],"guardian":"","gym":null}')],
    ['鍵が足りない（gym なし）', rawPack('{"items":["a"],"guardian":""}')], ['鍵が足りない（items なし）', rawPack('{"guardian":"","gym":""}')],
    ['余分な鍵', rawPack('{"items":["a"],"guardian":"","gym":"","extra":"x"}')], ['余分な鍵（__proto__）', rawPack('{"items":["a"],"guardian":"","gym":"","__proto__":{}}')],
    ['鍵の順番がちがう', rawPack('{"gym":"","guardian":"","items":["a"]}')], ['空白が入る', rawPack('{"items": ["a"], "guardian": "", "gym": ""}')], ['同じ鍵が2回', rawPack('{"items":["a"],"items":["b"],"guardian":"","gym":""}')],
    ['生のサロゲート（上だけ）', rawPack('{"items":["a\ud800"],"guardian":"","gym":""}')], ['生のサロゲート（下だけ）', rawPack('{"items":["a"],"guardian":"\udc00","gym":""}')],
    ['エスケープしたサロゲート（上だけ）', rawPack('{"items":["a\\ud800"],"guardian":"","gym":""}')], ['エスケープしたサロゲート（順番が逆）', rawPack('{"items":["a"],"guardian":"","gym":"\\udc00\\ud800"}')],
    ['9項目', rawPack(JSON.stringify({ items: Array.from({ length: 9 }, () => 'a'), guardian: '', gym: '' }))], ['121字', rawPack(JSON.stringify({ items: ['a'.repeat(121)], guardian: '', gym: '' }))],
  ];
  for (const [label, value] of bad) assert.equal(unpackPledge(value as string), undefined, label);
  // 対になったサロゲート（絵文字）は、よい
  assert.ok(unpackPledge(rawPack(JSON.stringify({ items: ['😀'], guardian: '', gym: '' }))));
  // 半端なサロゲートは詰められても、もどすときに断る（packPledge は投げない）
  assert.equal(unpackPledge(packPledge(['\ud800'], '', '')), undefined);
  assert.equal(unpackPledge(packPledge(['a'], '\udc00x', '')), undefined);
});

test('checkPledgeTexts・parsePledgeCanon: ping の pledgeCanon（JSON の文字）を、同じ上限で読む。鍵の順番は問わない。投げない', () => {
  assert.deepEqual(json(parsePledgeCanon(JSON.stringify({ items: ITEMS, guardian: 'g', gym: 'h' }))), { items: ITEMS, guardian: 'g', gym: 'h' });
  assert.deepEqual(json(parsePledgeCanon('{"gym":"h","items":["a"],"guardian":"g"}')), { items: ['a'], guardian: 'g', gym: 'h' }, '順番は問わない');
  for (const text of [undefined, null, 5, {}, '', '[]', 'null', '{"items":["a"],"guardian":"g"}', '{"items":["a"],"guardian":"g","gym":"h","x":1}', '{"items":[],"guardian":"","gym":""}', '{"items":["a",""],"guardian":"","gym":""}', JSON.stringify({ items: Array.from({ length: 9 }, () => 'a'), guardian: '', gym: '' }), JSON.stringify({ items: ['a'.repeat(121)], guardian: '', gym: '' }), JSON.stringify({ items: ['a'], guardian: 'b'.repeat(700), gym: '' }), '{"items":["\\ud800"],"guardian":"","gym":""}', 'x'.repeat(5000)]) assert.equal(parsePledgeCanon(text), undefined, JSON.stringify(text)?.slice(0, 60));
  assert.equal(checkPledgeTexts(['a'], 'g', 5), undefined); assert.equal(checkPledgeTexts('a', 'g', 'h'), undefined);
  const items = ['a', 'b']; const checked = checkPledgeTexts(items, 'g', 'h')!; assert.notEqual(checked.items, items, '写しを返す'); assert.deepEqual(checked.items, items);
});

test('guardianNeeded: なし→いつも要らない／全員→いつも要る／18歳未満のみ→空・読めない・121以上・18未満は要る（安全側）。全角の数字も読む', () => {
  const ages: [string, boolean][] = [
    ['', true], ['   ', true], ['abc', true], ['十八', true], ['18歳', true], ['17.5', true], ['-5', true], ['+20', true], ['1e2', true], ['0x20', true], ['1,8', true],
    ['0', true], ['00', true], ['1', true], ['5', true], ['9', true], ['10', true], ['17', true], ['017', true], ['０１７', true], ['１７', true], ['１', true],
    ['18', false], ['018', false], ['１８', false], ['19', false], ['20', false], ['２０', false], [' 20 ', false], ['20\u200B', false], ['\u200B20', false], ['\u300020\u3000', false], ['40', false], ['99', false], ['100', false], ['119', false], ['120', false], ['１２０', false],
    ['121', true], ['１２１', true], ['150', true], ['999', true], ['1000', true], ['0120', true], ['٢٠', true], ['二十', true],
  ];
  for (const [age, expected] of ages) {
    assert.equal(guardianNeeded('under18', age), expected, 'under18 ' + JSON.stringify(age));
    assert.equal(guardianNeeded('none', age), false, 'none ' + JSON.stringify(age));
    assert.equal(guardianNeeded('all', age), true, 'all ' + JSON.stringify(age));
  }
  for (const mode of ['under18', 'all', 'none'] as GuardianMode[]) for (const bad of [undefined, null, 20, {}] as unknown as string[]) assert.equal(typeof guardianNeeded(mode, bad), 'boolean');
  assert.equal(guardianNeeded('under18', undefined as unknown as string), true, '年齢が来なければ要る');
});

test('gymPhoneOk: 携帯（070・080・090で始まる11けた）。全角・ハイフン・空白はOK。050・固定電話・けた数ちがい・文字まじりは不可', () => {
  const ok = ['09000000000', '09012345678', '08012345678', '07012345678', '090-1234-5678', '090 1234 5678', '０９０１２３４５６７８', '０９０－１２３４－５６７８', '090ー1234ー5678', '090‐1234‐5678', '090−1234−5678', '  090-1234-5678  ', '090‐ 1234– 5678', '\u200B09012345678', '０８０ １２３４ ５６７８', '0901234567８'];
  const no = ['', '   ', '05012345678', '050-1234-5678', '0312345678', '03-1234-5678', '0120123456', '09012345', '0901234567', '090123456789', '9012345678', '+819012345678', '0601234567', '06012345678', '09012345678x', 'x09012345678', '090-1234-567', '090(1234)5678', '０９０１２３４５６７８９', '〇九〇', 'abc', '090 1234 5678 9', '090.1234.5678'];
  for (const s of ok) assert.equal(gymPhoneOk(s), true, JSON.stringify(s));
  for (const s of no) assert.equal(gymPhoneOk(s), false, JSON.stringify(s));
  for (const s of [undefined, null, 9012345678] as unknown as string[]) assert.equal(gymPhoneOk(s), false);
  // 記録に残す形：数字だけ。携帯でなければ ''
  assert.equal(gymPhoneNormal('０９０－１２３４－５６７８'), '09012345678'); assert.equal(gymPhoneNormal(' 090 1234 5678 '), '09012345678');
  for (const s of no) assert.equal(gymPhoneNormal(s), '', JSON.stringify(s));
});

test('isUnaffiliated: ジムに入っていない言い方（無所属／むしょぞく／所属なし／なし／フリー／個人／ジムなし／通っていない など）。全角・半角・空白・見えない文字をそろえたあと。ふつうのジム名は違う', () => {
  assert.deepEqual([...UNAFFILIATED_NAMES], ['無所属', 'むしょぞく', 'ムショゾク', '所属なし', 'なし', '無し', 'ない', '無', 'フリー', '個人']);
  assert.ok(UNAFFILIATED_PHRASES.includes('無所属') && UNAFFILIATED_PHRASES.includes('通っていない'));
  const yes = ['無所属', 'むしょぞく', 'ムショゾク', '所属なし', 'なし', '無し', 'ない', '無', 'フリー', '個人', ' 無所属 ', '\u3000無所属\u3000', '無 所 属', '無\u3000所属', '無\u200B所属', '\u202E無所属', 'ﾑｼｮｿﾞｸ', 'む しょ ぞく', '所属 なし', '無\n所属', 'ムショゾク\t',
    '無所属ジム', 'ジム無所属', '無所属です', '無所属。', '所属無し', 'しょぞくなし', 'ショゾクナシ', '所属してない', '所属していません', 'ジムなし', 'ジム無し', '道場なし', '通っていない', '通ってないです', '無所属1'];
  const no = ['', ' ', '所属', 'なしジム', '架空ジムA', 'ＡＢＣ', 'none', '無職', 'フラットアップジム', 'ナイスジム', '個人レッスンジム'];
  for (const s of yes) assert.equal(isUnaffiliated(s), true, JSON.stringify(s));
  for (const s of no) assert.equal(isUnaffiliated(s), false, JSON.stringify(s));
  for (const s of [undefined, null, 5] as unknown as string[]) assert.equal(isUnaffiliated(s), false);
  assert.equal(UNAFFILIATED_TEXT, 'ジムに所属していない人は、参加できません。通っているジム・道場の名前を入れてください。');
});

test('文のきまり: core/pledge.ts と、アプリのコード（app・core・tests・scripts）は、誓約・同意の文を持たない。文は .gs の初期値と docs だけ', () => {
  // .gs の初期値（PLEDGE_INITIAL_*）の文を、12字ずつの窓にして、ほかのコードに1つも出てこないことを確かめる（写して貼った文を見つける）
  const gs = readFileSync(new URL('../public/templates/Tournament_OS_Google受付_v3.gs', import.meta.url), 'utf8');
  const quoted = [...gs.slice(gs.indexOf('const PLEDGE_INITIAL_ITEMS'), gs.indexOf('const PLEDGE_HEADINGS_')).matchAll(/'([^'\n]{12,})'/g)].map((m) => m[1]);
  assert.equal(quoted.length, 7, '項目5つ・保護者の文・ジム責任者の文');
  const windows = new Set<string>();
  for (const text of quoted) for (let i = 0; i + 12 <= text.length; i++) windows.add(text.slice(i, i + 12));
  const root = new URL('..', import.meta.url).pathname;
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (['node_modules', '.next', 'out', 'out-private-pages', 'docs', 'public', 'standalone', 'private-deploy'].includes(name)) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path); else if (/\.(ts|tsx|mjs|js|css|json|sh)$/.test(name)) files.push(path);
    }
  };
  for (const dir of ['app', 'core', 'tests', 'scripts', 'worker']) { try { walk(join(root, dir)); } catch { /* 無い場所は飛ばす */ } }
  assert.ok(files.some((f) => f.endsWith('core/pledge.ts')), 'core/pledge.ts を数えている');
  const hits: string[] = [];
  for (const file of files) {
    const body = readFileSync(file, 'utf8');
    for (const w of windows) if (body.includes(w)) { hits.push(file.replace(root, '') + '：' + w); break; }
  }
  assert.deepEqual(hits, [], '誓約・同意の文を写していない');
  // core/pledge.ts には、文の語（「同意致します」「誓約します」など）の言い回しが無い
  const core = readFileSync(new URL('../core/pledge.ts', import.meta.url), 'utf8');
  assert.ok(!/致します|いたします|一切の責任|賠償|虚偽|感染症|著作権/.test(core), 'コアに文の言い回しが無い');
  assert.ok(!/@@/.test(core));
});

test('core/pledge.ts は、DOM も Node も使わない（純粋・同期）：window・document・Buffer・btoa・atob・fetch・require・import がない', () => {
  const core = readFileSync(new URL('../core/pledge.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const word of ['window', 'document', 'Buffer', 'btoa', 'atob', 'fetch(', 'require(', 'localStorage', 'TextDecoder', 'TextEncoder', 'async ', 'await ', 'Promise', 'Date.now', 'Math.random']) assert.ok(!core.includes(word), word);
  assert.ok(!/^import /m.test(core), '他のファイルを読み込まない');
});
