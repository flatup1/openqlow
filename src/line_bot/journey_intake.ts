// FLAT UP WebOS → LINE 引き継ぎ（journey intake / 接続口 seam）
//
// 目的:
//   1. ユーザーがWebOSで答えた内容を、LINEで二度聞かないこと。
//   2. オーナー（Jin）が「誰が・何目的で・どんな前提か」を一目で把握できること。
//
// 流れ:
//   WebOS回答完了 → POST /journey で回答（カテゴリのみ・PIIなし）を保存し journey_id を発行
//   → ユーザーがLINEで journey_id を送信（oaMessage の入力済みリンクで1タップ）
//   → 本モジュールが journey_id と LINE userId を紐づけ
//   → ユーザーへ固定文面で「引き継ぎました」/ オーナーへ日本語要約を通知
//
// 厳守事項:
//   - ユーザーへ送る文面は固定テンプレートのみ（AI生成文を送らない）。
//   - 返信は受信への reply でのみ行う。顧客への能動 push はしない（openQLOWの担当外）。
//   - 保存するのは選択カテゴリのみ。氏名・連絡先などのPIIは最初から受け取らない。
//   - 通知は保存の後。通知が失敗しても Lead レコードは失われない（状態を記録し再送可能）。
//   - 未連携 journey は JOURNEY_TTL_DAYS 経過で自動削除。連携済みは Lead として保持。
//   - 別ユーザーが同じ journey_id を送っても紐づけ直さない（混線防止・使い捨て）。

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pushLineMessage } from "./notifier.js";

export const JOURNEY_TTL_DAYS = 7;
const JOURNEY_ID_PATTERN = /^#?\s*(J-[a-f0-9]{10,16})\s*$/i;
const MAX_LIST_VALUES = 3;

// ---- 回答の正本キー（WebOS app/js/questions.js と一致させる） ----

const ANSWER_ENUMS: Record<string, ReadonlySet<string>> = {
  audience: new Set(["self", "kids", "family", "consult"]),
  gender: new Set(["female", "male", "other"]),
  goal: new Set(["exercise", "diet", "stress", "health", "try", "strong", "defense", "friends", "unsure"]),
  experience: new Set(["first", "some", "experienced", "active"]),
  availability: new Set(["weekday_morning", "weekday_noon", "weekday_night", "saturday", "unknown"]),
  kidsAge: new Set(["preschool", "es_lower", "es_upper", "junior", "other"]),
  kidsHope: new Set(["enjoy_sports", "confidence", "manner", "strong", "bully", "fitness", "match", "fun", "unsure"]),
};

// オーナー通知用の日本語ラベル。内部キーを絶対にそのまま見せない。
const JA_LABELS: Record<string, Record<string, string>> = {
  audience: { self: "本人", kids: "お子さま", family: "ご家族", consult: "相談から（未決定）" },
  gender: { female: "女性", male: "男性", other: "回答なし" },
  goal: {
    exercise: "運動不足を解消したい", diet: "ダイエット", stress: "ストレス発散",
    health: "健康づくり", try: "格闘技をやってみたい", strong: "強くなりたい",
    defense: "護身術", friends: "仲間がほしい", unsure: "まだ検討中",
  },
  experience: { first: "完全に初めて", some: "少しだけ経験あり", experienced: "経験者", active: "現役で練習中" },
  availability: {
    weekday_morning: "平日の午前", weekday_noon: "平日の昼", weekday_night: "平日の夜",
    saturday: "土曜日", unknown: "まだ未定",
  },
  kidsAge: { preschool: "未就学", es_lower: "小学校低学年", es_upper: "小学校高学年", junior: "中学生", other: "その他" },
  kidsHope: {
    enjoy_sports: "運動を好きになってほしい", confidence: "自信をつけてほしい", manner: "礼儀を身につけてほしい",
    strong: "強くなってほしい", bully: "いじめなどへの不安", fitness: "体力をつけてほしい",
    match: "試合にも挑戦したい", fun: "楽しい習い事を探している", unsure: "まだ分からない",
  },
};

export interface JourneyAnswers {
  audience: string;
  gender?: string;
  goal?: string[];
  experience?: string;
  availability?: string[];
  kidsAge?: string;
  kidsHope?: string[];
}

export interface JourneyRecord {
  journey_id: string;
  answers: JourneyAnswers;
  source: "webos";
  created_at: string;
  linked: boolean;
  line_user_id?: string;
  linked_at?: string;
  notify_status?: "sent" | "failed" | "dry_run" | "skipped";
  notified_at?: string;
  notify_error?: string;
}

// ---- ストア（prospects.json と同じ原子的書き込み・依存ゼロ） ----

function journeysFile(dataDir: string): string {
  return path.join(dataDir, "journeys.json");
}

async function readJourneys(dataDir: string): Promise<JourneyRecord[]> {
  try {
    const raw = await readFile(journeysFile(dataDir), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as JourneyRecord[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeJourneys(dataDir: string, list: JourneyRecord[]): Promise<void> {
  const filePath = journeysFile(dataDir);
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(tmpPath, JSON.stringify(list, null, 2) + "\n", "utf8");
  await rename(tmpPath, filePath);
}

function defaultDataDir(): string {
  return process.env.OPENQLOW_DATA_DIR || path.join(process.cwd(), "data");
}

/** 未連携のまま期限を過ぎた journey を除いた一覧を返す（連携済み＝Leadは残す）。 */
export function purgeExpired(list: JourneyRecord[], now: Date): JourneyRecord[] {
  const cutoff = now.getTime() - JOURNEY_TTL_DAYS * 24 * 60 * 60 * 1000;
  return list.filter(j => j.linked || new Date(j.created_at).getTime() >= cutoff);
}

// ---- 作成（WebOSからのPOST） ----

function sanitizeList(field: string, value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const allowed = ANSWER_ENUMS[field];
  const out = value.filter((v): v is string => typeof v === "string" && allowed.has(v)).slice(0, MAX_LIST_VALUES);
  return out.length > 0 ? out : undefined;
}

function sanitizeScalar(field: string, value: unknown): string | undefined {
  return typeof value === "string" && ANSWER_ENUMS[field].has(value) ? value : undefined;
}

/** 未知のキー・未知の値は黙って捨てる。audience が無ければ作成しない。 */
export function sanitizeAnswers(input: unknown): JourneyAnswers | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const raw = input as Record<string, unknown>;
  const audience = sanitizeScalar("audience", raw.audience);
  if (!audience) return undefined;
  const answers: JourneyAnswers = { audience };
  const gender = sanitizeScalar("gender", raw.gender);
  const experience = sanitizeScalar("experience", raw.experience);
  const kidsAge = sanitizeScalar("kidsAge", raw.kidsAge);
  const goal = sanitizeList("goal", raw.goal);
  const availability = sanitizeList("availability", raw.availability);
  const kidsHope = sanitizeList("kidsHope", raw.kidsHope);
  if (gender) answers.gender = gender;
  if (experience) answers.experience = experience;
  if (kidsAge) answers.kidsAge = kidsAge;
  if (goal) answers.goal = goal;
  if (availability) answers.availability = availability;
  if (kidsHope) answers.kidsHope = kidsHope;
  return answers;
}

export interface CreateJourneyOptions {
  dataDir?: string;
  now?: Date;
}

export async function createJourneyFromWebos(
  body: unknown,
  opts: CreateJourneyOptions = {},
): Promise<{ ok: boolean; journeyId?: string; error?: string }> {
  const raw = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const answers = sanitizeAnswers(raw.answers);
  if (!answers) return { ok: false, error: "invalid_answers" };

  const dataDir = opts.dataDir ?? defaultDataDir();
  const now = opts.now ?? new Date();
  const journeyId = `J-${randomBytes(6).toString("hex")}`;

  const list = purgeExpired(await readJourneys(dataDir), now);
  list.push({
    journey_id: journeyId,
    answers,
    source: "webos",
    created_at: now.toISOString(),
    linked: false,
  });
  await writeJourneys(dataDir, list);
  return { ok: true, journeyId };
}

// ---- オーナー向け日本語要約 ----

function labelOf(field: string, key: string): string {
  return JA_LABELS[field]?.[key] ?? key;
}

function labelsOf(field: string, keys: string[] | undefined): string | undefined {
  if (!keys || keys.length === 0) return undefined;
  return keys.map(k => labelOf(field, k)).join("、");
}

/** 内部キーは出さない。未回答の行は出さない（性別スキップ等）。 */
export function formatJourneyOwnerSummary(record: JourneyRecord): string {
  const a = record.answers;
  const lines: string[] = ["【WebOSから新規相談】", ""];
  lines.push(`対象: ${labelOf("audience", a.audience)}`);
  if (a.gender && a.gender !== "other") lines.push(`性別: ${labelOf("gender", a.gender)}`);
  if (a.experience) lines.push(`経験: ${labelOf("experience", a.experience)}`);
  const goals = labelsOf("goal", a.goal);
  if (goals) lines.push(`目的: ${goals}`);
  const availability = labelsOf("availability", a.availability);
  if (availability) lines.push(`希望時間: ${availability}`);
  if (a.kidsAge) lines.push(`お子さまの年代: ${labelOf("kidsAge", a.kidsAge)}`);
  const kidsHope = labelsOf("kidsHope", a.kidsHope);
  if (kidsHope) lines.push(`保護者の期待: ${kidsHope}`);
  lines.push("経路: FLAT UP WebOS");
  lines.push("状態: LINE連携済み");
  lines.push("");
  lines.push("この方はWebOSで上記を回答済みです。同じ内容の再質問は不要です。");
  return lines.join("\n");
}

// ---- LINE側: journey_id メッセージの受付・紐づけ ----

/** ユーザーへ返す固定テンプレート（AI生成文は使わない）。 */
export const JOURNEY_LINKED_REPLY =
  "Webで教えていただいた内容は引き継いでいます。もう一度答える必要はありません。\n" +
  "このまま、気になることやご希望を送ってください。スタッフが確認してお返事します。";

export const JOURNEY_NOT_FOUND_REPLY =
  "コードの確認ができませんでしたが、ご安心ください。そのままご質問やご希望を送っていただければ、スタッフが確認してお返事します。";

export function parseJourneyIdText(text: string): string | undefined {
  const match = JOURNEY_ID_PATTERN.exec(text.trim());
  return match ? `J-${match[1].slice(2).toLowerCase()}` : undefined;
}

type NotifyOwner = (text: string) => Promise<{ ok: boolean; mode: "dry_run" | "sent" | "skipped"; error?: string }>;

export interface ExecuteLineJourneyLinkOptions {
  text: string;
  lineUserId?: string;
  dataDir?: string;
  now?: Date;
  /** テスト用差し替え。既定はオーナー（JIN_LINE_USER_ID）へのpush。 */
  notifyOwner?: NotifyOwner;
}

export interface LineJourneyLinkResult extends Record<string, unknown> {
  handled: boolean;
  ok: boolean;
  message: string;
  replyToSender: boolean;
  action?: "webos_journey_linked" | "webos_journey_not_found";
}

export async function executeLineJourneyLink(
  opts: ExecuteLineJourneyLinkOptions,
): Promise<LineJourneyLinkResult> {
  const journeyId = parseJourneyIdText(opts.text ?? "");
  if (!journeyId) {
    return { handled: false, ok: true, message: "", replyToSender: false };
  }

  const dataDir = opts.dataDir ?? defaultDataDir();
  const now = opts.now ?? new Date();
  const notifyOwner: NotifyOwner = opts.notifyOwner ?? (text => pushLineMessage(text));

  const list = purgeExpired(await readJourneys(dataDir), now);
  const record = list.find(j => j.journey_id === journeyId);

  // 見つからない / 期限切れ / 別ユーザーに連携済み（混線防止で使い捨て）は同じ扱い。
  const takenByOther = record?.linked && record.line_user_id !== opts.lineUserId;
  if (!record || takenByOther || !opts.lineUserId) {
    await writeJourneys(dataDir, list); // purge結果は保存しておく
    return {
      handled: true,
      ok: true,
      action: "webos_journey_not_found",
      message: JOURNEY_NOT_FOUND_REPLY,
      replyToSender: true,
    };
  }

  const alreadyLinked = record.linked && record.line_user_id === opts.lineUserId;

  // 1) 先にLeadとして保存（通知失敗でも情報は失われない）
  record.linked = true;
  record.line_user_id = opts.lineUserId;
  if (!alreadyLinked) record.linked_at = now.toISOString();
  await writeJourneys(dataDir, list);

  // 2) オーナー通知（同じ人の再送では二重通知しない）。結果をLeadに記録。
  if (!alreadyLinked) {
    const summary = formatJourneyOwnerSummary(record);
    try {
      const pushed = await notifyOwner(summary);
      record.notify_status = pushed.mode === "dry_run" ? "dry_run" : pushed.ok ? "sent" : "failed";
      if (!pushed.ok && pushed.error) record.notify_error = pushed.error;
    } catch (error) {
      record.notify_status = "failed";
      record.notify_error = error instanceof Error ? error.message : "notify_threw";
    }
    record.notified_at = now.toISOString();
    await writeJourneys(dataDir, list);
  }

  return {
    handled: true,
    ok: true,
    action: "webos_journey_linked",
    message: JOURNEY_LINKED_REPLY,
    replyToSender: true,
  };
}
