/**
 * 短い申込URL（/a/コード）の決まり。Worker（worker/）と、テストが同じものを使う（準備画面は使わない。操作キーを扱わないため）。
 *
 * 短いURLは「行き先（申込ページのURL）」を Cloudflare の小さな箱に入れて作る。
 * 行き先にできるのは、申込ページ（/apply/#…）だけ。よその場所へ転送する道具にならないよう、ここで止める。
 */

/** 申込ページを置いている Cloudflare Pages のドメイン。その下の別名（プレビュー）も許す。ドメインを変えたら、ここも直す */
export const SHORT_LINK_HOSTS: readonly string[] = ['tournament-os-v3.pages.dev'];

/** コードに使う字。読み間違えやすい 0・1・i・l・o は入れない（LINEで手で打つことがあるため） */
export const SHORT_CODE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
export const SHORT_CODE_LENGTH = 8;
export const SHORT_CODE_PATTERN = /^[2-9a-hjkmnp-z]{8}$/;

const TARGET_MAX_LENGTH = 8000;

/** 乱数のバイトを、コードの字に変える。256は31で割り切れないので、余る範囲（248以上）は捨てる。字の出やすさをそろえるため */
export function shortCodeChars(bytes: ArrayLike<number>): string {
  const size = SHORT_CODE_ALPHABET.length;
  const limit = 256 - (256 % size);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] < limit) out += SHORT_CODE_ALPHABET[bytes[i] % size];
  }
  return out;
}

/** 行き先に使ってよいのは、https の申込ページ（/apply/ にハッシュ付き）だけ */
export function isShortLinkTarget(raw: string): boolean {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > TARGET_MAX_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  const onHost = SHORT_LINK_HOSTS.some((name) => host === name || host.endsWith('.' + name));
  return url.protocol === 'https:' && url.username === '' && url.password === '' && url.port === ''
    && onHost && url.pathname === '/apply/' && url.hash.length > 1;
}
