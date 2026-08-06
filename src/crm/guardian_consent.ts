// FLATUP AI永久集客エンジン — 未成年入会の保護者同意（データモデル + 永続化）
//
// 18歳未満の入会時にだけ発生する「保護者同意」を記録する。prospect.ts / store.ts は
// 一切変更せず、独立したJSONストアとして持つ（既存の名簿を壊さないための分離）。
// 将来 node:sqlite へ差し替え可能なよう、ストアI/Oとデータ型は分離している。
//
// 運用上の位置づけ（JIN確定 2026-08-06）:
//   - 電子（LINE）: 重要事項の提示と確認チェックのみ。手書き署名は取らない。履歴管理が目的。
//   - 紙（初回来館時）: 手書き署名をもらう。こちらが原本。
// したがって本モジュールは「紙の原本を代替するもの」ではなく、事前確認の履歴を残すもの。
//
// LINE会話フローの配線は src/line_bot/（Codex担当領域）で行う。本モジュールは
// 純粋なロジックとデータのみを提供し、LINE APIには一切依存しない。

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/** 保護者同意が必要になる年齢の境界（これ未満が未成年扱い） */
export const GUARDIAN_CONSENT_AGE_THRESHOLD = 18;

/**
 * 年代の区分。生年月日は聞かない運用（JIN確定 2026-08-06）のため、
 * 保護者同意の要否はこの区分だけで判定する。
 * 生年月日という強い個人情報を持たずに済むぶん、こちらのほうが安全。
 */
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

/** 保護者同意が必要な年代（成人以外はすべて必要） */
const MINOR_AGE_BANDS: ReadonlySet<AgeBand> = new Set<AgeBand>([
  "elementary",
  "junior_high",
  "high_school",
]);

/**
 * 重要事項の版。文言を変えたら必ず上げる。
 * 同意記録に焼き込むことで「どの文言に同意したか」を後から特定できる。
 */
export const CONSENT_TERMS_VERSION = "2026-08-06";

/**
 * 未成年入会で保護者が特に確認すべき重要事項。
 *
 * 会員規約の全文をここに再掲しない。規約と重複する一般条項は載せず、
 * 「未成年の入会だからこそ保護者に確認してほしいこと」だけに絞る。
 * 料金・住所・スケジュールなどの具体値は正本（shared/canon.ts）の担当であり、
 * ここには書かない（金額や期限の日数を書くと二重管理になるため）。
 */
export const GUARDIAN_CONSENT_ITEMS: readonly string[] = [
  "キックボクシングは接触を伴う競技であり、打撲・捻挫・骨折などの怪我が発生する可能性があります。",
  "ジムは安全管理に努めますが、競技の特性上、怪我のリスクを完全に排除することはできません。",
  "会員および保護者は、インストラクターの指示およびジムのルールに従ってください。",
  "休会・退会などの手続きには期限があります。",
  "キャンペーン入会には適用条件があり、条件を満たさない場合は違約金が発生する場合があります。",
  "必要に応じて、保護者の方へご連絡・ご協力をお願いする場合があります。",
];

/** 同意の進行状態 */
export type ConsentStatus =
  | "pending" // 重要事項を提示したが、まだ両方のチェックが揃っていない
  | "consented" // 電子同意が完了（LINE上で両方チェック済み）
  | "paper_signed" // 初回来館時に紙の同意書へ署名済み（原本確保）
  | "void"; // 無効化（入会取消など）

export const CONSENT_STATUSES: ConsentStatus[] = ["pending", "consented", "paper_signed", "void"];

/** 日本語などの別名 → 正規ステータス。crm 系CLIを日本語で打てるようにする。 */
const STATUS_ALIASES: Record<string, ConsentStatus> = {
  "未完了": "pending",
  "確認中": "pending",
  "同意済み": "consented",
  "電子同意": "consented",
  "署名済み": "paper_signed",
  "紙署名済み": "paper_signed",
  "無効": "void",
  "取消": "void",
};

/** 入力（英語コード or 日本語別名）を正規ステータスに解決する。未知なら undefined。 */
export function resolveConsentStatus(input: string): ConsentStatus | undefined {
  const t = (input ?? "").trim();
  if ((CONSENT_STATUSES as string[]).includes(t)) return t as ConsentStatus;
  return STATUS_ALIASES[t];
}

export interface GuardianConsent {
  id: number;
  /** 管理番号（例: FG-MC-20260806-0001）。紙の同意書と突き合わせる鍵 */
  managementNumber: string;
  /** 紐づく見込み客ID。未紐付けは 0 */
  prospectId: number;
  /** LINE userId など外部チャネルの安定ID。誰の同意かを特定する */
  externalId: string;
  /** 入会する本人（未成年）の氏名 */
  minorName: string;
  /** 年代区分。保護者同意の要否を判定した根拠として残す */
  ageBand: AgeBand | "";
  /**
   * 生年月日 YYYY-MM-DD。LINEでは聞かない運用のため通常は空。
   * 紙の同意書から判明した場合にだけ補記する。
   */
  birthDate: string;
  /** 生年月日が判明している場合の同意時点の満年齢。不明なら null */
  ageAtConsent: number | null;
  /**
   * 保護者氏名。LINE上では入力を求めない運用のため通常は空。
   * 紙の同意書やCRMから判明した時点で補記する。
   */
  guardianName: string;
  /** 「重要事項を確認しました」のチェック */
  confirmedImportantMatters: 0 | 1;
  /** 「保護者として入会に同意します」のチェック */
  confirmedGuardianAgreement: 0 | 1;
  /** 同意した重要事項の版 */
  termsVersion: string;
  status: ConsentStatus;
  /** 電子同意が成立した日時（ISO文字列）。未成立は空 */
  consentedAt: string;
  /** 紙の同意書に署名をもらった日時（ISO文字列）。未署名は空 */
  paperSignedAt: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
}

/** 新規作成・更新時に受け取れる部分入力 */
export type GuardianConsentInput = Partial<Omit<GuardianConsent, "id" | "createdAt" | "updatedAt">>;

const DEFAULTS: Omit<GuardianConsent, "id" | "createdAt" | "updatedAt"> = {
  managementNumber: "",
  prospectId: 0,
  externalId: "",
  minorName: "",
  ageBand: "",
  birthDate: "",
  ageAtConsent: null,
  guardianName: "",
  confirmedImportantMatters: 0,
  confirmedGuardianAgreement: 0,
  termsVersion: CONSENT_TERMS_VERSION,
  status: "pending",
  consentedAt: "",
  paperSignedAt: "",
  memo: "",
};

/** 0/1 に正規化（真偽値・文字列・数値のいずれで来ても受ける） */
function toFlag(value: unknown): 0 | 1 {
  return value === 1 || value === "1" || value === true ? 1 : 0;
}

/** 部分入力を既定値で埋め、既知フィールドだけを取り込む（未知キーは無視）。 */
export function normalizeGuardianConsentInput(
  input: GuardianConsentInput,
): Omit<GuardianConsent, "id" | "createdAt" | "updatedAt"> {
  const out = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS) as Array<keyof typeof DEFAULTS>) {
    const value = (input as Record<string, unknown>)[key];
    if (value === undefined || value === null) continue;
    if (key === "confirmedImportantMatters" || key === "confirmedGuardianAgreement") {
      out[key] = toFlag(value);
    } else if (key === "ageBand") {
      // LINEから来る日本語ラベル（「小学生」など）を正規コードに寄せて保存する
      out.ageBand = resolveAgeBand(String(value)) ?? "";
    } else if (key === "prospectId") {
      const n = Number(value);
      out.prospectId = Number.isFinite(n) ? n : 0;
    } else {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

// --- 生年月日と年齢 -----------------------------------------------------------

/**
 * LINEで打たれた生年月日をゆるく受けて YYYY-MM-DD に正規化する。
 * 受ける形: 2010-04-01 / 2010/4/1 / 20100401 / 2010年4月1日
 * 実在しない日付（2010-02-30 など）は undefined を返す。
 */
export function parseBirthDate(input: string): string | undefined {
  const t = (input ?? "").trim();
  if (!t) return undefined;

  const digits = t.match(/^(\d{4})\D*(\d{1,2})\D*(\d{1,2})\D*$/);
  if (!digits) return undefined;

  const year = Number(digits[1]);
  const month = Number(digits[2]);
  const day = Number(digits[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;

  // 実在日チェック（Date が繰り上げたら不正な日付だった）
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return undefined;
  }

  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * 日本時間での年月日を取り出す。
 *
 * `getFullYear()` 等はサーバーのタイムゾーンに従うため、VPSがUTCだと
 * 深夜帯に日付が1日ずれる（誕生日当日を前日と誤判定する）。
 * FLATUPは日本で営業しているので、日付の判断は常にJSTで行う。
 */
function jstYmd(at: Date): { year: number; month: number; day: number } {
  const jst = new Date(at.getTime() + 9 * 60 * 60 * 1000);
  return { year: jst.getUTCFullYear(), month: jst.getUTCMonth() + 1, day: jst.getUTCDate() };
}

/**
 * 満年齢を計算する。生年月日が不正なら undefined。
 * @param birthDate YYYY-MM-DD（ゆるい表記も parseBirthDate 経由で受ける）
 * @param asOf 基準日（省略時は現在）。日本時間で解釈する。
 */
export function calculateAge(birthDate: string, asOf: Date = new Date()): number | undefined {
  const normalized = parseBirthDate(birthDate);
  if (!normalized) return undefined;

  const [y, m, d] = normalized.split("-").map(Number);
  const today = jstYmd(asOf);
  let age = today.year - y;
  const beforeBirthday = today.month < m || (today.month === m && today.day < d);
  if (beforeBirthday) age -= 1;
  return age < 0 ? undefined : age;
}

/**
 * 保護者同意が必要かを判定する。判定材料は年代区分のみ（生年月日は聞かない）。
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

// --- 同意の成立判定 -----------------------------------------------------------

/**
 * 電子同意が成立しているか。
 * 「重要事項の確認」と「保護者としての同意」の両方が揃って初めて成立する。
 * 片方だけでは成立させない（依頼の「両方チェックしないと次へ進めない」に対応）。
 */
export function isConsentComplete(
  consent: Pick<GuardianConsent, "confirmedImportantMatters" | "confirmedGuardianAgreement">,
): boolean {
  return consent.confirmedImportantMatters === 1 && consent.confirmedGuardianAgreement === 1;
}

/**
 * 管理番号を組み立てる。FG-MC-YYYY.MM.DD.NNNN（MC = Minor Consent）。
 * 紙の同意書に手書きで転記して突き合わせる想定のため、短く読みやすい形にする。
 *
 * 区切りにハイフンを使わないのは、AIKAの返信前ゲート（port/aika/response_quality.ts）が
 * `20260806-0001` のような並びを**電話番号と誤検出**して送信を止めてしまうため。
 * port/aika/guardian_consent.ts と同じ形式を保つこと。
 */
export function formatManagementNumber(id: number, at: Date = new Date()): string {
  const { year, month, day } = jstYmd(at);
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `FG-MC-${year}.${m}.${d}.${String(id).padStart(4, "0")}`;
}

// --- LINEトークに残す文面 -----------------------------------------------------

/** 重要事項の提示文（LINEで最初に送る本文）。会員規約の再掲はしない。 */
export function buildImportantMattersMessage(): string {
  const list = GUARDIAN_CONSENT_ITEMS.map((text, i) => `${i + 1}. ${text}`).join("\n");
  return [
    "【未成年の方のご入会について｜保護者の方へ】",
    "",
    "ご入会にあたり、保護者の方に特にご確認いただきたい点をまとめました。",
    "",
    list,
    "",
    "※ 会員規約の全文とあわせてご確認ください。",
    "※ 初回ご来館時に、紙の同意書へご署名をお願いしております。",
  ].join("\n");
}

/** この言葉がLINEで打たれたら入会手続きのカードを出す */
export const GUARDIAN_CONSENT_TRIGGER = "入会手続き";

/**
 * 選択式カード1枚ぶんの中身。
 * LINE の Flex / Buttons どちらで描くかは line_bot 側の判断に委ねるため、
 * ここでは見出し・本文・ボタンだけを持つ素のデータとして返す。
 */
export interface ChoiceCard {
  title: string;
  text: string;
  options: ReadonlyArray<{ label: string; value: string }>;
}

/**
 * ボタンの postback に載せるアクション名。
 * line_bot 側と綴りを揃えるため、文字列を直接書かずここを参照する。
 */
export const CONSENT_ACTIONS = {
  ageBand: "guardian_consent:age_band",
  confirmMatters: "guardian_consent:confirm_matters",
  confirmAgreement: "guardian_consent:confirm_agreement",
} as const;

/**
 * 1枚目のカード。「未成年ですか？」を年代の選択という形で尋ねる。
 * 生年月日は聞かない（JIN確定 2026-08-06）。
 */
export function buildAgeBandQuestion(): ChoiceCard {
  return {
    title: "入会手続き",
    text: "ご入会される方の年代をお選びください。",
    options: [
      { label: "小学生", value: "elementary" },
      { label: "中学生", value: "junior_high" },
      { label: "高校生", value: "high_school" },
      { label: "成人（18歳以上）", value: "adult" },
    ],
  };
}

/**
 * 2枚目のカード。未成年が選ばれたときだけ出す。
 * 重要事項は別メッセージ（buildImportantMattersMessage）で先に送る前提で、
 * ここは確認ボタンだけを持たせる。両方押されるまで先へ進めない。
 */
export function buildGuardianConsentCard(): ChoiceCard {
  return {
    title: "保護者の方へ",
    text: "保護者の方、入会に同意しますか。\n下の2つの両方をお選びいただくと、お手続きに進めます。",
    options: [
      { label: "重要事項を確認しました", value: CONSENT_ACTIONS.confirmMatters },
      { label: "保護者として入会に同意します", value: CONSENT_ACTIONS.confirmAgreement },
    ],
  };
}

/** まだ押されていないほうを案内する文。片方だけ押された時にそのまま送れる。 */
export function buildRemainingConfirmationMessage(
  consent: Pick<GuardianConsent, "confirmedImportantMatters" | "confirmedGuardianAgreement">,
): string {
  if (isConsentComplete(consent)) return "";
  const remaining: string[] = [];
  if (consent.confirmedImportantMatters !== 1) remaining.push("「重要事項を確認しました」");
  if (consent.confirmedGuardianAgreement !== 1) remaining.push("「保護者として入会に同意します」");
  return `お手続きを進めるには、${remaining.join(" と ")} のご確認をお願いいたします。`;
}

/**
 * 同意完了後にLINEトークへ残す記録文。
 * これがトーク履歴そのものに残ることで、後から遡って確認できるようにする。
 */
export function buildConsentRecordMessage(consent: GuardianConsent): string {
  const lines = [
    "保護者同意を受け付けました。",
    "",
    `管理番号: ${consent.managementNumber}`,
    `同意日時: ${formatJstStamp(consent.consentedAt)}`,
  ];
  if (consent.guardianName) lines.push(`保護者氏名: ${consent.guardianName}`);
  if (consent.minorName) lines.push(`ご本人氏名: ${consent.minorName}`);
  lines.push(
    "",
    "初回ご来館時に、紙の同意書へご署名をお願いいたします。",
    "安心してお通いいただけるよう、しっかりお手伝いします。",
    "ご不明な点はこのトークでお気軽にお尋ねください。",
  );
  return lines.join("\n");
}

/** ISO文字列を「2026-08-06 14:30」形式（JST）にする。空なら空文字。 */
function formatJstStamp(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const mo = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const da = String(jst.getUTCDate()).padStart(2, "0");
  const hh = String(jst.getUTCHours()).padStart(2, "0");
  const mi = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${y}-${mo}-${da} ${hh}:${mi}`;
}

// --- 永続化 -------------------------------------------------------------------

export interface GuardianConsentStore {
  create(input: GuardianConsentInput): Promise<GuardianConsent>;
  getAll(): Promise<GuardianConsent[]>;
  get(id: number): Promise<GuardianConsent | undefined>;
  findByExternalId(externalId: string): Promise<GuardianConsent | undefined>;
  findByManagementNumber(managementNumber: string): Promise<GuardianConsent | undefined>;
  update(id: number, patch: GuardianConsentInput): Promise<GuardianConsent | undefined>;
  remove(id: number): Promise<boolean>;
}

async function readAll(filePath: string): Promise<GuardianConsent[]> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GuardianConsent[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeAll(filePath: string, list: GuardianConsent[]): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  // 一時ファイルに書き切ってから rename（同一ディレクトリ内なので原子的）。
  // 保存の途中で中断しても同意履歴が壊れない。
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(tmpPath, JSON.stringify(list, null, 2) + "\n", "utf8");
  await rename(tmpPath, filePath);
}

/**
 * JSONファイルを背後に持つ保護者同意ストアを開く。
 * @param filePath 保存先 JSON のパス
 * @param now タイムスタンプ生成（テスト用に差し替え可能）
 */
export function openGuardianConsentStore(
  filePath: string,
  now: () => Date = () => new Date(),
): GuardianConsentStore {
  const stamp = () => now().toISOString();

  return {
    async create(input) {
      const list = await readAll(filePath);
      const nextId = list.reduce((max, c) => Math.max(max, c.id), 0) + 1;
      const at = stamp();
      const normalized = normalizeGuardianConsentInput(input);

      // 生年月日が入っていれば同意時点の年齢を確定して残す。
      if (!normalized.ageAtConsent && normalized.birthDate) {
        normalized.ageAtConsent = calculateAge(normalized.birthDate, now()) ?? null;
      }
      // 管理番号は未指定なら採番する。
      if (!normalized.managementNumber) {
        normalized.managementNumber = formatManagementNumber(nextId, now());
      }
      // 両方チェック済みなら、この時点で同意成立として日時と状態を確定する。
      if (isConsentComplete(normalized) && !normalized.consentedAt) {
        normalized.consentedAt = at;
        if (normalized.status === "pending") normalized.status = "consented";
      }

      const consent: GuardianConsent = {
        id: nextId,
        ...normalized,
        createdAt: at,
        updatedAt: at,
      };
      list.push(consent);
      await writeAll(filePath, list);
      return consent;
    },

    async getAll() {
      return readAll(filePath);
    },

    async get(id) {
      const list = await readAll(filePath);
      return list.find(c => c.id === id);
    },

    async findByExternalId(externalId) {
      if (!externalId) return undefined;
      const list = await readAll(filePath);
      // 同一ユーザーに複数あれば最新を返す（子が複数人・再同意のケース）
      return [...list].reverse().find(c => c.externalId === externalId);
    },

    async findByManagementNumber(managementNumber) {
      if (!managementNumber) return undefined;
      const list = await readAll(filePath);
      return list.find(c => c.managementNumber === managementNumber);
    },

    async update(id, patch) {
      const list = await readAll(filePath);
      const index = list.findIndex(c => c.id === id);
      if (index < 0) return undefined;
      const current = list[index];
      const normalized = normalizeGuardianConsentInput({ ...current, ...patch });

      // 更新で両方チェックが揃ったら、その瞬間を同意成立とする。
      if (isConsentComplete(normalized) && !normalized.consentedAt) {
        normalized.consentedAt = stamp();
        if (normalized.status === "pending") normalized.status = "consented";
      }
      // 紙の署名日が入ったら状態を進める（原本確保）。
      if (normalized.paperSignedAt && normalized.status === "consented") {
        normalized.status = "paper_signed";
      }

      const updated: GuardianConsent = {
        ...normalized,
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: stamp(),
      };
      list[index] = updated;
      await writeAll(filePath, list);
      return updated;
    },

    async remove(id) {
      const list = await readAll(filePath);
      const next = list.filter(c => c.id !== id);
      if (next.length === list.length) return false;
      await writeAll(filePath, next);
      return true;
    },
  };
}
