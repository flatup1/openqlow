// 経費1件の型・正規化・勘定科目の自動判定
//
// レシート管理の一番の手間は「これ何費？」「いくら経費にできる？」の判断。
// ここでキーワードから勘定科目・消費税区分を推定し、事業按分まで自動で当てる。
// 推定はあくまで下書き。最終判断は人間（申告の責任はオーナーにある）。
//
// 金額は **税込・円単位の整数** で持つ。1円の丸め差が申告書とズレる原因になるため、
// 小数は一切使わない（按分計算も最後に四捨五入して整数へ戻す）。

/** 消費税の区分。仕入税額控除の可否と税率をまとめて表す。 */
export type TaxCategory = "10%" | "8%軽減" | "非課税" | "対象外";

/** 青色申告決算書の経費欄に対応する勘定科目。 */
export type AccountTitle =
  | "租税公課"
  | "荷造運賃"
  | "水道光熱費"
  | "旅費交通費"
  | "通信費"
  | "広告宣伝費"
  | "接待交際費"
  | "損害保険料"
  | "修繕費"
  | "消耗品費"
  | "減価償却費"
  | "福利厚生費"
  | "外注工賃"
  | "利子割引料"
  | "地代家賃"
  | "支払手数料"
  | "研修費"
  | "新聞図書費"
  | "雑費";

/** 決算書の並び順。集計・帳票はこの順で出す（申告書に転記しやすい）。 */
export const ACCOUNT_ORDER: readonly AccountTitle[] = [
  "租税公課",
  "荷造運賃",
  "水道光熱費",
  "旅費交通費",
  "通信費",
  "広告宣伝費",
  "接待交際費",
  "損害保険料",
  "修繕費",
  "消耗品費",
  "減価償却費",
  "福利厚生費",
  "外注工賃",
  "利子割引料",
  "地代家賃",
  "支払手数料",
  "研修費",
  "新聞図書費",
  "雑費",
] as const;

/** 支払方法。証憑の探し方（レシート/明細/通帳）が変わるので持っておく。 */
export type PaymentMethod = "現金" | "クレジット" | "口座振替" | "電子マネー" | "その他";

/** 証憑（レシート・領収書）の状態。 */
export type ReceiptState = "あり" | "電子" | "なし";

export interface Expense {
  id: number;
  /** YYYY-MM-DD（JST基準） */
  date: string;
  /** 支払先。レシートの店名をそのまま入れる */
  vendor: string;
  /** 税込金額（円・整数） */
  amount: number;
  account: AccountTitle;
  taxCategory: TaxCategory;
  /** 摘要。「何のために買ったか」を書く欄。税務調査で効くのはここ */
  note: string;
  /** 事業按分率（0〜100）。家事共用のものを何%事業に使ったか */
  businessRatio: number;
  paymentMethod: PaymentMethod;
  receipt: ReceiptState;
  /** インボイス登録番号（T+13桁）。仕入税額控除の可否に効く */
  invoiceNumber?: string;
  /** 補助金タグ。例: "省エネ2026"。申請資料はこのタグで抽出する */
  subsidyTag?: string;
  /** 減価償却資産として扱う場合の耐用年数（年） */
  assetLife?: number;
  createdAt: string;
  updatedAt: string;
}

/** 登録・更新時の入力。未指定の項目は推定 or 既定値で埋める。 */
export interface ExpenseInput {
  date?: string;
  vendor?: string;
  amount?: number | string;
  account?: string;
  taxCategory?: string;
  note?: string;
  businessRatio?: number | string;
  paymentMethod?: string;
  receipt?: string;
  invoiceNumber?: string;
  subsidyTag?: string;
  assetLife?: number | string;
}

/**
 * 少額減価償却資産の特例（青色申告者）の上限。
 * 1件30万円未満なら取得年に全額経費にできる（年間合計300万円まで）。
 */
export const SMALL_ASSET_LIMIT = 300_000;

/** 10万円以上は原則、資産計上して減価償却する。 */
export const ASSET_THRESHOLD = 100_000;

/** 年間で少額減価償却資産の特例を使える合計額の上限。 */
export const SMALL_ASSET_ANNUAL_LIMIT = 3_000_000;

// 勘定科目のキーワード辞書。上から順に判定し、最初に当たったものを採用する。
// ジム特有の語（グローブ・サンドバッグ・バンテージ等）を先に置いて誤判定を防ぐ。
const ACCOUNT_KEYWORDS: ReadonlyArray<readonly [AccountTitle, readonly string[]]> = [
  ["地代家賃", ["家賃", "賃料", "テナント", "駐車場代", "月極"]],
  ["水道光熱費", ["電気", "電力", "東京電力", "ガス", "水道", "光熱"]],
  ["通信費", ["携帯", "スマホ", "docomo", "ドコモ", "au", "ソフトバンク", "楽天モバイル", "wifi", "wi-fi", "インターネット", "回線", "ネット代", "切手", "はがき", "サーバー", "ドメイン"]],
  ["広告宣伝費", ["広告", "チラシ", "ポスティング", "看板", "instagram広告", "ig広告", "meta広告", "google広告", "リスティング", "販促", "のぼり", "名刺", "ホームページ", "lp制作", "撮影"]],
  ["外注工賃", ["外注", "業務委託", "インストラクター報酬", "トレーナー報酬", "デザイン費", "編集費", "委託料"]],
  ["旅費交通費", ["ガソリン", "給油", "eneos", "出光", "コスモ石油", "高速", "etc", "電車", "jr", "バス代", "タクシー", "駐車料", "コインパーキング", "宿泊", "ホテル"]],
  ["接待交際費", ["接待", "手土産", "お中元", "お歳暮", "祝儀", "香典", "懇親"]],
  ["福利厚生費", ["スタッフ用", "従業員", "健康診断", "慰労", "まかない", "社員"]],
  ["損害保険料", ["保険", "共済", "賠償責任"]],
  ["租税公課", ["収入印紙", "印紙", "自動車税", "固定資産税", "登録免許税", "事業税", "住民税", "証明書発行", "手数料 市役所"]],
  ["修繕費", ["修理", "修繕", "メンテナンス", "補修", "張り替え", "交換工事"]],
  ["研修費", ["セミナー", "研修", "講習", "資格", "受講", "スクール"]],
  ["新聞図書費", ["書籍", "本代", "新聞", "雑誌", "kindle", "amazon 書"]],
  ["荷造運賃", ["送料", "配送", "宅急便", "ヤマト", "佐川", "ゆうパック", "運賃"]],
  ["支払手数料", ["振込手数料", "決済手数料", "stripe", "paypay手数料", "square", "顧問料", "税理士", "サブスク", "月額利用料"]],
  ["消耗品費", [
    "グローブ", "ミット", "サンドバッグ", "バンテージ", "レガース", "マット", "テーピング", "プロテイン",
    "消毒", "アルコール", "掃除", "洗剤", "タオル", "文具", "ダイソー", "セリア", "コーナン", "カインズ",
    "ホームセンター", "電池", "ケーブル", "備品", "消耗品",
  ]],
];

// 8%（軽減税率）になりやすい語。飲食料品と定期購読新聞。
const REDUCED_RATE_KEYWORDS = [
  "食品", "飲料", "お茶", "水 ", "ミネラルウォーター", "弁当", "お菓子", "コーヒー",
  "スーパー", "業務スーパー", "まいばすけっと", "セブン", "ローソン", "ファミマ", "新聞",
];

// 消費税がかからない・対象外になりやすい語。
const NON_TAXABLE_KEYWORDS = ["保険", "共済", "印紙", "税", "給与", "賃金", "支払利息", "商品券"];

/** 全角英数・記号を半角に寄せ、比較しやすい形にする。 */
function normalizeText(value: string): string {
  return value.normalize("NFKC").replace(/[ \t　]+/g, " ").trim();
}

/**
 * 支払先＋摘要から勘定科目を推定する。
 * 当たらなければ「消耗品費」に寄せる（ジムの支出で最頻のため）。
 */
export function classifyAccount(text: string): AccountTitle {
  const haystack = normalizeText(text).toLowerCase();
  if (!haystack) return "雑費";
  for (const [account, keywords] of ACCOUNT_KEYWORDS) {
    if (keywords.some(keyword => haystack.includes(keyword.toLowerCase()))) return account;
  }
  return "消耗品費";
}

/**
 * 支払先＋摘要から消費税区分を推定する。
 * 迷ったら 10%（標準税率）。軽減税率と非課税だけを拾い上げる。
 */
export function classifyTaxCategory(text: string): TaxCategory {
  const haystack = normalizeText(text).toLowerCase();
  if (NON_TAXABLE_KEYWORDS.some(keyword => haystack.includes(keyword))) return "非課税";
  if (REDUCED_RATE_KEYWORDS.some(keyword => haystack.includes(keyword.toLowerCase()))) return "8%軽減";
  return "10%";
}

/** インボイス登録番号の形式（T＋数字13桁）かどうか。 */
export function isValidInvoiceNumber(value: string): boolean {
  return /^T\d{13}$/.test(normalizeText(value).toUpperCase());
}

/** 税込金額から消費税額を割り戻す（区分に応じた税率・1円未満切り捨て）。 */
export function taxAmountOf(expense: Pick<Expense, "amount" | "taxCategory">): number {
  const rate = expense.taxCategory === "10%" ? 10 : expense.taxCategory === "8%軽減" ? 8 : 0;
  if (rate === 0) return 0;
  return Math.floor((expense.amount * rate) / (100 + rate));
}

/** 事業按分後の必要経費額（円・四捨五入）。 */
export function deductibleAmount(expense: Pick<Expense, "amount" | "businessRatio">): number {
  return Math.round((expense.amount * expense.businessRatio) / 100);
}

/** 減価償却資産を計上する貸借対照表の科目。 */
export const ASSET_ACCOUNT = "工具器具備品";

/** 耐用年数が入っている＝減価償却資産として扱う。 */
export function isDepreciable(expense: Pick<Expense, "assetLife">): boolean {
  return expense.assetLife !== undefined && expense.assetLife > 0;
}

/**
 * 定額法の償却率。国税庁の償却率表は 1/耐用年数 を小数第3位に丸めた値。
 * 例: 13年 → 0.077、5年 → 0.2。
 */
export function straightLineRate(life: number): number {
  return Math.round((1 / life) * 1000) / 1000;
}

export interface Depreciation {
  year: number;
  rate: number;
  /** その年の事業供用月数（取得年は月割） */
  months: number;
  /** その年の償却費（按分前・円） */
  amount: number;
  /** 事業按分後の必要経費額 */
  deductible: number;
  /** その年の末までの償却累計 */
  accumulated: number;
  /** 期末の未償却残高（最後は備忘価額1円が残る） */
  bookValue: number;
}

/**
 * 定額法で指定年の減価償却費を出す。
 * 取得年は事業供用月からの月割、最終年は備忘価額1円を残して打ち切る。
 * @returns 償却資産でない、または取得年より前なら undefined
 */
export function depreciationFor(expense: Expense, year: number): Depreciation | undefined {
  if (!isDepreciable(expense)) return undefined;

  const acquiredYear = Number(expense.date.slice(0, 4));
  const acquiredMonth = Number(expense.date.slice(5, 7));
  if (!Number.isFinite(acquiredYear) || year < acquiredYear) return undefined;

  const rate = straightLineRate(expense.assetLife!);
  // 備忘価額1円は帳簿に残し続ける（除却するまで償却しきらない）
  const depreciableTotal = expense.amount - 1;

  let accumulated = 0;
  let amount = 0;

  for (let target = acquiredYear; target <= year; target++) {
    const months = target === acquiredYear ? 13 - acquiredMonth : 12;
    const raw = Math.floor((expense.amount * rate * months) / 12);
    amount = Math.min(raw, Math.max(0, depreciableTotal - accumulated));
    accumulated += amount;
  }

  return {
    year,
    rate,
    months: year === acquiredYear ? 13 - acquiredMonth : 12,
    amount,
    deductible: Math.round((amount * expense.businessRatio) / 100),
    accumulated,
    bookValue: expense.amount - accumulated,
  };
}

/**
 * 資産計上の要否を判定する。
 * - 10万円未満: そのまま経費
 * - 10万円以上30万円未満: 青色申告なら少額減価償却資産の特例で全額経費にできる
 * - 30万円以上: 減価償却が必要（耐用年数の設定が要る）
 */
export function assetJudgement(amount: number): {
  kind: "経費" | "少額減価償却資産" | "減価償却";
  message: string;
} {
  if (amount < ASSET_THRESHOLD) {
    return { kind: "経費", message: "10万円未満。そのまま経費でOK。" };
  }
  if (amount < SMALL_ASSET_LIMIT) {
    return {
      kind: "少額減価償却資産",
      message: "10万円以上30万円未満。青色申告なら少額減価償却資産の特例で今年に全額経費化できる（年間300万円まで）。",
    };
  }
  return {
    kind: "減価償却",
    message: "30万円以上。減価償却が必要。耐用年数を --life で設定してください（例: 業務用エアコン13年）。",
  };
}

function toInteger(value: number | string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const digits = String(value).normalize("NFKC").replace(/[,，¥￥円\s]/g, "");
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function coerceAccount(value: string | undefined, fallbackText: string): AccountTitle {
  if (value) {
    const normalized = normalizeText(value);
    const hit = ACCOUNT_ORDER.find(account => account === normalized);
    if (hit) return hit;
  }
  return classifyAccount(fallbackText);
}

function coerceTaxCategory(value: string | undefined, fallbackText: string): TaxCategory {
  const normalized = value ? normalizeText(value) : "";
  if (normalized === "10%" || normalized === "10") return "10%";
  if (normalized === "8%軽減" || normalized === "8%" || normalized === "8") return "8%軽減";
  if (normalized === "非課税") return "非課税";
  if (normalized === "対象外") return "対象外";
  return classifyTaxCategory(fallbackText);
}

function coercePaymentMethod(value: string | undefined): PaymentMethod {
  const normalized = value ? normalizeText(value) : "";
  if (/現金|cash/i.test(normalized)) return "現金";
  if (/クレ|カード|credit|card/i.test(normalized)) return "クレジット";
  if (/振替|引落|口座|自動引/.test(normalized)) return "口座振替";
  if (/電子マネー|paypay|suica|id|quicpay/i.test(normalized)) return "電子マネー";
  if (normalized) return "その他";
  return "現金";
}

function coerceReceipt(value: string | undefined): ReceiptState {
  const normalized = value ? normalizeText(value) : "";
  if (/なし|無し|紛失|no/i.test(normalized)) return "なし";
  if (/電子|データ|pdf|画像|写真/i.test(normalized)) return "電子";
  return "あり";
}

/** 0〜100 に収めた按分率。未指定は 100（全額事業用）。 */
function coerceRatio(value: number | string | undefined): number {
  const parsed = toInteger(String(value ?? "").replace(/%|％/g, ""), 100);
  return Math.min(100, Math.max(0, parsed));
}

/**
 * 入力を Expense の中身（id/timestamps を除く）に正規化する。
 * 勘定科目・税区分・按分は未指定なら推定で埋める。
 */
export function normalizeExpenseInput(input: ExpenseInput): Omit<Expense, "id" | "createdAt" | "updatedAt"> {
  const vendor = normalizeText(input.vendor ?? "");
  const note = normalizeText(input.note ?? "");
  const hint = `${vendor} ${note}`;
  const invoiceNumber = input.invoiceNumber ? normalizeText(input.invoiceNumber).toUpperCase() : "";

  const normalized: Omit<Expense, "id" | "createdAt" | "updatedAt"> = {
    date: normalizeText(input.date ?? ""),
    vendor,
    amount: Math.max(0, toInteger(input.amount, 0)),
    account: coerceAccount(input.account, hint),
    taxCategory: coerceTaxCategory(input.taxCategory, hint),
    note,
    businessRatio: coerceRatio(input.businessRatio),
    paymentMethod: coercePaymentMethod(input.paymentMethod),
    receipt: coerceReceipt(input.receipt),
  };

  if (invoiceNumber) normalized.invoiceNumber = invoiceNumber;
  if (input.subsidyTag) normalized.subsidyTag = normalizeText(input.subsidyTag).replace(/^#/, "");
  const life = toInteger(input.assetLife, 0);
  if (life > 0) normalized.assetLife = life;

  return normalized;
}

/**
 * 1件の経費の不備を洗い出す。空配列なら申告に使える状態。
 * 「あとで直す」を溜めないために、登録直後にこれを見せる。
 */
export function validateExpense(expense: Expense): string[] {
  const problems: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expense.date)) problems.push("日付が YYYY-MM-DD の形になっていません");
  if (!expense.vendor) problems.push("支払先が空です");
  if (expense.amount <= 0) problems.push("金額が0円です");
  if (!expense.note) problems.push("摘要が空です（何のために買ったかが税務調査で効きます）");
  if (expense.receipt === "なし") problems.push("レシートがありません（出金伝票かクレカ明細で代用を）");
  if (expense.invoiceNumber && !isValidInvoiceNumber(expense.invoiceNumber)) {
    problems.push("インボイス登録番号の形式が違います（T＋数字13桁）");
  }
  if (expense.amount >= SMALL_ASSET_LIMIT && !expense.assetLife) {
    problems.push("30万円以上なので減価償却が必要です（耐用年数が未設定）");
  }
  return problems;
}
