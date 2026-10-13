/**
 * PostCSS の小さな部品：出来上がった CSS から「@layer」を無くす（見た目は、今までと同じにする）。
 *
 * なぜ：Tailwind v4 は、ほとんどの規則を「@layer ○○ { … }」の中に入れて出す。
 * Safari 15.0〜15.3 は @layer を知らないので、その塊をまるごと捨ててしまう。
 * すると、レイアウト（並べ方・余白・ボタンの形）が全部消えて、画面がバラバラに見える。
 * 古い Safari（iOS 15）の携帯は、実際の利用者にいる。
 *
 * 見た目を変えないために、2つのことをする：
 *  1) @layer の中の規則を、同じ順番のまま、外へ出す。
 *  2) 手で書いた規則（globals.css の .tos-○○ など。もともと @layer の外）には、選択子のうしろに :not(#\#) を足す。
 *     これは「ID が1つ分だけ強い」という意味で、何も除外しない（#\# という名前の要素は無い）。
 *     @layer の外の規則は、@layer の中のどんな規則より強い、という今までの決まりを、そのまま守るため。
 *     足すのは全部の手書きの規則なので、手書きの規則どうしの強さの順番は変わらない。
 *
 * 外へは何も送らない。ビルドのときだけ動く。
 * 部品は、このファイルの中に書く（Next.js 16 の Turbopack は、[部品, 設定] の形で、関数もそのまま受け取る）。
 * 確かめ：npm run verify:private-build は、出来上がった CSS に @layer が残っていないかを見る。
 */
const BUMP = ':not(#\\#)';
/** 「,」で分ける（かっこの中の「,」では分けない） */
const splitSelectors = (text) => {
  const parts = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (const ch of text) {
    if (quote) { cur += ch; if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts;
};
/** 疑似要素（::before など）は、いちばん最後に置く決まりなので、その手前に足す */
const PSEUDO_ELEMENTS = /((?:::[A-Za-z-]+(?:\([^)]*\))?|:(?:before|after|first-line|first-letter))+)\s*$/;
const bumpSelector = (selector) => {
  const trimmed = selector.trim();
  if (!trimmed) return selector;
  const m = trimmed.match(PSEUDO_ELEMENTS);
  return m ? trimmed.slice(0, m.index) + BUMP + trimmed.slice(m.index) : trimmed + BUMP;
};
const bumpRule = (rule) => {
  if (rule.parent && rule.parent.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
  rule.selector = splitSelectors(rule.selector).map(bumpSelector).join(',');
};
/** @layer の外にある規則（@media・@supports の中も）だけに足す */
const bumpOutsideLayers = (container) => {
  container.each((node) => {
    if (node.type === 'rule') bumpRule(node);
    else if (node.type === 'atrule' && node.name !== 'layer' && /^(media|supports|container|scope)$/i.test(node.name) && node.nodes) bumpOutsideLayers(node);
  });
};

const flattenLayers = () => ({
  postcssPlugin: 'tos-flatten-layers',
  OnceExit(root) {
    bumpOutsideLayers(root);
    // 入れ子の @layer もあるので、見つからなくなるまで繰り返す。
    // 中身のない「@layer a, b, c;」（順番だけを決める行）は消す。
    let again = true;
    while (again) {
      again = false;
      root.walkAtRules('layer', (rule) => {
        if (rule.nodes && rule.nodes.length) rule.replaceWith(rule.nodes);
        else rule.remove();
        again = true;
      });
    }
  },
});
flattenLayers.postcss = true;

const config = {
  plugins: [
    ['@tailwindcss/postcss', {}],
    [flattenLayers, {}],
  ],
};

export default config;
