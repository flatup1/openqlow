// AIKA 移植キット — 未成年入会の保護者同意
//
// 未成年（小学生・中学生・高校生）が入会する場合にだけ、保護者の同意を確認するための
// **依存ゼロ**モジュール。外部importなし。AIKA側の `src/safety/` などへそのままコピーして使う。
//
// 運用の位置づけ（JIN確定 2026-08-06）:
//   - 電子（LINE）: 重要事項の提示と確認のみ。手書き署名は取らない。
//   - 紙（初回来館時）: 手書き署名をもらう。こちらが原本。
//   - 生年月日は聞かない。年代区分だけで判定する（強い個人情報を持たないため）。
//
// 会員規約の全文はここに再掲しない。未成年だからこそ保護者に確認してほしいことだけを持つ。
// 料金・住所・スケジュールなどの具体値は flatup_canon.ts が正本。ここには書かない。

// --- 年代区分 -----------------------------------------------------------------

/** 保護者同意が必要になる年齢の境界（これ未満が未成年扱い） */
export const GUARDIAN_CONSENT_AGE_THRESHOLD = 18;

export type AgeBand = "elementary" | "junior_high" | "high_school" | "adult";

export const AGE_BANDS: AgeBand[] = ["elementary", "junior_high", "high_school", "adult"];

/** LINEで選ばれた日本語ラベル → 正規の年代区分 */
const AGE_BAND_ALIASES: Record<string, AgeBand> = {
  "小学生": "elementary",
  "小学校": "elementary",
  "小": "elementary",
  "中学生": "junior_high",
  "中学校": "junior_high",
  "中": "junior_high",
  "高校生": "high_school",
  "高校": "high_school",
  "高": "high_school",
  "成人": "adult",
  "大人": "adult",
  "社会人": "adult",
  "18歳以上": "adult",
};

/** 入力（英語コード or 日本語ラベル）を正規の年代区分に解決する。未知なら undefined。 */
export function resolveAgeBand(input: string): AgeBand | undefined {
  const t = (input ?? "").trim();
  if ((AGE_BANDS as string[]).includes(t)) return t as AgeBand;
  return AGE_BAND_ALIASES[t];
}

const MINOR_AGE_BANDS: ReadonlySet<AgeBand> = new Set<AgeBand>([
  "elementary",
  "junior_high",
  "high_school",
]);

/**
 * 保護者同意が必要かを判定する。判定材料は年代区分のみ。
 *
 * 安全側に倒す設計：区分が未選択・不明な場合は true を返す。
 * 「判定できないから同意を飛ばす」は未成年保護の観点で最も危険なため、
 * 迷ったら保護者同意フローへ送る。
 *
 * 高校3年生など18歳に達している場合も「高校生」は必要側に含める。
 * 在学中は保護者の関与が実務上必要で、境界で取りこぼすリスクのほうが大きいため。
 */
export function requiresGuardianConsent(ageBand: string): boolean {
  const band = resolveAgeBand(ageBand);
  if (!band) return true;
  return MINOR_AGE_BANDS.has(band);
}

// --- 重要事項 -----------------------------------------------------------------

/** 重要事項の版。文言を変えたら必ず上げる。同意記録に焼き込んで後から特定できるようにする。 */
export const CONSENT_TERMS_VERSION = "2026-08-06";

/**
 * 未成年入会で保護者が特に確認すべき重要事項。
 *
 * 退会・休会・違約金は入会手続きの共通案内（【1/2】重要事項の確認）で扱うため、
 * ここには**含めない**。重複させると同じ事実が2箇所に散り、片方だけ古くなる。
 */
export const GUARDIAN_CONSENT_ITEMS: readonly string[] = [
  "キックボクシングは相手と接触する競技です。打撲・捻挫・骨折などのけがが起こる可能性があります。",
  "当ジムは安全管理に努めていますが、競技の性質上、けがのリスクをゼロにすることはできません。",
  "会員ご本人および保護者の方は、インストラクターの指示とジムのルールに従ってください。",
  "体調やお怪我、練習の様子について、保護者の方へご連絡・ご相談をお願いする場合があります。",
];

// --- カード式のフロー ---------------------------------------------------------

/** この言葉が打たれたら入会手続きのカードを出す */
export const GUARDIAN_CONSENT_TRIGGER = "入会手続き";

/**
 * 選択式カード1枚ぶんの中身。
 * Flex / Buttons どちらで描くかは送信側に委ねるため、見出し・本文・ボタンだけを持つ。
 * ボタンの `send` は「押したときにお客様の発言として送信されるテキスト」。
 * それが次の応答を呼ぶ（LINE応答メッセージのノーコード運用と同じ考え方）。
 */
export interface ChoiceCard {
  title: string;
  text: string;
  options: ReadonlyArray<{ label: string; send: string }>;
}

/** 1枚目。「未成年ですか？」を年代の選択という形で尋ねる。生年月日は聞かない。 */
export function buildAgeBandQuestion(): ChoiceCard {
  return {
    title: "入会手続き",
    text: [
      "ご入会のお手続きを始めます。",
      "初心者の方も、ご自身のペースで安心して始めていただけます。",
      "",
      "まず、ご入会される方の年代をお選びください。",
    ].join("\n"),
    options: [
      { label: "小学生", send: `${GUARDIAN_CONSENT_TRIGGER} 小学生` },
      { label: "中学生", send: `${GUARDIAN_CONSENT_TRIGGER} 中学生` },
      { label: "高校生", send: `${GUARDIAN_CONSENT_TRIGGER} 高校生` },
      { label: "成人（18歳以上）", send: `${GUARDIAN_CONSENT_TRIGGER} 成人` },
    ],
  };
}

/** 押されるとトークに残る同意文。これがそのまま同意の記録になる。 */
export const GUARDIAN_CONSENT_REPLY =
  "私は保護者として、けがのリスク・指示に従うこと・保護者への連絡について確認し、未成年者の入会に同意します。";

/** 2枚目。未成年が選ばれたときだけ出す。 */
export function buildGuardianConsentCard(): ChoiceCard {
  const list = GUARDIAN_CONSENT_ITEMS.map((text, i) => `${i + 1}. ${text}`).join("\n\n");
  return {
    title: "【保護者の方へ】未成年の方のご入会について",
    text: [
      "お子さまに安心して通っていただくために、保護者の方にご確認いただきたいことがあります。",
      "次の4点をご覧ください。",
      "",
      list,
      "",
      "初心者の方も、ご自身のペースで無理なく続けられるようお手伝いします。",
      "ご不明な点は、同意される前にお気軽にご相談ください。",
      "",
      "次にすること：下のボタンを押してください。",
    ].join("\n"),
    options: [{ label: "確認して保護者として同意する", send: GUARDIAN_CONSENT_REPLY }],
  };
}

/**
 * 年代の選択を受けて、次に出すカードを決める。
 * 成人なら null（＝未成年フローに入らず、既存の入会案内へそのまま進む）。
 */
export function nextCardForAgeBand(ageBand: string): ChoiceCard | null {
  return requiresGuardianConsent(ageBand) ? buildGuardianConsentCard() : null;
}

/** 同意文を受け取ったか（次の案内へ進んでよいか）を判定する。 */
export function isGuardianConsentReply(text: string): boolean {
  return (text ?? "").trim() === GUARDIAN_CONSENT_REPLY;
}

// --- 記録 ---------------------------------------------------------------------

/**
 * 管理番号を組み立てる。FG-MC-YYYY.MM.DD.NNNN（MC = Minor Consent）。
 * 紙の同意書に手書きで転記して突き合わせる想定のため、短く読みやすい形にする。
 *
 * 区切りにハイフンを使わないのは、返信前の品質ゲート（response_quality.ts）が
 * `20260806-0001` のような並びを**電話番号と誤検出**して送信を止めてしまうため。
 * ドット区切りなら誤検出されない（2026-08-06 に実測して確認）。
 */
export function formatManagementNumber(seq: number, at: Date = new Date()): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, "0");
  const d = String(at.getDate()).padStart(2, "0");
  return `FG-MC-${y}.${m}.${d}.${String(seq).padStart(4, "0")}`;
}

/** 同意を受け付けたことをトークに残す文。管理番号は紙の同意書と突き合わせる鍵になる。 */
export function buildConsentRecordMessage(managementNumber: string, at: Date = new Date()): string {
  return [
    "保護者同意を受け付けました。",
    "",
    `管理番号: ${managementNumber}`,
    `同意日時: ${formatJstStamp(at)}`,
    "",
    "初回ご来館時に、紙の同意書へご署名をお願いいたします。",
    "安心してお通いいただけるよう、しっかりお手伝いします。",
    "ご不明な点はこのトークでお気軽にお尋ねください。",
  ].join("\n");
}

/** 日時を「2026-08-06 14:30」形式（JST）にする。 */
function formatJstStamp(at: Date): string {
  const jst = new Date(at.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const mo = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const da = String(jst.getUTCDate()).padStart(2, "0");
  const hh = String(jst.getUTCHours()).padStart(2, "0");
  const mi = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${y}-${mo}-${da} ${hh}:${mi}`;
}
