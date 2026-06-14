// ─────────────────────────────────────────────────────────────────────────
// EXPERIMENTAL SPIKE (2026-06) — クラフト採点 / 投稿批評器
//
// これは「実験」です。1ヶ月後に捨てやすいよう、以下を守っています:
//   - 依存ゼロ（既存方針どおり）
//   - 既存フロー（daily / approval / safety）に一切ワイヤリングしない
//   - 型は本モジュール内に閉じる（types.ts を汚さない）
//   - このファイルと craft_score.test.ts を消せば痕跡が残らない
//
// 役割: safety/check.ts の KindnessScore が「危険・冷たくないか」のガードレール
// なのに対し、本モジュールは「面白いか・刺さるか・新鮮か」のクラフト採点。
// COORDINATION.md で Claude に割り当てられた「投稿レビュー・採点」に対応する。
// ─────────────────────────────────────────────────────────────────────────

import { weightedLength, X_WEIGHTED_LIMIT } from "./text_metrics.js";

export type CraftPlatform = "x" | "instagram" | "threads" | "line" | "unknown";

export interface CraftDimension {
  /** 0-5 */
  score: number;
  /** なぜそのスコアか（日本語1行） */
  why: string;
  /** 具体的な改善のヒント（不要なら空配列） */
  hints: string[];
}

export interface CraftScore {
  hook: CraftDimension;          // 冒頭がつかむか
  specificity: CraftDimension;   // 具体・固有・数字があるか
  platformFit: CraftDimension;   // 媒体に合っているか
  invitation: CraftDimension;    // 押しつけない「誘い」があるか
  freshness: CraftDimension;     // 直近の投稿と被っていないか
  /** 各軸の合計 (0-25) */
  total: number;
  /** 見せてよいか / 直すか */
  verdict: "ship" | "polish" | "rework";
  /** 一番効く改善（hints から1つ選んだ要約） */
  topFix: string | null;
}

export interface CraftScoreOptions {
  platform?: CraftPlatform;
  /** 直近に出した本文の集合。新鮮さ判定に使う。 */
  recentBodies?: string[];
}

function clamp(n: number): number {
  return Math.max(0, Math.min(5, n));
}

function firstNonEmptyLine(text: string): string {
  return text.split(/\r?\n/).map(l => l.trim()).find(Boolean) ?? "";
}

// 文字 bigram 集合。短文どうしの「ほぼ同じ」を素朴に検出する。
function bigrams(text: string): Set<string> {
  const compact = text.replace(/\s+/g, "");
  const grams = new Set<string>();
  for (let i = 0; i < compact.length - 1; i++) {
    grams.add(compact.slice(i, i + 2));
  }
  return grams;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const g of a) if (b.has(g)) inter++;
  return inter / (a.size + b.size - inter);
}

// ── 採点に使う語彙・パターン（何を「具体的/情景/つかみ」と見なすかの一覧） ──────
const HAS_QUESTION = /[？?]/;                       // 問いかけ
const HAS_QUOTE = /[「『][^」』]+[」』]/;              // 声・セリフ
const HEAD_HAS_NUMBER = /[0-9０-９]|¥|円|月-/;        // 冒頭の数字・金額
const HAS_NUMBER = /[0-9０-９]|¥|円|￥/;              // 本文の数字・金額
const HAS_PROPER_NOUN = /(UIZIN|初陣|親子割|バンテージ|太陽のジム|FLATUP|成田)/; // 固有名詞
const HAS_SCENE = /(ミット|ハイタッチ|鏡|横顔|拍手|抱擁|笑い合|並んで|見守る)/;   // 情景描写

// ── 各軸の採点 ───────────────────────────────────────────────────────────

function scoreHook(text: string): CraftDimension {
  const head = firstNonEmptyLine(text);
  const hints: string[] = [];
  let score = 2; // 平凡な見出しの基準点

  const hasQuestion = HAS_QUESTION.test(head);
  const hasQuote = HAS_QUOTE.test(head);
  const hasNumber = HEAD_HAS_NUMBER.test(head);
  const headLen = weightedLength(head);
  const isPunchy = headLen > 0 && headLen <= 32;
  const isBareThemeLabel = head.length > 0 && head.length <= 14 && !hasQuestion && !hasQuote && !hasNumber;

  if (hasQuestion) score += 1;
  if (hasQuote) score += 1;
  if (hasNumber) score += 1;
  if (isPunchy) score += 1;

  if (!isPunchy) hints.push("冒頭が長い。最初の一行を一呼吸で読める長さに削る。");
  if (isBareThemeLabel) {
    score -= 1;
    hints.push("冒頭がテーマ名の貼り付けになっている。具体的な情景や問いかけで始める。");
  }
  if (!hasQuestion && !hasQuote) {
    hints.push("問いかけ（？）か声（「」）を冒頭に置くと、止まって読まれやすい。");
  }

  score = clamp(score);
  return {
    score,
    why:
      score >= 4
        ? "冒頭で読者を止める要素（問い/声/数字）がある"
        : score >= 3
          ? "冒頭は悪くないが、もう一押し弱い"
          : "冒頭がつかみに欠ける",
    hints,
  };
}

function scoreSpecificity(text: string): CraftDimension {
  const hints: string[] = [];
  let score = 2;

  const hasNumber = HAS_NUMBER.test(text);
  const hasProperNoun = HAS_PROPER_NOUN.test(text);
  const hasScene = HAS_SCENE.test(text);
  const abstractOnly = !hasNumber && !hasProperNoun && !hasScene;

  if (hasNumber) score += 1;
  if (hasProperNoun) score += 1;
  if (hasScene) score += 1;

  if (!hasNumber) hints.push("数字（500円・月-¥500 など）を1つ入れると具体性が増す。");
  if (!hasScene) hints.push("情景（ミットを持つ・ハイタッチ等）を1カット足すと映像が浮かぶ。");
  if (abstractOnly) {
    score -= 1;
    hints.push("抽象語だけで構成されている。固有名詞か具体描写を最低1つ。");
  }

  score = clamp(score);
  return {
    score,
    why:
      score >= 4
        ? "数字・固有名詞・情景のいずれも備わっている"
        : score >= 3
          ? "具体性はあるが、もう1要素ほしい"
          : "抽象的で像が結びにくい",
    hints,
  };
}

function scorePlatformFit(text: string, platform: CraftPlatform): CraftDimension {
  const hints: string[] = [];
  let score = 3;

  switch (platform) {
    case "x": {
      const len = weightedLength(text);
      // 長さ順守は加点せず（当たり前）、超過のみ減点する。
      if (len > X_WEIGHTED_LIMIT) {
        score -= 2;
        hints.push(`X の長さ超過の疑い（重み付け ${len} > ${X_WEIGHTED_LIMIT}）。1〜2行削る。`);
      }
      if (!/\n/.test(text)) hints.push("X は改行で間を作ると読みやすい。");
      else score += 1;
      break;
    }
    case "instagram": {
      const hasReelStructure = /(冒頭|中盤|終盤)/.test(text) && /字幕/.test(text);
      if (hasReelStructure) score += 2;
      else hints.push("リール案は『冒頭/中盤/終盤＋字幕』の構成だと現場が動きやすい。");
      break;
    }
    case "threads": {
      const lines = text.split(/\r?\n/).filter(l => l.trim()).length;
      if (lines >= 3) score += 1;
      else hints.push("Threads は数行で会話のように展開すると伸びやすい。");
      if (/[。、]$/.test(firstNonEmptyLine(text))) score += 1;
      break;
    }
    case "line": {
      if (weightedLength(text) <= 120) score += 1;
      else hints.push("LINE は短く。120字相当を目安に。");
      break;
    }
    default:
      hints.push("platform 未指定。x/instagram/threads/line を渡すと適合度を判定できる。");
  }

  score = clamp(score);
  return {
    score,
    why:
      score >= 4
        ? "媒体の型に合っている"
        : score >= 3
          ? "媒体適合は標準的"
          : "媒体の型から外れている",
    hints,
  };
}

// safety/check.ts の salesy パターンに引っかからない「やわらかい誘い」を評価する。
const softInvitePattern = /(ワンコイン体験|500円から|空気を感じ|のぞいて|見に来|一度だけ|まずは)/;
const hardSellPattern = /(今だけ|限定|今すぐ|お急ぎ|残りわずか|お申し込みは)/;

function scoreInvitation(text: string): CraftDimension {
  const hints: string[] = [];
  let score = 2;

  const hasSoft = softInvitePattern.test(text);
  const hasHard = hardSellPattern.test(text);

  if (hasSoft) score += 2;
  else hints.push("締めにやわらかい誘い（例:『ワンコイン体験500円から』）が無い。");

  if (hasHard) {
    score -= 2;
    hints.push("煽り系の誘導（今だけ/限定 等）は太陽のジムの声と合わない。外す。");
  }

  score = clamp(score);
  return {
    score,
    why:
      score >= 4
        ? "押しつけない誘いで着地している"
        : score >= 3
          ? "誘いはあるが弱い、または硬い"
          : "誘いが無い／硬い",
    hints,
  };
}

function scoreFreshness(text: string, recentBodies: string[]): CraftDimension {
  if (recentBodies.length === 0) {
    // 比較対象が無いと新鮮さは判定不能。最大点を配ると総合が嵩上げされるので中立(3)。
    return {
      score: 3,
      why: "比較対象（直近投稿）が無いため判定不能・中立",
      hints: [],
    };
  }

  const target = bigrams(text);
  let maxSim = 0;
  for (const prev of recentBodies) {
    maxSim = Math.max(maxSim, jaccard(target, bigrams(prev)));
  }

  // 類似度 0 → 5点, 0.7以上 → 0点 に線形マップ
  const score = clamp(Math.round(5 - (maxSim / 0.7) * 5));
  const hints: string[] = [];
  if (maxSim >= 0.5) {
    hints.push(`直近投稿と ${Math.round(maxSim * 100)}% 類似。固定テンプレの使い回しになっている可能性。角度か語彙を変える。`);
  }
  return {
    score,
    why:
      score >= 4
        ? "直近投稿と十分に差別化されている"
        : score >= 2
          ? "直近投稿とやや被っている"
          : "直近投稿とほぼ同一",
    hints,
  };
}

// ── 公開API ──────────────────────────────────────────────────────────────

const DIMENSION_LABELS: Record<keyof Omit<CraftScore, "total" | "verdict" | "topFix">, string> = {
  hook: "フック",
  specificity: "具体性",
  platformFit: "媒体適合",
  invitation: "誘い",
  freshness: "新鮮さ",
};

export function scoreCraft(text: string, options: CraftScoreOptions = {}): CraftScore {
  const platform = options.platform ?? "unknown";
  const recentBodies = options.recentBodies ?? [];

  const hook = scoreHook(text);
  const specificity = scoreSpecificity(text);
  const platformFit = scorePlatformFit(text, platform);
  const invitation = scoreInvitation(text);
  const freshness = scoreFreshness(text, recentBodies);

  const total = hook.score + specificity.score + platformFit.score + invitation.score + freshness.score;
  const verdict: CraftScore["verdict"] = total >= 20 ? "ship" : total >= 15 ? "polish" : "rework";

  // 一番スコアが低い軸の最初のヒントを「最優先の直し」として選ぶ。
  const dims: Array<[keyof typeof DIMENSION_LABELS, CraftDimension]> = [
    ["hook", hook],
    ["specificity", specificity],
    ["platformFit", platformFit],
    ["invitation", invitation],
    ["freshness", freshness],
  ];
  dims.sort((a, b) => a[1].score - b[1].score);
  const weakest = dims[0];
  const topFix =
    weakest[1].hints.length > 0 ? `[${DIMENSION_LABELS[weakest[0]]}] ${weakest[1].hints[0]}` : null;

  return { hook, specificity, platformFit, invitation, freshness, total, verdict, topFix };
}

/** PlatformDraft 風オブジェクトの薄い受け口（types.ts に依存しない）。 */
export function scoreDraftLike(
  draft: { body: string; platform?: string },
  options: Omit<CraftScoreOptions, "platform"> = {},
): CraftScore {
  const platform = (["x", "instagram", "threads", "line"].includes(draft.platform ?? "")
    ? draft.platform
    : "unknown") as CraftPlatform;
  return scoreCraft(draft.body, { ...options, platform });
}

/** 人が読むためのレポート文字列を作る。 */
export function formatCraftReport(score: CraftScore): string {
  const line = (label: string, d: CraftDimension): string => {
    const bar = "█".repeat(d.score) + "░".repeat(5 - d.score);
    const hints = d.hints.length ? `\n    └ ${d.hints.join("\n    └ ")}` : "";
    return `  ${label.padEnd(4, "　")} ${bar} ${d.score}/5  ${d.why}${hints}`;
  };
  const verdictLabel =
    score.verdict === "ship" ? "✅ 見せてOK" : score.verdict === "polish" ? "✋ 軽く磨く" : "🔁 作り直し";

  return [
    `クラフト採点: ${score.total}/25  → ${verdictLabel}`,
    line("フック", score.hook),
    line("具体性", score.specificity),
    line("媒体", score.platformFit),
    line("誘い", score.invitation),
    line("新鮮さ", score.freshness),
    score.topFix ? `\n  ⭐ 最優先の直し: ${score.topFix}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ── CLI ──────────────────────────────────────────────────────────────────
// 使い方:
//   tsx src/distribution/craft_score.ts --platform x "本文..."
//   echo "本文" | tsx src/distribution/craft_score.ts --platform threads
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const argv = process.argv.slice(2);
  let platform: CraftPlatform = "unknown";
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--platform") {
      platform = (argv[++i] ?? "unknown") as CraftPlatform;
    } else {
      rest.push(argv[i]);
    }
  }

  const run = (text: string): void => {
    if (!text.trim()) {
      console.error("本文が空です。引数か標準入力で本文を渡してください。");
      process.exit(1);
    }
    console.log(formatCraftReport(scoreCraft(text, { platform })));
  };

  if (rest.length > 0) {
    run(rest.join(" "));
  } else {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => (buf += chunk));
    process.stdin.on("end", () => run(buf));
  }
}
