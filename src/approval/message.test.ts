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

assert(message.includes("投稿ID: FG-20260518-001"), "message includes approval id");
assert(message.includes("下書き保存だけ: OK FG-20260518-001"), "message keeps drafts-only approval");
assert(message.includes("投稿準備まで: OK FG-20260518-001 all"), "message includes all publish queue approval");
assert(message.includes("Threadsのみ: OK FG-20260518-001 threads"), "message includes threads publish queue approval");
assert(message.includes("Googleビジネスプロフィールのみ: OK FG-20260518-001 google"), "message includes google publish queue approval");
assert(message.includes("LINE VOOMのみ: OK FG-20260518-001 voom"), "message includes voom publish queue approval");
assert(message.includes("修正する場合: 修正 FG-20260518-001:"), "message requires id for revision");
assert(message.includes("やめる場合: NO FG-20260518-001"), "message includes NO rejection");
assert(!message.includes("Y / 修正"), "message no longer uses Y approval");
assert(message.includes("優しさスコア:"), "message includes kindness score");
assert(message.includes("安全チェック: OK"), "message includes safety OK");
assert(message.includes("FLATUP GYM"), "message includes draft body");

console.log("approval message tests passed");
