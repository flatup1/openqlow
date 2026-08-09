// 会員からのLINE受信 → 退会相談の記録と手続き案内（接続口 / seam）
//
// webhook（src/line_bot/webhook.ts）から、**承認者ではない＝会員**のテキストだけが渡ってくる。
// 会員のメッセージは、この関数の外へは一切流さない。特に executeApprovalText（オーナー用の
// 承認・push コマンド経路）へは絶対に到達させない。これが本モジュールの最重要の設計条件。
//
// 厳守事項:
//   - LINEの発言だけでは正式受付にしない。相談として記録するだけ（状態は WITHDRAWAL_INQUIRY）。
//   - 会員へ送る文面は固定テンプレートのみ。AIが生成した文章を会員へ送らない。
//   - 実際に送れたときだけ「案内済み」にする。送っていないのに送信済みにしない。
//   - 特殊ケース（返金・弁護士・入院など）を検知したら自動返信せず、オーナーへ上げる。
//   - 会員の自動返信は既定で無効。OPENQLOW_WITHDRAWAL_AUTO_REPLY=true のときだけ送る。

import path from "node:path";
import { logError as writeSelfRepairLog } from "../crm/self_repair.js";
import {
  buildProcedureGuideMessage,
  detectOwnerReviewSignals,
  detectWithdrawalIntent,
} from "../crm/withdrawal.js";
import { openWithdrawalService } from "../crm/withdrawal_store.js";
import { pushLineMessage } from "./notifier.js";

export type LineWithdrawalAction = "withdrawal_intake";

export interface LineWithdrawalIntakeResult extends Record<string, unknown> {
  /** この関数が処理したか。false なら退会の話ではない */
  handled: boolean;
  ok: boolean;
  message: string;
  action?: LineWithdrawalAction;
  meta?: Record<string, unknown>;
}

type PushResult = Awaited<ReturnType<typeof pushLineMessage>>;
type SendToMember = (text: string, lineUserId: string) => Promise<PushResult>;
type NotifyOwner = (text: string) => Promise<PushResult>;

export interface ExecuteLineWithdrawalIntakeOptions {
  text: string;
  /** 会員の LINE userId。名寄せキー。無いと記録できない */
  lineUserId?: string;
  /** LINE の messageId。webhookの二重配信を弾く鍵 */
  messageId?: string;
  displayName?: string;
  dataDir?: string;
  now?: () => Date;
  /** 会員へ自動返信するか。既定は環境変数（未設定なら送らない） */
  autoReply?: boolean;
  sendToMember?: SendToMember;
  notifyOwner?: NotifyOwner;
  logCrmError?: (errorMessage: string, context?: string) => Promise<void>;
}

/**
 * 会員への自動返信が有効か。
 *
 * 既定は false（送らない）。`AGENTS.md` の「送信は人間承認後」に合わせ、
 * オーナーが明示的に有効化したときだけ会員へ届く。
 * `OPENQLOW_DRY_RUN=true`（既定）の間は、有効化されていても送らない。
 */
export function isWithdrawalAutoReplyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.OPENQLOW_WITHDRAWAL_AUTO_REPLY !== "true") return false;
  // 本番反映の総合スイッチ。DRY_RUN の間は会員へ届かない。
  return env.OPENQLOW_DRY_RUN === "false";
}

function defaultDataDir(): string {
  return process.env.OPENQLOW_DATA_DIR || path.join(process.cwd(), "data");
}

/**
 * オーナー通知の本文。
 * LINE userId や会員の発言そのものは載せない（個人情報を通知経路に流さない）。
 * 何を拾ったか・次に何をするかだけを伝える。
 */
export function buildOwnerWithdrawalNotification(input: {
  caseId: number;
  caseNumber: string;
  keywords: string[];
  ownerReviewReasons: string[];
  guideSent: boolean;
  autoReplyEnabled: boolean;
}): string {
  const lines = [
    "【OPENQLOW 退会】 退会・休会のご相談を受けました",
    `管理番号: ${input.caseNumber}`,
    `拾った言葉: ${input.keywords.join("、") || "（なし）"}`,
    "",
    "※ LINEのご連絡だけでは正式受付になりません（退会届＋カードキー返却で成立）。",
  ];

  if (input.ownerReviewReasons.length > 0) {
    lines.push(
      "",
      `⚠ オーナー確認が必要かもしれません: ${input.ownerReviewReasons.join("、")}`,
      "自動返信は止めました。JINさんが内容を確認してから対応してください。",
      `  回すなら: npm run crm -- withdrawal owner-review ${input.caseId} --reason "…"`,
    );
    return lines.join("\n");
  }

  if (input.guideSent) {
    lines.push("", "手続き案内を送信済みです（固定テンプレート）。ご来館日時の連絡をお待ちください。");
  } else {
    lines.push(
      "",
      input.autoReplyEnabled
        ? "手続き案内は送信していません（送信に失敗したか、既に案内済みです）。"
        : "手続き案内はまだ送っていません（自動返信は無効）。下書きを確認して送ってください。",
      `  文面: npm run crm -- withdrawal guide ${input.caseId}`,
      `  送ったら: npm run crm -- withdrawal guide ${input.caseId} --sent`,
    );
  }
  return lines.join("\n");
}

async function safeLog(
  opts: ExecuteLineWithdrawalIntakeOptions,
  dataDir: string,
  errorMessage: string,
): Promise<void> {
  try {
    const logger =
      opts.logCrmError ??
      ((message: string, context?: string) => writeSelfRepairLog("line_webhook_error", message, context, dataDir));
    await logger(errorMessage, "line_withdrawal_intake");
  } catch (error) {
    console.error("[line_withdrawal_intake] failed to write self repair log:", error);
  }
}

/**
 * 会員のLINEメッセージ1件を処理する。
 *
 * 退会・休会の話でなければ何もしない（handled: false）。呼び出し側は、この関数が
 * 処理しなかった会員メッセージを**他のどの処理にも渡してはいけない**。
 */
export async function executeLineWithdrawalIntake(
  opts: ExecuteLineWithdrawalIntakeOptions,
): Promise<LineWithdrawalIntakeResult> {
  const intent = detectWithdrawalIntent(opts.text ?? "");
  if (!intent.matched) {
    return { handled: false, ok: false, message: "line withdrawal intake not matched" };
  }

  const dataDir = opts.dataDir ?? defaultDataDir();
  const notifyOwner = opts.notifyOwner ?? ((text: string) => pushLineMessage(text));

  if (!opts.lineUserId) {
    // 誰の相談か特定できないと台帳に残せない。握りつぶさずオーナーへ上げる。
    await notifyOwner(
      [
        "【OPENQLOW 退会】 退会・休会のご相談を受けましたが、送信者を特定できませんでした。",
        `拾った言葉: ${intent.keywords.join("、")}`,
        "LINEのトークを確認して、`npm run crm -- withdrawal open` で手動登録してください。",
      ].join("\n"),
    );
    return {
      handled: true,
      ok: false,
      action: "withdrawal_intake",
      message: "OPENQLOW: 送信者を特定できないため、オーナーへ通知しました。",
      meta: { reason: "no_line_user_id" },
    };
  }

  try {
    const service = openWithdrawalService({ dataDir, now: opts.now });
    const ownerReviewSignals = detectOwnerReviewSignals(opts.text ?? "");
    const ownerReviewReasons = ownerReviewSignals.map(s => s.reason);

    const recorded = await service.recordInquiry({
      memberId: "",
      lineUserId: opts.lineUserId,
      memberName: opts.displayName,
      channel: "LINE",
      messageId: opts.messageId,
      keywords: intent.keywords,
      kind: intent.kind,
      actor: { type: "member" },
      source: "LINE",
    });

    const record = recorded.case;
    if (!record) {
      await safeLog(opts, dataDir, "withdrawal case was not created");
      return {
        handled: true,
        ok: false,
        action: "withdrawal_intake",
        message: "OPENQLOW: 退会相談の記録に失敗しました。",
        meta: { reason: recorded.reason ?? "no_case" },
      };
    }

    // 同じwebhookの二重配信。記録も送信もしない。
    if (recorded.reason === "duplicate_message") {
      return {
        handled: true,
        ok: true,
        action: "withdrawal_intake",
        message: "OPENQLOW: 同じメッセージを処理済みです（重複送信していません）。",
        meta: { caseId: record.id, duplicate: true },
      };
    }

    const autoReplyEnabled = opts.autoReply ?? isWithdrawalAutoReplyEnabled();
    let guideSent = false;
    let sendMode: string | undefined;

    // 特殊ケースを検知したら自動返信しない。定型文で返すと火に油を注ぐため、必ず人が読む。
    const blockedByOwnerReview = ownerReviewReasons.length > 0;

    if (!blockedByOwnerReview && autoReplyEnabled && !record.procedureGuidedAt) {
      const sendToMember =
        opts.sendToMember ?? ((text: string, userId: string) => pushLineMessage(text, { userId }));
      // 会員へ送るのは固定テンプレートのみ。AI生成文は送らない。
      const sent = await sendToMember(buildProcedureGuideMessage(), opts.lineUserId);
      sendMode = sent.mode;
      // 実際に届いたときだけ「案内済み」にする。送れていないのに送信済みにしない。
      if (sent.ok && sent.mode === "sent") {
        await service.markProcedureGuided({
          caseId: record.id,
          messageId: opts.messageId,
          actor: { type: "system" },
          source: "LINE",
        });
        guideSent = true;
      } else {
        await safeLog(opts, dataDir, `withdrawal guide not delivered (mode=${sent.mode})`);
      }
    }

    await notifyOwner(
      buildOwnerWithdrawalNotification({
        caseId: record.id,
        caseNumber: record.caseNumber,
        keywords: intent.keywords,
        ownerReviewReasons,
        guideSent,
        autoReplyEnabled,
      }),
    );

    return {
      handled: true,
      ok: true,
      action: "withdrawal_intake",
      message: guideSent
        ? "OPENQLOW: 退会相談を記録し、手続き案内を送信しました（正式受付ではありません）。"
        : "OPENQLOW: 退会相談を記録しました。案内の送信はオーナー確認後です（正式受付ではありません）。",
      meta: {
        caseId: record.id,
        status: record.currentWithdrawalStatus,
        guideSent,
        sendMode,
        ownerReviewReasons,
        autoReplyEnabled,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await safeLog(opts, dataDir, message);
    return {
      handled: true,
      ok: false,
      action: "withdrawal_intake",
      message: "OPENQLOW: 退会相談の記録に失敗しました。",
      meta: { error: message },
    };
  }
}
