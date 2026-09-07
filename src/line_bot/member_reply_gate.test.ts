// 会員への自動返信の関門と、ログの仮名化のテスト。
//
// この2つは「お客様に誤って届く」「個人情報がログに残る」という、
// 起きたら取り返しがつかない事故を止めるためのもの。

import { isMemberAutoReplyEnabled, sealMemberReply } from "./member_reply_gate.js";
import { pseudonymize } from "./pseudonymize.js";
import { isWithdrawalAutoReplyEnabled } from "./withdrawal_intake.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// --- 関門は既定で閉じている -----------------------------------------------------
assert(isMemberAutoReplyEnabled({}) === false, "何も設定しなければ会員へ送らない");
assert(
  isMemberAutoReplyEnabled({ OPENQLOW_WITHDRAWAL_AUTO_REPLY: "true" }) === false,
  "機能スイッチだけでは送らない（DRY_RUN が効いている）",
);
assert(
  isMemberAutoReplyEnabled({ OPENQLOW_DRY_RUN: "false" }) === false,
  "DRY_RUN 解除だけでは送らない（機能スイッチが必要）",
);
assert(
  isMemberAutoReplyEnabled({ OPENQLOW_WITHDRAWAL_AUTO_REPLY: "true", OPENQLOW_DRY_RUN: "false" }) === true,
  "2つ揃って初めて送る",
);
// 曖昧な値で開いてしまわないこと（"1" や "yes" では開かない）
for (const value of ["1", "yes", "TRUE", "on", ""]) {
  assert(
    isMemberAutoReplyEnabled({ OPENQLOW_WITHDRAWAL_AUTO_REPLY: value, OPENQLOW_DRY_RUN: "false" }) === false,
    `曖昧な値 "${value}" では開かない`,
  );
}

// --- 退会OS側の判定が関門と同じであること（二重管理させない） ---------------------
for (const env of [
  {},
  { OPENQLOW_WITHDRAWAL_AUTO_REPLY: "true" },
  { OPENQLOW_DRY_RUN: "false" },
  { OPENQLOW_WITHDRAWAL_AUTO_REPLY: "true", OPENQLOW_DRY_RUN: "false" },
]) {
  assert(
    isWithdrawalAutoReplyEnabled(env) === isMemberAutoReplyEnabled(env),
    "退会OSの判定は関門と完全に一致する",
  );
}

// --- 関門が閉じていれば、ハンドラが送りたがっても送らない -------------------------
{
  const wantsToReply = { ok: true, action: "brand_growth_routed", replyToSender: true };

  const sealed = sealMemberReply(wantsToReply, false);
  assert(sealed.replyToSender === false, "関門が閉じていれば replyToSender を潰す");
  assert(sealed.action === "brand_growth_routed", "他の項目は壊さない");

  const opened = sealMemberReply(wantsToReply, true);
  assert(opened.replyToSender === true, "関門が開いていれば通す");

  // 送る気のないハンドラを、関門が勝手に送る側へ変えないこと
  const quiet = sealMemberReply({ ok: true, replyToSender: false }, true);
  assert(quiet.replyToSender === false, "元が false なら開いていても送らない");

  // replyToSender を持たないハンドラ（新規追加を想定）は、既定で送らない側に倒す
  const unspecified = sealMemberReply({ ok: true, action: "something_new" }, true);
  assert(unspecified.replyToSender === false, "未指定のハンドラは送らない側が既定");
}

// --- ログの仮名化 ---------------------------------------------------------------
{
  const id = "Uaa10d8962ee00789c2a52cfa01a94cff";
  const tag = pseudonymize(id);
  assert(!tag.includes(id), "元のIDがそのまま出ない");
  assert(tag === pseudonymize(id), "同じ人は毎回同じ表記（追跡できる）");
  assert(tag !== pseudonymize("Ubb10d8962ee00789c2a52cfa01a94cff"), "違う人は違う表記");
  assert(tag.startsWith("u_") && tag.length === 10, "短く読みやすい形式");
  assert(pseudonymize("") === "anonymous", "空なら anonymous");
  assert(pseudonymize(undefined) === "anonymous", "未指定なら anonymous");
  // LINE userId の形（U + 32桁の16進）に見えないこと。既存の pii_guard が個人情報と判定する形を避ける。
  assert(!/^U[0-9a-f]{32}$/.test(tag), "LINE userId の形に見えない");
}

console.log("member reply gate tests passed");
