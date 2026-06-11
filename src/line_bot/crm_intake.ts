import crypto from "node:crypto";
import path from "node:path";
import { intakeFromLineMessage } from "../crm/line_intake.js";
import { logError as writeSelfRepairLog } from "../crm/self_repair.js";
import { openProspectStore } from "../crm/store.js";
import { pushLineMessage } from "./notifier.js";

export type LineCrmIntakeAction = "crm_intake";

export interface LineCrmIntakeResult extends Record<string, unknown> {
  handled: boolean;
  ok: boolean;
  message: string;
  action?: LineCrmIntakeAction;
  meta?: Record<string, unknown>;
}

type NotifyOwner = (message: string) => Promise<Awaited<ReturnType<typeof pushLineMessage>>>;
type LogCrmError = (errorMessage: string, context?: string) => Promise<void>;

export interface ExecuteLineCrmIntakeOptions {
  lineUserId?: string;
  text: string;
  displayName?: string;
  dataDir?: string;
  now?: () => Date;
  notifyOwner?: NotifyOwner;
  logCrmError?: LogCrmError;
}

export function parseLineCrmInquiryText(text: string): string | undefined {
  const match = text.match(/^\s*問い合わせ\s*[:：]\s*([\s\S]*)$/);
  if (!match) return undefined;
  return match[1].trim();
}

function defaultDataDir(): string {
  return process.env.OPENQLOW_DATA_DIR || path.join(process.cwd(), "data");
}

function buildManualExternalId(lineUserId: string | undefined, inquiryText: string): string {
  const ownerId = lineUserId || "unknown";
  const normalized = inquiryText.replace(/\s+/g, " ").trim();
  const hash = crypto.createHash("sha256").update(`${ownerId}\n${normalized}`).digest("hex").slice(0, 16);
  return `manual:${ownerId}:${hash}`;
}

function buildOwnerNotification(input: {
  created: boolean;
  prospectId: number;
  inquiryText: string;
  replyDraft: string;
}): string {
  return [
    `【OPENQLOW CRM】 ${input.created ? "新規問い合わせ" : "問い合わせ更新"}`,
    `ID: ${input.prospectId}`,
    "",
    "問い合わせ本文:",
    input.inquiryText,
    "",
    "返信下書き:",
    input.replyDraft,
    "",
    "※まだお客様には送信していません。JINさん確認後に送信してください。",
  ].join("\n");
}

async function defaultLogCrmError(dataDir: string, errorMessage: string, context?: string): Promise<void> {
  await writeSelfRepairLog("line_webhook_error", errorMessage, context, dataDir);
}

async function safeLogCrmError(opts: ExecuteLineCrmIntakeOptions, dataDir: string, errorMessage: string): Promise<void> {
  try {
    const logger = opts.logCrmError ?? ((message, context) => defaultLogCrmError(dataDir, message, context));
    await logger(errorMessage, "line_crm_intake");
  } catch (logError) {
    console.error("[line_crm_intake] failed to write self repair log:", logError);
  }
}

export async function executeLineCrmIntake(opts: ExecuteLineCrmIntakeOptions): Promise<LineCrmIntakeResult> {
  const inquiryText = parseLineCrmInquiryText(opts.text);
  if (inquiryText === undefined) {
    return { handled: false, ok: false, message: "line crm intake not matched" };
  }

  if (!inquiryText) {
    return {
      handled: true,
      ok: false,
      action: "crm_intake",
      message: "OPENQLOW: `問い合わせ: 本文` の形で問い合わせ内容を送ってください。",
    };
  }

  const dataDir = opts.dataDir ?? defaultDataDir();
  const store = openProspectStore(path.join(dataDir, "prospects.json"), opts.now);

  try {
    const result = await intakeFromLineMessage(
      {
        lineUserId: buildManualExternalId(opts.lineUserId, inquiryText),
        text: inquiryText,
        displayName: opts.displayName,
      },
      store,
      opts.now,
    );
    const notification = buildOwnerNotification({
      created: result.created,
      prospectId: result.prospect.id,
      inquiryText,
      replyDraft: result.replyDraft,
    });
    const notifyOwner = opts.notifyOwner ?? pushLineMessage;
    const notificationResult = await notifyOwner(notification);

    return {
      handled: true,
      ok: notificationResult.ok,
      action: "crm_intake",
      message: [
        `OPENQLOW: 問い合わせをCRMに${result.created ? "登録" : "更新"}しました。`,
        `ID: ${result.prospect.id}`,
        "返信下書きはオーナー通知に回しました。お客様への自動返信はしていません。",
      ].join("\n"),
      meta: {
        id: result.prospect.id,
        created: result.created,
        notificationMode: notificationResult.mode,
        notificationError: notificationResult.error,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await safeLogCrmError(opts, dataDir, message);
    return {
      handled: true,
      ok: false,
      action: "crm_intake",
      message: `OPENQLOW: 問い合わせのCRM登録に失敗しました。\n理由: ${message}`,
      meta: { error: message },
    };
  }
}
