/**
 * 申し込みのリンクの署名（オーナー 2026-10-25「署名つきリンクにする」）。
 *
 * ねらい：申し込みのページは、リンクの中の送り先（Googleの受付のURL）へ、選手の情報を送る。
 * だれでも、自分のGoogleの受付を送り先にしたリンクを作れてしまうので、主催者のパソコンで作ったリンクだけを使えるようにする。
 *
 * しくみ：主催者のパソコン（「選手の受付をつくる」の画面）で、1回だけ鍵を作る（ECDSA P-256）。
 * 秘密の鍵は、そのブラウザの中だけにあり、取り出せない（extractable=false）。公開用の文字（下の TRUSTED_LINK_KEYS に入れる）は、だれに見られても大丈夫。
 * リンクを作るとき、# のあとの文字（sig を除いたもの）に署名して、最後の end=1 の すぐ前に sig=… を入れる。
 * 申し込みのページは、TRUSTED_LINK_KEYS のどれかの鍵で、署名を確かめる。合わない・無いリンクは、途中で切れたリンクと同じに止める。
 *
 * TRUSTED_LINK_KEYS が空のあいだは、今までどおり（署名なしでも使える）。鍵を登録して公開しなおした時から、署名のないリンクは使えない。
 */

/** リンクの中の署名の名前 */
export const LINK_SIG_KEY = 'sig';

/**
 * 使ってよい鍵（公開用の文字）。主催者が「選手の受付をつくる」の画面で作った鍵の、公開用の文字をここに入れて、公開しなおす。
 * 1つも無いときは、署名を確かめない（今までどおり）。
 */
export const TRUSTED_LINK_KEYS: readonly string[] = [];

const ALGO = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGN_ALGO = { name: 'ECDSA', hash: 'SHA-256' } as const;
const SIG_PART = /&sig=([A-Za-z0-9_-]{1,200})(?=&end=1$)/;
const KEY_TEXT = /^[A-Za-z0-9_-]{87}$/;

export function toBase64Url(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const raw = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
    const bytes = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** 公開用の文字の形（P-256 の公開鍵 65バイトを base64url にした87字）か */
export function isLinkKeyText(text: string): boolean {
  if (!KEY_TEXT.test(text)) return false;
  const bytes = fromBase64Url(text);
  return bytes !== null && bytes.length === 65 && bytes[0] === 4;
}

/** リンク（# から）を、署名した文字と署名に分ける。署名が無い・形がちがうときは sig は null */
export function splitSignedHash(hash: string): { body: string; sig: string | null } {
  const match = SIG_PART.exec(hash);
  if (!match) return { body: hash, sig: null };
  return { body: hash.slice(0, match.index) + hash.slice(match.index + match[0].length), sig: match[1] };
}

/** 署名を、リンクの最後の end=1 の すぐ前に入れる（途中で切れたら、end と いっしょに無くなる）。end=1 で終わらないリンクには入れない */
export function withSignature(hash: string, sig: string): string {
  if (!/&end=1$/.test(hash)) throw new Error('リンクの形がちがいます（最後に end=1 がありません）。');
  return hash.replace(/&end=1$/, '&' + LINK_SIG_KEY + '=' + sig + '&end=1');
}

const bodyBytes = (body: string): Uint8Array<ArrayBuffer> => new Uint8Array(new TextEncoder().encode(body.replace(/^#/, '')));

/** 新しい鍵を作る。秘密の鍵は取り出せない。公開用の文字もいっしょに返す */
export async function createLinkKey(subtle: SubtleCrypto = globalThis.crypto.subtle): Promise<{ privateKey: CryptoKey; publicText: string }> {
  const pair = await subtle.generateKey(ALGO, false, ['sign', 'verify']) as CryptoKeyPair;
  const raw = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
  return { privateKey: pair.privateKey, publicText: toBase64Url(raw) };
}

/** リンク（publicEntryHash が作った、# から end=1 まで）に署名して、署名つきのリンクを返す */
export async function signLinkHash(hash: string, privateKey: CryptoKey, subtle: SubtleCrypto = globalThis.crypto.subtle): Promise<string> {
  const { body } = splitSignedHash(hash);
  const sig = new Uint8Array(await subtle.sign(SIGN_ALGO, privateKey, bodyBytes(body)));
  return withSignature(body, toBase64Url(sig));
}

/**
 * 申し込みのページで使う：このリンクを使ってよいか。投げない。
 * - 使ってよい鍵（keys）が1つも無い：true（今までどおり）。
 * - 鍵があるのに、署名が無い・合わない・このブラウザで確かめられない：false（送り先が主催者のものか分からないので、止める）。
 */
export async function linkSignatureOk(hash: string, keys: readonly string[] = TRUSTED_LINK_KEYS, subtle: SubtleCrypto | null | undefined = globalThis.crypto?.subtle): Promise<boolean> {
  if (keys.length === 0) return true;
  try {
    const { body, sig } = splitSignedHash(hash);
    if (!sig || !subtle) return false;
    const sigBytes = fromBase64Url(sig);
    if (!sigBytes || sigBytes.length !== 64) return false;
    for (const keyText of keys) {
      const raw = isLinkKeyText(keyText) ? fromBase64Url(keyText) : null;
      if (!raw) continue;
      const key = await subtle.importKey('raw', raw, ALGO, false, ['verify']);
      if (await subtle.verify(SIGN_ALGO, key, sigBytes, bodyBytes(body))) return true;
    }
    return false;
  } catch {
    return false;
  }
}
