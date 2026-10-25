import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createLinkKey, fromBase64Url, isLinkKeyText, linkSignatureOk, signLinkHash, splitSignedHash, toBase64Url, TRUSTED_LINK_KEYS, withSignature } from '../core/linkSign.ts';
import { publicEntryConfig, publicEntryHash, publicEntryLinkCut, publicEntryReady, type PublicEntryConfig } from '../core/publicEntry.ts';
import { shortLinkSlot } from '../core/shortLink.ts';

/*
  署名つきの申し込みリンク（オーナー 2026-10-25「署名つきリンクにする」）。
  主催者のパソコンで作った鍵で署名したリンクだけを、申し込みのページが使う。鍵をサイトに登録するまでは、今までどおり。
*/
const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const cfg: PublicEntryConfig = { endpoint: 'https://script.google.com/macros/s/AKfycbxREAL/exec', eventId: 'sign-cup', title: '架空大会', organizer: '架空主催', date: '2027年10月3日', venue: '架空体育館', venueUrl: '', deadline: '2099-11-30', contact: '連絡先', music: false, grade: 'optional', age: 'required', comment: 'optional', protocol: '3', mode: 'live' };
const swap = (link: string, key: string, value: string) => { const params = new URLSearchParams(link.replace(/^#/, '').replace(/&sig=[^&]*/, '')); params.set(key, value); const plain = '#' + params.toString(); const sig = splitSignedHash(link).sig ?? ''; return withSignature(plain.replace(/&end=1$/, '') + '&end=1', sig); };

test('1 鍵を作る：秘密の鍵は取り出せない。公開用の文字は87字（P-256 の公開鍵 65バイト）', async () => {
  const key = await createLinkKey();
  assert.equal(key.privateKey.extractable, false);
  assert.equal(key.privateKey.type, 'private');
  assert.ok(isLinkKeyText(key.publicText), key.publicText);
  assert.equal(fromBase64Url(key.publicText)?.length, 65);
  assert.equal(isLinkKeyText(key.publicText.slice(1)), false);
  assert.equal(isLinkKeyText('A'.repeat(87)), false, '04 で始まらない文字は、鍵ではない');
  assert.deepEqual([...fromBase64Url(toBase64Url(new Uint8Array([0, 255, 62, 63])))!], [0, 255, 62, 63]);
});

test('2 署名は end=1 の すぐ前に入る。切れ検出・設定の読み取り・短いURLは、署名なしと同じに動く', async () => {
  const key = await createLinkKey();
  const plain = publicEntryHash(cfg);
  const signed = await signLinkHash(plain, key.privateKey);
  assert.match(signed, /&sig=[A-Za-z0-9_-]{86}&end=1$/);
  assert.equal(splitSignedHash(signed).body, plain);
  assert.equal(publicEntryLinkCut(signed), false);
  assert.deepEqual(publicEntryConfig(signed), publicEntryConfig(plain));
  assert.ok(publicEntryReady(publicEntryConfig(signed)));
  const slot = shortLinkSlot('https://tournament-os-v3.pages.dev/apply/' + signed);
  assert.ok(slot.ok && slot.slot === 'sign-cup:live', JSON.stringify(slot));
  assert.ok(slot.ok && slot.href.endsWith(signed), '短いURLの行き先にも、署名がそのまま残る');
  // 署名し直しても、二重には付かない
  const again = await signLinkHash(signed, key.privateKey);
  assert.equal((again.match(/&sig=/g) ?? []).length, 1);
});

test('3 申し込みのページの確かめ：登録した鍵の署名だけを通す。書きかえ・署名なし・ちがう鍵・切れは止める', async () => {
  const key = await createLinkKey(), other = await createLinkKey();
  const keys = [key.publicText];
  const signed = await signLinkHash(publicEntryHash(cfg), key.privateKey);
  assert.equal(await linkSignatureOk(signed, keys), true);
  assert.equal(await linkSignatureOk(signed, [other.publicText, key.publicText]), true, '鍵が2つ登録してあっても通る');
  assert.equal(await linkSignatureOk(publicEntryHash(cfg), keys), false, '署名なし');
  assert.equal(await linkSignatureOk(swap(signed, 'endpoint', 'https://script.google.com/macros/s/AKfycbxEVIL/exec'), keys), false, '送り先の書きかえ');
  assert.equal(await linkSignatureOk(swap(signed, 'title', '別の大会'), keys), false, '大会名の書きかえ');
  assert.equal(await linkSignatureOk(swap(signed, 'mode', 'test'), keys), false, '本番/テストの書きかえ');
  assert.equal(await linkSignatureOk(await signLinkHash(publicEntryHash(cfg), other.privateKey), keys), false, '登録していない鍵の署名');
  assert.equal(await linkSignatureOk(signed.replace(/&sig=[^&]*&end=1$/, ''), keys), false, '後ろが切れた');
  assert.equal(await linkSignatureOk(signed + '&endpoint=https://evil.example/', keys), false, '後ろに足した');
  assert.equal(await linkSignatureOk(signed.replace(/&sig=([A-Za-z0-9_-])/, (_m, c) => '&sig=' + (c === 'A' ? 'B' : 'A')), keys), false, '署名を1字変えた');
  assert.equal(await linkSignatureOk(signed, keys, null), false, '確かめられないブラウザでは、止める');
  assert.equal(await linkSignatureOk(signed, ['not-a-key']), false);
});

test('4 鍵を1つも登録していないあいだは、今までどおり（署名なしも、署名つきも使える）', async () => {
  const key = await createLinkKey();
  assert.equal(await linkSignatureOk(publicEntryHash(cfg), []), true);
  assert.equal(await linkSignatureOk(await signLinkHash(publicEntryHash(cfg), key.privateKey), []), true);
  for (const text of TRUSTED_LINK_KEYS) assert.ok(isLinkKeyText(text), '登録した鍵は、正しい形: ' + text);
});

test('5 画面のつなぎ：申し込みのページは署名を確かめてから送る。準備の画面は、鍵があれば署名つきのリンクだけを渡す', () => {
  const apply = read('app/apply/page.tsx');
  assert.match(apply, /const needSig = TRUSTED_LINK_KEYS\.length > 0 && hash !== '' && hash !== '#';/);
  assert.match(apply, /pledgeCheckingRef\.current = Boolean\(next\.pledge\) \|\| needSig;/);
  assert.match(apply, /if \(!pledgeOk \|\| !sigOk\) setLinkCut\(true\);/);
  const setup = read('app/private/setup/page.tsx');
  assert.match(setup, /if \(!hash \|\| linkKey === undefined \|\| keyMissing\) return '';/);
  assert.match(setup, /return signed\[hash\] \? '\/apply\/' \+ signed\[hash\] : '';/);
  assert.match(setup, /const keyMissing = TRUSTED_LINK_KEYS\.length > 0 && linkKey !== undefined && !keyTrusted;/);
  const store = read('app/lib/linkKeyStore.ts');
  assert.doesNotMatch(store, /exportKey\([^)]*privateKey/, '秘密の鍵は取り出さない');
});
