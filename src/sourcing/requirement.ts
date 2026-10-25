// 調達要件 — 「何を・何個・いつまでに・どこへ」を1つの型に固定する。
//
// FLAT UP 調達AI の入口。メダル専用ではなく、Tシャツ・トロフィー・バンテージ・
// グローブ・大会備品・販促物など「海外に作らせて日本へ運ぶもの」すべてに使う。
//
// ここでの原則は3つ。
//   1. 納期は「発送日」ではなく「日本の届け先への到着日」で持つ。
//   2. 未確認の値は未確認のまま持つ。埋めない。推測で数字を作らない。
//   3. 判断材料は作るが、発注・決済は一切しない（人間の承認が要る）。

/** 優先順位。上から順に強い。既定は 納期 > 品質 > 総額 > デザイン。 */
export type Priority = "納期" | "品質" | "総額" | "デザイン";

export const DEFAULT_PRIORITIES: readonly Priority[] = ["納期", "品質", "総額", "デザイン"] as const;

/** 到着の締切が午前中までか、その日いっぱいか。大会前日納品では午前中指定が要る。 */
export type DeadlineHalf = "AM" | "PM";

/** 調達要件。1案件につき1つ。 */
export type SourcingRequirement = {
  /** 案件ID（ファイル名やレポート見出しに使う短い識別子）。 */
  readonly id: string;
  /** 商品名。英語検索語の素にもなる。 */
  readonly item: string;
  /** 数量。 */
  readonly quantity: number;
  /** 日本側の到着必着日（YYYY-MM-DD）。発送日ではない。 */
  readonly arrivalDeadline: string;
  /** 締切がその日の午前中までなら "AM"。 */
  readonly deadlineHalf: DeadlineHalf;
  /** 届け先（都道府県・市まで。番地は書かない）。 */
  readonly destination: string;
  /**
   * 届け先の英語表記（例: "Narita, Chiba, Japan"）。
   * 海外業者への文面に日本語の住所を入れても読めないため、必ず英語で持つ。
   */
  readonly destinationEnglish: string;
  /** 使用日（大会日など）。あれば逆算の妥当性チェックに使う。 */
  readonly useDate?: string;
  /** 目標実質単価（円）。 */
  readonly targetUnitPriceJpy?: number;
  /** 許容できる実質単価の上限（円）。これを超えたら総額点は0。 */
  readonly maxUnitPriceJpy?: number;
  /** 満たすべき仕様（日本語）。社内の判断とレポートに使う。 */
  readonly mustHaves: readonly string[];
  /**
   * 満たすべき仕様の英語表記。海外業者への文面にはこちらを使う。
   * 日本語のまま送っても読まれず、仕様の食い違いのまま量産に入る事故につながる。
   */
  readonly mustHavesEnglish: readonly string[];
  /** 優先順位。 */
  readonly priorities: readonly Priority[];
};

/** 要件の入力チェック。埋まっていない・矛盾しているものは、ここで落とす。 */
export function validateRequirement(input: SourcingRequirement): string[] {
  const errors: string[] = [];

  if (!input.id.trim()) errors.push("id が空です");
  if (!input.item.trim()) errors.push("item が空です");
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    errors.push("quantity は1以上の整数にしてください");
  }
  if (!isIsoDate(input.arrivalDeadline)) {
    errors.push("arrivalDeadline は YYYY-MM-DD 形式にしてください");
  }
  if (!input.destination.trim()) errors.push("destination が空です");
  if (!input.destinationEnglish.trim()) {
    errors.push("destinationEnglish が空です（海外業者への文面に使う英語表記が要ります）");
  }
  if (input.mustHaves.length > 0 && input.mustHavesEnglish.length === 0) {
    errors.push("mustHavesEnglish が空です（仕様を日本語のまま海外業者へ送らない）");
  }

  if (input.useDate && isIsoDate(input.useDate) && isIsoDate(input.arrivalDeadline)) {
    if (input.useDate < input.arrivalDeadline) {
      errors.push("useDate（使用日）が arrivalDeadline（到着必着日）より前です");
    }
  }
  if (
    input.targetUnitPriceJpy !== undefined &&
    input.maxUnitPriceJpy !== undefined &&
    input.targetUnitPriceJpy > input.maxUnitPriceJpy
  ) {
    errors.push("targetUnitPriceJpy が maxUnitPriceJpy を超えています");
  }

  return errors;
}

/** YYYY-MM-DD として実在する日付か。 */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** 日付に日数を足す（UTC固定。タイムゾーンで1日ずれないようにする）。 */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** from から to までの日数（to - from）。同じ日なら0。 */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * 検索キーワードを組み立てる。
 * 「商品名 + 数量 + 低MOQ + 短納期 + 日本向け配送」の型で英語検索語を作る。
 * ブラウザ調査の初手をぶれさせないための素であって、これ自体は何も検索しない。
 */
export function searchKeywords(requirement: SourcingRequirement, itemEnglish: string): string[] {
  const base = itemEnglish.trim() || requirement.item;
  return [
    `custom ${base}`,
    `custom ${base} ${requirement.quantity} pcs`,
    `custom ${base} low MOQ`,
    `custom ${base} MOQ ${requirement.quantity}`,
    `custom ${base} fast production`,
    `custom ${base} DHL shipping`,
    `custom ${base} Japan shipping`,
    `custom ${base} manufacturer`,
  ];
}
