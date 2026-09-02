// 「下書きを作ってよい問い合わせか」を先に分ける。
//
// クレーム、ケガ・健康、未成年、返金・退会、法律、支払いトラブルは、
// 言葉を選び間違えると取り返しがつかない。AIは文案を出さず、
// 「JIN確認」とだけ伝える。これは AGENTS.md の人間確認必須項目に合わせている。

export type TriageRoute =
  /** 下書きを作ってよい */
  | "draft"
  /** 下書きを作らず、JINに確認だけ求める */
  | "human_only";

export interface TriageResult {
  route: TriageRoute;
  /** 日本語の理由。そのまま通知に出す。 */
  reason: string;
  /** 当たった区分（ログ用） */
  category?: HumanOnlyCategory;
}

export type HumanOnlyCategory =
  | "complaint"
  | "health"
  | "minor"
  | "money"
  | "membership"
  | "legal";

const HUMAN_ONLY_RULES: Array<{ category: HumanOnlyCategory; reason: string; pattern: RegExp }> = [
  {
    category: "complaint",
    reason: "クレーム・苦情の可能性",
    pattern: /クレーム|苦情|最悪|ひどい|不満|謝罪|責任者|訴え|返してください|二度と/,
  },
  {
    category: "health",
    reason: "ケガ・健康の相談",
    pattern: /怪我|けが|ケガ|痛み|痛い|病院|通院|持病|手術|妊娠|喘息|心臓|血圧|診断|薬を/,
  },
  {
    category: "minor",
    reason: "未成年に関する判断が必要",
    pattern: /未成年|保護者|親権|同意書|中学生|高校生/,
  },
  {
    category: "money",
    reason: "お金に関する確定回答が必要",
    pattern: /返金|払い戻し|請求|二重|引き落とし|違約金|未払い|カード情報/,
  },
  {
    category: "membership",
    reason: "退会・休会の手続き",
    pattern: /退会|解約|休会|やめたい|辞めたい/,
  },
  {
    category: "legal",
    reason: "法律・契約に関する判断が必要",
    pattern: /弁護士|法的|契約書|個人情報の開示|消費者センター/,
  },
];

/** 空・短すぎる本文は下書きの材料にならない。 */
const MIN_LENGTH = 4;

export function triageInbound(text: string): TriageResult {
  const body = text.trim();

  if (body.length < MIN_LENGTH) {
    return { route: "human_only", reason: "本文が短く、内容が読み取れない" };
  }

  for (const rule of HUMAN_ONLY_RULES) {
    if (rule.pattern.test(body)) {
      return { route: "human_only", reason: rule.reason, category: rule.category };
    }
  }

  return { route: "draft", reason: "通常の問い合わせ" };
}
