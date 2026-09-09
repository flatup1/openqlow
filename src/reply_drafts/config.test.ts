// 設定の読み取りテスト。
// 「動かない側が既定」「true ちょうどだけ有効」「非常停止が最優先」を固定する。

import { isExplicitlyTrue, loadReplyDraftConfig, resolveMode } from "./config.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// 何も設定していなければ動かない。
assert(resolveMode({}) === "off", "既定は off");

// true ちょうどのときだけ有効（要件 §43）。
for (const value of ["1", "yes", "TRUE", "True", "on", "true ", " true", ""]) {
  assert(!isExplicitlyTrue(value), `"${value}" は有効にしない`);
}
assert(isExplicitlyTrue("true"), '"true" だけ有効');

for (const value of ["1", "yes", "TRUE", "True", "on"]) {
  assert(
    resolveMode({ REPLY_DRAFT_ENABLED: value }) === "off",
    `REPLY_DRAFT_ENABLED=${value} では動かない`,
  );
}

// 有効化しても、既定は dry run（OPENQLOW_DRY_RUN が "false" のときだけ本番）。
assert(resolveMode({ REPLY_DRAFT_ENABLED: "true" }) === "dry_run", "有効化しても既定は dry run");
assert(
  resolveMode({ REPLY_DRAFT_ENABLED: "true", OPENQLOW_DRY_RUN: "true" }) === "dry_run",
  "DRY_RUN=true は dry run",
);
assert(
  resolveMode({ REPLY_DRAFT_ENABLED: "true", OPENQLOW_DRY_RUN: "false" }) === "live",
  "DRY_RUN=false で初めて本番",
);

// 非常停止は最優先（要件 §44 / §46）。
assert(
  resolveMode({
    REPLY_DRAFT_DISABLED: "true",
    REPLY_DRAFT_ENABLED: "true",
    OPENQLOW_DRY_RUN: "false",
  }) === "disabled",
  "Kill Switch は他の設定に関係なく最優先",
);

// 書き込みが許されるのは live のときだけ。
const live = loadReplyDraftConfig({ REPLY_DRAFT_ENABLED: "true", OPENQLOW_DRY_RUN: "false" });
assert(live.writes === true, "live は書き込み可");
for (const env of [
  {},
  { REPLY_DRAFT_ENABLED: "true" },
  { REPLY_DRAFT_DISABLED: "true", REPLY_DRAFT_ENABLED: "true", OPENQLOW_DRY_RUN: "false" },
]) {
  assert(loadReplyDraftConfig(env).writes === false, "live 以外は書き込み不可");
}

// 既定値（要件 §19 / §36 / §37）。
assert(live.seenRetentionDays === 30, "重複台帳の保持は30日");
assert(live.notifyMaxItems === 5, "1通知は最大5件");
assert(live.quietStartHour === 22 && live.quietEndHour === 7, "静音は22:00〜7:00");

// 数値の設定ミスは既定値に落とす（0や負値で機能が壊れないように）。
const broken = loadReplyDraftConfig({
  REPLY_DRAFT_ENABLED: "true",
  OPENQLOW_DRY_RUN: "false",
  REPLY_DRAFT_NOTIFY_MAX_ITEMS: "0",
  REPLY_DRAFT_SEEN_RETENTION_DAYS: "-1",
});
assert(broken.notifyMaxItems === 5 && broken.seenRetentionDays === 30, "不正な数値は既定値へ");

console.log("reply_drafts config tests passed");
