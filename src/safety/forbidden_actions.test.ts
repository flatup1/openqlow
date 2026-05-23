import assert from "node:assert/strict";
import {
  ForbiddenActionError,
  assertNotForbidden,
  isForbidden,
  listForbiddenActions,
} from "./forbidden_actions.js";

// 主要な禁止アクション 8 種をテスト
const forbidden = [
  "send_to_customer_directly",
  "confirm_reservation",
  "handle_complaint",
  "process_cancellation",
  "modify_member_data",
  "send_apology",
  "change_pricing",
  "issue_refund",
] as const;

for (const action of forbidden) {
  assert.throws(
    () => assertNotForbidden(action),
    (err: unknown) => err instanceof ForbiddenActionError && err.action === action,
    `${action} should throw`,
  );
  assert.equal(isForbidden(action), true);
}

// 一覧の長さは 8
assert.equal(listForbiddenActions().length, 8);

// 未知のアクション名は isForbidden=false
assert.equal(isForbidden("generate_sns_post"), false);
assert.equal(isForbidden("record_memory_log"), false);

console.log("forbidden actions tests passed");
