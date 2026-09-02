import assert from "node:assert/strict";
import { isQuietHour, loadReplyDraftConfig, parseQuietHours, parseSources } from "./config.js";

// 何も設定しなければ、1件も動かない。ここが一番大事。
{
  const config = loadReplyDraftConfig({});
  assert.equal(config.enabled, false, "既定では動かない");
  assert.equal(config.disabled, false);
  assert.deepEqual(config.sources, ["line"], "Phase 1 は LINE のみ");
  assert.equal(config.maxPerRun, 5);
  assert.deepEqual(config.quietHours, { start: 22, end: 7 });
  assert.equal(config.dryRun, true, "既定は dry run");
}

// スイッチは "true" ちょうどのときだけ有効。
{
  assert.equal(loadReplyDraftConfig({ OPENQLOW_REPLY_DRAFT_ENABLED: "1" }).enabled, false);
  assert.equal(loadReplyDraftConfig({ OPENQLOW_REPLY_DRAFT_ENABLED: "yes" }).enabled, false);
  assert.equal(loadReplyDraftConfig({ OPENQLOW_REPLY_DRAFT_ENABLED: "TRUE" }).enabled, true);
}

// dry run は既存の OPENQLOW_DRY_RUN に合わせる。
{
  assert.equal(loadReplyDraftConfig({ OPENQLOW_DRY_RUN: "false" }).dryRun, false);
  assert.equal(loadReplyDraftConfig({ OPENQLOW_DRY_RUN: "true" }).dryRun, true);
}

// 受信元の指定。知らない名前は無視する。
{
  assert.deepEqual(parseSources("line,gmail"), ["line", "gmail"]);
  assert.deepEqual(parseSources("gmail, gmail"), ["gmail"]);
  assert.deepEqual(parseSources("slack"), ["line"], "知らない受信元だけなら既定に戻す");
  assert.deepEqual(parseSources(undefined), ["line"]);
}

// 静音時間の読み取り。おかしな値は既定に戻す。
{
  assert.deepEqual(parseQuietHours("21-8"), { start: 21, end: 8 });
  assert.deepEqual(parseQuietHours("22 - 7"), { start: 22, end: 7 });
  assert.deepEqual(parseQuietHours("abc"), { start: 22, end: 7 });
  assert.deepEqual(parseQuietHours("30-40"), { start: 22, end: 7 });
}

// 日をまたぐ静音時間（22時〜翌7時）。
{
  const quiet = { start: 22, end: 7 };
  assert.equal(isQuietHour(23, quiet), true);
  assert.equal(isQuietHour(2, quiet), true);
  assert.equal(isQuietHour(7, quiet), false, "7時ちょうどは送ってよい");
  assert.equal(isQuietHour(12, quiet), false);
  assert.equal(isQuietHour(21, quiet), false);
}

// 日をまたがない指定でも同じように働く。
{
  assert.equal(isQuietHour(13, { start: 12, end: 14 }), true);
  assert.equal(isQuietHour(15, { start: 12, end: 14 }), false);
  assert.equal(isQuietHour(5, { start: 0, end: 0 }), false, "同じ時刻なら静音なし");
}

console.log("reply draft config tests passed");
