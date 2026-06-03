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

console.log("approval command tests passed");
