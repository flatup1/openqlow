// 広告動画: 生成した1本を採点する（指示書 §9 STEP3）。
//
// 8つの観点を 0〜10 で人が付け、重みをかけて100点満点にする。
// 重みは「会員が増えるか」から逆算している。再生数そのものは点にしない（§5）。
//
// ここは純関数。ファイルにも外部にも触らない。

export const SCORE_AXES = [
  "beginner_safety",
  "flatup_fit",
  "hook_within_3s",
  "cta_connection",
  "low_ai_artifacts",
  "human_integrity",
  "ad_strength",
  "cost",
] as const;

export type ScoreAxis = (typeof SCORE_AXES)[number];

export interface AxisMeta {
  readonly axis: ScoreAxis;
  readonly label_ja: string;
  /** 合計100になる重み。 */
  readonly weight: number;
  readonly question_ja: string;
}

export const AXIS_META: readonly AxisMeta[] = Object.freeze([
  Object.freeze({
    axis: "beginner_safety",
    label_ja: "初心者への安心感",
    weight: 18,
    question_ja: "未経験の女性が見て「ここなら行けそう」と思うか。",
  }),
  Object.freeze({
    axis: "flatup_fit",
    label_ja: "FLAT UP GYMらしさ",
    weight: 14,
    question_ja: "怒鳴らない・比べない・明るい・清潔が絵に出ているか。",
  }),
  Object.freeze({
    axis: "hook_within_3s",
    label_ja: "3秒以内の引き",
    weight: 20,
    question_ja: "最初の3秒で指が止まるか。",
  }),
  Object.freeze({
    axis: "cta_connection",
    label_ja: "CTAとのつながり",
    weight: 16,
    question_ja: "見た直後に体験予約・LINE登録へ自然につながるか。",
  }),
  Object.freeze({
    axis: "low_ai_artifacts",
    label_ja: "AI感の少なさ",
    weight: 10,
    question_ja: "作り物に見えないか。",
  }),
  Object.freeze({
    axis: "human_integrity",
    label_ja: "人物破綻のなさ",
    weight: 10,
    question_ja: "手・指・顔・体の動きが壊れていないか。",
  }),
  Object.freeze({
    axis: "ad_strength",
    label_ja: "広告としての強さ",
    weight: 8,
    question_ja: "他の広告と並んだとき残るか。",
  }),
  Object.freeze({
    axis: "cost",
    label_ja: "コスト",
    weight: 4,
    question_ja: "この効果に対して費用が見合うか。",
  }),
]);

/** 各観点 0〜10。 */
export type AxisScores = Readonly<Record<ScoreAxis, number>>;

export interface ScoreResult {
  readonly total: number;
  readonly per_axis: readonly { readonly axis: ScoreAxis; readonly label_ja: string; readonly points: number }[];
  /** 弱いところ（重み×不足が大きい順に上位2つ）。次の改善はここから。 */
  readonly weakest_ja: readonly string[];
}

export class ScoringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScoringError";
  }
}

/** 0〜10 の8観点から100点満点を出す。範囲外は推測せず止める。 */
export function scoreVideo(scores: AxisScores): ScoreResult {
  for (const meta of AXIS_META) {
    const raw = scores[meta.axis];
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > 10) {
      throw new ScoringError(`${meta.label_ja} の点は0〜10で入れる（受け取った値: ${String(raw)}）`);
    }
  }

  const perAxis = AXIS_META.map(meta =>
    Object.freeze({
      axis: meta.axis,
      label_ja: meta.label_ja,
      points: Math.round(((scores[meta.axis] / 10) * meta.weight) * 100) / 100,
    }),
  );
  const total = Math.round(perAxis.reduce((sum, a) => sum + a.points, 0) * 10) / 10;

  const weakest = AXIS_META.map(meta => ({
    label: meta.label_ja,
    lost: Math.round(((10 - scores[meta.axis]) / 10) * meta.weight * 100) / 100,
    raw: scores[meta.axis],
  }))
    .filter(item => item.lost > 0)
    .sort((a, b) => b.lost - a.lost)
    .slice(0, 2)
    .map(item => `${item.label}（${item.raw}/10・-${item.lost}点）`);

  return Object.freeze({
    total,
    per_axis: Object.freeze(perAxis),
    weakest_ja: Object.freeze(weakest),
  });
}

/** 上位N案だけ残す（§9 STEP4は上位2案）。同点は元の順を保つ。 */
export function topConcepts<T extends { readonly total: number }>(
  entries: readonly T[],
  count: number,
): readonly T[] {
  return Object.freeze(
    entries
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => b.entry.total - a.entry.total || a.index - b.index)
      .slice(0, count)
      .map(item => item.entry),
  );
}
