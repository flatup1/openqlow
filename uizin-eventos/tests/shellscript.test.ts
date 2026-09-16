/**
 * シェルスクリプトが、日本語環境で壊れる書き方をしていないことを固定する。
 *
 * 実機（macOS）で go-live.sh が3回止まった。原因は1行だけ:
 *
 *   ok "ログイン済み（$ACCOUNT）"
 *                  ↑ 変数の直後が全角の「）」
 *
 * bash は $ACCOUNT の次のバイトを見て変数名の続きかを判断する。ロケールによっては
 * 全角「）」の先頭バイト(0xEF)を文字として扱い、変数名を ACCOUNT+1バイト と誤読して
 * 「ACCOUNT?: unbound variable」で止まる。
 *
 * このリポジトリのスクリプトは日本語メッセージだらけなので、同じ形は必ずまた書く。
 * 人間のレビューでは見つけられない（見た目が完全に正常）ので、テストで止める。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SCRIPTS_DIR = new URL('../scripts/', import.meta.url).pathname;

/** $VAR の直後に非ASCIIバイトが続く箇所（${VAR} で囲えば安全なので、囲っていないものだけ） */
const RISKY = /\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7F]/;

/** .command は Mac のダブルクリック用。中身は同じ bash なので、同じ罠を踏む */
function shellScripts(): string[] {
  return readdirSync(SCRIPTS_DIR).filter((f) => f.endsWith('.sh') || f.endsWith('.command'));
}

test('シェルスクリプト: 変数の直後に全角文字を置いていない', () => {
  const offenders: string[] = [];
  for (const file of shellScripts()) {
    const lines = readFileSync(join(SCRIPTS_DIR, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (RISKY.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(
    offenders,
    [],
    '変数の直後が全角文字になっています。${VAR} で囲うか、直後を半角にしてください:\n' + offenders.join('\n'),
  );
});

test('シェルスクリプト: 失敗しても止まらない設定になっている', () => {
  for (const file of shellScripts()) {
    const src = readFileSync(join(SCRIPTS_DIR, file), 'utf8');
    assert.ok(src.includes('set -euo pipefail'), `${file} に set -euo pipefail がありません`);
  }
});
