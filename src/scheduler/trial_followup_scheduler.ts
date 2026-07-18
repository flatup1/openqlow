// TASK E — 体験後フォロー自動化（体験当日夕方の oneshot）
//
// 既存資産だけで実装する（新ライブラリ・新レイヤーなし）:
//   - CRM の prospects.json（trialDate / status / externalId=LINE userId）
//   - src/crm/queries.ts の抽出ロジックと同じ条件
//   - src/generators/trial_followup.ts の文生成（星指定なし＝Google規約順守）
//   - src/line_bot/notifier.ts の pushLineMessage（顧客個別 or Jin へ送信）
//
// 動作（systemd/launchd の夕方タイマーから1日1回呼ばれる）:
//   1. その日が体験日（trialDate == 今日/JST）で未入会の見込み客を抽出
//      → 「当日お礼＋感想依頼（口コミ直リンク＋FlatポイントPRO）」を送る（stage=same_day）
//   2. 前日が体験日（trialDate == 昨日/JST）で未入会の見込み客を抽出
//      → 「入会案内」を送る（stage=next_day）
//   3. 各見込み客×stageは state スタンプで1回のみ（多重送信防止）
//
// 承認ゲート（恒常ルール3）:
//   - 既定は「Jin の LINE にドラフトを送る」= 人が確認して送る運用（外部顧客へは自動送信しない）
//   - OPENQLOW_TRIAL_FOLLOWUP_AUTO_SEND=true のときだけ、顧客の LINE へ直接送信する
//
// 安全装置（reminder.ts と同じ思想）:
//   - OPENQLOW_TRIAL_FOLLOWUP_DISABLED=true で完全停止
//   - LINE_CHANNEL_ACCESS_TOKEN / 宛先未設定なら no-op（pushLineMessage 側で skip）
//   - OPENQLOW_LINE_DRY_RUN=true で送信せず stdout

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { openProspectStore, type ProspectStore } from "../crm/store.js";
import type { Prospect } from "../crm/prospect.js";
import { generateTrialFollowup } from "../generators/trial_followup.js";
import { pushLineMessage } from "../line_bot/notifier.js";
import { formatDateInTimeZone } from "../utils/date.js";

export type FollowupStage = "same_day" | "next_day";

export type FollowupOutcome =
  | "sent"
  | "dry_run"
  | "skipped"
  | "no_target"
  | "already_done";

export interface FollowupAction {
  prospectId: number;
  name: string;
  stage: FollowupStage;
  outcome: FollowupOutcome;
  /** 実際に送った宛先の種別（顧客 or Jin）。送らなかった場合は none。 */
  target: "customer" | "jin" | "none";
}

export interface TrialFollowupRunResult {
  ok: boolean;
  disabled: boolean;
  dateJst: string;
  actions: FollowupAction[];
}

export interface TrialFollowupOptions {
  /** 現在時刻（テスト用） */
  now?: Date;
  /** テスト用 store 差し替え */
  store?: ProspectStore;
  /** テスト用 push 関数 */
  pushFn?: typeof pushLineMessage;
  /** state ディレクトリ差し替え（多重送信防止スタンプの置き場） */
  stateDir?: string;
  /** true で顧客の LINE へ直接送信。false（既定）は Jin へドラフト送信。 */
  autoSend?: boolean;
  /** Google口コミ直リンク（未指定なら env FLATUP_GBP_REVIEW_URL） */
  reviewUrl?: string;
  /** FlatポイントPRO 案内URL（未指定なら env FLATUP_POINT_PRO_URL） */
  pointProUrl?: string;
}

function dayInJst(iso: string): string {
  // trialDate は "YYYY-MM-DD" もしくは ISO文字列を許容する。
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return formatDateInTimeZone(new Date(t));
}

function isJoined(p: Prospect): boolean {
  return p.joined === 1 || p.status === "joined";
}

/** 体験当日フォロー対象: trialDate==today / 未入会 / 失注・保管でない。 */
export function selectSameDay(prospects: Prospect[], todayJst: string): Prospect[] {
  return prospects.filter(p =>
    dayInJst(p.trialDate) === todayJst &&
    !isJoined(p) &&
    p.status !== "lost" &&
    p.status !== "archived",
  );
}

/** 翌日入会案内対象: trialDate==yesterday / 未入会 / 失注・保管でない。 */
export function selectNextDay(prospects: Prospect[], yesterdayJst: string): Prospect[] {
  return prospects.filter(p =>
    dayInJst(p.trialDate) === yesterdayJst &&
    !isJoined(p) &&
    p.status !== "lost" &&
    p.status !== "archived",
  );
}

function stampPath(stateDir: string, prospectId: number, stage: FollowupStage, dateJst: string): string {
  return path.join(stateDir, `trial_followup_${prospectId}_${stage}_${dateJst}.txt`);
}

async function alreadyDone(stateDir: string, prospectId: number, stage: FollowupStage, dateJst: string): Promise<boolean> {
  try {
    await fs.stat(stampPath(stateDir, prospectId, stage, dateJst));
    return true;
  } catch {
    return false;
  }
}

async function markDone(stateDir: string, prospectId: number, stage: FollowupStage, dateJst: string, isoNow: string): Promise<void> {
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(stampPath(stateDir, prospectId, stage, dateJst), isoNow);
}

/** 見込み客 → 生成器の入力へ変換。 */
function toFollowupInput(p: Prospect, reviewUrl: string, pointProUrl: string) {
  const gender = /female|女/.test(p.gender) ? "female" : /male|男/.test(p.gender) ? "male" : undefined;
  return {
    gender: gender as "female" | "male" | undefined,
    ageBand: p.ageGroup || undefined,
    reaction: p.memo || undefined,
    concern: p.lostReason || undefined,
    enrollmentStatus: p.trialStatus || undefined,
    reviewUrl,
    pointProUrl,
  };
}

/** 顧客へ直接送るか、Jin へドラフトとして送るかで本文を組み立てる。 */
function wrapForJin(name: string, stage: FollowupStage, body: string): string {
  const label = stage === "same_day" ? "体験当日フォロー（お礼＋感想依頼）" : "翌日フォロー（入会案内）";
  return [
    `【体験後フォロー・確認用ドラフト】${label}`,
    `宛先: ${name} さん`,
    "――― 以下を確認して送ってください ―――",
    body,
    "―――――――――――――――――――",
    "※ このまま送ってOKなら顧客へ転送、直したい場合は編集して送ってください。",
  ].join("\n");
}

export async function runTrialFollowup(options: TrialFollowupOptions = {}): Promise<TrialFollowupRunResult> {
  const now = options.now ?? new Date();
  const dateJst = formatDateInTimeZone(now);
  const yesterdayJst = formatDateInTimeZone(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  if (process.env.OPENQLOW_TRIAL_FOLLOWUP_DISABLED === "true") {
    return { ok: true, disabled: true, dateJst, actions: [] };
  }

  const baseDir = process.env.OPENQLOW_DATA_DIR || path.join(process.cwd(), "data");
  const stateDir = options.stateDir ?? path.join(baseDir, "state");
  const store = options.store ?? openProspectStore(path.join(baseDir, "prospects.json"));
  const pushFn = options.pushFn ?? pushLineMessage;
  const autoSend = options.autoSend ?? (process.env.OPENQLOW_TRIAL_FOLLOWUP_AUTO_SEND === "true");
  const reviewUrl = options.reviewUrl ?? process.env.FLATUP_GBP_REVIEW_URL ?? "";
  const pointProUrl = options.pointProUrl ?? process.env.FLATUP_POINT_PRO_URL ?? "";

  const prospects = await store.getAll();
  const actions: FollowupAction[] = [];

  const plan: Array<{ p: Prospect; stage: FollowupStage }> = [
    ...selectSameDay(prospects, dateJst).map(p => ({ p, stage: "same_day" as const })),
    ...selectNextDay(prospects, yesterdayJst).map(p => ({ p, stage: "next_day" as const })),
  ];

  for (const { p, stage } of plan) {
    if (await alreadyDone(stateDir, p.id, stage, dateJst)) {
      actions.push({ prospectId: p.id, name: p.name, stage, outcome: "already_done", target: "none" });
      continue;
    }

    const result = generateTrialFollowup(toFollowupInput(p, reviewUrl, pointProUrl));
    const customerId = (p.externalId || "").trim();

    // stage ごとの本文（当日=お礼＋感想依頼、翌日=入会案内）
    const body = stage === "same_day"
      ? [result.messages.sameDayThanks, "", result.messages.reviewRequest].join("\n")
      : result.messages.enrollmentInfo;

    let target: "customer" | "jin" = autoSend ? "customer" : "jin";
    // 顧客直送モードでも、顧客の LINE userId が無ければ Jin へ回す（送り先が無いのに握りつぶさない）。
    if (autoSend && !customerId) {
      target = "jin";
    }

    const text = target === "customer" ? body : wrapForJin(p.name, stage, body);
    const pushOpts = target === "customer" ? { userId: customerId } : {};
    const res = await pushFn(text, pushOpts);

    let outcome: FollowupOutcome;
    if (res.mode === "sent") outcome = "sent";
    else if (res.mode === "dry_run") outcome = "dry_run";
    else outcome = "skipped";

    // 送信できた/ドライランした場合のみ「済み」を刻む（skip＝未設定はリトライ余地を残す）。
    if (outcome === "sent" || outcome === "dry_run") {
      await markDone(stateDir, p.id, stage, dateJst, now.toISOString());
    }

    actions.push({
      prospectId: p.id,
      name: p.name,
      stage,
      outcome,
      target: outcome === "skipped" ? "none" : target,
    });
  }

  return { ok: true, disabled: false, dateJst, actions };
}

// systemd/launchd から node dist/scheduler/trial_followup_scheduler.js で実行される時のみ動く。
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  runTrialFollowup()
    .then(r => {
      const summary = r.disabled
        ? "disabled"
        : r.actions.map(a => `#${a.prospectId} ${a.name} ${a.stage}=${a.outcome}(${a.target})`).join(" / ") || "no candidates";
      console.log(`[trial-followup ${r.dateJst}] ${summary}`);
      process.exit(0);
    })
    .catch(err => {
      console.error("[trial-followup] error:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
