import assert from "node:assert/strict";
import { parseApprovalCommand } from "./command.js";

assert.deepEqual(parseApprovalCommand("OK FG-20260530-001"), {
  response: "OK",
  id: "FG-20260530-001",
  raw: "OK FG-20260530-001",
  targets: ["drafts_only"],
});

assert.deepEqual(parseApprovalCommand("ok　FG-20260530-001　all"), {
  response: "OK",
  id: "FG-20260530-001",
  raw: "ok　FG-20260530-001　all",
  targets: ["google_business", "threads", "line_voom"],
});

assert.deepEqual(parseApprovalCommand("OK FG-20260530-001 google"), {
  response: "OK",
  id: "FG-20260530-001",
  raw: "OK FG-20260530-001 google",
  targets: ["google_business"],
});

assert.deepEqual(parseApprovalCommand("OK FG-20260530-001 voom"), {
  response: "OK",
  id: "FG-20260530-001",
  raw: "OK FG-20260530-001 voom",
  targets: ["line_voom"],
});

assert.deepEqual(parseApprovalCommand("NO FG-20260530-001"), {
  response: "reject",
  id: "FG-20260530-001",
  raw: "NO FG-20260530-001",
});

assert.deepEqual(parseApprovalCommand("修正 FG-20260530-001 もっと初心者向けに"), {
  response: "revision",
  id: "FG-20260530-001",
  raw: "修正 FG-20260530-001 もっと初心者向けに",
  note: "もっと初心者向けに",
});

assert.equal(parseApprovalCommand("OK FG-20260530-001 instagram"), undefined);

// id を省略した修正（直近候補対象。id は空文字で返す）。
assert.deepEqual(parseApprovalCommand("修正 セールは6/10までに変更"), {
  response: "revision",
  id: "",
  raw: "修正 セールは6/10までに変更",
  note: "セールは6/10までに変更",
});

assert.deepEqual(parseApprovalCommand("修正: もっと短く"), {
  response: "revision",
  id: "",
  raw: "修正: もっと短く",
  note: "もっと短く",
});

assert.deepEqual(parseApprovalCommand("修正"), {
  response: "revision",
  id: "",
  raw: "修正",
  note: "",
});

console.log("approval command tests passed");
