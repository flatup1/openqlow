// 公開用フォルダ（out-private-pages）が、壊れていないかを確かめる。
// build:private の最後に自動で動く。1つでも駄目なら、公開に進ませない（終了コード1）。
// ブラウザは使わない。Macでも、クラウドでも、同じように動く。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const dir = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : join(root, 'out-private-pages');
const problems = [];
const need = (ok, message) => { if (!ok) problems.push(message); };

const walk = (base) => readdirSync(base, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(base, e.name)) : [join(base, e.name)]);
if (!existsSync(dir)) { console.error('NG 公開用フォルダがありません: ' + dir); process.exit(1); }
const files = walk(dir);
const rel = (f) => relative(dir, f).split('\\').join('/');
const js = files.filter((f) => f.endsWith('.js'));
const text = (f) => readFileSync(f, 'utf8');

// 1. 画面（HTML）は、受付と準備の画面だけ。クラウド管理・古い管理画面が混ざらない。
const pages = files.map(rel).filter((f) => f.endsWith('.html'));
const allowedTop = ['private/', 'apply/'];
for (const page of pages) need(allowedTop.some((p) => page.startsWith(p)) || page === 'index.html' || page === '404.html', '公開してはいけない画面が入っています: ' + page);
need(pages.some((p) => p.startsWith('private/')), '準備の画面（/private/）がありません。');
need(pages.some((p) => p.startsWith('apply/')), '選手の申込画面（/apply/）がありません。');
need(pages.some((p) => p.startsWith('private/setup/')), '設定の画面（/private/setup/）がありません。');
need(pages.some((p) => p.startsWith('private/live/')), '試合当日の画面（/private/live/）がありません。');

// 2. 名簿を読み込む部品が、本当にコピーされている（これが抜けると、公開後に名簿の取り込みが動かない）。
//    呼び出す側の名前（unzipSync など）ではなく、部品の中にだけある文字で探す。
const all = js.map((f) => text(f));
need(all.some((t) => t.includes('invalid zip data')), 'ZIPを読む部品（fflate）が、公開用フォルダに入っていません。名簿のZIPが取り込めなくなります。');
need(all.some((t) => t.includes('sharedStrings')), 'Excelを読む部品が、公開用フォルダに入っていません。xlsxが取り込めなくなります。');

// 3. HTMLが指している /_next/static/... は、すべて実在する
const missing = new Set();
for (const page of files.filter((f) => f.endsWith('.html'))) {
  for (const m of text(page).matchAll(/\/_next\/static\/[A-Za-z0-9._\/-]+/g)) {
    if (!existsSync(join(dir, m[0].replace(/^\//, '')))) missing.add(m[0] + '  ← ' + rel(page));
  }
}
need(missing.size === 0, 'HTMLが指しているファイルが無い: ' + [...missing].slice(0, 5).join(' / '));

// 4. JSの中の「static/chunks/○○.js」の指定も、すべて実在する（動的に読み込む部品の抜けを見つける）
const lost = new Set();
for (const f of js) {
  for (const m of text(f).matchAll(/static\/chunks\/([A-Za-z0-9._-]+\.js)/g)) {
    if (!existsSync(join(dir, '_next/static/chunks', m[1])) && !existsSync(join(dir, '_next/static/chunks', m[1].replace(/^.*\//, '')))) lost.add(m[1] + '  ← ' + rel(f));
  }
}
need(lost.size === 0, 'JSが読み込む部品が無い: ' + [...lost].slice(0, 5).join(' / '));

// 5. 必要な付属ファイル
need(existsSync(join(dir, '_headers')), '_headers（安全のための設定）がありません。');
need(existsSync(join(dir, 'template-link.json')), 'template-link.json がありません。');
need(existsSync(join(dir, 'templates/Tournament_OS_Google受付_v3.gs')) || files.some((f) => /Google受付_v3\.gs$/.test(f)), 'ひな形のプログラム（.gs）がありません。');

// 6. 個人情報・鍵らしき文字が、公開用フォルダに入っていない
const secretLike = [/AKfy[A-Za-z0-9_-]{20,}/, /BEGIN (RSA |EC )?PRIVATE KEY/, /sk-[A-Za-z0-9]{24,}/];
for (const f of files.filter((f) => /\.(js|html|json|gs|txt|css)$/.test(f) && statSync(f).size < 3_000_000)) {
  const t = text(f);
  for (const re of secretLike) if (re.test(t)) problems.push('鍵や秘密らしき文字が入っています: ' + rel(f));
}

if (problems.length) {
  console.error('NG 公開用フォルダを、公開してはいけません。');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log('OK 公開用フォルダは、正常です（画面 ' + pages.length + ' / ファイル ' + files.length + '）。');
