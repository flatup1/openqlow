// 入会後フォロー（入会してくれた人に、続けてもらうための声かけ）— 純粋ドメイン
//
// 目的は「退会を引き止めること」ではない。入会直後の不安が大きい時期に、
// 営業ではない一言を忘れずに届けることで、通う習慣ができる前の離脱を減らす。
//
// これまでの名簿は「入会」で終わっていて、入会した人に いつ・誰へ 声をかけるかを
// 出す仕組みが無かった（文面だけが正本にあり、送るかどうかは記憶頼みだった）。
//
// このファイルは I/O を一切持たない。送信もしない。出すのは「候補」と「下書き」だけ。
// 料金・住所・スケジュールなどの具体値はここに書かない（正本は src/shared/canon.ts）。

import type { Prospect, ProspectInput, ProspectStatus } from "./prospect.js";
import { toJstDate, type WithdrawalCase } from "./withdrawal.js";

// --- ステップ -----------------------------------------------------------------

export type OnboardingStepKey = "welcome" | "week1" | "week2" | "month1";

export interface OnboardingStep {
  key: OnboardingStepKey;
  /** 画面・日報に出す名前 */
  label: string;
  /** 入会日から数えて何日目に声をかけるか（入会日＝0日目） */
  dueDay: number;
  /** 何日間 候補に出し続けるか。過ぎたら出さない（時期外れの文面を送らないため） */
  windowDays: number;
}

/**
 * 声をかける時期。正本（LINE文面 §4 入会後フォロー）にある4つだけを扱う。
 * 新しい時期（3ヶ月など）を足すときは、先に文面の正本をJINが決めてからにする。
 */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { key: "welcome", label: "入会当日", dueDay: 0, windowDays: 3 },
  { key: "week1", label: "入会1週間", dueDay: 7, windowDays: 7 },
  { key: "week2", label: "入会2週間", dueDay: 14, windowDays: 7 },
  { key: "month1", label: "入会1ヶ月", dueDay: 30, windowDays: 7 },
];

const STEP_KEYS: readonly string[] = ONBOARDING_STEPS.map(s => s.key);

export function isOnboardingStepKey(value: string): value is OnboardingStepKey {
  return STEP_KEYS.includes(value);
}

export function findOnboardingStep(key: string): OnboardingStep | undefined {
  return ONBOARDING_STEPS.find(s => s.key === key);
}

// --- 日付（日本時間で数える） ---------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

function ymdToUtcMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d);
  // 2026-02-31 のような存在しない日付は、別の日へ繰り上がるので弾く
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return Number.NaN;
  return ms;
}

/** 実在する日付の YYYY-MM-DD か。入会日の手入力の検査に使う。 */
export function isValidYmd(value: string): boolean {
  const t = (value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(ymdToUtcMs(t));
}

/**
 * 入会日から今日まで何日たったか（日本時間の日付どうしの差。入会日＝0）。
 * 入会日が未記録・不正なら null。未来の日付は負の数になる（＝まだ候補に出さない）。
 */
export function daysSinceJoin(joinedAt: string, now: Date = new Date()): number | null {
  const joined = joinDateOf(joinedAt);
  const today = toJstDate(now.toISOString());
  if (!joined || !today) return null;
  return Math.round((ymdToUtcMs(today) - ymdToUtcMs(joined)) / DAY_MS);
}

/** 入会日を日本時間の YYYY-MM-DD にする。未記録・不正（存在しない日付を含む）は空文字。 */
export function joinDateOf(joinedAt: string): string {
  const ymd = toJstDate(joinedAt ?? "");
  return ymd && !Number.isNaN(ymdToUtcMs(ymd)) ? ymd : "";
}

/** いま声をかける時期に入っているステップ。どの時期でもなければ undefined。 */
export function dueOnboardingStep(joinedAt: string, now: Date = new Date()): OnboardingStep | undefined {
  const days = daysSinceJoin(joinedAt, now);
  if (days === null) return undefined;
  return ONBOARDING_STEPS.find(s => days >= s.dueDay && days < s.dueDay + s.windowDays);
}

// --- 送信済みの記録 -------------------------------------------------------------

/** "welcome,week1" → ["welcome","week1"]。未知のキー・空要素は捨てる。 */
export function parseOnboardingSent(value: string): OnboardingStepKey[] {
  return (value ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(isOnboardingStepKey);
}

/** 送信済みにステップを1つ足した文字列を返す（重複させない・定義順に並べる）。 */
export function addOnboardingSent(value: string, key: OnboardingStepKey): string {
  const set = new Set<string>([...parseOnboardingSent(value), key]);
  return STEP_KEYS.filter(k => set.has(k)).join(",");
}

// --- 候補の抽出 -----------------------------------------------------------------

/** 入会済みの会員か（口コミ依頼候補と同じ判定にそろえる）。 */
function isJoinedMember(p: Prospect): boolean {
  return p.status === "joined" && p.joined === 1;
}

export interface OnboardingDue {
  prospect: Prospect;
  step: OnboardingStep;
  /** 入会から何日目か */
  days: number;
}

export interface OnboardingQueryOptions {
  /**
   * 候補から外す名簿番号（退会の相談・手続きに入っている会員など）。
   * 退会を申し出た人に「入会1ヶ月ですね！」を送らないための安全弁。
   */
  excludeProspectIds?: ReadonlySet<number>;
}

/**
 * 入会後フォローの候補。
 * 条件: 入会済み / 入会日が記録されている / いまが声かけの時期 / その時期の分をまだ送っていない。
 */
export function getOnboardingDue(
  prospects: Prospect[],
  now: Date = new Date(),
  options: OnboardingQueryOptions = {},
): OnboardingDue[] {
  const exclude = options.excludeProspectIds;
  const out: OnboardingDue[] = [];
  for (const p of prospects) {
    if (!isJoinedMember(p)) continue;
    if (exclude?.has(p.id)) continue;
    const days = daysSinceJoin(p.joinedAt, now);
    if (days === null) continue;
    const step = dueOnboardingStep(p.joinedAt, now);
    if (!step) continue;
    if (parseOnboardingSent(p.onboardingSent).includes(step.key)) continue;
    out.push({ prospect: p, step, days });
  }
  // 入会から日が浅い人ほど上に出す（いちばん不安が大きい時期を先に）
  return out.sort((a, b) => a.days - b.days || a.prospect.id - b.prospect.id);
}

/**
 * 入会済みなのに入会日が記録されていない会員。
 * 入会日が無いと声かけの時期を数えられない。推測では埋めず、人に補ってもらう。
 */
export function getJoinDateMissing(prospects: Prospect[]): Prospect[] {
  return prospects.filter(p => isJoinedMember(p) && !joinDateOf(p.joinedAt));
}

/**
 * 退会の相談・手続きに入っている会員の名簿番号（完了済みも含む）。
 * 入会後フォローの候補から外すために使う。
 *
 * 退会ケースは名簿番号（prospectId）を持たないことが多い。LINEからの相談も
 * `crm withdrawal open` も prospectId を渡さず、LINE userId で記録するため。
 * そこで LINE userId（名簿側は externalId）でも突き合わせる。
 */
export function withdrawalProspectIds(
  cases: ReadonlyArray<Pick<WithdrawalCase, "prospectId" | "lineUserId" | "currentWithdrawalStatus">>,
  prospects: ReadonlyArray<Pick<Prospect, "id" | "externalId">> = [],
): Set<number> {
  const ids = new Set<number>();
  const lineIds = new Set<string>();
  for (const c of cases) {
    if (c.currentWithdrawalStatus === "ACTIVE") continue;
    if (c.prospectId > 0) ids.add(c.prospectId);
    if (c.lineUserId) lineIds.add(c.lineUserId);
  }
  for (const p of prospects) {
    if (p.externalId && lineIds.has(p.externalId)) ids.add(p.id);
  }
  return ids;
}

// --- 入会の記録 -----------------------------------------------------------------

export interface JoinPatchResult {
  /** 状態の変更と一緒に保存する差分 */
  patch: Pick<ProspectInput, "joined" | "joinedAt" | "onboardingSent">;
  /** 入会済みなのに入会日が分からないまま（人に補ってもらう必要がある） */
  joinDateMissing: boolean;
}

/**
 * 状態を変えるときに、入会フラグと入会日をそろえる。
 *
 * これまで `crm status <番号> 入会` は状態だけを変え、入会フラグ（joined）を立てていなかった。
 * そのため入会した人が口コミ依頼候補にも日報の「入会」にも出てこなかった。
 *
 * - 入会にした瞬間: フラグを立て、入会日を記録する（指定が無ければ今日）。フォローの送信記録は新しく始める。
 * - すでに入会済みの記録をもう一度「入会」にしたとき: 入会日を今日と決めつけない。
 *   指定（--joined-at）があるときだけ入会日を入れる。
 * - 入会から別の状態へ戻したとき（押し間違いの訂正など）: フラグを下ろす。
 *   下ろさないと、未入会として追客すべき人が追客一覧から消えたままになる。
 *
 * @param explicitJoinedAt 人が指定した入会日（YYYY-MM-DD）。呼び出し側で isValidYmd を確認してから渡す
 */
export function buildJoinPatch(
  current: Pick<Prospect, "status" | "joinedAt">,
  nextStatus: ProspectStatus,
  options: { explicitJoinedAt?: string; now?: Date } = {},
): JoinPatchResult {
  if (nextStatus !== "joined") {
    return { patch: current.status === "joined" ? { joined: 0 } : {}, joinDateMissing: false };
  }
  const explicit = (options.explicitJoinedAt ?? "").trim();
  const entering = current.status !== "joined";
  if (explicit) {
    return {
      patch: { joined: 1, joinedAt: explicit, ...(entering ? { onboardingSent: "" } : {}) },
      joinDateMissing: false,
    };
  }
  if (entering) {
    return {
      patch: { joined: 1, joinedAt: (options.now ?? new Date()).toISOString(), onboardingSent: "" },
      joinDateMissing: false,
    };
  }
  return { patch: { joined: 1 }, joinDateMissing: !joinDateOf(current.joinedAt) };
}

// --- 文面（下書き） -------------------------------------------------------------
//
// 文面は LINE文面の正本（flatup-ai-os/src/data/line_flows_100.md §4 入会後フォロー）と同じ。
// ここで言い回しを作り変えない。直すときは正本を先に直し、ここを合わせる。
// どれも「営業しない・押し込まない・週1回でも大丈夫」が芯になっている。

const ONBOARDING_MESSAGES: Readonly<Record<OnboardingStepKey, readonly string[]>> = {
  welcome: [
    "ご入会ありがとうございます！",
    "これから一緒に楽しく頑張っていきましょう☀",
    "最初は週1回でも大丈夫です。",
    "無理なく、少しずつ慣れていきましょう。",
  ],
  week1: [
    "入会して1週間ですね！",
    "少しジムの雰囲気には慣れてきましたか？",
    "「この時間が通いやすい」",
    "「ここが少し不安」",
    "などあれば、遠慮なく教えてください。",
    "一緒に続けやすい形を作っていきましょう☀",
  ],
  week2: [
    "入会して2週間ですね！",
    "少しずつ体も慣れてきた頃だと思います。",
    "無理にたくさん来なくても大丈夫です。",
    "週1回でも、続けることが一番大事です。",
    "不安なことがあればいつでも聞いてください☀",
  ],
  month1: [
    "入会して1ヶ月ですね！",
    "少し慣れてきましたか？",
    "「通いやすい時間」",
    "「楽しかったこと」",
    "「ちょっと不安なこと」",
    "などあれば、遠慮なく教えてください。",
    "一緒に続けやすい形を作っていきましょう☀",
  ],
};

/** そのステップの声かけ文（下書き）。送信はしない。必ず人が確認してから送る。 */
export function buildOnboardingMessage(key: OnboardingStepKey): string {
  return ONBOARDING_MESSAGES[key].join("\n");
}
