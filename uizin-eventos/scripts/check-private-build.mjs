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

// 0. 置いてよいファイルだけ（許可リスト）。名簿のCSV・バックアップ・写真・.env・ソースマップなどが、1つでも混ざったら止める。
//    置いてよいのは、画面（HTML）・プログラム（js）・見た目（css）・書き出し（txt）・設定（json）・ひな形（.gs・.xlsx）・フォント（woff2）・図（svg）だけ。
const TOP_ENTRIES = ['_headers', '_redirects', 'template-link.json', '_next', 'apply', 'private', 'templates', 'index.html', '404.html'];
const ALLOWED_EXT = ['html', 'js', 'css', 'txt', 'json', 'gs', 'xlsx', 'woff2', 'svg'];
for (const f of files) {
  const r = rel(f);
  const top = r.split('/')[0];
  const name = r.split('/').pop();
  if (!TOP_ENTRIES.includes(top)) { problems.push('置いてはいけないファイルがあります: ' + r); continue; }
  if (name.startsWith('.')) { problems.push('隠しファイル（.で始まる名前）があります: ' + r); continue; }
  if (r === '_headers' || r === '_redirects') continue;
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  if (!ALLOWED_EXT.includes(ext)) problems.push('置いてはいけない種類のファイルです（' + (ext || '拡張子なし') + '）: ' + r);
}

// 1. 画面（HTML）は、受付と準備の画面だけ。クラウド管理・古い管理画面が混ざらない。
const pages = files.map(rel).filter((f) => f.endsWith('.html'));
const allowedTop = ['private/', 'apply/'];
for (const page of pages) need(allowedTop.some((p) => page.startsWith(p)) || page === 'index.html' || page === '404.html', '公開してはいけない画面が入っています: ' + page);
need(pages.some((p) => p.startsWith('private/')), '準備の画面（/private/）がありません。');
need(pages.some((p) => p.startsWith('apply/')), '選手の申込画面（/apply/）がありません。');
need(pages.some((p) => p.startsWith('private/setup/')), '設定の画面（/private/setup/）がありません。');
need(pages.some((p) => p.startsWith('private/live/')), '試合当日の画面（/private/live/）がありません。');

// 1b. 古い「別の方法で受付をつくる」画面（private/google-setup）は、公開してはいけない。
//     この画面は、主催者のメールアドレスと合言葉（setupKey）を、ブラウザに残すため。使える道は /private/setup/（v3）だけ。
//     画面の置き場所・画面の名前・その画面だけの保存の書き込み（setItem('tournament-google-setup:…')）・古い _headers の設定の、どれか1つでも残っていたら止める。
//     ソースのファイルは消さない。公開用フォルダに入れないだけ（scripts/build-private-pages.sh の LEGACY_ROUTES）。
need(!existsSync(join(dir, 'templates/Tournament_OS_Google受付.gs')), '古い版のGoogleのプログラム（templates/Tournament_OS_Google受付.gs）が公開用フォルダに入っています。使えるひな形は v3 だけです。scripts/build-private-pages.sh の LEGACY_FILES を確かめてください。');
need(!existsSync(join(dir, 'private/google-setup')) && !pages.some((p) => p.includes('google-setup')), '古い受付画面（private/google-setup）が公開用フォルダに入っています。主催者のメールと合言葉をブラウザに残すので、公開できません。scripts/build-private-pages.sh の LEGACY_ROUTES を確かめてください。');
for (const f of files.filter((f) => /\.(js|html|txt|json|gs|css)$/.test(f) || /(^|\/)_headers$/.test(rel(f)))) {
  const t = text(f);
  // 古い画面が「書く」ところと、その画面だけの言葉。（画面が古い覚え書きを「消す」ための名前は、あってよい）
  if (/setItem\(\s*["'`]tournament-google-setup:|\/private\/google-setup|主催者本人のGoogleメールアドレス|Google受付をつなぐ/.test(t)) problems.push('古い受付画面（google-setup）の名前や保存の書き込みが、公開用フォルダに残っています: ' + rel(f));
}

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

// 5b. template-link.json：空は許す（公開のコマンドが、控えのリンクを入れる）。入っているなら、「コピーを作る」の形でなければ止める。
if (existsSync(join(dir, 'template-link.json'))) {
  try {
    const link = JSON.parse(text(join(dir, 'template-link.json')));
    const url = typeof link.copyUrl === 'string' ? link.copyUrl : null;
    need(url !== null, 'template-link.json に "copyUrl" がありません。');
    if (url) need(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+\/copy$/.test(url), 'template-link.json のリンクの形が正しくありません（https://docs.google.com/spreadsheets/d/…/copy）。');
  } catch { problems.push('template-link.json が読めません（JSON ではありません）。'); }
}

// 5c. 安全のための設定（_headers）の中身。弱くなっていたら止める。
//     CSP は、許す宛先が「自分・none・data:・blob:・Googleの2つ」だけであること。申込（/apply/）は、外への通信 connect-src 'none'、送れる先は Google だけ。
if (existsSync(join(dir, '_headers'))) {
  const blocks = new Map();
  let current = null;
  for (const raw of text(join(dir, '_headers')).split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (/^\S/.test(raw)) { current = { path: raw.trim(), lines: [] }; blocks.set(current.path, current); } else if (current) current.lines.push(raw.trim());
  }
  const GOOGLE = ['https://script.google.com', 'https://script.googleusercontent.com'];
  const SAFE_TOKENS = ["'self'", "'none'", 'data:', 'blob:', "'unsafe-inline'", ...GOOGLE];
  const REQUIRED_PATHS = ['/private/', '/private/entry/*', '/private/live/*', '/private/setup/*', '/apply/*'];
  for (const path of REQUIRED_PATHS) {
    const block = blocks.get(path);
    if (!block) { problems.push('_headers に ' + path + ' の設定がありません。'); continue; }
    const header = (name) => (block.lines.find((l) => l.toLowerCase().startsWith(name.toLowerCase() + ':')) || '').slice(name.length + 1).trim();
    const csp = header('Content-Security-Policy');
    const directives = new Map(csp.split(';').map((d) => d.trim()).filter(Boolean).map((d) => { const [k, ...v] = d.split(/\s+/); return [k, v]; }));
    need(csp !== '', '_headers の ' + path + ' に Content-Security-Policy がありません。');
    for (const [k, want] of [['default-src', "'self'"], ['object-src', "'none'"], ['frame-src', "'none'"], ['base-uri', "'none'"], ['frame-ancestors', "'none'"]]) {
      need((directives.get(k) || []).join(' ') === want, '_headers の ' + path + ' の ' + k + ' は ' + want + ' でなければなりません。');
    }
    for (const [k, tokens] of directives) for (const t of tokens) need(SAFE_TOKENS.includes(t), '_headers の ' + path + ' の ' + k + ' に、許していない宛先（' + t + '）があります。');
    for (const k of ['script-src', 'style-src', 'font-src', 'connect-src', 'form-action']) need(directives.has(k), '_headers の ' + path + ' に ' + k + ' がありません。');
    for (const k of ['script-src', 'style-src', 'font-src', 'img-src']) need(!(directives.get(k) || []).some((t) => GOOGLE.includes(t)), '_headers の ' + path + ' の ' + k + ' に Google は入れられません。');
    need(header('Referrer-Policy') === 'no-referrer', '_headers の ' + path + ' の Referrer-Policy は no-referrer でなければなりません。');
    need(header('X-Content-Type-Options') === 'nosniff', '_headers の ' + path + ' の X-Content-Type-Options は nosniff でなければなりません。');
    need(header('X-Frame-Options') === 'DENY', '_headers の ' + path + ' の X-Frame-Options は DENY でなければなりません。');
    need(/noindex/i.test(header('X-Robots-Tag')), '_headers の ' + path + ' に X-Robots-Tag: noindex がありません（検索に出てしまいます）。');
    if (path === '/apply/*') {
      need((directives.get('connect-src') || []).join(' ') === "'none'", '_headers の /apply/* の connect-src は \'none\' でなければなりません（申込の画面は、外へ通信しません）。');
      const fa = directives.get('form-action') || [];
      need(fa.length > 0 && fa.every((t) => GOOGLE.includes(t)), '_headers の /apply/* の form-action は、Google の2つだけでなければなりません。');
    } else if (path !== '/private/setup/*') {
      need((directives.get('connect-src') || []).join(' ') === "'self'", '_headers の ' + path + ' の connect-src は \'self\' でなければなりません。');
      need((directives.get('form-action') || []).join(' ') === "'none'", '_headers の ' + path + ' の form-action は \'none\' でなければなりません。');
    }
  }
}

// 5d. 外のファイルを読み込む書き方が無い（外部のスクリプト・フォント・画像・CSS）。文章の中のリンク（<a href>）は、数えない。
const externalUrl = /^\s*(https?:)?\/\//i;
for (const page of files.filter((f) => f.endsWith('.html'))) {
  const html = text(page);
  for (const m of html.matchAll(/<(script|img|iframe|embed|object|source|video|audio|input)\b[^>]*?\s(?:src|data)=["']?([^"'\s>]+)/gi)) if (externalUrl.test(m[2])) problems.push('外のファイルを読み込む書き方があります（' + m[1] + ' src）: ' + rel(page) + ' → ' + m[2].slice(0, 60));
  for (const m of html.matchAll(/<link\b[^>]*?\shref=["']?([^"'\s>]+)/gi)) if (externalUrl.test(m[1])) problems.push('外のファイルを読み込む書き方があります（link href）: ' + rel(page) + ' → ' + m[1].slice(0, 60));
  for (const m of html.matchAll(/\ssrcset=["']([^"']+)/gi)) if (/https?:\/\//i.test(m[1])) problems.push('外のファイルを読み込む書き方があります（srcset）: ' + rel(page));
  for (const m of html.matchAll(/<form\b[^>]*?\saction=["']?([^"'\s>]+)/gi)) if (externalUrl.test(m[1]) && !/^https:\/\/script\.google(usercontent)?\.com\//.test(m[1])) problems.push('Google 以外へ送るフォームがあります: ' + rel(page) + ' → ' + m[1].slice(0, 60));
}
for (const f of files.filter((f) => f.endsWith('.css'))) {
  const css = text(f);
  for (const m of css.matchAll(/url\(\s*["']?(https?:)?\/\/[^)"']+/gi)) problems.push('CSS が外のファイルを読み込みます: ' + rel(f) + ' → ' + m[0].slice(0, 60));
  for (const m of css.matchAll(/@import\s+(url\()?\s*["']?(https?:)?\/\//gi)) problems.push('CSS が外の CSS を読み込みます: ' + rel(f));
  // Safari 15.0〜15.3 は @layer を読めず、その塊をまるごと捨てる（レイアウトが全部消える）。postcss.config.mjs が取りのぞいている。
  if (/@layer\b/.test(css)) problems.push('CSS に @layer が残っています（古い Safari 15.0〜15.3 で、レイアウトが消えます。postcss.config.mjs を見てください）: ' + rel(f));
}
for (const f of js) {
  const code = text(f);
  for (const m of code.matchAll(/(?:fetch|import|importScripts|sendBeacon|WebSocket|EventSource)\(\s*["'`]https?:\/\/(?!script\.google(?:usercontent)?\.com\/)[^"'`]+/g)) problems.push('外へ通信する書き方があります: ' + rel(f) + ' → ' + m[0].slice(0, 70));
  for (const m of code.matchAll(/["'`](https?:\/\/[^"'`\s]+\.(?:js|mjs|css|woff2?|ttf|otf|png|jpe?g|gif|webp|ico|svg)(?:\?[^"'`\s]*)?)["'`]/gi)) if (!/^https?:\/\/(www\.w3\.org|schemas\.|purl\.)/.test(m[1])) problems.push('外のファイル（スクリプト・フォント・画像）の住所があります: ' + rel(f) + ' → ' + m[1].slice(0, 70));
}

// 6. 個人情報・鍵らしき文字が、公開用フォルダに入っていない。
//    大きさ・種類に関わらず、文字のファイルは全部読む。メールアドレスと電話番号は、見本の決まった文字だけ許す。
const secretLike = [
  [/AKfy[A-Za-z0-9_-]{20,}/, 'Google の鍵'],
  [/BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/, '秘密鍵'],
  [/AKIA[0-9A-Z]{16}/, 'AWS の鍵'],
  [/gh[pousr]_[A-Za-z0-9]{30,}/, 'GitHub の鍵'],
  [/AIza[0-9A-Za-z_-]{30,}/, 'Google API の鍵'],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, 'Slack の鍵'],
  [/eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\./, 'JWT（ログインの札）'],
  [/sk-[A-Za-z0-9_-]{20,}/, 'API の鍵'],
  [/(?<![A-Za-z0-9_-])(?:password|secret|operatorKey|setupKey)["']?\s*[:=]\s*["'][A-Za-z0-9+/_-]{12,}["']/i, '書き込まれた合言葉'],
];
const SAMPLE_EMAIL_HOST = /@(?:example\.(?:com|org|net|invalid)|[a-z0-9.-]+\.invalid|localhost)$/i;
const SAMPLE_PHONES = ['09012345678', '08012345678', '07012345678', '09000000000', '09099999999', '08000000000'];
for (const f of files.filter((f) => /\.(js|html|json|gs|txt|css|svg)$/.test(f) || /(^|\/)(_headers|_redirects)$/.test(rel(f)))) {
  const t = text(f);
  for (const [re, label] of secretLike) if (re.test(t)) problems.push('鍵や秘密らしき文字（' + label + '）が入っています: ' + rel(f));
  for (const m of t.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g)) if (!SAMPLE_EMAIL_HOST.test(m[0]) && !/\.(?:png|jpe?g|svg|gif|webp|woff2?|m?js|css|json|map|tsx?|txt|html)$/i.test(m[0])) problems.push('メールアドレスらしき文字が入っています: ' + rel(f) + ' → ' + m[0].slice(0, 40));
  for (const m of t.matchAll(/(?<![0-9])0[789]0[-\s]?[0-9]{4}[-\s]?[0-9]{4}(?![0-9])/g)) if (!SAMPLE_PHONES.includes(m[0].replace(/[-\s]/g, ''))) problems.push('電話番号らしき文字が入っています: ' + rel(f) + ' → ' + m[0]);
}

// 7. 古い Safari（iOS 15 など）で、文法が読めずに画面が動かなくなる書き方が、JSに入っていない。
//    - クラスの static ブロック（Safari 16.4 から）… これが1つでもあると、その部品が読めず、画面が「よみこみ中…」のまま止まる。
//    - 正規表現の後読み (?<= (?<! （Safari 16.4 から）
//    文字の中の偶然の一致で誤って止めないよう、TypeScript の構文木で調べる。
let ts = null;
try { ts = (await import('typescript')).default; } catch { /* TypeScript が無い環境（公開用の取り出し先など）では、この検査だけ省く */ }
if (ts) {
  for (const f of js) {
    const source = ts.createSourceFile(f, text(f), ts.ScriptTarget.ESNext, false, ts.ScriptKind.JS);
    const hits = new Set();
    const visit = (node) => {
      if (node.kind === ts.SyntaxKind.ClassStaticBlockDeclaration) hits.add('クラスの static ブロック');
      if (node.kind === ts.SyntaxKind.RegularExpressionLiteral && /\(\?<[=!]/.test(node.getText(source))) hits.add('正規表現の後読み');
      ts.forEachChild(node, visit);
    };
    visit(source);
    for (const hit of hits) problems.push('古い Safari で動かない書き方（' + hit + '）が入っています: ' + rel(f) + '（package.json の browserslist を確かめてください）');
  }
} else console.log('i TypeScript が無いので、古い Safari 向けの文法の検査は省きました。');

if (problems.length) {
  console.error('NG 公開用フォルダを、公開してはいけません。');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log('OK 公開用フォルダは、正常です（画面 ' + pages.length + ' / ファイル ' + files.length + '）。');
