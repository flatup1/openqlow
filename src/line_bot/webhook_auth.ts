import crypto from "node:crypto";

export interface SignatureOptions {
  /** LINE チャンネルシークレット（未設定なら "" ） */
  channelSecret: string;
  /** dry-run（既定 true）。本番送信モードでは false */
  dryRun: boolean;
}

/**
 * LINE Webhook の署名を検証する。
 *
 * - secret 設定済み: HMAC-SHA256 を timing-safe に照合（正しい署名のみ true）。
 * - secret 未設定:
 *     - dry-run（既定・ローカル検証）→ true（署名なしでも通す）
 *     - 本番送信モード（dryRun=false）→ false（fail-closed: secret 無しでは全拒否）
 *
 * 呼び出し側は content-type に関わらず必ずこれを通すこと。content-type で
 * 検証を分岐すると、application/json 以外で署名を回避できてしまう。
 */
export function verifyLineSignature(
  rawBody: string,
  signature: string | string[] | undefined,
  opts: SignatureOptions,
): boolean {
  if (!opts.channelSecret) {
    return opts.dryRun;
  }

  const expected = crypto.createHmac("sha256", opts.channelSecret).update(rawBody).digest("base64");
  const actual = Array.isArray(signature) ? signature[0] : signature;
  if (!actual) return false;
  if (Buffer.byteLength(expected) !== Buffer.byteLength(actual)) return false;

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}
