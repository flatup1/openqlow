// FLATUP 退会トラブルゼロ化OS v1 — 永続化（退会ケース）と append-only 監査ログ
//
// 既存の prospects.json / guardian_consents.json は一切変更しない。退会は独立した
// 2ファイルとして持つ（既存の名簿と入会時の同意履歴を壊さないための分離）。
//   - data/withdrawal_cases.json       … 現在状態（1会員1レコード）
//   - data/withdrawal_audit_logs.jsonl … 誰が・いつ・何をしたか（追記のみ・書き換えない）
//
// 保存の作法は store.ts / guardian_consent.ts と同じ（一時ファイル → rename の原子的書き込み）。
// 監査ログだけは JSONL の appendFile にする。行を書き換えるAPIを**実装しない**ことで、
// 過去ログを後から修正する経路そのものを無くしている。

import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  applyFormalReceipt,
  calcFormalReceivedAt,
  canTransition,
  deriveWithdrawalStatus,
  formatCaseNumber,
  formatJstStamp,
  isFormalReceiptComplete,
  isScheduledDateReached,
  isWithdrawalConfirmed,
  missingForClose,
  normalizeWithdrawalCaseInput,
  withdrawalStatusLabel,
  type WithdrawalCase,
  type WithdrawalCaseInput,
  type WithdrawalStatus,
} from "./withdrawal.js";

// --- 監査ログ -------------------------------------------------------------------

export type WithdrawalEventType =
  | "WITHDRAWAL_INQUIRY_RECEIVED"
  | "PROCEDURE_GUIDE_SENT"
  | "FORM_RECEIVED"
  | "CARD_KEY_RETURNED"
  | "FORMAL_RECEIPT_COMPLETED"
  | "PAYMENT_STOP_COMPLETED"
  | "CONFIRMATION_MESSAGE_SENT"
  | "OWNER_REVIEW_REQUESTED"
  | "OWNER_REVIEW_RESOLVED"
  | "ADMIN_CORRECTION"
  | "WITHDRAWAL_CLOSED";

/** 監査ログ上の日本語表示（オーナー確認画面の時系列に出す）。 */
export const WITHDRAWAL_EVENT_LABELS: Readonly<Record<WithdrawalEventType, string>> = {
  WITHDRAWAL_INQUIRY_RECEIVED: "退会意思表示",
  PROCEDURE_GUIDE_SENT: "退会方法案内",
  FORM_RECEIVED: "退会届受領",
  CARD_KEY_RETURNED: "カードキー返却",
  FORMAL_RECEIPT_COMPLETED: "正式受付",
  PAYMENT_STOP_COMPLETED: "会費ペイ処理済",
  CONFIRMATION_MESSAGE_SENT: "正式受付LINE送信",
  OWNER_REVIEW_REQUESTED: "オーナー確認へ",
  OWNER_REVIEW_RESOLVED: "オーナー確認 完了",
  ADMIN_CORRECTION: "管理者修正",
  WITHDRAWAL_CLOSED: "退会完了",
};

export type ActorType = "member" | "staff" | "owner" | "system";

export interface Actor {
  type: ActorType;
  /** スタッフ名など。LINE userId のような強い個人情報はここに入れない */
  id?: string;
}

export interface WithdrawalAuditLog {
  id: number;
  caseId: number;
  memberId: string;
  eventType: WithdrawalEventType;
  oldStatus: WithdrawalStatus | "";
  newStatus: WithdrawalStatus | "";
  actorType: ActorType;
  actorId: string;
  /** LINE / CLI / system など、その操作がどこから来たか */
  source: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface WithdrawalAuditLogStore {
  append(entry: Omit<WithdrawalAuditLog, "id" | "createdAt">): Promise<WithdrawalAuditLog>;
  getAll(): Promise<WithdrawalAuditLog[]>;
  getByCase(caseId: number): Promise<WithdrawalAuditLog[]>;
}

async function readLogs(filePath: string): Promise<WithdrawalAuditLog[]> {
  try {
    const raw = await readFile(filePath, "utf8");
    return raw
      .split("\n")
      .filter(line => line.trim().length > 0)
      .map(line => {
        try {
          return JSON.parse(line) as WithdrawalAuditLog;
        } catch {
          // 壊れた行があっても残りのログを読めるようにする（証跡を全部失うほうが痛い）
          return undefined;
        }
      })
      .filter((entry): entry is WithdrawalAuditLog => entry !== undefined);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/**
 * append-only の監査ログを開く。
 * 更新・削除のAPIは意図的に用意していない（過去ログを書き換える方式は禁止）。
 * @param filePath 保存先 JSONL のパス
 * @param now タイムスタンプ生成（テスト用に差し替え可能）
 */
export function openWithdrawalAuditLog(
  filePath: string,
  now: () => Date = () => new Date(),
): WithdrawalAuditLogStore {
  return {
    async append(entry) {
      const existing = await readLogs(filePath);
      const record: WithdrawalAuditLog = {
        id: existing.reduce((max, e) => Math.max(max, e.id), 0) + 1,
        ...entry,
        createdAt: now().toISOString(),
      };
      await mkdir(path.dirname(filePath), { recursive: true });
      await appendFile(filePath, JSON.stringify(record) + "\n", "utf8");
      return record;
    },
    async getAll() {
      return readLogs(filePath);
    },
    async getByCase(caseId) {
      const all = await readLogs(filePath);
      return all.filter(e => e.caseId === caseId);
    },
  };
}

// --- 退会ケースのストア ---------------------------------------------------------

export interface WithdrawalCaseStore {
  create(input: WithdrawalCaseInput): Promise<WithdrawalCase>;
  getAll(): Promise<WithdrawalCase[]>;
  get(id: number): Promise<WithdrawalCase | undefined>;
  findByMemberId(memberId: string): Promise<WithdrawalCase | undefined>;
  findByLineUserId(lineUserId: string): Promise<WithdrawalCase | undefined>;
  findByCaseNumber(caseNumber: string): Promise<WithdrawalCase | undefined>;
  update(id: number, patch: WithdrawalCaseInput): Promise<WithdrawalCase | undefined>;
}

async function readCases(filePath: string): Promise<WithdrawalCase[]> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WithdrawalCase[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeCases(filePath: string, list: WithdrawalCase[]): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  // 一時ファイルに書き切ってから rename（同一ディレクトリ内なので原子的）。
  // 保存の途中で中断しても退会台帳が壊れない。
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(tmpPath, JSON.stringify(list, null, 2) + "\n", "utf8");
  await rename(tmpPath, filePath);
}

/**
 * 事実（日時）から派生する値をすべて計算し直す。
 *
 * 正式受付日・退会予定日・最終在籍月・現在状態は、この関数以外では決まらない。
 * スタッフもAIも、この4つを直接書き込む経路を持たない。
 */
function recomputeDerived(rec: WithdrawalCase): WithdrawalCase {
  let next: WithdrawalCase = isFormalReceiptComplete(rec)
    ? applyFormalReceipt({ ...rec, formalReceivedAt: calcFormalReceivedAt(rec) })
    : { ...rec, formalReceivedAt: "", scheduledWithdrawalDate: "", finalMembershipMonth: "" };
  next = { ...next, currentWithdrawalStatus: deriveWithdrawalStatus(next) };
  return next;
}

/**
 * JSONファイルを背後に持つ退会ケースストアを開く。
 * @param filePath 保存先 JSON のパス
 * @param now タイムスタンプ生成（テスト用に差し替え可能）
 */
export function openWithdrawalCaseStore(
  filePath: string,
  now: () => Date = () => new Date(),
): WithdrawalCaseStore {
  const stamp = () => now().toISOString();

  return {
    async create(input) {
      const list = await readCases(filePath);
      const nextId = list.reduce((max, c) => Math.max(max, c.id), 0) + 1;
      const at = stamp();
      const normalized = normalizeWithdrawalCaseInput(input);
      if (!normalized.caseNumber) normalized.caseNumber = formatCaseNumber(nextId, now());

      const created = recomputeDerived({
        id: nextId,
        ...normalized,
        createdAt: at,
        updatedAt: at,
      });
      list.push(created);
      await writeCases(filePath, list);
      return created;
    },

    async getAll() {
      return readCases(filePath);
    },

    async get(id) {
      const list = await readCases(filePath);
      return list.find(c => c.id === id);
    },

    async findByMemberId(memberId) {
      if (!memberId) return undefined;
      const list = await readCases(filePath);
      // 同一会員に複数あれば最新を返す（再入会 → 再退会のケース）
      return [...list].reverse().find(c => c.memberId === memberId);
    },

    async findByLineUserId(lineUserId) {
      if (!lineUserId) return undefined;
      const list = await readCases(filePath);
      return [...list].reverse().find(c => c.lineUserId === lineUserId);
    },

    async findByCaseNumber(caseNumber) {
      if (!caseNumber) return undefined;
      const list = await readCases(filePath);
      return list.find(c => c.caseNumber === caseNumber);
    },

    async update(id, patch) {
      const list = await readCases(filePath);
      const index = list.findIndex(c => c.id === id);
      if (index < 0) return undefined;
      const current = list[index];
      const merged = normalizeWithdrawalCaseInput({ ...current, ...patch });
      const updated = recomputeDerived({
        ...merged,
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: stamp(),
      });
      list[index] = updated;
      await writeCases(filePath, list);
      return updated;
    },
  };
}

// --- 高レベル操作（スタッフ操作＝ボタン1つ分） -----------------------------------

export interface WithdrawalServiceOptions {
  /** data ディレクトリ。既定は OPENQLOW_DATA_DIR または ./data */
  dataDir?: string;
  now?: () => Date;
}

export interface WithdrawalOpResult {
  ok: boolean;
  /** 何もしなかった理由（重複・条件未達など）。ok=true でも入ることがある */
  reason?: string;
  message: string;
  case?: WithdrawalCase;
  /** 人が確認してから送るLINE文面（このシステムは自動送信しない） */
  draft?: string;
}

export interface WithdrawalService {
  cases: WithdrawalCaseStore;
  audit: WithdrawalAuditLogStore;
  /** 退会の相談を受けた（LINE/電話/メール/来館）。正式受付には**しない** */
  recordInquiry(input: {
    memberId: string;
    lineUserId?: string;
    memberName?: string;
    prospectId?: number;
    channel?: string;
    /** LINE の messageId。同じイベントが2回来ても二重処理しないための鍵 */
    messageId?: string;
    keywords?: string[];
    actor?: Actor;
    source?: string;
  }): Promise<WithdrawalOpResult>;
  /** 手続き案内を送った（同じ会員へ連続送信しない） */
  markProcedureGuided(input: {
    caseId: number;
    messageId?: string;
    actor?: Actor;
    source?: string;
    force?: boolean;
  }): Promise<WithdrawalOpResult>;
  /** ［退会届受領］ */
  receiveWithdrawalForm(input: { caseId: number; at?: string; actor?: Actor }): Promise<WithdrawalOpResult>;
  /** ［カードキー返却］ */
  returnCardKey(input: { caseId: number; at?: string; actor?: Actor }): Promise<WithdrawalOpResult>;
  /** 正式受付LINEを送った */
  markConfirmationSent(input: { caseId: number; actor?: Actor; force?: boolean }): Promise<WithdrawalOpResult>;
  /** ［会費ペイ処理済］。会費ペイAPIは無いので、人が押したときだけ真になる */
  completePaymentStop(input: { caseId: number; actor?: Actor; note?: string }): Promise<WithdrawalOpResult>;
  /** ［オーナー確認へ］ */
  requestOwnerReview(input: { caseId: number; reason: string; actor?: Actor }): Promise<WithdrawalOpResult>;
  /** オーナー確認の解除（オーナー権限＋理由必須） */
  resolveOwnerReview(input: { caseId: number; note: string; actor: Actor }): Promise<WithdrawalOpResult>;
  /** 退会完了。4条件と退会予定日の到来を確認してから */
  closeWithdrawal(input: { caseId: number; actor?: Actor; force?: boolean }): Promise<WithdrawalOpResult>;
  /** 管理者による修正（オーナー権限＋変更理由＋監査ログ必須） */
  adminCorrect(input: {
    caseId: number;
    field: CorrectableField;
    value: string;
    reason: string;
    actor: Actor;
  }): Promise<WithdrawalOpResult>;
}

/**
 * 管理者が直接直せる項目。
 *
 * 退会予定日・最終在籍月・正式受付日・状態は**入っていない**。
 * これらは退会届とカードキーの日付から必ず再計算されるので、
 * 「日付を手で書き換える」経路が存在しない。直したいときは元の2つの日付を直す。
 */
export type CorrectableField =
  | "memberId"
  | "memberName"
  | "lineUserId"
  | "prospectId"
  | "withdrawalInquiryChannel"
  | "firstWithdrawalInquiryAt"
  | "withdrawalFormReceivedAt"
  | "cardKeyReturnedAt"
  | "paymentStopStatus"
  | "memo";

export const CORRECTABLE_FIELDS: CorrectableField[] = [
  "memberId",
  "memberName",
  "lineUserId",
  "prospectId",
  "withdrawalInquiryChannel",
  "firstWithdrawalInquiryAt",
  "withdrawalFormReceivedAt",
  "cardKeyReturnedAt",
  "paymentStopStatus",
  "memo",
];

function defaultDataDir(): string {
  return process.env.OPENQLOW_DATA_DIR || path.join(process.cwd(), "data");
}

const SYSTEM_ACTOR: Actor = { type: "system" };

/**
 * 退会オペレーションをまとめて開く。
 * 状態変化は必ずこの層を通し、同じトランザクションで監査ログを書く
 * （「更新したがログが無い」を作らないため）。
 */
export function openWithdrawalService(options: WithdrawalServiceOptions = {}): WithdrawalService {
  const dataDir = options.dataDir ?? defaultDataDir();
  const now = options.now ?? (() => new Date());
  const cases = openWithdrawalCaseStore(path.join(dataDir, "withdrawal_cases.json"), now);
  const audit = openWithdrawalAuditLog(path.join(dataDir, "withdrawal_audit_logs.jsonl"), now);

  /** 状態を更新し、変化を監査ログへ残す。正式受付が成立した瞬間は追加で1本残す。 */
  async function applyAndLog(input: {
    current: WithdrawalCase;
    patch: WithdrawalCaseInput;
    eventType: WithdrawalEventType;
    actor: Actor;
    source: string;
    metadata?: Record<string, unknown>;
  }): Promise<WithdrawalCase> {
    const { current, patch, eventType, actor, source } = input;
    const before = current.currentWithdrawalStatus;
    const wasFormal = Boolean(current.formalReceivedAt);

    const updated = (await cases.update(current.id, {
      ...patch,
      handledBy: actor.id || current.handledBy,
    }))!;

    await audit.append({
      caseId: updated.id,
      memberId: updated.memberId,
      eventType,
      oldStatus: before,
      newStatus: updated.currentWithdrawalStatus,
      actorType: actor.type,
      actorId: actor.id ?? "",
      source,
      metadata: input.metadata ?? {},
    });

    // 退会届とカードキーが揃った「その瞬間」を、独立した1件として必ず残す。
    // 後からクレームになったとき、正式受付日の根拠がこの1行で示せる。
    if (!wasFormal && updated.formalReceivedAt) {
      await audit.append({
        caseId: updated.id,
        memberId: updated.memberId,
        eventType: "FORMAL_RECEIPT_COMPLETED",
        oldStatus: before,
        newStatus: updated.currentWithdrawalStatus,
        actorType: "system",
        actorId: "",
        source: "system",
        metadata: {
          formalReceivedAt: updated.formalReceivedAt,
          scheduledWithdrawalDate: updated.scheduledWithdrawalDate,
          finalMembershipMonth: updated.finalMembershipMonth,
        },
      });
    }

    return updated;
  }

  /** 同じ LINE メッセージで既に同じ種類の処理をしていないか（webhookの二重配信対策）。 */
  async function alreadyHandled(
    caseId: number,
    eventType: WithdrawalEventType,
    messageId?: string,
  ): Promise<boolean> {
    if (!messageId) return false;
    const logs = await audit.getByCase(caseId);
    return logs.some(e => e.eventType === eventType && e.metadata?.messageId === messageId);
  }

  return {
    cases,
    audit,

    async recordInquiry(input) {
      const actor = input.actor ?? { type: "member" };
      const source = input.source ?? input.channel ?? "LINE";
      const at = now().toISOString();

      if (!input.memberId && !input.lineUserId) {
        return { ok: false, reason: "no_key", message: "会員番号かLINE userId のどちらかが必要です。" };
      }

      let record =
        (input.memberId ? await cases.findByMemberId(input.memberId) : undefined) ??
        (input.lineUserId ? await cases.findByLineUserId(input.lineUserId) : undefined);

      if (!record) {
        record = await cases.create({
          memberId: input.memberId,
          lineUserId: input.lineUserId,
          memberName: input.memberName,
          prospectId: input.prospectId,
          withdrawalInquiryChannel: input.channel ?? "LINE",
          firstWithdrawalInquiryAt: at,
        });
        await audit.append({
          caseId: record.id,
          memberId: record.memberId,
          eventType: "WITHDRAWAL_INQUIRY_RECEIVED",
          oldStatus: "ACTIVE",
          newStatus: record.currentWithdrawalStatus,
          actorType: actor.type,
          actorId: actor.id ?? "",
          source,
          // 本文は残さない。拾った言葉だけ残す（個人情報を増やさない）
          metadata: { keywords: input.keywords ?? [], messageId: input.messageId ?? "" },
        });
        return {
          ok: true,
          message: "退会のご相談として記録しました（正式受付ではありません）。",
          case: record,
          draft: undefined,
        };
      }

      if (await alreadyHandled(record.id, "WITHDRAWAL_INQUIRY_RECEIVED", input.messageId)) {
        return {
          ok: true,
          reason: "duplicate_message",
          message: "同じメッセージを既に処理済みです（重複処理はしていません）。",
          case: record,
        };
      }

      // 最初の意思表示日時は上書きしない。これが「いつ相談されたか」の唯一の証跡になる。
      if (record.firstWithdrawalInquiryAt) {
        await audit.append({
          caseId: record.id,
          memberId: record.memberId,
          eventType: "WITHDRAWAL_INQUIRY_RECEIVED",
          oldStatus: record.currentWithdrawalStatus,
          newStatus: record.currentWithdrawalStatus,
          actorType: actor.type,
          actorId: actor.id ?? "",
          source,
          metadata: {
            keywords: input.keywords ?? [],
            messageId: input.messageId ?? "",
            note: "初回相談日時は保持（上書きしない）",
          },
        });
        return {
          ok: true,
          reason: "already_inquired",
          message: "既に退会相談として記録済みです（最初の相談日時は保持しています）。",
          case: record,
        };
      }

      const updated = await applyAndLog({
        current: record,
        patch: {
          firstWithdrawalInquiryAt: at,
          withdrawalInquiryChannel: input.channel ?? record.withdrawalInquiryChannel ?? "LINE",
          ...(input.lineUserId ? { lineUserId: input.lineUserId } : {}),
          ...(input.memberName ? { memberName: input.memberName } : {}),
        },
        eventType: "WITHDRAWAL_INQUIRY_RECEIVED",
        actor,
        source,
        metadata: { keywords: input.keywords ?? [], messageId: input.messageId ?? "" },
      });
      return {
        ok: true,
        message: "退会のご相談として記録しました（正式受付ではありません）。",
        case: updated,
      };
    },

    async markProcedureGuided(input) {
      const record = await cases.get(input.caseId);
      if (!record) return { ok: false, reason: "not_found", message: "該当の退会ケースが見つかりません。" };

      if (await alreadyHandled(record.id, "PROCEDURE_GUIDE_SENT", input.messageId)) {
        return {
          ok: true,
          reason: "duplicate_message",
          message: "同じメッセージで案内済みです（重複送信はしていません）。",
          case: record,
        };
      }
      if (record.procedureGuidedAt && !input.force) {
        return {
          ok: true,
          reason: "already_guided",
          message: "手続き案内は送信済みです（重複送信はしていません）。",
          case: record,
        };
      }

      const updated = await applyAndLog({
        current: record,
        patch: { procedureGuidedAt: record.procedureGuidedAt || now().toISOString() },
        eventType: "PROCEDURE_GUIDE_SENT",
        actor: input.actor ?? SYSTEM_ACTOR,
        source: input.source ?? "LINE",
        metadata: { messageId: input.messageId ?? "" },
      });
      return { ok: true, message: "手続き案内の送信を記録しました。", case: updated };
    },

    async receiveWithdrawalForm(input) {
      const record = await cases.get(input.caseId);
      if (!record) return { ok: false, reason: "not_found", message: "該当の退会ケースが見つかりません。" };
      if (record.withdrawalFormReceivedAt) {
        return { ok: true, reason: "already_received", message: "退会届は受領済みです。", case: record };
      }
      const updated = await applyAndLog({
        current: record,
        patch: { withdrawalFormReceivedAt: input.at || now().toISOString() },
        eventType: "FORM_RECEIVED",
        actor: input.actor ?? { type: "staff" },
        source: "CLI",
      });
      return { ok: true, message: "退会届の受領を記録しました。", case: updated };
    },

    async returnCardKey(input) {
      const record = await cases.get(input.caseId);
      if (!record) return { ok: false, reason: "not_found", message: "該当の退会ケースが見つかりません。" };
      if (record.cardKeyReturnedAt) {
        return { ok: true, reason: "already_returned", message: "カードキーは返却済みです。", case: record };
      }
      const updated = await applyAndLog({
        current: record,
        patch: { cardKeyReturnedAt: input.at || now().toISOString() },
        eventType: "CARD_KEY_RETURNED",
        actor: input.actor ?? { type: "staff" },
        source: "CLI",
      });
      return { ok: true, message: "カードキーの返却を記録しました。", case: updated };
    },

    async markConfirmationSent(input) {
      const record = await cases.get(input.caseId);
      if (!record) return { ok: false, reason: "not_found", message: "該当の退会ケースが見つかりません。" };
      if (!record.formalReceivedAt) {
        return {
          ok: false,
          reason: "not_formal",
          message: "正式受付がまだ成立していません（退会届とカードキーの両方が必要です）。",
          case: record,
        };
      }
      if (record.withdrawalConfirmationSentAt && !input.force) {
        return {
          ok: true,
          reason: "already_sent",
          message: "正式受付のご案内は送信済みです（重複送信はしていません）。",
          case: record,
        };
      }
      const updated = await applyAndLog({
        current: record,
        patch: { withdrawalConfirmationSentAt: record.withdrawalConfirmationSentAt || now().toISOString() },
        eventType: "CONFIRMATION_MESSAGE_SENT",
        actor: input.actor ?? { type: "staff" },
        source: "CLI",
      });
      return { ok: true, message: "正式受付のご案内送信を記録しました。", case: updated };
    },

    async completePaymentStop(input) {
      const record = await cases.get(input.caseId);
      if (!record) return { ok: false, reason: "not_found", message: "該当の退会ケースが見つかりません。" };
      if (!record.formalReceivedAt) {
        return {
          ok: false,
          reason: "not_formal",
          message: "正式受付の前に会費ペイを処理済みにはできません。",
          case: record,
        };
      }
      if (record.paymentStopCompletedAt) {
        return { ok: true, reason: "already_completed", message: "会費ペイは処理済みです。", case: record };
      }
      const updated = await applyAndLog({
        current: record,
        patch: { paymentStopStatus: "completed", paymentStopCompletedAt: now().toISOString() },
        eventType: "PAYMENT_STOP_COMPLETED",
        actor: input.actor ?? { type: "staff" },
        source: "CLI",
        metadata: input.note ? { note: input.note } : {},
      });
      return { ok: true, message: "会費ペイの処理済みを記録しました。", case: updated };
    },

    async requestOwnerReview(input) {
      const record = await cases.get(input.caseId);
      if (!record) return { ok: false, reason: "not_found", message: "該当の退会ケースが見つかりません。" };
      if (!input.reason?.trim()) {
        return { ok: false, reason: "no_reason", message: "オーナー確認に回す理由を入力してください。" };
      }
      if (!canTransition(record.currentWithdrawalStatus, "OWNER_REVIEW_REQUIRED")) {
        return {
          ok: false,
          reason: "invalid_transition",
          message: `${withdrawalStatusLabel(record.currentWithdrawalStatus)} からはオーナー確認へ回せません。`,
          case: record,
        };
      }
      const updated = await applyAndLog({
        current: record,
        patch: { ownerReviewRequired: 1, ownerReviewReason: input.reason.trim() },
        eventType: "OWNER_REVIEW_REQUESTED",
        actor: input.actor ?? { type: "staff" },
        source: "CLI",
        metadata: { reason: input.reason.trim() },
      });
      return { ok: true, message: "オーナー確認へ回しました。", case: updated };
    },

    async resolveOwnerReview(input) {
      const record = await cases.get(input.caseId);
      if (!record) return { ok: false, reason: "not_found", message: "該当の退会ケースが見つかりません。" };
      if (input.actor.type !== "owner") {
        return { ok: false, reason: "forbidden", message: "オーナー確認の解除はオーナーのみ可能です。" };
      }
      if (!input.note?.trim()) {
        return { ok: false, reason: "no_reason", message: "解除の理由・判断内容を入力してください。" };
      }
      const updated = await applyAndLog({
        current: record,
        patch: { ownerReviewRequired: 0, ownerReviewReason: "" },
        eventType: "OWNER_REVIEW_RESOLVED",
        actor: input.actor,
        source: "CLI",
        metadata: { note: input.note.trim(), previousReason: record.ownerReviewReason },
      });
      return { ok: true, message: "オーナー確認を解除しました。", case: updated };
    },

    async closeWithdrawal(input) {
      const record = await cases.get(input.caseId);
      if (!record) return { ok: false, reason: "not_found", message: "該当の退会ケースが見つかりません。" };
      if (record.closedAt) {
        return { ok: true, reason: "already_closed", message: "既に退会完了です。", case: record };
      }
      if (!isWithdrawalConfirmed(record)) {
        return {
          ok: false,
          reason: "incomplete",
          message: `退会完了にできません。未了: ${missingForClose(record).join(" / ")}`,
          case: record,
        };
      }
      if (!isScheduledDateReached(record, now()) && !input.force) {
        return {
          ok: false,
          reason: "not_due",
          message: `退会予定日（${record.scheduledWithdrawalDate}）がまだ到来していません。`,
          case: record,
        };
      }
      const updated = await applyAndLog({
        current: record,
        patch: { closedAt: now().toISOString() },
        eventType: "WITHDRAWAL_CLOSED",
        actor: input.actor ?? { type: "staff" },
        source: "CLI",
        metadata: { scheduledWithdrawalDate: record.scheduledWithdrawalDate },
      });
      return { ok: true, message: "退会完了として記録しました。", case: updated };
    },

    async adminCorrect(input) {
      const record = await cases.get(input.caseId);
      if (!record) return { ok: false, reason: "not_found", message: "該当の退会ケースが見つかりません。" };
      if (input.actor.type !== "owner") {
        return { ok: false, reason: "forbidden", message: "修正は管理者（オーナー）のみ可能です。" };
      }
      if (!input.reason?.trim()) {
        return { ok: false, reason: "no_reason", message: "変更理由の入力は必須です。" };
      }
      if (!CORRECTABLE_FIELDS.includes(input.field)) {
        return {
          ok: false,
          reason: "not_correctable",
          message:
            "その項目は直接修正できません。退会予定日・最終在籍月・正式受付日・状態は、" +
            "退会届とカードキーの日付から自動計算されます。元の日付を直してください。",
        };
      }

      const before = (record as unknown as Record<string, unknown>)[input.field];
      const updated = await applyAndLog({
        current: record,
        patch: { [input.field]: input.value } as WithdrawalCaseInput,
        eventType: "ADMIN_CORRECTION",
        actor: input.actor,
        source: "CLI",
        metadata: { field: input.field, before, after: input.value, reason: input.reason.trim() },
      });
      return { ok: true, message: `${input.field} を修正しました（理由を記録済み）。`, case: updated };
    },
  };
}

// --- オーナー確認画面（時系列） -------------------------------------------------

export interface TimelineEntry {
  /** 並べ替え用の元の値（ISO） */
  atIso: string;
  /** 表示用「2026-08-18 13:03」（JST） */
  at: string;
  /** 「退会届受領」など */
  label: string;
  /** 補足（状態変化・理由など） */
  detail: string;
}

export interface OnboardingRecord {
  termsVersion?: string;
  sentAt?: string;
  confirmedAt?: string;
  joinedAt?: string;
}

/**
 * 監査ログから時系列を組み立てる（オーナーが1画面で事実確認するためのもの）。
 *
 * AI要約を足してもよいが、この元データは必ず併記すること。
 * 入会時の重要事項は既存の同意記録（guardian_consents.json）を渡せば先頭に並ぶ。
 * 退会側で複製保存はしない。
 */
export function buildWithdrawalTimeline(
  logs: WithdrawalAuditLog[],
  onboarding?: OnboardingRecord,
): TimelineEntry[] {
  const entries: Array<Omit<TimelineEntry, "at">> = [];

  if (onboarding?.joinedAt) entries.push({ atIso: onboarding.joinedAt, label: "入会", detail: "" });
  if (onboarding?.sentAt) {
    entries.push({
      atIso: onboarding.sentAt,
      label: "重要事項LINE送信",
      detail: onboarding.termsVersion ? `版: ${onboarding.termsVersion}` : "",
    });
  }
  if (onboarding?.confirmedAt) {
    entries.push({ atIso: onboarding.confirmedAt, label: "重要事項確認", detail: "" });
  }

  for (const log of logs) {
    const label = WITHDRAWAL_EVENT_LABELS[log.eventType] ?? log.eventType;
    const details: string[] = [];
    if (log.oldStatus && log.newStatus && log.oldStatus !== log.newStatus) {
      details.push(`${withdrawalStatusLabel(log.oldStatus)} → ${withdrawalStatusLabel(log.newStatus)}`);
    }
    if (log.eventType === "FORMAL_RECEIPT_COMPLETED") {
      const scheduled = log.metadata?.scheduledWithdrawalDate;
      if (scheduled) details.push(`退会予定日 ${String(scheduled)} 確定`);
    }
    if (log.eventType === "OWNER_REVIEW_REQUESTED" && log.metadata?.reason) {
      details.push(`理由: ${String(log.metadata.reason)}`);
    }
    if (log.eventType === "ADMIN_CORRECTION") {
      details.push(`${String(log.metadata?.field ?? "")} 修正 / 理由: ${String(log.metadata?.reason ?? "")}`);
    }
    if (log.actorId) details.push(`担当: ${log.actorId}`);

    entries.push({ atIso: log.createdAt, label, detail: details.join(" / ") });
  }

  return entries
    .filter(e => Boolean(e.atIso))
    .sort((a, b) => (a.atIso < b.atIso ? -1 : a.atIso > b.atIso ? 1 : 0))
    .map(e => ({ ...e, at: formatJstStamp(e.atIso) }));
}
