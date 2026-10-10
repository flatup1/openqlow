/**
 * 当日用の一体型進行画面に、選手のデータを入れたままコミットさせない。
 *
 * 2026-09-21、このファイルに 48試合・実名88名・意気込み94件・体重・写真パスが
 * 埋め込まれた状態で、公開リポジトリに push された。
 * 発注者が最初に決めた「個人情報は一切入れない」に反する。
 *
 * このファイルは「型」だけを置く。当日は手元にコピーしてからデータを貼る。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('一体型進行画面に、選手のデータが埋め込まれていない', () => {
  const src = readFileSync(new URL('../standalone/index.html', import.meta.url), 'utf8');
  const start = src.indexOf('<script id="data" type="application/json">');
  assert.ok(start >= 0, 'データの置き場が見つからない');
  const from = start + '<script id="data" type="application/json">'.length;
  const body = src.slice(from, src.indexOf('</script>', from)).trim();

  assert.equal(
    body,
    '[]',
    'standalone/index.html に進行データが入っています。' +
      '選手名・意気込み・体重・写真は個人情報で、このリポジトリは公開されています。' +
      'データは手元のコピーにだけ貼り、コミットしないでください。',
  );
});
