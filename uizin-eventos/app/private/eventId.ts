// 大会番号（URL の ?event= の値）の決まり。保存形式（core/privateTournament.ts の正規表現）と同じ範囲に収める。
// 画面にも通信にも依存しない。準備の画面と「受付をつくる」画面が同じ規則を使う。

/** 保存してよい大会番号。core/privateTournament.ts の isLocalTournament と同じ */
export const EVENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const DEFAULT_EVENT_ID = 'my-tournament';

/**
 * 大会番号を、使える形に直す。
 * NFKC → 小文字 → 英数字と - 以外は - → 連続する - を1つ → 前後の - を除く → 64文字まで → 空なら既定
 */
export function normalizeEventId(raw: string | null | undefined): string {
  const text = String(raw ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return text || DEFAULT_EVENT_ID;
}

export const isValidEventId = (value: string): boolean => EVENT_ID_PATTERN.test(value);

/** 新しい大会の番号。例: taikai-lq3k9x2a（英小文字と数字だけ） */
export const newEventId = (now: number): string => 'taikai-' + Math.max(0, Math.floor(now)).toString(36);
