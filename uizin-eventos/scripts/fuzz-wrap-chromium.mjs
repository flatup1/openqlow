/**
 * 手動の確認用です。verify-private-all.sh（npm run verify:all）には入れません。
 * Manual check only. It is NOT part of verify-private-all.sh / npm run verify:all.
 *
 * 何を確かめるか / what it checks:
 *   A3の対戦一覧表（core/boutSheet.ts の wrapLines）が数える「文字が何行に折り返されるか」を、
 *   本物の Chromium の行数と、乱数でつくった名前 1500 件で比べる。
 *   The line count that core/boutSheet.ts wrapLines predicts for a name, compared with the real Chromium line count, on 1500 random names.
 *   結果は 1行目に { total, same, modelHigher, modelLower } で出る。modelLower（モデルの行数が本物より少ない＝紙の上で文字があふれるかもしれない）が
 *   0 でないときは、下に最大12件の例が出る。
 *   The first output line is { total, same, modelHigher, modelLower }. modelLower > 0 means the model counts fewer lines than the browser
 *   (a possible overflow on paper); up to 12 examples follow.
 *
 * 使い方 / run (in uizin-eventos/):
 *   TOS_PLAYWRIGHT_MODULE=playwright TOS_CHROME_PATH=/path/to/chrome node --experimental-strip-types scripts/fuzz-wrap-chromium.mjs
 *   TOS_PLAYWRIGHT_MODULE（既定: playwright）／TOS_CHROME_PATH（Chrome/Chromium の実行ファイル。省略すると、パソコンの Chrome）
 *
 * 気をつけること / notes:
 *   - 通信はしない。ページは setContent で作る空のページだけ。名前はぜんぶ架空のことば。
 *   - 乱数は種（12345）が決まっているので、同じ場所・同じフォントなら、毎回同じ件が出る。
 *     フォントがちがう場所（Mac・Windows・別のLinux）では、本物の行数が変わるので、数は同じにならない。
 *   - この中の数字（件数 1500・種 12345・文字の大きさ・幅の範囲）は、確かめた時のまま。直さない。
 *   - 名前に見える部品の言葉は、文字の長さと種類（漢字・カタカナ・英字・小さい「ッ」「ェ」・長音「ー」）を試すための、ばらばらの部品。
 *     実在の人物の名前になりうる言葉（有名人の名前の部品）は、同じ長さの、意味のない言葉に置きかえてある（文字の数は同じ）。
 *   - PR に書いた「Chromium の行数で1500件を確かめた」と同じ種類の確認。数は、動かした場所のフォントで変わるので、動かしたときの出力を見る。
 */
import { wrapLines } from '../core/boutSheet.ts';

const { chromium } = await import(process.env.TOS_PLAYWRIGHT_MODULE || 'playwright');
const EXE = process.env.TOS_CHROME_PATH || '';
const pools = {
  cjk: ['田中','陽菜','佐々木','大二郎','小野寺','まゆみ','斎藤','健太郎','宮本','武蔵之助','山田','太郎','高橋','花子'],
  kata: ['シェーマル','ブラテン','エトラード','ノーベン','シャミクァー','ローマレス','ナモラス','ケミジ','ラッペル','クルウ','アルモクンダー','ミハナル','ゴムパチュフ','ッ','ー'],
  latin: ['JOHN','SMITH','TARO','YAMADA','Maximilian','Weber','Jose-Antonio','Fernandez','Yuki','Matsumoto','DAIKI','NAKAMURA','Anne-Marie','O\'Connor'],
};
const seps = ['', '　', ' ', '・', '＝', ' '];
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const cases = [];
for (let i = 0; i < 1500; i++) {
  const kind = pick(['cjk', 'kata', 'latin', 'mix']);
  const n = 1 + Math.floor(rnd() * 3);
  let t = '';
  for (let k = 0; k < n; k++) { const pool = kind === 'mix' ? pools[pick(['cjk', 'kata', 'latin'])] : pools[kind]; t += (k ? pick(seps) : '') + pick(pool); }
  const size = 3.4 + rnd() * 11, width = 30 + rnd() * 80;
  cases.push({ t: t.trim(), size, width });
}
const browser = await chromium.launch({ headless: true, ...(EXE ? { executablePath: EXE } : {}) });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.setContent('<body style="margin:0"><div id="r"></div></body>');
const real = await page.evaluate((cs) => {
  const MM = 96 / 25.4; const root = document.getElementById('r');
  return cs.map((c) => {
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;left:0;top:0;font-family:"Hiragino Sans","Yu Gothic UI","Meiryo","Noto Sans JP",sans-serif;font-weight:800;line-height:1.15;overflow-wrap:break-word;overflow-wrap:anywhere;width:' + c.width + 'mm;font-size:' + c.size + 'mm';
    d.textContent = c.t; root.appendChild(d);
    const lh = c.size * MM * 1.15; const n = Math.round(d.getBoundingClientRect().height / lh); d.remove(); return n;
  });
}, cases);
await browser.close();
let under = 0, over = 0, same = 0; const bad = [];
cases.forEach((c, i) => { const m = wrapLines(c.t, c.size, c.width); if (m < real[i]) { under++; if (bad.length < 12) bad.push([c.t, c.size.toFixed(1), c.width.toFixed(0), 'model ' + m, 'real ' + real[i]]); } else if (m > real[i]) over++; else same++; });
console.log(JSON.stringify({ total: cases.length, same, modelHigher: over, modelLower: under }));
console.log(bad.map((b) => b.join(' | ')).join('\n'));
