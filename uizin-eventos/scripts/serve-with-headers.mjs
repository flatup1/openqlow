#!/usr/bin/env node
/**
 * 公開用フォルダ（out-private-pages）を、手元（127.0.0.1）だけで配る、とても小さなサーバー。
 * python3 -m http.server と ちがうのは、フォルダの中の `_headers`（Cloudflare Pages の書き方）を読んで、
 * 本番と同じ安全の約束（CSP・Referrer-Policy・noindex など）を、返事に付けること。
 * → 画面の確認（scripts/test-*.mjs）が、本物の CSP の下でも通るかを確かめられる。
 *
 * 使い方:  node scripts/serve-with-headers.mjs <フォルダ> <ポート>
 *   例:    node scripts/serve-with-headers.mjs out-private-pages 4990
 * 外へは何も送らない。127.0.0.1 だけで待つ。止めるときは、プロセスを止める（Ctrl+C）。
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json',
  '.zip': 'application/zip', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** `_headers` を読む。書き方: 行頭から書いた行 = 道すじ（* は「なんでも」）、字下げした「名前: 値」の行 = その道すじに付ける見出し */
export function parseHeadersFile(text) {
  const blocks = [];
  let cur = null;
  for (const raw of String(text).split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (/^\s/.test(raw)) {
      const i = raw.indexOf(':');
      if (cur && i > 0) cur.headers.push([raw.slice(0, i).trim(), raw.slice(i + 1).trim()]);
    } else {
      const pattern = raw.trim();
      const source = '^' + pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$';
      cur = { pattern, regex: new RegExp(source), headers: [] };
      blocks.push(cur);
    }
  }
  return blocks;
}

/** 道すじに合う見出しを、全部あつめる（あとのほうが、同じ名前を上書きする） */
export function headersFor(blocks, pathname) {
  const out = new Map();
  for (const block of blocks) if (block.regex.test(pathname)) for (const [name, value] of block.headers) out.set(name, value);
  return [...out.entries()];
}

export function startServer(rootDir, port) {
  const root = resolve(rootDir);
  const headersPath = join(root, '_headers');
  const blocks = existsSync(headersPath) ? parseHeadersFile(readFileSync(headersPath, 'utf8')) : [];
  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      let pathname = decodeURIComponent(url.pathname);
      let file = normalize(join(root, pathname));
      if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403); res.end('forbidden'); return; }
      if (existsSync(file) && statSync(file).isDirectory()) {
        if (!pathname.endsWith('/')) { res.writeHead(301, { Location: pathname + '/' + url.search }); res.end(); return; }
        file = join(file, 'index.html');
        pathname = pathname + 'index.html';
      }
      if (!existsSync(file)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('not found'); return; }
      // 本番（Cloudflare）と同じく、「/private/live/」と「/private/live/index.html」の どちらにも、同じ見出しを付ける
      const headerPath = pathname.endsWith('/index.html') ? pathname.slice(0, -'index.html'.length) : pathname;
      const headers = { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' };
      for (const [name, value] of headersFor(blocks, headerPath)) headers[name] = value;
      res.writeHead(200, headers);
      res.end(readFileSync(file));
    } catch {
      res.writeHead(500); res.end('error');
    }
  });
  server.listen(port, '127.0.0.1');
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dir, portText] = process.argv.slice(2);
  const port = Number(portText);
  if (!dir || !Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('使い方: node scripts/serve-with-headers.mjs <フォルダ> <ポート>');
    process.exit(2);
  }
  if (!existsSync(dir)) { console.error('フォルダがありません: ' + dir); process.exit(2); }
  startServer(dir, port);
}
