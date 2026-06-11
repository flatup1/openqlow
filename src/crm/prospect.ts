// FLATUP AI永久集客エンジン — 見込み客（prospect）データモデル
//
// 指示書の prospects スキーマを TypeScript で表現する。永続化は store.ts（JSONファイル）。
// SQLite ではなく依存ゼロの JSON ストアを使う（最小変更・依存追加なしの方針）。
// 将来 node:sqlite へ差し替え可能なよう、ストアI/Oとデータ型は分離している。

/** ステータス（問い合わせ→入会/失注のパイプライン） */
export type ProspectStatus =
  | "new_inquiry"
  | "replied"
  | "waiting_reply"
  | "followup_needed"
  | "trial_scheduled"
  | "trial_done"
  | "joined"
  | "lost"
  | "archived";

export const PROSPECT_STATUSES: ProspectStatus[] = [
  "new_inquiry",
  "replied",
  "waiting_reply",
  "followup_needed",
  "trial_scheduled",
  "trial_done",
  "joined",
  "lost",
  "archived",
];

/** 温度感（A=体験予約に近い / B=興味あり / C=情報収集中） */
export type ProspectTemperature = "A" | "B" | "C";

/** 属性カテゴリ */
export type ProspectCategory = "female" | "male" | "kids" | "parent_child" | "senior" | "unknown";

export const PROSPECT_CATEGORIES: ProspectCategory[] = [
  "female",
  "male",
  "kids",
  "parent_child",
  "senior",
  "unknown",
];

export interface Prospect {
  id: number;
  name: string;
  contactSource: string;
  gender: string;
  ageGroup: string;
  category: ProspectCategory;
  purpose: string;
  temperature: ProspectTemperature | "";
  status: ProspectStatus;
  inquiryText: string;
  aiReply: string;
  humanSentReply: string;
  /** 最終連絡（ISO文字列）。追客漏れ検知に使う */
  lastContactAt: string;
  nextAction: string;
  trialDate: string;
  trialStatus: string;
  joined: 0 | 1;
  lostReason: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
}

/** 新規作成・更新時に受け取れる部分入力 */
export type ProspectInput = Partial<Omit<Prospect, "id" | "createdAt" | "updatedAt">>;

const DEFAULTS: Omit<Prospect, "id" | "createdAt" | "updatedAt"> = {
  name: "",
  contactSource: "",
  gender: "",
  ageGroup: "",
  category: "unknown",
  purpose: "",
  temperature: "",
  status: "new_inquiry",
  inquiryText: "",
  aiReply: "",
  humanSentReply: "",
  lastContactAt: "",
  nextAction: "",
  trialDate: "",
  trialStatus: "",
  joined: 0,
  lostReason: "",
  memo: "",
};

/** 部分入力を既定値で埋め、既知フィールドだけを取り込む（未知キーは無視）。 */
export function normalizeProspectInput(input: ProspectInput): Omit<Prospect, "id" | "createdAt" | "updatedAt"> {
  const out = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS) as Array<keyof typeof DEFAULTS>) {
    const value = (input as Record<string, unknown>)[key];
    if (value !== undefined && value !== null) {
      // joined は 0/1 に正規化
      if (key === "joined") {
        out.joined = value === 1 || value === "1" || value === true ? 1 : 0;
      } else {
        (out as Record<string, unknown>)[key] = value;
      }
    }
  }
  return out;
}
