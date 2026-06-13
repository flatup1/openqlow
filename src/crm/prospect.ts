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

/** 日本語などの別名 → 正規ステータス。crm status を日本語で打てるようにする。 */
const STATUS_ALIASES: Record<string, ProspectStatus> = {
  "新規": "new_inquiry",
  "問い合わせ": "new_inquiry",
  "返信した": "replied",
  "返信済み": "replied",
  "返信待ち": "waiting_reply",
  "要フォロー": "followup_needed",
  "フォロー": "followup_needed",
  "体験予約": "trial_scheduled",
  "予約": "trial_scheduled",
  "体験済み": "trial_done",
  "体験": "trial_done",
  "入会": "joined",
  "入会済み": "joined",
  "見送り": "lost",
  "失注": "lost",
  "保管": "archived",
  "アーカイブ": "archived",
};

/** 入力（英語コード or 日本語別名）を正規ステータスに解決する。未知なら undefined。 */
export function resolveStatus(input: string): ProspectStatus | undefined {
  const t = (input ?? "").trim();
  if ((PROSPECT_STATUSES as string[]).includes(t)) return t as ProspectStatus;
  return STATUS_ALIASES[t];
}

export interface Prospect {
  id: number;
  name: string;
  contactSource: string;
  /** 外部チャネルの安定ID（例: LINE userId）。同一客の重複登録防止に使う */
  externalId: string;
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
  externalId: "",
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
