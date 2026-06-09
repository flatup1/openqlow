import assert from "node:assert/strict";
import type { DraftRecord } from "../types.js";
import { applyBodyEdit, isUsableRevisionText } from "./revise_content.js";

function sampleRecord(): DraftRecord {
  const now = "2026-06-09T00:00:00.000Z";
  return {
    id: "FG-20260609-003",
    idea: {
      id: "FG-20260609-003",
      date: "2026-06-09",
      theme: "t",
      angle: "a",
      audience: "beginners",
      source: "rotation",
      valueConnection: "v",
    },
    drafts: [
      {
        id: "d-threads",
        ideaId: "FG-20260609-003",
        approvalId: "FG-20260609-003",
        platform: "threads",
        publicationLevel: "level_2_draft",
        body: "古い本文",
        hashtags: ["FLATUPGYM"],
        cta: "見学だけでも大丈夫です。",
        safetyNotes: [],
        createdAt: now,
      },
      {
        id: "d-x",
        ideaId: "FG-20260609-003",
        approvalId: "FG-20260609-003",
        platform: "x",
        publicationLevel: "level_2_draft",
        body: "別の古い本文",
        hashtags: ["成田市"],
        cta: "cta2",
        safetyNotes: [],
        createdAt: now,
      },
    ],
    status: "needs_revision",
    approvalMessage: "msg",
    createdAt: now,
    updatedAt: now,
  };
}

function testReplacesAllBodiesAndKeepsRest(): void {
  const record = sampleRecord();
  const edited = applyBodyEdit(record, "  新しい本文に変更  ", new Date("2026-06-09T01:00:00.000Z"));

  // 本文は全媒体で新しいものに差し替え（前後空白はトリム）。
  for (const draft of edited.drafts) {
    assert.equal(draft.body, "新しい本文に変更");
  }
  // cta / hashtags / platform は維持。
  assert.equal(edited.drafts[0].cta, "見学だけでも大丈夫です。");
  assert.deepEqual(edited.drafts[1].hashtags, ["成田市"]);
  assert.equal(edited.drafts[0].platform, "threads");
  // 修正後は再承認待ちに戻る。
  assert.equal(edited.status, "pending_approval");
  assert.equal(edited.updatedAt, "2026-06-09T01:00:00.000Z");
  // 元レコードは変更しない（純粋関数）。
  assert.equal(record.drafts[0].body, "古い本文");
  assert.equal(record.status, "needs_revision");
}

function testUsableRevisionText(): void {
  assert.equal(isUsableRevisionText("a"), true);
  assert.equal(isUsableRevisionText("  "), false);
  assert.equal(isUsableRevisionText(""), false);
}

testReplacesAllBodiesAndKeepsRest();
testUsableRevisionText();

console.log("revise content tests passed");
