// FLATUP GYM オペレーション物理ロック
// OPENQLOW（攻めのAI）が侵してはいけない領域。違反は throw で停止させる。
// 「AIKAの仕事（接客）」「Jinの仕事（最終判断）」を実装レベルで保護する。

export type ForbiddenAction =
  | "send_to_customer_directly"
  | "confirm_reservation"
  | "handle_complaint"
  | "process_cancellation"
  | "modify_member_data"
  | "send_apology"
  | "change_pricing"
  | "issue_refund";

const FORBIDDEN_ACTIONS: ReadonlySet<ForbiddenAction> = new Set<ForbiddenAction>([
  "send_to_customer_directly",
  "confirm_reservation",
  "handle_complaint",
  "process_cancellation",
  "modify_member_data",
  "send_apology",
  "change_pricing",
  "issue_refund",
]);

const ACTION_REASON: Record<ForbiddenAction, string> = {
  send_to_customer_directly: "お客様への直接送信はAIKAとJinの責任範囲です。",
  confirm_reservation: "予約確定はJinが行います。",
  handle_complaint: "クレーム対応はAIKAが一次受付し、Jinが判断します。",
  process_cancellation: "退会処理はJinが行います。",
  modify_member_data: "会員情報の変更はJinが行います。",
  send_apology: "謝罪文の送信はAIKAが一次案を作りJinが承認・送信します。",
  change_pricing: "料金変更はJinの経営判断です。",
  issue_refund: "返金処理はJinの経営判断です。",
};

export class ForbiddenActionError extends Error {
  constructor(public readonly action: ForbiddenAction) {
    super(`OPENQLOW cannot perform "${action}": ${ACTION_REASON[action]}`);
    this.name = "ForbiddenActionError";
  }
}

export function assertNotForbidden(action: ForbiddenAction): void {
  if (FORBIDDEN_ACTIONS.has(action)) {
    throw new ForbiddenActionError(action);
  }
}

export function listForbiddenActions(): ForbiddenAction[] {
  return Array.from(FORBIDDEN_ACTIONS);
}

export function isForbidden(action: string): action is ForbiddenAction {
  return FORBIDDEN_ACTIONS.has(action as ForbiddenAction);
}
