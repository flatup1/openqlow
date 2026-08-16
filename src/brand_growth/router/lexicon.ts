// Brand Growth Phase 1 Router: 言い回し辞書と決定論的スコアリング。
//
// なぜ作るか:
//   単純なキーワード一致は「子ども向けではなく初心者女性向け」を取り違える。
//   語を宣言的に並べ、打ち消し表現を見てから点数を付けることで、
//   同じ入力からは必ず同じ答えが出るまま、言い換えに強くする。
//
// 決め方:
//   1. 当たった語の重みを value ごとに合計する。
//   2. 合計が最大の value を選ぶ。
//   3. 同点なら「宣言順が先」を選ぶ（並び順が優先度そのもの）。
//
// このファイルは文字列処理だけを行う。I/O、ネットワーク、時刻、乱数を使わない。

import type { NormalizedInput } from "./normalize_input.js";

export interface Phrase<T> {
  readonly value: T;
  /** 判定に使う語。照合先は小文字化済みのため、必ず小文字で書く。 */
  readonly phrase: string;
  /** 同じ value の語が複数当たったら合計する。既定は 1。 */
  readonly weight?: number;
  /** 英字の短い語で、別語の一部に当たるのを避けたいとき true（例: online の中の line）。 */
  readonly boundary?: boolean;
}

export interface LexiconMatch<T> {
  readonly value: T;
  readonly score: number;
  /** 2位の点数。0 なら競合が無かったということ。 */
  readonly runner_up_score: number;
  readonly matched: readonly string[];
}

/**
 * 直後に来ると打ち消しになる語。
 * 「子ども向けではなく」のように、語と打ち消しの間に「向け」等が挟まるため窓で探す。
 */
const NEGATION_SUFFIXES: readonly string[] = [
  "ではなく",
  "ではない",
  "ではありません",
  "じゃなく",
  "じゃない",
  "でなく",
  "ではなくて",
];

/** 直前に来ると打ち消しになる語（英語）。 */
const NEGATION_PREFIXES: readonly string[] = ["not ", "no ", "instead of ", "rather than "];

/** 打ち消し語を探す窓の広さ（文字数）。広げすぎると別の文の打ち消しを拾う。 */
const NEGATION_SUFFIX_WINDOW = 10;
const NEGATION_PREFIX_WINDOW = 12;

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[a-z0-9]/.test(ch);
}

/** その出現が打ち消されているか。 */
export function isNegatedAt(haystack: string, start: number, length: number): boolean {
  const after = haystack.slice(start + length, start + length + NEGATION_SUFFIX_WINDOW);
  for (const suffix of NEGATION_SUFFIXES) {
    if (after.includes(suffix)) return true;
  }
  const before = haystack.slice(Math.max(0, start - NEGATION_PREFIX_WINDOW), start);
  for (const prefix of NEGATION_PREFIXES) {
    if (before.includes(prefix)) return true;
  }
  return false;
}

/** 語が「打ち消されずに」1回でも出てくるか。 */
function occursUnnegated(haystack: string, phrase: string, boundary: boolean): boolean {
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(phrase, from);
    if (at === -1) return false;
    from = at + 1;
    if (boundary) {
      const prev = haystack[at - 1];
      const next = haystack[at + phrase.length];
      if (isWordChar(prev) || isWordChar(next)) continue;
    }
    if (!isNegatedAt(haystack, at, phrase.length)) return true;
  }
}

/** 英字を含まない語は、空白を抜いた側でも探す（日本語の分かち書き揺れ対策）。 */
function hasAsciiLetter(phrase: string): boolean {
  return /[a-z]/.test(phrase);
}

function phraseMatches<T>(entry: Phrase<T>, normalized: NormalizedInput): boolean {
  const boundary = entry.boundary === true;
  if (occursUnnegated(normalized.text_lower, entry.phrase, boundary)) return true;
  if (!hasAsciiLetter(entry.phrase) && occursUnnegated(normalized.compact_lower, entry.phrase, false)) {
    return true;
  }
  return false;
}

/**
 * 辞書に照らして最も点数の高い値を返す。何も当たらなければ null。
 * 同点は宣言順で決めるため、結果は常に同じになる。
 */
export function scoreLexicon<T>(
  entries: readonly Phrase<T>[],
  normalized: NormalizedInput,
): LexiconMatch<T> | null {
  const scores = new Map<T, number>();
  const matched = new Map<T, string[]>();
  const firstIndex = new Map<T, number>();

  entries.forEach((entry, index) => {
    if (!firstIndex.has(entry.value)) firstIndex.set(entry.value, index);
    if (!phraseMatches(entry, normalized)) return;
    scores.set(entry.value, (scores.get(entry.value) ?? 0) + (entry.weight ?? 1));
    const list = matched.get(entry.value) ?? [];
    list.push(entry.phrase);
    matched.set(entry.value, list);
  });

  if (scores.size === 0) return null;

  let bestValue: T | null = null;
  let bestScore = 0;
  let runnerUp = 0;

  for (const [value, score] of scores) {
    if (bestValue === null) {
      bestValue = value;
      bestScore = score;
      continue;
    }
    const better =
      score > bestScore ||
      // 同点は宣言順が先の方を選ぶ。並び順が優先度そのもの。
      (score === bestScore && (firstIndex.get(value) ?? 0) < (firstIndex.get(bestValue) ?? 0));
    if (better) {
      runnerUp = Math.max(runnerUp, bestScore);
      bestValue = value;
      bestScore = score;
    } else {
      runnerUp = Math.max(runnerUp, score);
    }
  }

  if (bestValue === null) return null;
  return {
    value: bestValue,
    score: bestScore,
    runner_up_score: runnerUp,
    matched: Object.freeze([...(matched.get(bestValue) ?? [])].sort()),
  };
}

/**
 * 点数から confidence を決める。
 * 競合が無ければ強く、競合と僅差なら弱くする。閾値は固定で、入力ごとに変わらない。
 */
export function confidenceFromMatch<T>(match: LexiconMatch<T>): number {
  if (match.runner_up_score === 0) return 0.92;
  if (match.score >= match.runner_up_score * 2) return 0.9;
  return 0.8;
}

/** 単発の語が「打ち消されずに」出てくるかだけを見る（分類ではなく検知用）。 */
export function anyPhrasePresent(phrases: readonly string[], normalized: NormalizedInput): boolean {
  return phrases.some(phrase => phraseMatches({ value: true, phrase }, normalized));
}

/**
 * 当たった値を宣言順で全部返す（重複なし）。
 * 「TikTokにも出したい」のように、1つに絞らず複数を残したい軸で使う。
 */
export function matchedValues<T>(entries: readonly Phrase<T>[], normalized: NormalizedInput): readonly T[] {
  const found: T[] = [];
  for (const entry of entries) {
    if (found.includes(entry.value)) continue;
    if (phraseMatches(entry, normalized)) found.push(entry.value);
  }
  return Object.freeze(found);
}
