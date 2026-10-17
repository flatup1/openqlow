// 広告動画: 使う生成モデルの仕様と単価をまとめた台帳。
//
// 参照: 指示書 §2「使用モデル」/ §3「API優先順位」/ §13「コスト管理」。
//
// ここで一番大事な決めごと:
//   このファイルの数値は「公式で確認できたか」を必ず一緒に持つ。
//   `verified_official: false` の間は、課金する生成に進めない（fail closed）。
//   古い料金やSNS投稿だけを根拠に実行しないための仕組み。
//
// 秘密情報はここに書かない。APIキーは環境変数だけで扱う（`client.ts`）。

/** 生成の種類。 */
export type FalTaskKind = "text_to_video" | "image_to_video";

/** 1つの解像度に対する単価。出所と確認日を必ず持つ。 */
export interface PriceQuote {
  readonly resolution: string;
  /** 出力1秒あたりのUSD。 */
  readonly usd_per_output_second: number;
  /** 公式（fal.ai のモデルページ / 料金ページ）で確認できたか。 */
  readonly verified_official: boolean;
  /** どこで見た値か。人が後から追える形で書く。 */
  readonly source_note: string;
  /** 確認した日（YYYY-MM-DD）。 */
  readonly checked_at: string;
}

/** モデル1つ分の仕様。 */
export interface ModelSpec {
  readonly model_key: string;
  readonly label_ja: string;
  readonly endpoints: Readonly<Record<FalTaskKind, string>>;
  readonly durations_seconds: readonly number[];
  readonly resolutions: readonly string[];
  readonly aspect_ratios: readonly string[];
  readonly prompt_expansion_modes: readonly string[];
  readonly prices: readonly PriceQuote[];
  /** 仕様そのものを公式で確認できたか。 */
  readonly spec_verified_official: boolean;
  readonly spec_source_note: string;
  readonly spec_checked_at: string;
}

/**
 * 第一候補のモデル。
 *
 * 注意: 2026-09-07 時点、この作業環境から fal.ai への通信は遮断されており
 * （egress proxy が fal.ai をブロック）、公式ページを直接読めていない。
 * 下記は検索結果の二次情報にもとづく「仮置き」で、公式未確認のまま置いている。
 * オーナーが公式ページで確認したら `verified_official` / `spec_verified_official`
 * と `checked_at` を更新する。それまで課金生成は `plan.ts` が止める。
 */
export const H3_MAX_TURBO: ModelSpec = Object.freeze({
  model_key: "minimax/h3-max-turbo",
  label_ja: "H3 Max Turbo（速い・安いほう）",
  endpoints: Object.freeze({
    text_to_video: "minimax/h3-max-turbo/text-to-video",
    image_to_video: "minimax/h3-max-turbo/image-to-video",
  }),
  durations_seconds: Object.freeze([5, 10, 15]),
  resolutions: Object.freeze(["480p", "768p"]),
  aspect_ratios: Object.freeze(["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"]),
  prompt_expansion_modes: Object.freeze(["balanced", "quality"]),
  prices: Object.freeze([
    Object.freeze({
      resolution: "768p",
      usd_per_output_second: 0.01,
      verified_official: false,
      source_note:
        "検索結果の二次情報（fal公式Xの告知を紹介した記事）。キャンペーン価格の可能性あり。公式ページ未確認。",
      checked_at: "2026-09-07",
    }),
    Object.freeze({
      resolution: "480p",
      usd_per_output_second: 0.01,
      verified_official: false,
      source_note:
        "480pの個別単価は未確認。安全側に倒して768pと同額で仮置きしている（実際はこれ以下の見込み）。",
      checked_at: "2026-09-07",
    }),
  ]),
  spec_verified_official: false,
  spec_source_note:
    "尺は最大15秒、解像度は480p/768p、比率は21:9〜9:16、prompt_expansion_mode は balanced/quality、という二次情報にもとづく。公式APIドキュメント未確認。",
  spec_checked_at: "2026-09-07",
});

export const MODELS: readonly ModelSpec[] = Object.freeze([H3_MAX_TURBO]);

export function findModel(modelKey: string): ModelSpec | null {
  return MODELS.find(m => m.model_key === modelKey) ?? null;
}

export function findPrice(spec: ModelSpec, resolution: string): PriceQuote | null {
  return spec.prices.find(p => p.resolution === resolution) ?? null;
}

/**
 * 公式確認が済んでいない箇所を日本語で並べる。
 * 空配列なら「公式で確認済み」。1つでもあれば課金生成は止める。
 */
export function unverifiedReasons(spec: ModelSpec, resolution: string): readonly string[] {
  const reasons: string[] = [];
  if (!spec.spec_verified_official) {
    reasons.push(`${spec.model_key} の仕様が公式未確認（${spec.spec_source_note}）`);
  }
  const price = findPrice(spec, resolution);
  if (price === null) {
    reasons.push(`${spec.model_key} の ${resolution} の単価が台帳にない`);
  } else if (!price.verified_official) {
    reasons.push(`${resolution} の単価が公式未確認（${price.source_note}）`);
  }
  return Object.freeze(reasons);
}
