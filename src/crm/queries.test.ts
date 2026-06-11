import {
  getFollowupNeeded,
  getTrialFollowupNeeded,
  getReviewRequestCandidates,
} from "./queries.js";
import { normalizeProspectInput, type Prospect, type ProspectInput } from "./prospect.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

let idSeq = 0;
function make(input: ProspectInput): Prospect {
  idSeq += 1;
  return { id: idSeq, ...normalizeProspectInput(input), createdAt: "2026-06-10T00:00:00.000Z", updatedAt: "2026-06-10T00:00:00.000Z" };
}

const now = new Date("2026-06-11T12:00:00.000Z");
const old = "2026-06-10T00:00:00.000Z"; // 36時間前
const recent = "2026-06-11T06:00:00.000Z"; // 6時間前

// --- getFollowupNeeded --------------------------------------------------------
const waitingOld = make({ name: "A", status: "waiting_reply", lastContactAt: old });
const repliedOld = make({ name: "B", status: "replied", lastContactAt: old });
const waitingRecent = make({ name: "C", status: "waiting_reply", lastContactAt: recent });
const joinedOld = make({ name: "D", status: "waiting_reply", lastContactAt: old, joined: 1 });
const lostOld = make({ name: "E", status: "lost", lastContactAt: old });
const newInquiry = make({ name: "F", status: "new_inquiry", lastContactAt: old });

const followups = getFollowupNeeded([waitingOld, repliedOld, waitingRecent, joinedOld, lostOld, newInquiry], now);
const followupNames = followups.map(p => p.name).sort();
assert(followupNames.join(",") === "A,B", `followup needed = A,B; got ${followupNames.join(",")}`);
assert(!followups.includes(waitingRecent), "recent contact (<24h) excluded");
assert(!followups.includes(joinedOld), "joined excluded");
assert(!followups.includes(lostOld), "lost excluded");
assert(!followups.includes(newInquiry), "new_inquiry excluded (not waiting/replied)");

// 連絡日未記録は放置とみなして対象に含める
const noContact = make({ name: "G", status: "waiting_reply", lastContactAt: "" });
assert(getFollowupNeeded([noContact], now).length === 1, "missing lastContactAt treated as overdue");

// --- getTrialFollowupNeeded ---------------------------------------------------
const trialDone = make({ name: "H", status: "trial_done", trialDate: "2026-06-09", joined: 0 });
const trialDoneJoined = make({ name: "I", status: "trial_done", trialDate: "2026-06-09", joined: 1 });
const trialDoneNoDate = make({ name: "J", status: "trial_done", trialDate: "", joined: 0 });
const trialFollowups = getTrialFollowupNeeded([trialDone, trialDoneJoined, trialDoneNoDate]);
assert(trialFollowups.length === 1 && trialFollowups[0].name === "H", "trial followup = trial_done + not joined + has date");

// --- getReviewRequestCandidates ----------------------------------------------
const joinedMember = make({ name: "K", status: "joined", joined: 1 });
const joinedStatusOnly = make({ name: "L", status: "joined", joined: 0 });
const reviews = getReviewRequestCandidates([joinedMember, joinedStatusOnly]);
assert(reviews.length === 1 && reviews[0].name === "K", "review candidate = status joined AND joined=1");

console.log("crm queries tests passed");
