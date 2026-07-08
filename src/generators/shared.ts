// 集客AI司令塔ジェネレータ群の共有ユーティリティ・正本値。
//
// inquiry_reply / trial_followup / ad_copy / site_audit が共通で使う:
//   - FLATUP_INFO（料金・スケジュール等の正本値）と共通型
//   - 正規表現述語（matchesAny / countMatches）
//   - AIKA 署名付きの本文組み立て（composeSigned）
//   - CLI のフラグ解析（parseFlags）と表示用セクション（section）
//
// 正本値・型をここに集約することで、各ジェネレータが互いに import し合う歪な依存を避ける。

export type Gender = "female" | "male" | "unknown";

/** 見込み客の属性分類 */
export type Attribute = "kids" | "women" | "men" | "parent_child" | "senior" | "beginner";

/** 温度感（入会への近さ） */
export type Temperature = "high" | "mid" | "low";

/**
 * FLATUP GYM 基本情報（正本値）。
 * 単一正本は `src/shared/canon.ts` の `FLATUP_CANON`。ここはその再エクスポート（二重管理しない）。
 * AIはこの値を勝手に変更してはいけない。料金改定時は `src/shared/canon.ts` だけを更新する。
 */
export { FLATUP_CANON as FLATUP_INFO } from "../shared/canon.js";

/** AIKA 返信の署名 */
export const AIKA_SIGN = "AIKA";

/** いずれかのパターンにマッチするか。 */
export function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(re => re.test(text));
}

/** マッチしたパターンの数を数える。 */
export function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);
}

/** 空行を除いた本文を改行で連結し、末尾に「AIKA」署名を付ける。 */
export function composeSigned(lines: string[]): string {
  return [...lines.filter(Boolean), AIKA_SIGN].join("\n");
}

/**
 * CLI 引数を `--key value` フラグと位置引数に分解する。
 * 値の無いフラグ（次が別フラグ/末尾）は空文字になる。
 */
export function parseFlags(argv: string[]): { flags: Record<string, string>; positional: string[] } {
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "";
      flags[key] = value;
    } else {
      positional.push(token);
    }
  }
  return { flags, positional };
}

/** CLI 表示用の「■ タイトル + 本文」セクション。 */
export function section(title: string, body: string): string {
  return `\n■ ${title}\n${body}`;
}
