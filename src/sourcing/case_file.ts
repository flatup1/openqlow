// 案件ファイル — 1件の調達をJSON1本にまとめ、読み込み時に検証する。
//
// ブラウザ調査で集めた値は、人・日・サイトによって形がぶれる。
// ここで型と必須項目を1回だけ厳しく通し、以降の計算は「通った値」だけを扱う。
// 検証に落ちたら計算しない（間違った前提で総額や納期を出す方が危険）。

import { validateRequirement, type SourcingRequirement } from "./requirement.js";
import { validateAssumption, validateQuote, type ImportAssumption } from "./cost.js";
import type { Candidate } from "./candidate.js";
import { EXPRESS_LEAD_TIME, type LeadTime } from "./schedule.js";

export type SourcingCase = {
  readonly requirement: SourcingRequirement;
  /** 英語の商品名。検索語と問い合わせ文に使う。 */
  readonly itemEnglish: string;
  readonly lead: LeadTime;
  readonly assumption: ImportAssumption;
  readonly candidates: readonly Candidate[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * null を取り除く。
 * 入力テンプレートは未確認を `null` で表す（JSONに undefined が書けないため）。
 * 一方コード側は「未確認 = undefined」で統一しているので、読み込み時にここで揃える。
 * これを省くと `null` が「未確認」ではなく「値がある」として扱われ、
 * 未確認の項目が警告にも未確認一覧にも出なくなる。
 */
function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (!isObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === null) continue;
    out[key] = stripNulls(item);
  }
  return out;
}

/**
 * JSON を案件として読む。
 * 足りない・壊れている項目は errors に集めて返す（1件目で止めず全部見せる）。
 */
export function parseCaseFile(input: unknown): { readonly value?: SourcingCase; readonly errors: readonly string[] } {
  const errors: string[] = [];
  if (!isObject(input)) return { errors: ["案件ファイルがオブジェクトではありません"] };
  const data = stripNulls(input) as Record<string, unknown>;

  if (!isObject(data.requirement)) {
    return { errors: ["requirement がありません"] };
  }
  const requirement = data.requirement as unknown as SourcingRequirement;
  errors.push(...validateRequirement(requirement).map(e => `requirement: ${e}`));

  const itemEnglish = typeof data.itemEnglish === "string" ? data.itemEnglish : "";
  if (!itemEnglish.trim()) errors.push("itemEnglish が空です（英語の商品名が検索と問い合わせに要ります）");

  // 所要日数は未指定なら急ぎ案件の既定値。ただし「既定を使った」ことは呼び出し側が明示できる。
  const lead: LeadTime = isObject(data.lead) ? (data.lead as unknown as LeadTime) : EXPRESS_LEAD_TIME;
  for (const key of ["productionDays", "shippingDays", "customsBufferDays", "domesticBufferDays", "safetyBufferDays"] as const) {
    const value = lead[key];
    if (!Number.isFinite(value) || value < 0) errors.push(`lead.${key} は0以上の数値にしてください`);
  }

  if (!isObject(data.assumption)) {
    errors.push("assumption がありません（為替・関税率・消費税率は必ず明示する）");
  }
  const assumption = (data.assumption ?? {}) as unknown as ImportAssumption;
  if (isObject(data.assumption)) {
    errors.push(...validateAssumption(assumption).map(e => `assumption: ${e}`));
  }

  const rawCandidates = Array.isArray(data.candidates) ? data.candidates : [];
  if (!Array.isArray(data.candidates)) errors.push("candidates は配列にしてください（未調査なら空配列）");

  const candidates: Candidate[] = [];
  const seenIds = new Set<string>();
  for (const [index, raw] of rawCandidates.entries()) {
    if (!isObject(raw)) {
      errors.push(`candidates[${index}] がオブジェクトではありません`);
      continue;
    }
    const candidate = raw as unknown as Candidate;
    const label = typeof candidate.id === "string" && candidate.id ? candidate.id : `candidates[${index}]`;
    if (typeof candidate.id !== "string" || !candidate.id.trim()) errors.push(`${label}: id が空です`);
    else if (seenIds.has(candidate.id)) errors.push(`${label}: id が重複しています`);
    else seenIds.add(candidate.id);

    if (typeof candidate.supplier !== "string" || !candidate.supplier.trim()) {
      errors.push(`${label}: supplier が空です`);
    }
    if (!isObject(candidate.delivery) || !Array.isArray(candidate.delivery.couriers)) {
      errors.push(`${label}: delivery.couriers は配列にしてください（未確認なら空配列）`);
    }
    if (!isObject(candidate.quality)) errors.push(`${label}: quality がありません（未確認なら空オブジェクト）`);
    if (!isObject(candidate.trust)) errors.push(`${label}: trust がありません（未確認なら空オブジェクト）`);
    if (candidate.quote !== undefined) {
      errors.push(...validateQuote(candidate.quote).map(e => `${label}.quote: ${e}`));
    }
    candidates.push(candidate);
  }

  if (errors.length > 0) return { errors };
  return { value: { requirement, itemEnglish, lead, assumption, candidates }, errors: [] };
}

/** 候補1件分の入力テンプレート。ブラウザ調査はこの形に埋めていく。 */
export function candidateTemplate(): Record<string, unknown> {
  return {
    id: "supplier-01",
    supplier: "（業者名）",
    marketplace: "Alibaba",
    url: "（商品ページURL）",
    moq: null,
    itemizedQuote: null,
    // 見積が返ってきたら null を外して埋める。埋まるまでは「見積未取得」として扱われる。
    quote: null,
    delivery: {
      guaranteedArrivalDate: null,
      guaranteedHalf: null,
      isGuaranteed: null,
      couriers: [],
      productionDays: null,
    },
    quality: {
      materialOk: null,
      constructionOk: null,
      finishOk: null,
      platingOk: null,
      substanceOk: null,
      accessoryOk: null,
      evidencePhotos: null,
    },
    trust: {
      ratingOutOf5: null,
      reviewCount: null,
      yearsOnPlatform: null,
      responseRatePercent: null,
      onTimeDeliveryPercent: null,
      tradeAssurance: null,
      verifiedSupplier: null,
      sameCategoryTrackRecord: null,
    },
    designMatchPercent: null,
    note: "（調査メモ。未確認は null のままにする。埋めない）",
  };
}
