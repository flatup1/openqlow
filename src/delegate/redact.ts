// 委任の安全弁: 外のAIへ渡す前に、秘密情報と個人情報を消す。
//
// なぜ作るか:
//   ChatGPT へ渡す文面は「社外へ出る文面」と同じ扱いにする。
//   鍵や顧客の連絡先が混ざったまま出したら取り返せない。
//   だから (1) 消す → (2) 既存ガードで確かめる → (3) 残っていたら送らない、の三段にする。
//
// 既存の src/shared/secret_guard.ts と src/shared/pii_guard.ts を「最後の確認」に使う。
// それらは「1件見つける」用なので、ここでは「全件置き換える」用の全域パターンを別に持つ。
// このファイルは文字列処理だけを行う。I/O、ネットワーク、時刻、乱数を使わない。

import { hasPii, scanPii } from "../shared/pii_guard.js";
import { hasSecret, scanText } from "../shared/secret_guard.js";

export interface Redaction {
  readonly kind: string;
  readonly count: number;
}

export interface RedactResult {
  readonly text: string;
  readonly redactions: readonly Redaction[];
}

/** 置き換え用の全域パターン。kind は secret_guard / pii_guard の名前に合わせる。 */
const GLOBAL_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = Object.freeze([
  ["private_key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g],
  ["openai_or_openrouter_key", /\bsk-(?:or-)?[A-Za-z0-9_-]{20,}\b/g],
  ["google_api_key", /\bAIza[0-9A-Za-z_-]{30,}\b/g],
  ["aws_access_key", /\bAKIA[0-9A-Z]{16}\b/g],
  ["github_token", /\bgh[pousr]_[0-9A-Za-z]{30,}\b/g],
  ["slack_token", /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g],
  ["bearer_jwt", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g],
  ["line_user_id", /\bU[0-9a-f]{32}\b/g],
  ["email", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
  ["phone", /\b0\d{1,4}[-‐－—][0-9]{1,4}[-‐－—][0-9]{3,4}\b/g],
]);

/**
 * 環境変数の値だけを消す（名前は残す）。
 * 名前が残ると「何の設定の話か」は伝わるので、委任の役に立つ。
 */
const ENV_ASSIGNMENT = /\b([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|KEY|PASSWORD|PASS|CREDENTIALS?))\s*[=:]\s*("[^"]+"|'[^']+'|\S+)/g;

function isPlaceholder(value: string): boolean {
  const bare = value.replace(/^["']|["']$/g, "");
  if (bare.length < 8) return true;
  // <your token> / ${VAR} / xxx… は本物ではない。
  return /^[<$]/.test(bare) || /^x+$/i.test(bare);
}

/** 秘密情報と個人情報を [REDACTED:種類] へ置き換える。 */
export function redactSensitive(input: string): RedactResult {
  const counts = new Map<string, number>();
  let text = input;

  text = text.replace(ENV_ASSIGNMENT, (whole, name: string, value: string) => {
    if (isPlaceholder(value)) return whole;
    counts.set("env_value", (counts.get("env_value") ?? 0) + 1);
    return `${name}=[REDACTED:env_value]`;
  });

  for (const [kind, pattern] of GLOBAL_PATTERNS) {
    text = text.replace(pattern, () => {
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
      return `[REDACTED:${kind}]`;
    });
  }

  const redactions = [...counts.entries()].map(([kind, count]) => Object.freeze({ kind, count }));
  return Object.freeze({ text, redactions: Object.freeze(redactions) });
}

export interface SafetyVerdict {
  readonly safe: boolean;
  /** 残ってしまった種類。safe が true なら空。 */
  readonly remaining: readonly string[];
}

/**
 * 消し切れたかを既存ガードで確かめる。
 * ここが false のものは送らない（安全側に倒す）。
 */
export function verifySafeToSend(text: string): SafetyVerdict {
  const remaining: string[] = [];
  if (hasSecret(text)) remaining.push(...scanText(text).map(f => f.kind));
  if (hasPii(text)) remaining.push(...scanPii(text).map(f => f.kind));
  return Object.freeze({
    safe: remaining.length === 0,
    remaining: Object.freeze([...new Set(remaining)]),
  });
}

/**
 * トークン数のおおよその見積り。
 *
 * 正確な数はモデル側にしか出せない。ここは「減ったかどうかを比べる」ための目安。
 * 日本語(CJK)は1文字≒1トークン、英数字は4文字≒1トークンで数える。
 * 実測値と混同しないよう、呼び出し側は必ず「概算」と表示する。
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  const cjk = text.match(/[　-ヿ㐀-䶿一-鿿豈-﫿＀-￯]/g)?.length ?? 0;
  const rest = text.length - cjk;
  return cjk + Math.ceil(rest / 4);
}
