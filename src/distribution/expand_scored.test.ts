import type { ContentIdea } from "../types.js";
import { improveDraft, expandIdeaScored, formatImprovement } from "./expand_scored.js";
import { checkDraftSafety } from "../safety/check.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// ── improveDraft: 誘いが無い本文には soft invite が足され、誘い軸が上がる ──
const noInvite = "強く見せるためじゃなく、今日の自分から逃げなかったことを静かに認める。\nFLATUP GYMは、そういう一日がちゃんと残る場所です。";
const improved = improveDraft("x", noInvite);
assert(improved.changed, "draft without soft invite should be repaired");
assert(improved.safe, "repaired draft should pass safety");
assert(improved.after.total >= improved.before.total, "repair must not lower total score");
assert(improved.after.invitation.score > improved.before.invitation.score, "invitation dimension should improve");
assert(/ワンコイン体験/.test(improved.body), "soft invite should be present after repair");
assert(checkDraftSafety(improved.body).ok, "repaired body must be safe");

// 既に誘いがある本文は変更されない（無駄に触らない）
const hasInvite = "「お父さん、見てた？」その一言、聞いたことありますか？\n親子割で月-¥500。ワンコイン体験500円から、空気を感じに。";
const kept = improveDraft("x", hasInvite);
assert(!kept.changed, "draft that already has a soft invite should not change");
assert(kept.after.total === kept.before.total, "unchanged draft keeps its score");

// X 長さ超過は短縮候補で媒体適合が改善し、超過警告が消える
const tooLong = Array.from({ length: 6 }, (_, i) => `行${i}：${"あ".repeat(40)}`).join("\n");
const tightened = improveDraft("x", tooLong);
assert(
  !tightened.after.platformFit.hints.some(h => h.includes("長さ超過")),
  "over-length X draft should be tightened under the limit",
);

// ── expandIdeaScored: 3媒体を展開し、どの媒体もスコアを下げない ──
const idea: ContentIdea = {
  id: "idea_test_scored",
  date: "2026-06-09",
  theme: "未知のテーマ（defaultBodyにフォールバック）",
  angle: "安心して挑戦できる場所であることを、やさしく伝える",
  audience: "beginners",
  source: "mma_topic",
  valueConnection: "FLATUPの安全思想と初心者へのやさしさに接続する。",
};
const { drafts, improvements } = expandIdeaScored(idea);
assert(drafts.length === 3, "should expand into 3 platform drafts");
assert(improvements.length === 3, "should report one improvement per draft");
assert(improvements.every(i => i.after.total >= i.before.total), "no platform should regress");
assert(improvements.every(i => checkDraftSafety(i.body).ok), "every improved body must stay safe");
assert(drafts.every(d => checkDraftSafety(d.body).ok), "every emitted draft body must be safe");

// ── freshness 連動: 直近本文と被ると、被っていない候補が選ばれやすい ──
const recent = ["強く見せるためじゃなく、今日の自分から逃げなかったことを静かに認める。"];
const withHistory = improveDraft("threads", "強く見せるためじゃなく、今日の自分から逃げなかったことを静かに認める。", {
  recentBodies: recent,
});
// 被り本文そのものは freshness が低いので、修復後 total が原文以上であることを担保
assert(withHistory.after.total >= withHistory.before.total, "history-aware repair must not regress");

// ── レポート整形が落ちない ──
const report = formatImprovement(improved);
assert(report.includes("/25"), "report should include score");
assert(report.includes("[x]"), "report should include platform");

console.log("expand scored tests passed");
