import { formatApprovalMessage } from "./message.js";
import { checkDraftSafety } from "../safety/check.js";
import type { ContentIdea, PlatformDraft } from "../types.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const idea: ContentIdea = {
  id: "FG-20260518-001",
  date: "2026-05-18",
  theme: "弱い自分と戦う人へ",
  angle: "最初の一歩を静かに認める投稿",
  audience: "beginners",
  source: "mma_topic",
  valueConnection: "FLATUPの優しさと、弱い自分と向き合う思想に接続する。",
};

const drafts: PlatformDraft[] = [{
  id: "FG-20260518-001_x",
  ideaId: "FG-20260518-001",
  approvalId: "FG-20260518-001",
  platform: "x",
  publicationLevel: "level_2_draft",
  body: "FLATUP GYMは、弱い自分と向き合うための世界一優しい格闘技ジムです。安心して笑える日が、今日の小さな一歩になる。",
  hashtags: ["FLATUPGYM"],
  cta: "",
  safetyNotes: [],
  createdAt: "2026-05-18T00:00:00.000Z",
}];

const safety = checkDraftSafety(drafts.map(draft => draft.body).join("\n"));
const message = formatApprovalMessage(idea, drafts, safety);

// シンプル化後: 内部用語(目的/正本参照/公開レベル/優しさスコア)は出さず、
// OK一発で投稿できる導線と、各媒体指定コマンドが見つけられることを担保する。
assert(message.includes("ID: FG-20260518-001"), "message includes approval id");
assert(message.includes("そのまま投稿準備するなら → OK"), "message leads with one-tap OK");
assert(message.includes("OK FG-20260518-001 all"), "message keeps all publish queue approval");
assert(message.includes("threads"), "message mentions threads target");
assert(message.includes("google"), "message mentions google target");
assert(message.includes("voom"), "message mentions voom target");
assert(message.includes("下書きだけ: OK FG-20260518-001"), "message keeps drafts-only approval");
assert(message.includes("修正 新しい本文"), "message offers revision");
assert(message.includes("やめるなら → NO"), "message includes NO rejection");
assert(!message.includes("Y / 修正"), "message no longer uses Y approval");
assert(!message.includes("優しさスコア"), "message no longer dumps internal kindness score");
assert(!message.includes("正本参照"), "message no longer dumps internal canon refs");
assert(message.includes("安心して投稿できます"), "message reassures when safe");
assert(message.includes("FLATUP GYM"), "message includes draft body");

console.log("approval message tests passed");
