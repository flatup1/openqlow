import assert from "node:assert/strict";
import { buildInstagramCaption, stripLineLink } from "./instagram_caption.js";
import type { DraftRecord } from "../types.js";

// LINEの友だち追加リンク（▼…＋URL）は除去される。
{
  const body = "今日も成田で稽古。\n\n▼体験・ご質問は公式LINEから\nhttps://lin.ee/oF1FMGJ";
  const stripped = stripLineLink(body);
  assert.doesNotMatch(stripped, /lin\.ee/);
  assert.doesNotMatch(stripped, /▼/);
  assert.match(stripped, /今日も成田で稽古/);
}

function record(body: string): DraftRecord {
  return {
    id: "FG-20260621-901",
    idea: { id: "x", date: "2026-06-21", theme: "t", angle: "a", audience: "local_narita", source: "obsidian_inbox", valueConnection: "v" },
    drafts: [{ id: "d", ideaId: "x", approvalId: "x", platform: "threads", publicationLevel: "level_2_draft", body, hashtags: ["FLATUPGYM"], cta: "", safetyNotes: [], createdAt: "2026-06-21T00:00:00.000Z" }],
    status: "pending_approval",
    approvalMessage: "",
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
  };
}

// キャプション: 本文＋CTA＋ローカルハッシュタグ。LINE生URLは無し。
{
  const caption = buildInstagramCaption(record("初心者も安心。\n\n▼体験・ご質問は公式LINEから\nhttps://lin.ee/oF1FMGJ"), {});
  assert.match(caption, /初心者も安心/);
  assert.match(caption, /体験予約/);          // CTA
  assert.match(caption, /#成田/);             // ローカルタグ
  assert.match(caption, /#初心者歓迎/);
  assert.doesNotMatch(caption, /lin\.ee/);     // 非クリックURLは出さない
}

// env でハッシュタグ/CTAを差し替えられる。
{
  const caption = buildInstagramCaption(record("本文"), {
    OPENQLOW_IG_HASHTAGS: "#成田 テスト, 体験",
    OPENQLOW_IG_CTA: "DMで体験予約",
  });
  assert.match(caption, /DMで体験予約/);
  assert.match(caption, /#成田 #テスト #体験/);
}

console.log("instagram caption tests passed");
