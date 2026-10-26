// 2026-10-24 の点検（10-release・5-perf）で見つかった、公開の道具の直しを確かめる。
// 本物の公開・本物のビルド・ブラウザは動かさない。一時フォルダに練習用の git リポジトリを作り、npm・npx は、にせもの（呼ばれたことを書くだけ）にする。
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { headersFor, parseHeadersFile } from '../scripts/serve-with-headers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const LIST_NAME = 'uizin-eventos-verified-trees.txt';
const FAKE_LINK = '{ "copyUrl": "https://docs.google.com/spreadsheets/d/TESTONLY_fake_template_0000/copy" }\n';

type Env = Record<string, string | undefined>;
type Box = { dir: string; home: string; log: string; env: Env };

/** 練習用の場所：HOME（git の設定を読まない）・にせものの npm / npx・呼ばれた記録 */
function sandbox(): Box {
  const dir = mkdtempSync(join(tmpdir(), 'tos-tools-'));
  const home = join(dir, 'home');
  const bin = join(dir, 'bin');
  mkdirSync(home); mkdirSync(bin);
  const log = join(dir, 'calls.log');
  writeFileSync(log, '');
  const stub = (name: string, body: string) => { writeFileSync(join(bin, name), '#!/bin/sh\necho "' + name + ' $* @ $(pwd)" >> "$STUB_LOG"\n' + body + '\nexit 0\n'); chmodSync(join(bin, name), 0o755); };
  stub('npm', 'case "$*" in\n  "run build:private") echo "OK 公開用フォルダは、正常です（にせもの）" ;;\n  "test --silent") [ -n "$STUB_FAIL_TEST" ] && exit 1 ;;\nesac');
  stub('npx', '');
  const env: Env = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^(GIT_|TOS_|STUB_)/.test(k)) env[k] = v;
  Object.assign(env, {
    HOME: home, PATH: bin + ':' + (process.env.PATH ?? ''), STUB_LOG: log, GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
  });
  return { dir, home, log, env };
}
const sh = (box: Box, cwd: string, cmd: string, args: string[], extra: Env = {}, input?: string) =>
  spawnSync(cmd, args, { cwd, env: { ...box.env, ...extra } as NodeJS.ProcessEnv, encoding: 'utf8', input, timeout: 60_000 });
function git(box: Box, cwd: string, ...args: string[]): string {
  const r = sh(box, cwd, 'git', args);
  assert.equal(r.status, 0, 'git ' + args.join(' ') + ': ' + r.stderr);
  return r.stdout.trim();
}
const put = (path: string, text: string) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
const copyScript = (repo: string, name: string) => { put(join(repo, 'uizin-eventos/scripts', name), read('scripts/' + name)); chmodSync(join(repo, 'uizin-eventos/scripts', name), 0o755); };
/** 練習用のリポジトリ（いちばん上に検証ずみの一覧、uizin-eventos/ に道具）。コミットずみで返す */
function makeRepo(box: Box, scripts: string[], stubs: Record<string, string> = {}): string {
  const repo = join(box.dir, 'repo');
  mkdirSync(repo);
  git(box, repo, 'init', '-q', '-b', 'main');
  for (const name of scripts) copyScript(repo, name);
  for (const [name, body] of Object.entries(stubs)) put(join(repo, 'uizin-eventos/scripts', name), body);
  put(join(repo, 'uizin-eventos/.gitignore'), 'out-private-pages/\n.verify-ok\n');
  put(join(repo, 'uizin-eventos/app.txt'), '画面の元\n');
  put(join(repo, 'uizin-eventos/out-private-pages/index.html'), '<!doctype html><title>x</title>');
  put(join(repo, LIST_NAME), '# 練習用の、検証ずみの一覧\n');
  git(box, repo, 'add', '-A');
  git(box, repo, 'commit', '-q', '-m', 'init');
  return repo;
}
const treeOf = (box: Box, repo: string) => git(box, repo, 'rev-parse', 'HEAD:uizin-eventos');
const listLines = (repo: string) => readFileSync(join(repo, LIST_NAME), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
const stamp = (box: Box, repo: string, ...args: string[]) => sh(box, repo, 'bash', [join(repo, 'uizin-eventos/scripts/tree-stamp.sh'), ...args]);
const freePort = (): Promise<number> => new Promise((resolve) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => resolve(p)); }); });

/* ───────── 指紋（tree-stamp.sh）：まだ追跡していないファイルの中身も見る ───────── */

test('10-release: tree-stamp.sh は、まだ追跡していないファイルの中身を変えると、ちがう指紋になる（名前が同じでも）', () => {
  const box = sandbox();
  try {
    const repo = makeRepo(box, ['tree-stamp.sh']);
    put(join(repo, 'uizin-eventos/app/components/X.tsx'), 'export const a = 1;\n');
    const first = stamp(box, repo).stdout.trim();
    assert.match(first, /^[0-9a-f]{40}:[0-9a-f]{40}$/);
    assert.equal(stamp(box, repo).stdout.trim(), first, '何も変えなければ、同じ指紋');
    put(join(repo, 'uizin-eventos/app/components/X.tsx'), 'export const a = 2;\n');
    assert.notEqual(stamp(box, repo).stdout.trim(), first, 'git add の前に直した中身も、指紋に出る');
    // .gitignore で無視している物（公開用フォルダなど）は、数えない
    const now = stamp(box, repo).stdout.trim();
    put(join(repo, 'uizin-eventos/out-private-pages/extra.js'), 'x');
    assert.equal(stamp(box, repo).stdout.trim(), now);
  } finally { rmSync(box.dir, { recursive: true, force: true }); }
});

test('10-release: tree-stamp.sh --tree は、コミットずみで変更が無いときだけ、フォルダの中身の番号を出す。--list は一覧の場所', () => {
  const box = sandbox();
  try {
    const repo = makeRepo(box, ['tree-stamp.sh']);
    const tree = treeOf(box, repo);
    assert.equal(stamp(box, repo, '--tree').stdout.trim(), tree);
    assert.equal(stamp(box, repo, '--list').stdout.trim(), join(git(box, repo, 'rev-parse', '--show-toplevel'), LIST_NAME));
    // フォルダの外の変更（一覧に書き足した・コミットしていない）は、関係ない。一覧をコミットしても、中身の番号は変わらない
    writeFileSync(join(repo, LIST_NAME), readFileSync(join(repo, LIST_NAME), 'utf8') + tree + '  2026-10-24T00:00+0000  abc1234\n');
    put(join(repo, 'outside.txt'), 'x');
    assert.equal(stamp(box, repo, '--tree').stdout.trim(), tree);
    git(box, repo, 'add', LIST_NAME); git(box, repo, 'commit', '-q', '-m', 'list');
    assert.equal(treeOf(box, repo), tree, '一覧のコミットで、中身の番号は変わらない');
    // フォルダの中の、まだ追跡していないファイル・コミットしていない変更があると、何も出さずに 1
    put(join(repo, 'uizin-eventos/new.txt'), 'x');
    let r = stamp(box, repo, '--tree');
    assert.equal(r.status, 1); assert.equal(r.stdout, '');
    rmSync(join(repo, 'uizin-eventos/new.txt'));
    put(join(repo, 'uizin-eventos/app.txt'), '直した\n');
    r = stamp(box, repo, '--tree');
    assert.equal(r.status, 1); assert.equal(r.stdout, '');
    assert.equal(stamp(box, repo, '--nope').status, 2);
    // フォルダが git のいちばん上のとき（一覧がフォルダの中に入ってしまう）は、どちらも使わない
    const solo = join(box.dir, 'solo');
    mkdirSync(join(solo, 'scripts'), { recursive: true });
    copyFileSync(join(ROOT, 'scripts/tree-stamp.sh'), join(solo, 'scripts/tree-stamp.sh'));
    git(box, solo, 'init', '-q', '-b', 'main'); git(box, solo, 'add', '-A'); git(box, solo, 'commit', '-q', '-m', 'solo');
    for (const opt of ['--tree', '--list']) {
      const s = sh(box, solo, 'bash', [join(solo, 'scripts/tree-stamp.sh'), opt]);
      assert.equal(s.status, 1, opt); assert.equal(s.stdout, '', opt);
    }
  } finally { rmSync(box.dir, { recursive: true, force: true }); }
});

/* ───────── 全部の確認（verify-private-all.sh）：検証ずみの一覧に書く・マニュアルのロボット ───────── */

const VERIFY_STUBS = {
  'check-manual-labels.mjs': 'process.exit(process.env.STUB_FAIL_LABELS ? 1 : 0);\n',
  'test-ok.mjs': 'process.exit(0);\n',
};
async function runVerify(box: Box, repo: string, extra: Env = {}) {
  return sh(box, join(repo, 'uizin-eventos'), 'bash', [join(repo, 'uizin-eventos/scripts/verify-private-all.sh')], { TOS_PORT: String(await freePort()), ...extra });
}

test('10-release: verify-private-all.sh は、コミットずみの中身で全部合格したら、中身の番号を一覧に1行足す（同じ番号は2回書かない）', async () => {
  const box = sandbox();
  try {
    const repo = makeRepo(box, ['verify-private-all.sh', 'tree-stamp.sh', 'serve-with-headers.mjs'], VERIFY_STUBS);
    const tree = treeOf(box, repo);
    const head = git(box, repo, 'rev-parse', '--short', 'HEAD');
    let r = await runVerify(box, repo);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /ALL OK/);
    assert.match(r.stdout, /OK +\d+s +manual labels/, 'マニュアルのロボットも動いた');
    assert.ok(existsSync(join(repo, 'uizin-eventos/.verify-ok')));
    const lines = listLines(repo);
    assert.equal(lines.length, 1);
    assert.match(lines[0], new RegExp('^' + tree + '  \\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}[+-]\\d{4}  ' + head + '$'));
    assert.match(r.stdout, /この一覧を、コミットしてください/);
    assert.equal(git(box, repo, 'status', '--porcelain', '--', 'uizin-eventos'), '', 'フォルダの中は、変わらない（一覧は外）');
    r = await runVerify(box, repo);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(listLines(repo).length, 1, '同じ番号は、2回書かない');
    assert.match(r.stdout, /もう検証ずみの一覧/);
  } finally { rmSync(box.dir, { recursive: true, force: true }); }
});

test('10-release: verify-private-all.sh は、変更があるとき・一部だけのとき・失敗したとき（マニュアルのロボットも）は、一覧に書かない', async () => {
  const box = sandbox();
  try {
    const repo = makeRepo(box, ['verify-private-all.sh', 'tree-stamp.sh', 'serve-with-headers.mjs'], VERIFY_STUBS);
    // まだ追跡していないファイルがある：全部合格して .verify-ok は書くが、一覧には書かない
    put(join(repo, 'uizin-eventos/new.txt'), 'x');
    let r = await runVerify(box, repo);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(existsSync(join(repo, 'uizin-eventos/.verify-ok')));
    assert.equal(listLines(repo).length, 0);
    assert.match(r.stdout, /検証ずみの一覧（uizin-eventos-verified-trees\.txt）には書きません/);
    rmSync(join(repo, 'uizin-eventos/new.txt'));
    rmSync(join(repo, 'uizin-eventos/.verify-ok'));
    // 一部だけ（TOS_ONLY）
    r = await runVerify(box, repo, { TOS_ONLY: 'test-ok' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(listLines(repo).length, 0);
    // マニュアルの文字のロボットが落ちた → 全体も失敗。指紋も一覧も書かない
    r = await runVerify(box, repo, { STUB_FAIL_LABELS: '1' });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /FAIL manual labels/);
    assert.ok(!existsSync(join(repo, 'uizin-eventos/.verify-ok')));
    assert.equal(listLines(repo).length, 0);
    // 単体テストが落ちた
    r = await runVerify(box, repo, { STUB_FAIL_TEST: '1' });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.equal(listLines(repo).length, 0);
  } finally { rmSync(box.dir, { recursive: true, force: true }); }
});

/* ───────── 公開のコマンド（deploy-private.sh）：一覧にある中身なら、ふつうの yes ───────── */

function makeDeployRepo(box: Box): string {
  const repo = makeRepo(box, ['deploy-private.sh', 'tree-stamp.sh'], { 'check-private-build.mjs': 'console.log("OK（にせもの）");\n' });
  writeFileSync(join(box.home, 'template-link.backup.json'), FAKE_LINK);
  return repo;
}
const runDeploy = (box: Box, repo: string, answer: string) => sh(box, join(repo, 'uizin-eventos'), 'bash', [join(repo, 'uizin-eventos/scripts/deploy-private.sh')], {}, answer + '\n');
const deployed = (box: Box) => readFileSync(box.log, 'utf8').includes('npx wrangler pages deploy');
const addToList = (repo: string, line: string) => writeFileSync(join(repo, LIST_NAME), readFileSync(join(repo, LIST_NAME), 'utf8') + line + '\n');

test('10-release: deploy-private.sh は、.verify-ok が無くても、コミットずみで一覧にある中身なら「✓」で、ふつうの yes で公開する', () => {
  const box = sandbox();
  try {
    const repo = makeDeployRepo(box);
    const tree = treeOf(box, repo);
    // 一覧に無い → いままでどおり yes-unverified（yes では公開しない）
    let r = runDeploy(box, repo, 'yes');
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /よければ yes-unverified と打って/);
    assert.match(r.stdout, /やめました/);
    assert.equal(deployed(box), false);
    // 一覧にある → yes で公開（記録の日時とコミットも出す）
    addToList(repo, tree + '  2026-10-24T09:30+0900  abc1234');
    git(box, repo, 'add', LIST_NAME); git(box, repo, 'commit', '-q', '-m', 'list');
    r = runDeploy(box, repo, 'yes');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /全部の確認に合格した記録があります（2026-10-24T09:30\+0900・コミット abc1234/);
    assert.match(r.stdout, /よければ yes と打って/);
    assert.equal(deployed(box), true, 'にせものの wrangler まで進んだ');
  } finally { rmSync(box.dir, { recursive: true, force: true }); }
});

test('10-release: deploy-private.sh は、変更があるとき・中身が一覧とちがうとき・コメントの中だけにあるときは、一覧を使わない（.verify-ok の道は今までどおり）', () => {
  const box = sandbox();
  try {
    const repo = makeDeployRepo(box);
    const tree = treeOf(box, repo);
    addToList(repo, '# 前に書いた ' + tree);
    let r = runDeploy(box, repo, 'yes');
    assert.match(r.stdout, /yes-unverified と打って/, 'コメントの中だけ → 一覧にない');
    addToList(repo, tree + '  2026-10-24T09:30+0900  abc1234');
    // まだ追跡していないファイルが、フォルダの中にある
    put(join(repo, 'uizin-eventos/new.txt'), 'x');
    r = runDeploy(box, repo, 'yes');
    assert.match(r.stdout, /yes-unverified と打って/);
    assert.equal(deployed(box), false);
    // その状態で verify が全部合格していた（.verify-ok がいまの指紋と同じ）→ いままでどおり yes
    writeFileSync(join(repo, 'uizin-eventos/.verify-ok'), stamp(box, repo).stdout);
    r = runDeploy(box, repo, 'yes');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /このコミット・この中身で、bash scripts\/verify-private-all\.sh は全部合格しています/);
    rmSync(join(repo, 'uizin-eventos/.verify-ok'));
    // 中身を直してコミットした（中身の番号が変わった）→ 一覧の古い番号では通さない
    rmSync(join(repo, 'uizin-eventos/new.txt'));
    put(join(repo, 'uizin-eventos/app.txt'), '直した\n');
    git(box, repo, 'add', '-A'); git(box, repo, 'commit', '-q', '-m', 'change');
    writeFileSync(box.log, '');
    r = runDeploy(box, repo, 'yes');
    assert.match(r.stdout, /yes-unverified と打って/);
    assert.equal(deployed(box), false);
  } finally { rmSync(box.dir, { recursive: true, force: true }); }
});

/* ───────── オーナーの Mac の公開（owner-deploy.sh）：前の ~/a3deploy.sh と同じ仕事 ───────── */

const OWNER = read('scripts/owner-deploy.sh');
const DEFAULT_BRANCH = (OWNER.match(/^DEFAULT_BRANCH="([^"]+)"$/m) ?? [])[1];

test('10-release: owner-deploy.sh は、枝を ~/openqlow-a3 に取ってきて、npm ci と npm run deploy:private をする（枝の名前は1か所）', () => {
  assert.ok(DEFAULT_BRANCH, 'DEFAULT_BRANCH="…" の1行がある');
  assert.equal((OWNER.match(/claude\/tournament-os-/g) ?? []).length, 1, '枝の名前は、DEFAULT_BRANCH の1か所だけ');
  assert.match(OWNER, /local branch="\$\{1:-\$DEFAULT_BRANCH\}"/, '引数があれば、その枝');
  assert.match(OWNER, /local new="\$HOME\/openqlow-a3"/);
  assert.match(OWNER, /npm ci --no-audit --no-fund/);
  assert.doesNotMatch(OWNER, /npm install/, 'package-lock.json を書きかえない（フォルダを「変更なし」のままにする）');
  assert.match(OWNER, /npm run deploy:private/);
  assert.match(OWNER, /^main "\$@"; exit \$\?$/m, '全部を読んでから動く（取ってくると、このファイル自身も変わるため）');
  const doc = read('docs/TOURNAMENT_OS_公開とCodex連携の決まり.md');
  for (const word of ['scripts/owner-deploy.sh', 'DEFAULT_BRANCH', LIST_NAME, 'check-manual-labels.mjs', '/_next/static/*']) assert.ok(doc.includes(word), word);
  assert.ok(!doc.includes(DEFAULT_BRANCH), '文書には枝の名前を書かない（1か所だけにする）');
});

test('10-release: owner-deploy.sh を、にせものの GitHub（手元の空のリポジトリ）で動かす：はじめて／2回目／ちがう枝／名前の形がちがう', () => {
  const box = sandbox();
  try {
    // にせものの GitHub（名前に flatup1/openqlow を含む）と、そこへ送る元のリポジトリ
    const bare = join(box.dir, 'flatup1', 'openqlow.git');
    mkdirSync(bare, { recursive: true });
    git(box, bare, 'init', '-q', '--bare');
    const src = join(box.dir, 'src');
    mkdirSync(src);
    git(box, src, 'init', '-q', '-b', 'main');
    put(join(src, 'uizin-eventos/package.json'), '{ "name": "practice" }\n');
    git(box, src, 'add', '-A'); git(box, src, 'commit', '-q', '-m', 'one');
    git(box, src, 'remote', 'add', 'origin', 'file://' + bare);
    git(box, src, 'push', '-q', 'origin', 'HEAD:refs/heads/' + DEFAULT_BRANCH);
    const first = git(box, src, 'rev-parse', 'HEAD');
    // 前の場所（古い作業フォルダ）：取り先が flatup1/openqlow で、ひな形のリンクの入った公開用フォルダがある
    const old = join(box.home, 'tournament-os-latest');
    mkdirSync(old);
    git(box, old, 'init', '-q', '-b', 'main');
    git(box, old, 'remote', 'add', 'origin', 'file://' + bare);
    put(join(old, 'uizin-eventos/out-private-pages/template-link.json'), FAKE_LINK);
    const owner = join(ROOT, 'scripts/owner-deploy.sh');
    const a3 = join(box.home, 'openqlow-a3');
    const calls = () => readFileSync(box.log, 'utf8').trim().split('\n').filter(Boolean);
    // 使い方だけ・名前の形がちがう → 何もしない
    let r = sh(box, box.home, 'bash', [owner, '--help']);
    assert.equal(r.status, 0); assert.match(r.stdout, /owner-deploy\.sh/);
    r = sh(box, box.home, 'bash', [owner, 'bad..name']);
    assert.equal(r.status, 2); assert.match(r.stderr, /枝の名前の形が正しくありません/);
    assert.equal(existsSync(a3), false); assert.deepEqual(calls(), []);
    // はじめて：前の場所の取り先から、新しく取ってくる
    r = sh(box, box.home, 'bash', [owner]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(git(box, a3, 'rev-parse', 'HEAD'), first);
    assert.deepEqual(calls(), ['npm ci --no-audit --no-fund @ ' + join(a3, 'uizin-eventos'), 'npm run deploy:private @ ' + join(a3, 'uizin-eventos')]);
    assert.equal(readFileSync(join(box.home, 'template-link.backup.json'), 'utf8'), FAKE_LINK, 'ひな形のリンクの控え（はじめの1回だけ）');
    // 2回目：新しいコミットを取ってくる。公開するだけの場所で手で直した物は、取ってきた中身に戻る
    put(join(src, 'uizin-eventos/package.json'), '{ "name": "practice", "v": 2 }\n');
    git(box, src, 'commit', '-q', '-am', 'two');
    git(box, src, 'push', '-q', 'origin', 'HEAD:refs/heads/' + DEFAULT_BRANCH);
    put(join(a3, 'uizin-eventos/package.json'), 'local edit\n');
    writeFileSync(box.log, '');
    r = sh(box, box.home, 'bash', [owner]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(git(box, a3, 'rev-parse', 'HEAD'), git(box, src, 'rev-parse', 'HEAD'));
    assert.equal(git(box, a3, 'status', '--porcelain'), '', '変更なしのまま（一覧で見分けられる）');
    assert.equal(calls().length, 2);
    // ちがう枝を、引数で
    git(box, src, 'push', '-q', 'origin', first + ':refs/heads/claude/other-branch');
    r = sh(box, box.home, 'bash', [owner, 'claude/other-branch']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(git(box, a3, 'rev-parse', 'HEAD'), first);
    assert.equal(git(box, a3, 'rev-parse', '--abbrev-ref', 'HEAD'), 'claude/other-branch');
  } finally { rmSync(box.dir, { recursive: true, force: true }); }
});

/* ───────── 5-perf：名前に中身の印が入った JS/CSS だけ、長く覚えさせる ───────── */

const HEADERS = read('public/_headers');

test('5-perf: _headers の /_next/static/* は「Cache-Control: public, max-age=31536000, immutable」だけ。ほかの道すじ（画面）に Cache-Control は無い', () => {
  assert.match(HEADERS, /\n\/_next\/static\/\*\n {2}Cache-Control: public, max-age=31536000, immutable\n$/);
  const blocks = parseHeadersFile(HEADERS);
  for (const b of blocks) if (b.pattern !== '/_next/static/*') assert.ok(!(b.headers as Array<[string, string]>).some(([n]) => /^cache-control$/i.test(n)), b.pattern);
  // 画面の道すじは、いままでどおり（長く覚えさせる見出しは付かない）
  for (const path of ['/private/', '/private/live/', '/private/setup/', '/private/sheet/', '/private/entry/', '/apply/']) {
    const h = new Map(headersFor(blocks, path));
    assert.match(h.get('Content-Security-Policy') ?? '', /default-src 'self'/, path);
    assert.equal(h.has('Cache-Control'), false, path);
  }
  assert.deepEqual(headersFor(blocks, '/_next/static/chunks/0abc.js'), [['Cache-Control', 'public, max-age=31536000, immutable']]);
});

test('5-perf: serve-with-headers は、新しい _headers でも、画面を今までどおり配る（画面は no-store と CSP、部品だけ長く覚えさせる）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tos-serve-cache-'));
  put(join(dir, 'apply/index.html'), '<!doctype html><title>apply</title>');
  put(join(dir, '_next/static/chunks/0abc.js'), 'console.log(1)');
  writeFileSync(join(dir, '_headers'), HEADERS);
  const port = await freePort();
  const child = spawn(process.execPath, [join(ROOT, 'scripts/serve-with-headers.mjs'), dir, String(port)], { stdio: 'ignore' });
  try {
    let page: Response | null = null;
    for (let i = 0; i < 40 && !page; i++) { try { page = await fetch('http://127.0.0.1:' + port + '/apply/'); } catch { await new Promise((r) => setTimeout(r, 100)); } }
    assert.ok(page && page.status === 200);
    assert.equal(page.headers.get('cache-control'), 'no-store');
    assert.match(page.headers.get('content-security-policy') ?? '', /connect-src 'none'/);
    assert.equal(page.headers.get('x-robots-tag'), 'noindex, nofollow');
    const chunk = await fetch('http://127.0.0.1:' + port + '/_next/static/chunks/0abc.js');
    assert.equal(chunk.status, 200);
    assert.equal(chunk.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.match(chunk.headers.get('content-type') ?? '', /javascript/);
    assert.equal(await chunk.text(), 'console.log(1)');
  } finally { child.kill(); rmSync(dir, { recursive: true, force: true }); }
});

/* ───────── CI：uizin-eventos の仕事で、型チェック・単体テスト・公開用フォルダの自動チェックをする ───────── */

const CI = join(ROOT, '..', '.github/workflows/ci.yml');
test('10-release: CI の uizin-eventos の仕事は、npx tsc --noEmit → npm test → npm run build:private（ブラウザなし）', { skip: !existsSync(CI) && 'フォルダだけ取り出した場合は ci.yml が無い' }, () => {
  const ci = readFileSync(CI, 'utf8');
  const job = ci.slice(ci.indexOf('\n  uizin-eventos:'));
  assert.match(job, /name: UIZIN tests and build/, '仕事の名前は変えない（GitHub の必須の確認の名前）');
  assert.match(job, /working-directory: uizin-eventos/);
  const steps = ['run: npm ci', 'run: npx tsc --noEmit', 'run: npm test', 'run: npm run build:private'];
  for (const s of steps) assert.ok(job.includes(s), s);
  for (let i = 1; i < steps.length; i++) assert.ok(job.indexOf(steps[i - 1]) < job.indexOf(steps[i]), steps[i - 1] + ' → ' + steps[i]);
  assert.doesNotMatch(job, /run: npm run verify\s*$/m, 'npm test + next build だけの古い手順は、上の3つにした');
});
