// 問い合わせの仕分け。分類・優先度・「JIN確認」の判定をここだけで行う。
//
// この機能で一番大事なのは「AIが答えてはいけないものを、AIが答えないこと」。
// 迷ったら答えない（JIN確認へ回す）。判定の材料は本文だけで、外部へは何も出さない。
//
// 未成年の扱い（要件 §6）:
//   「未成年だから全部止める」はしない。それでは普通のキッズ問い合わせまで止まり、
//   一番返信が要る相手を待たせてしまう。止めるのは「未成年 かつ 慎重な判断が要る話」だけ。

export type InquiryCategory =
  | "trial"
  | "tour"
  | "price"
  | "join"
  | "kids"
  | "ladies"
  | "class"
  | "hours"
  | "bring"
  | "access"
  | "parking"
  | "member"
  | "other";

export type InquiryPriority = "A" | "B" | "C" | "ESCALATE";

export type EscalationReason =
  | "complaint"
  | "medical"
  | "injury"
  | "legal"
  | "money_trouble"
  | "membership_trouble"
  | "refund"
  | "violence"
  | "accident"
  | "safety"
  | "minor_sensitive"
  | "special_request"
  | "outside_canon"
  | "too_little_information";

export interface TriageResult {
  category: InquiryCategory;
  priority: InquiryPriority;
  /** true なら返信本文を作らない。JINへ「JIN確認」とだけ伝える。 */
  escalate: boolean;
  reasons: EscalationReason[];
  /** 未成年に関する問い合わせか（返信可否そのものは escalate が決める）。 */
  aboutMinor: boolean;
}

function normalize(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function hit(text: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text));
}

// ---- JIN確認の条件（要件 §23）----
// どれか1つでも当たれば、AIは返信本文を作らない。

const ESCALATION_RULES: Array<{ reason: EscalationReason; patterns: RegExp[] }> = [
  {
    reason: "complaint",
    patterns: [/クレーム|苦情/, /(最悪|ひどい|不愉快|失礼|納得(でき|いか)な)/, /責任者|上の人|訴え/],
  },
  {
    reason: "medical",
    patterns: [/持病|通院|入院|薬を|服薬|喘息|心臓|血圧|妊娠|妊婦|障害|発達|うつ|てんかん|診断/],
  },
  {
    reason: "injury",
    patterns: [/怪我|けが|ケガ|骨折|捻挫|脱臼|靭帯|痛めて|痛みが|むち打ち|後遺症/],
  },
  { reason: "legal", patterns: [/弁護士|訴訟|裁判|法的|警察|示談|慰謝料/] },
  {
    reason: "money_trouble",
    patterns: [/未払|滞納|二重(に)?(請求|引き落と)|引き落とされ|請求がおかしい|支払われ(て|ず)/],
  },
  { reason: "refund", patterns: [/返金|払い戻し|返してほし/] },
  {
    reason: "membership_trouble",
    patterns: [/退会|解約|辞めたい|やめたい|違約金|ペナルティ|休会|一時停止/],
  },
  { reason: "violence", patterns: [/暴力|殴られ|いじめ|ハラスメント|パワハラ|セクハラ|恫喝/] },
  { reason: "accident", patterns: [/事故|救急|搬送|倒れ/] },
  { reason: "safety", patterns: [/危険|危ない目|安全(面|上)?(が|の)?(心配|不安|配慮)|配慮が必要/] },
  {
    reason: "special_request",
    patterns: [/特例|例外|特別に|値引き|割引して|まけて|安くして|無料にして|裏メニュー/],
  },
  // 正本(canon)に無いサービスの問い合わせ。答えられる材料が無いので推測で書かない（要件 §26）。
  // ここを止めないと、パーソナルの料金を聞かれて通常の月会費を並べる、という
  // 「間違ってはいないが答えになっていない」下書きがJINへ届く。
  {
    reason: "outside_canon",
    patterns: [
      /パーソナル|マンツーマン|個人レッスン|プライベートレッスン/,
      /出張|貸切|合宿|遠征/,
      /法人|企業(研修|向け)|団体(利用|割)/,
      /物販|プロテイン|サプリ|グッズ販売/,
      /スポンサー|取材|撮影許可|イベント(出演|依頼|開催)/,
    ],
  },
];

// ---- 未成年の判定（要件 §6）----

// 「未成年 かつ これ」なら JIN確認。普通のキッズ問い合わせ（何歳から/曜日/持ち物/料金）は含めない。
const MINOR_SENSITIVE_PATTERNS = [
  /怪我|けが|ケガ|病気|持病|アレルギー|発達|健康(相談|面|状態)|通院|薬/,
  /いじめ|暴力|不登校/,
  /学校(で|の|と)?(トラブル|問題|相談|事情)/,
  /保護者(間|同士)?(の)?(トラブル|問題)/,
  /契約(の)?(トラブル|問題)/,
  /料金(の)?(トラブル|問題)|返金|未払/,
  /クレーム|苦情/,
  /特別(な)?(配慮|対応)|配慮(が|を)(必要|お願い)/,
];

function detectMinor(text: string): boolean {
  // 「何歳から？」は年齢制限＝お子さまの話であることがほとんどなので未成年側に寄せる。
  if (/子供|子ども|こども|息子|娘|うちの子|小学|中学|高校|園児|幼児|キッズ|未就学|未成年|何歳/.test(text)) {
    return true;
  }
  const age = text.match(/(\d{1,2})\s*(?:歳|才)/);
  return age ? Number(age[1]) < 18 : false;
}

// ---- 分類（要件 §21）----
// 上から順に見て、最初に当たったものを採る。売上に近いものほど先に置く。

const CATEGORY_RULES: Array<[InquiryCategory, RegExp[]]> = [
  [ "trial", [/体験/] ],
  [ "tour", [/見学|雰囲気を見|下見/] ],
  [ "join", [/入会|入りたい|通いたい|始めたい|申し込/] ],
  [ "price", [/料金|値段|月会費|会費|費用|いくら|金額|価格|入会金/] ],
  [ "kids", [/子供|子ども|こども|小学|キッズ|息子|娘|何歳|園児|幼児/] ],
  [ "ladies", [/レディース|女性(専用|クラス|限定)|女性でも|女子/] ],
  [ "class", [/クラス|種目|コース|カリキュラム|柔術|キック|ボクシング|レスリング|MMA|ムエタイ/i] ],
  [ "hours", [/営業時間|何時(から|まで)|開いて|やってま|曜日|スケジュール|時間帯/] ],
  [ "bring", [/持ち物|持って(い|行)|用意する|服装|グローブ|道具|レンタル|貸出/] ],
  [ "access", [/場所|住所|どこ|アクセス|行き方|最寄|駅|バス|地図/] ],
  [ "parking", [/駐車場|車で|駐輪/] ],
  [ "member", [/会員(です|ですが|の者|番号)|通って(います|る)|在籍/] ],
];

function detectCategory(text: string): InquiryCategory {
  for (const [category, patterns] of CATEGORY_RULES) {
    if (hit(text, patterns)) return category;
  }
  return "other";
}

// ---- 優先度（要件 §22）----

const PRIORITY_A: InquiryCategory[] = ["trial", "tour", "join"];
const PRIORITY_B: InquiryCategory[] = ["price", "class", "hours", "kids", "ladies"];

function detectPriority(category: InquiryCategory): InquiryPriority {
  if (PRIORITY_A.includes(category)) return "A";
  if (PRIORITY_B.includes(category)) return "B";
  return "C";
}

/** 本文が短すぎて何も判断できない（要件 §23 情報不足）。 */
function tooLittleInformation(text: string): boolean {
  return text.length < 2;
}

/**
 * 問い合わせ1件を仕分ける。外部送信も保存もしない純関数。
 */
export function triageInquiry(rawText: string): TriageResult {
  const text = normalize(rawText);
  const aboutMinor = detectMinor(text);
  const reasons: EscalationReason[] = [];

  for (const rule of ESCALATION_RULES) {
    if (hit(text, rule.patterns)) reasons.push(rule.reason);
  }

  // 未成年 かつ 慎重な判断が要る話だけを止める。通常のキッズ問い合わせは止めない。
  if (aboutMinor && hit(text, MINOR_SENSITIVE_PATTERNS)) reasons.push("minor_sensitive");

  if (tooLittleInformation(text)) reasons.push("too_little_information");

  const escalate = reasons.length > 0;
  const category = detectCategory(text);

  return {
    category,
    priority: escalate ? "ESCALATE" : detectPriority(category),
    escalate,
    reasons,
    aboutMinor,
  };
}

/** 通知に出す日本語ラベル。 */
export const CATEGORY_LABEL: Record<InquiryCategory, string> = {
  trial: "体験",
  tour: "見学",
  price: "料金",
  join: "入会",
  kids: "キッズ",
  ladies: "レディース",
  class: "クラス",
  hours: "営業時間",
  bring: "持ち物",
  access: "アクセス",
  parking: "駐車場",
  member: "会員からの質問",
  other: "その他",
};

export const ESCALATION_LABEL: Record<EscalationReason, string> = {
  complaint: "クレーム",
  medical: "医療・健康",
  injury: "ケガ",
  legal: "法律",
  money_trouble: "金銭トラブル",
  membership_trouble: "退会・休会",
  refund: "返金",
  violence: "暴力・いじめ",
  accident: "事故",
  safety: "安全上の配慮",
  minor_sensitive: "未成年のセンシティブ案件",
  special_request: "特例の要望",
  outside_canon: "正本にない内容",
  too_little_information: "情報不足",
};
