// 委任ルーター: 1行の依頼文から「どちらのAIに考えさせるか」を決める。
//
// なぜ作るか:
//   毎回人間が「これはChatGPT向き」と考えるのをやめたい。
//   同じ文からは必ず同じ答えが出る（決定的）ようにして、後から理由を追えるようにする。
//
// このファイルは文字列処理だけを行う。I/O、ネットワーク、時刻、乱数を使わない。
// 既存の Router 辞書（src/brand_growth/router/lexicon.ts）を再利用する。作り直さない。

import {
  anyPhrasePresent,
  confidenceFromMatch,
  matchedValues,
  scoreLexicon,
  type Phrase,
} from "../brand_growth/router/lexicon.js";
import { normalizeText, type NormalizedInput } from "../brand_growth/router/normalize_input.js";
import {
  DELEGATE_ROUTER_VERSION,
  ENGINE_BY_TASK_KIND,
  type ApprovalReason,
  type DelegateDecision,
  type Engine,
  type TaskKind,
} from "./contracts.js";

/** 依頼文をそろえる。CreativeInput を経由せずに文字列から作る。 */
export function normalizeQuestion(raw: string): NormalizedInput {
  const text = normalizeText(raw);
  const textLower = text.toLowerCase();
  return {
    raw_text: raw,
    text,
    text_lower: textLower,
    compact_lower: textLower.replace(/\s+/g, ""),
  };
}

/**
 * 依頼の種類を決める語。
 *
 * 並び順が優先度そのもの（同点なら先に書いた方が勝つ）。
 * 考える仕事を先に並べ、手を動かす仕事を後に並べる。
 * weight 3 は「してほしい動作」そのもの、2 は「ほぼ決まり」、1 は「弱い手がかり」。
 * 動詞は名詞より強くする。「この設計をレビューして」は設計の話だが、頼まれているのはレビューだから。
 */
const TASK_PHRASES: readonly Phrase<TaskKind>[] = Object.freeze([
  // --- 考える仕事（ChatGPT へ） ---
  { value: "plan", phrase: "計画", weight: 2 },
  { value: "plan", phrase: "設計", weight: 2 },
  { value: "plan", phrase: "段取り", weight: 2 },
  { value: "plan", phrase: "ロードマップ", weight: 2 },
  { value: "plan", phrase: "進め方", weight: 2 },
  { value: "plan", phrase: "方針" },
  { value: "plan", phrase: "手順" },
  { value: "plan", phrase: "戦略" },
  { value: "plan", phrase: "どうすれば" },
  { value: "plan", phrase: "次の一手" },

  { value: "review", phrase: "レビューして", weight: 3 },
  { value: "review", phrase: "採点して", weight: 3 },
  { value: "review", phrase: "添削して", weight: 3 },
  { value: "review", phrase: "レビュー", weight: 2 },
  { value: "review", phrase: "採点", weight: 2 },
  { value: "review", phrase: "添削", weight: 2 },
  { value: "review", phrase: "指摘", weight: 2 },
  { value: "review", phrase: "評価して" },
  { value: "review", phrase: "改善案" },
  { value: "review", phrase: "点数" },

  { value: "explain", phrase: "説明して", weight: 3 },
  { value: "explain", phrase: "説明", weight: 2 },
  { value: "explain", phrase: "教えて", weight: 2 },
  { value: "explain", phrase: "なぜ", weight: 2 },
  { value: "explain", phrase: "違いは" },
  { value: "explain", phrase: "比較" },
  { value: "explain", phrase: "意味" },
  { value: "explain", phrase: "理由" },
  { value: "explain", phrase: "わかりやすく" },

  { value: "write", phrase: "台本", weight: 2 },
  { value: "write", phrase: "文章", weight: 2 },
  { value: "write", phrase: "下書き", weight: 2 },
  { value: "write", phrase: "コピーを", weight: 2 },
  { value: "write", phrase: "構文", weight: 2 },
  { value: "write", phrase: "案を出して", weight: 2 },
  { value: "write", phrase: "セリフ" },
  { value: "write", phrase: "キャッチ" },

  // --- 手を動かす仕事（Claude Code へ） ---
  { value: "edit", phrase: "実装して", weight: 3 },
  { value: "edit", phrase: "直して", weight: 3 },
  { value: "edit", phrase: "実装", weight: 2 },
  { value: "edit", phrase: "修正", weight: 2 },
  { value: "edit", phrase: "リファクタ", weight: 2 },
  { value: "edit", phrase: "追加して", weight: 2 },
  { value: "edit", phrase: "書き換えて", weight: 2 },
  { value: "edit", phrase: "ファイル" },
  { value: "edit", phrase: "コードを" },

  { value: "verify", phrase: "テストして", weight: 3 },
  { value: "verify", phrase: "テスト", weight: 2 },
  { value: "verify", phrase: "型チェック", weight: 2 },
  { value: "verify", phrase: "typecheck", weight: 2, boundary: true },
  { value: "verify", phrase: "lint", weight: 2, boundary: true },
  { value: "verify", phrase: "緑にして", weight: 2 },
  { value: "verify", phrase: "検証" },

  { value: "run", phrase: "実行して", weight: 3 },
  { value: "run", phrase: "実行", weight: 2 },
  { value: "run", phrase: "動かして", weight: 2 },
  { value: "run", phrase: "ビルド", weight: 2 },
  { value: "run", phrase: "npm run", weight: 2 },
  { value: "run", phrase: "書き出し", weight: 2 },
  { value: "run", phrase: "生成して" },

  { value: "repo", phrase: "差分", weight: 2 },
  { value: "repo", phrase: "diff", weight: 2, boundary: true },
  { value: "repo", phrase: "ブランチ", weight: 2 },
  { value: "repo", phrase: "git", weight: 2, boundary: true },
  { value: "repo", phrase: "ログを" },
]);

/**
 * 人間承認が要る操作の語。承認行列に対応する。
 * ここは「engine の判定」とは独立に見る（ChatGPT へ回す依頼でも承認は要る）。
 */
const APPROVAL_PHRASES: readonly Phrase<ApprovalReason>[] = Object.freeze([
  { value: "send", phrase: "送信" },
  { value: "send", phrase: "返信して" },
  { value: "send", phrase: "line で送" },
  { value: "publish", phrase: "公開" },
  { value: "publish", phrase: "投稿" },
  { value: "publish", phrase: "アップロード" },
  { value: "booking", phrase: "予約確定" },
  { value: "booking", phrase: "予約を確定" },
  { value: "money", phrase: "料金" },
  { value: "money", phrase: "値段" },
  { value: "money", phrase: "返金" },
  { value: "money", phrase: "課金" },
  { value: "money", phrase: "決済" },
  { value: "membership", phrase: "退会" },
  { value: "membership", phrase: "休会" },
  { value: "production", phrase: "本番" },
  { value: "production", phrase: "デプロイ" },
  { value: "production", phrase: "リリース" },
  { value: "git_write", phrase: "コミット" },
  { value: "git_write", phrase: "commit", boundary: true },
  { value: "git_write", phrase: "push", boundary: true },
  { value: "git_write", phrase: "プッシュ" },
  { value: "git_write", phrase: "pr を" },
  { value: "git_write", phrase: "プルリク" },
]);

/** 本人が engine を明示したときの合図。 */
const FORCE_CHATGPT: readonly string[] = Object.freeze([
  "chatgptに依頼",
  "chatgptに聞いて",
  "chatgptにお願い",
  "chatgpt:",
  "gptに依頼",
]);

const FORCE_CLAUDE: readonly string[] = Object.freeze([
  "claudeに依頼",
  "claudeに聞いて",
  "claudeにお願い",
  "claude:",
  "自分でやって",
]);

/**
 * 先頭の合図かどうか。
 *
 * 合図の直後が区切り（: ： 、 , 空白）か文末でなければ合図と見なさない。
 * こうしないと「ChatGPTに依頼する方法を教えて」という“説明の依頼”を
 * 「ChatGPTに依頼」の合図と読み違えてしまう。
 */
function startsWithMarker(textLower: string, marker: string): boolean {
  if (!textLower.startsWith(marker)) return false;
  const next = textLower.slice(marker.length, marker.length + 1);
  return next === "" || /[\s:：,、]/.test(next);
}

/** 明示の合図を先頭から取り除く。委任先へ渡す本文を作るときに使う。 */
export function stripDelegatePrefix(raw: string): string {
  const normalized = normalizeQuestion(raw);
  for (const marker of [...FORCE_CHATGPT, ...FORCE_CLAUDE]) {
    if (!startsWithMarker(normalized.text_lower, marker)) continue;
    // 合図の直後に来る「：」「:」「、」と空白を落とす。
    return normalized.text.slice(marker.length).replace(/^[\s:：,、]+/, "");
  }
  return normalized.text;
}

function forcedEngine(normalized: NormalizedInput): Engine | null {
  if (FORCE_CHATGPT.some(marker => startsWithMarker(normalized.text_lower, marker))) return "chatgpt";
  if (FORCE_CLAUDE.some(marker => startsWithMarker(normalized.text_lower, marker))) return "claude";
  return null;
}

/**
 * 依頼文から委任先を決める。
 *
 * 決め方:
 *   1. 先頭に明示の合図があれば、それに従う（confidence 1.0）。
 *   2. なければ辞書の点数で TaskKind を決め、対応表で engine を引く。
 *   3. 何も当たらなければ unknown＝Claude に残す（勝手に外へ出さない）。
 * 承認が要る語は 1〜3 と無関係に必ず記録する。
 */
export function classifyDelegation(raw: string): DelegateDecision {
  const normalized = normalizeQuestion(raw);
  const approvalReasons = matchedValues(APPROVAL_PHRASES, normalized);
  const match = scoreLexicon(TASK_PHRASES, normalized);
  const forced = forcedEngine(normalized);

  const lexiconKind: TaskKind = match?.value ?? "unknown";
  let taskKind = lexiconKind;
  let engine = ENGINE_BY_TASK_KIND[lexiconKind];
  let confidence = match === null ? 0.3 : confidenceFromMatch(match);
  let source: DelegateDecision["source"] = match === null ? "default" : "lexicon";

  if (forced !== null) {
    engine = forced;
    source = "explicit_prefix";
    confidence = 1;
    // 辞書の種類が明示と食い違うときは、代表的な種類に置き換える。
    // 例: 「ChatGPTに依頼：テストの直し方」→ verify(Claude) ではなく explain(ChatGPT)。
    if (ENGINE_BY_TASK_KIND[lexiconKind] !== forced) {
      taskKind = forced === "chatgpt" ? "explain" : "run";
    }
  }

  return Object.freeze({
    task_kind: taskKind,
    engine,
    confidence,
    source,
    matched: Object.freeze([...(match?.matched ?? [])]),
    approval_reasons: approvalReasons,
    requires_human_approval: approvalReasons.length > 0,
    router_version: DELEGATE_ROUTER_VERSION,
  });
}

/** 承認が要る語が入っているかだけを見たいとき用。 */
export function mentionsApprovalGate(raw: string): boolean {
  return anyPhrasePresent(
    APPROVAL_PHRASES.map(entry => entry.phrase),
    normalizeQuestion(raw),
  );
}
