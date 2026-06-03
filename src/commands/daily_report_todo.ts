// 朝の8問回答から「今日やること3つ」を抽出する純粋関数。
// LLM を使わずルールベースで動かす（依存ゼロ・テスト容易）。
//
// 優先順:
//   1. today_top_task        — オーナーが明示した今日の最優先タスク
//   2. followup_needed       — 返信・フォロー（Priority 3: 追客漏れゼロ）
//   3. enrollment_considering — 入会検討中（Priority 2: 入会率）
//   4. retention_risk        — 退会リスク（Priority 4: 継続率）
//   5. review_request_candidate — 口コミ候補（Priority 5: 口コミ・紹介）
//   6. concerning_member     — 気になる会員ケア

interface TodoSeed {
  /** morning genre の answer キー */
  key: string;
  /** 提案に使うラベル */
  label: string;
}

const PRIORITY_SEEDS: TodoSeed[] = [
  { key: "today_top_task", label: "今日のタスク" },
  { key: "followup_needed", label: "返信・フォロー" },
  { key: "enrollment_considering", label: "入会検討中の方へ声かけ" },
  { key: "retention_risk", label: "退会リスク確認" },
  { key: "review_request_candidate", label: "口コミ依頼" },
  { key: "concerning_member", label: "気になる会員ケア" },
];

const EMPTY_VALUES = new Set(["", "なし", "無し", "ない", "特になし"]);

/**
 * morning ジャンルの answers (key→value) から、優先度順に最大3つの ToDo を抽出する。
 * 空（"なし" 等）や未回答の項目はスキップする。
 */
export function extractTopThreeTodos(answers: Record<string, string | undefined>): string[] {
  const todos: string[] = [];
  for (const seed of PRIORITY_SEEDS) {
    if (todos.length >= 3) break;
    const raw = answers[seed.key];
    if (!raw) continue;
    const trimmed = raw.trim();
    if (EMPTY_VALUES.has(trimmed)) continue;
    todos.push(`${seed.label}: ${trimmed}`);
  }
  return todos;
}

/**
 * LINE 返信に貼り付ける整形済みブロック。ToDo が0件なら空配列を返す。
 */
export function buildTodoReplyLines(answers: Record<string, string | undefined>): string[] {
  const todos = extractTopThreeTodos(answers);
  if (todos.length === 0) return [];
  return [
    "",
    "今日やることはこの3つです：",
    ...todos.map((todo, i) => `${i + 1}. ${todo}`),
    "",
    "必要なら、このままLINE下書きも作れます。",
  ];
}
