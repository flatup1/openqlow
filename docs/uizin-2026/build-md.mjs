#!/usr/bin/env node
/* ------------------------------------------------------------------
   Markdown → A4印刷用HTML（引き継ぎ資料をPDFにするため）
   実行: node docs/uizin-2026/build-md.mjs <入力.md> [<入力.md> ...]
   出力: print/<同名>.html
   依存なし。この資料で使っている記法（見出し・表・箇条書き・引用・
   コードブロック・太字・リンク・区切り線）だけを扱う。
   ------------------------------------------------------------------ */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, basename, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'print');
mkdirSync(OUT, { recursive: true });

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/** 行内記法：**太字** / `コード` / [文字](URL) */
function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

/** 表の区切り行から各列の寄せを読む: ---: 右 / :---: 中央 / それ以外 左 */
const alignOf = (cell) => {
  const c = cell.trim();
  if (c.startsWith(':') && c.endsWith(':')) return 'center';
  if (c.endsWith(':')) return 'right';
  return 'left';
};

const splitRow = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');

function mdToHtml(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let para = [];
  let list = null; // {tag, items}
  let quote = [];

  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map((t) => `<li>${inline(t)}</li>`).join('')}</${list.tag}>`); list = null; } };
  const flushQuote = () => { if (quote.length) { out.push(`<blockquote>${quote.map(inline).join('<br>')}</blockquote>`); quote = []; } };
  const flush = () => { flushPara(); flushList(); flushQuote(); };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // コードブロック
    if (/^```/.test(line.trim())) {
      flush();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) buf.push(lines[i++]);
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }

    // 表
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      flush();
      const head = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map(alignOf);
      i += 2;
      const body = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) body.push(splitRow(lines[i++]));
      i--;
      const th = head.map((c, n) => `<th style="text-align:${aligns[n] ?? 'left'}">${inline(c.trim())}</th>`).join('');
      const tr = body.map((r) => `<tr>${r.map((c, n) => `<td style="text-align:${aligns[n] ?? 'left'}">${inline(c.trim())}</td>`).join('')}</tr>`).join('');
      out.push(`<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`);
      continue;
    }

    // 見出し
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { flush(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }

    // 区切り線
    if (/^\s*---+\s*$/.test(line)) { flush(); out.push('<hr>'); continue; }

    // 引用
    const q = line.match(/^>\s?(.*)$/);
    if (q) { flushPara(); flushList(); quote.push(q[1]); continue; }

    // 箇条書き
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul || ol) {
      flushPara(); flushQuote();
      const tag = ul ? 'ul' : 'ol';
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push((ul ?? ol)[1]);
      continue;
    }

    // 空行
    if (!line.trim()) { flush(); continue; }

    // 段落
    flushList(); flushQuote();
    para.push(line.trim());
  }
  flush();
  return out.join('\n');
}

const CSS = `
  @page { size: A4 portrait; margin: 14mm 15mm 15mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", "YuGothic", "Meiryo",
                 "Noto Sans JP", "IPAPGothic", "IPAGothic", sans-serif;
    color: #000; background: #fff; margin: 0;
    font-size: 10pt; line-height: 1.7;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .doc { max-width: 180mm; margin: 0 auto; padding: 0 0 10mm; }
  h1 { font-size: 17pt; line-height: 1.4; border-bottom: 2.4px solid #000; padding-bottom: 2mm; margin: 0 0 5mm; }
  h2 { font-size: 13pt; background: #000; color: #fff; padding: 1.2mm 3mm; margin: 8mm 0 3mm; page-break-after: avoid; break-after: avoid; }
  h3 { font-size: 11.5pt; border-left: 4px solid #000; padding-left: 2.5mm; margin: 5mm 0 2mm; page-break-after: avoid; break-after: avoid; }
  h4 { font-size: 10.5pt; margin: 4mm 0 1.5mm; page-break-after: avoid; break-after: avoid; }
  p { margin: 0 0 2.5mm; }
  ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
  li { margin-bottom: .8mm; }
  strong { font-weight: 700; }
  a { color: #000; }
  hr { border: none; border-top: 1px solid #bbb; margin: 6mm 0; }
  blockquote {
    border-left: 4px solid #000; background: #f2f2f2;
    padding: 2mm 3.5mm; margin: 0 0 3.5mm; font-size: 9.6pt;
    page-break-inside: avoid; break-inside: avoid;
  }
  table {
    width: 100%; border-collapse: collapse; margin: 0 0 4mm; font-size: 9.4pt;
    page-break-inside: avoid; break-inside: avoid;
  }
  th, td { border: 1px solid #000; padding: 1.2mm 2mm; vertical-align: top; }
  th { background: #000; color: #fff; font-weight: 700; }
  pre {
    background: #f2f2f2; border: 1px solid #999; padding: 2.5mm 3mm;
    margin: 0 0 4mm; overflow: hidden;
    page-break-inside: avoid; break-inside: avoid;
  }
  pre code { font-family: "SFMono-Regular", Consolas, "Courier New", monospace; font-size: 8.6pt; line-height: 1.5; white-space: pre-wrap; }
  code { font-family: "SFMono-Regular", Consolas, "Courier New", monospace; font-size: 9pt; background: #eee; padding: 0 .8mm; }
  @media screen { body { background: #eee; } .doc { background: #fff; max-width: 210mm; padding: 14mm 15mm; margin: 8mm auto; box-shadow: 0 2px 14px rgba(0,0,0,.25); } }
`;

for (const arg of process.argv.slice(2)) {
  const src = resolve(arg);
  const md = readFileSync(src, 'utf8');
  const title = (md.match(/^#\s+(.*)$/m)?.[1] ?? basename(src, extname(src))).replace(/[*`]/g, '');
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="doc">
${mdToHtml(md)}
</div>
</body>
</html>
`;
  const outFile = join(OUT, `${basename(src, extname(src))}.html`);
  writeFileSync(outFile, html, 'utf8');
  console.log(`wrote print/${basename(outFile)} (${html.length} bytes)`);
}
