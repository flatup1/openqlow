/**
 * 短い申込URL（/a/コード）の決まり。Worker（worker/）と、テストが同じものを使う（準備画面は使わない。操作キーを扱わないため）。
 *
 * 短いURLは「行き先（申込ページのURL）」を Cloudflare の小さな箱に入れて作る。
 * 行き先にできるのは、申込ページ（/apply/#…）だけ。よその場所へ転送する道具にならないよう、ここで止める。
 *
 * どの大会の・本番かテストか（＝どの短いURLの枠か）は、行き先のリンクの中身（#のあと）から決める（shortLinkSlot）。
 * 入力欄の大会IDや、画面が決めたモードは使わない：使うと、別の大会の短いURLをうっかり上書きしたり、
 * テスト用のURLが、配ったあとの本番の短いURLの行き先になってしまうため。
 */

import { isValidEventId } from './eventId.ts';
import { LINK_END_KEY, publicEntryConfig, publicEntryLinkCut, publicEntryReady } from './publicEntry.ts';

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

/** 枠の名前＝「大会ID:モード」。箱に入れてよい形（大会IDは eventId.ts と同じ字種） */
export const SHORT_LINK_SLOT_PATTERN = /^[a-z0-9][a-z0-9-]{1,47}:(?:live|test)$/;

export type ShortLinkSlot =
  | { ok: true; slot: string; eventId: string; mode: 'live' | 'test'; title: string; href: string }
  | { ok: false; reason: 'target' | 'cut' | 'event' };

/**
 * 行き先のURLから、短いURLの枠（大会ID:モード）を決める。決めるのは、リンクの中身だけ。
 * - 'target'：申込ページのURLではない（isShortLinkTarget に合わない）
 * - 'cut'   ：リンクが完成していない（途中で切れている・最後の目印 end=1 が無い・受付のURLや本番/テストが読めない）
 * - 'event' ：大会IDが読めない
 * 通ったときの href は、URLとして整えた形（途中の改行・タブは取れる）。箱にも転送にも、この形を使う。
 */
export function shortLinkSlot(raw: string): ShortLinkSlot {
  if (!isShortLinkTarget(raw)) return { ok: false, reason: 'target' };
  const url = new URL(raw);
  const hash = url.hash;
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (publicEntryLinkCut(hash) || params.get(LINK_END_KEY) !== '1') return { ok: false, reason: 'cut' };
  const config = publicEntryConfig(hash);
  if (!publicEntryReady(config) || (config.mode !== 'live' && config.mode !== 'test')) return { ok: false, reason: 'cut' };
  // 大会IDは、リンクに書いてある文字そのものを使う（空のとき publicEntryConfig が入れる既定の名前は、使わない：空のリンクどうしが、同じ枠になってしまう）
  const eventId = (params.get('eventId') ?? '').trim().toLowerCase();
  if (!isValidEventId(eventId)) return { ok: false, reason: 'event' };
  return { ok: true, slot: eventId + ':' + config.mode, eventId, mode: config.mode, title: config.title.slice(0, 120), href: url.href };
}
