import {
  addOnboardingSent,
  buildJoinPatch,
  buildOnboardingMessage,
  daysSinceJoin,
  dueOnboardingStep,
  getJoinDateMissing,
  getOnboardingDue,
  isValidYmd,
  joinDateOf,
  ONBOARDING_STEPS,
  parseOnboardingSent,
  withdrawalProspectIds,
} from "./onboarding.js";
import { normalizeProspectInput, type Prospect, type ProspectInput } from "./prospect.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

let idSeq = 0;
function make(input: ProspectInput): Prospect {
  idSeq += 1;
  return { id: idSeq, ...normalizeProspectInput(input), createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" };
}
function member(name: string, joinedAt: string, extra: ProspectInput = {}): Prospect {
  return make({ name, status: "joined", joined: 1, joinedAt, ...extra });
}

// 基準の「今日」= 日本時間 2026-11-17 の昼
const now = new Date("2026-11-17T03:00:00.000Z");

// --- 日数の数え方（日本時間の日付どうしの差） -----------------------------------
assert(daysSinceJoin("2026-11-17", now) === 0, "入会当日は0日目");
assert(daysSinceJoin("2026-11-10", now) === 7, "7日前は7日目");
assert(daysSinceJoin("2026-10-18", now) === 30, "月をまたいでも正しく数える");
assert(daysSinceJoin("", now) === null, "未記録は null");
assert(daysSinceJoin("なんとなく先週", now) === null, "日付でない値は null");
assert(daysSinceJoin("2026-02-31", now) === null, "存在しない日付は null");
assert((daysSinceJoin("2026-11-20", now) ?? 0) < 0, "未来の入会日は負の数（候補に出さない）");

// サーバーがUTCでも日本時間で数える: UTC 11/16 16:00 = 日本時間 11/17 01:00 → 当日扱い
assert(daysSinceJoin("2026-11-16T16:00:00.000Z", now) === 0, "ISO日時は日本時間の日付に直して数える");
// 日本時間の深夜（UTCではまだ前日）でも、日本の日付で数える
const jstLateNight = new Date("2026-11-17T15:30:00.000Z"); // 日本時間 11/18 00:30
assert(daysSinceJoin("2026-11-11", jstLateNight) === 7, "日本時間の日付が変わったら1日進む");

assert(joinDateOf("2026-11-16T16:00:00.000Z") === "2026-11-17", "入会日は日本時間の日付で表示");
assert(joinDateOf("") === "" && joinDateOf("2026-13-01") === "", "未記録・不正は空文字");
assert(isValidYmd("2026-11-17") && !isValidYmd("2026-2-3") && !isValidYmd("2026-02-30") && !isValidYmd(""), "入会日の入力検査");

// --- 声かけの時期 ---------------------------------------------------------------
const stepAt = (daysAgo: number): string | undefined => {
  const d = new Date(Date.UTC(2026, 10, 17 - daysAgo));
  return dueOnboardingStep(d.toISOString().slice(0, 10), now)?.key;
};
assert(stepAt(0) === "welcome" && stepAt(2) === "welcome", "0〜2日目は入会当日の声かけ");
assert(stepAt(3) === undefined && stepAt(6) === undefined, "3〜6日目は何も出さない");
assert(stepAt(7) === "week1" && stepAt(13) === "week1", "7〜13日目は1週間");
assert(stepAt(14) === "week2" && stepAt(20) === "week2", "14〜20日目は2週間");
assert(stepAt(21) === undefined && stepAt(29) === undefined, "21〜29日目は何も出さない");
assert(stepAt(30) === "month1" && stepAt(36) === "month1", "30〜36日目は1ヶ月");
assert(stepAt(37) === undefined && stepAt(200) === undefined, "時期を過ぎたら出さない（時期外れの文面を送らない）");

// ステップ同士の時期が重ならない（1人に同じ日に2通の候補を出さない）
for (let i = 1; i < ONBOARDING_STEPS.length; i++) {
  const prev = ONBOARDING_STEPS[i - 1];
  assert(prev.dueDay + prev.windowDays <= ONBOARDING_STEPS[i].dueDay, `${prev.key} と ${ONBOARDING_STEPS[i].key} の時期が重ならない`);
}

// --- 送信済みの記録 -------------------------------------------------------------
assert(parseOnboardingSent("welcome,week1").join("|") === "welcome|week1", "カンマ区切りを読む");
assert(parseOnboardingSent(" week1 , ぴよ ,,").join("|") === "week1", "未知のキー・空要素は捨てる");
assert(parseOnboardingSent(undefined as unknown as string).length === 0, "古い記録（項目なし）でも落ちない");
assert(addOnboardingSent("", "week1") === "week1", "1つ目を足す");
assert(addOnboardingSent("week1", "welcome") === "welcome,week1", "定義順に並べる");
assert(addOnboardingSent("welcome,week1", "week1") === "welcome,week1", "重複させない");

// --- 候補の抽出 -----------------------------------------------------------------
const newMember = member("当日さん", "2026-11-17");
const week1Member = member("1週間さん", "2026-11-09"); // 8日目
const week1Sent = member("送信済みさん", "2026-11-09", { onboardingSent: "week1" });
const month1Member = member("1ヶ月さん", "2026-10-17"); // 31日目
const quietMember = member("谷間さん", "2026-11-13"); // 4日目（時期の谷間）
const oldMember = member("ベテランさん", "2025-11-17");
const noDate = member("入会日なしさん", "");
const trialOnly = make({ name: "体験だけさん", status: "trial_done", trialDate: "2026-11-10" });
const flagOnly = make({ name: "フラグなしさん", status: "joined", joined: 0, joinedAt: "2026-11-17" });
const leaving = member("退会相談さん", "2026-11-09");

const everyone = [oldMember, month1Member, week1Sent, week1Member, newMember, quietMember, noDate, trialOnly, flagOnly, leaving];
const due = getOnboardingDue(everyone, now, { excludeProspectIds: new Set([leaving.id]) });
assert(
  due.map(d => `${d.prospect.name}:${d.step.key}:${d.days}`).join(",") === "当日さん:welcome:0,1週間さん:week1:8,1ヶ月さん:month1:31",
  `候補は時期に入っていて未送信の会員だけ・入会が浅い順; got ${due.map(d => `${d.prospect.name}:${d.step.key}:${d.days}`).join(",")}`,
);
assert(!due.some(d => d.prospect === week1Sent), "送信済みは出さない");
assert(!due.some(d => d.prospect === leaving), "退会の相談に入っている会員には出さない");
assert(getOnboardingDue(everyone, now).some(d => d.prospect === leaving), "除外の指定が無ければ通常どおり出る");

// 1週間を送っていても、2週間の時期が来たら次の候補として出る
const later = new Date("2026-11-24T03:00:00.000Z"); // 送信済みさんは15日目
assert(getOnboardingDue([week1Sent], later)[0]?.step.key === "week2", "次の時期になったら次の声かけが候補に出る");

const missing = getJoinDateMissing(everyone);
assert(missing.length === 1 && missing[0] === noDate, "入会日が未記録の会員を拾う（推測で埋めない）");

// 古い名簿（joinedAt / onboardingSent の項目が無い記録）でも落ちない
const legacy = { ...member("古い記録さん", ""), joinedAt: undefined, onboardingSent: undefined } as unknown as Prospect;
assert(getOnboardingDue([legacy], now).length === 0, "古い記録は候補に出ない（落ちない）");
assert(getJoinDateMissing([legacy]).length === 1, "古い記録は入会日未記録として拾う");

// --- 退会手続き中の会員を外す -----------------------------------------------------
const ids = withdrawalProspectIds([
  { prospectId: 5, lineUserId: "", currentWithdrawalStatus: "WITHDRAWAL_INQUIRY" },
  { prospectId: 6, lineUserId: "", currentWithdrawalStatus: "CLOSED" },
  { prospectId: 7, lineUserId: "", currentWithdrawalStatus: "ACTIVE" },
  { prospectId: 0, lineUserId: "", currentWithdrawalStatus: "FORM_RECEIVED" },
]);
assert(ids.has(5) && ids.has(6) && !ids.has(7) && !ids.has(0), "退会の相談〜完了の会員だけ外す（名簿に紐付かない0は無視）");

// 実際の退会ケースは名簿番号を持たない（LINEの相談も CLI の open も prospectId を渡さない）。
// LINE userId で名簿と突き合わせて外せること。
const lineMember = member("LINE相談さん", "2026-11-09", { externalId: "U-line-123" });
const otherMember = member("ほかの人さん", "2026-11-09", { externalId: "U-other" });
const viaLine = withdrawalProspectIds(
  [
    { prospectId: 0, lineUserId: "U-line-123", currentWithdrawalStatus: "WITHDRAWAL_INQUIRY" },
    { prospectId: 0, lineUserId: "U-other", currentWithdrawalStatus: "ACTIVE" },
  ],
  [lineMember, otherMember],
);
assert(viaLine.has(lineMember.id) && !viaLine.has(otherMember.id), "LINE userId で退会相談中の会員を見つけて外す（在籍中のケースは外さない）");
const dueViaLine = getOnboardingDue([lineMember, otherMember], now, { excludeProspectIds: viaLine });
assert(dueViaLine.length === 1 && dueViaLine[0].prospect === otherMember, "退会相談中の人には入会後フォローを出さない");
assert(withdrawalProspectIds([{ prospectId: 0, lineUserId: "", currentWithdrawalStatus: "FORM_RECEIVED" }], [member("ID空さん", "2026-11-09")]).size === 0, "LINE userId が空どうしでは一致させない");

// --- 入会の記録（状態と入会フラグ・入会日をそろえる） ------------------------------
const joinNow = buildJoinPatch({ status: "trial_done", joinedAt: "" }, "joined", { now });
assert(joinNow.patch.joined === 1, "入会にしたら入会フラグが立つ（以前は立たず、入会者が一覧から消えていた）");
assert(joinNow.patch.joinedAt === now.toISOString() && joinNow.patch.onboardingSent === "", "入会日は今日・送信記録は新しく始める");
assert(!joinNow.joinDateMissing, "入会日は記録済み");

const backfill = buildJoinPatch({ status: "trial_done", joinedAt: "" }, "joined", { explicitJoinedAt: "2026-11-01", now });
assert(backfill.patch.joinedAt === "2026-11-01", "入会日の指定があればそれを使う");

const again = buildJoinPatch({ status: "joined", joinedAt: "" }, "joined", { now });
assert(again.patch.joined === 1 && again.patch.joinedAt === undefined, "入会済みの記録の入会日を今日と決めつけない");
assert(again.joinDateMissing, "入会日が未記録のままなら知らせる");

const againKnown = buildJoinPatch({ status: "joined", joinedAt: "2026-10-01" }, "joined", { now });
assert(againKnown.patch.joinedAt === undefined && againKnown.patch.onboardingSent === undefined && !againKnown.joinDateMissing, "記録済みの入会日・送信記録は上書きしない");

const fixDate = buildJoinPatch({ status: "joined", joinedAt: "2026-10-01" }, "joined", { explicitJoinedAt: "2026-10-05", now });
assert(fixDate.patch.joinedAt === "2026-10-05" && fixDate.patch.onboardingSent === undefined, "入会日だけ直せる（送信記録は消さない）");

const undo = buildJoinPatch({ status: "joined", joinedAt: "2026-11-01" }, "trial_done", { now });
assert(undo.patch.joined === 0 && undo.patch.joinedAt === undefined, "入会から戻したらフラグを下ろす（追客一覧から消えたままにしない）");
assert(Object.keys(buildJoinPatch({ status: "replied", joinedAt: "" }, "trial_done", { now }).patch).length === 0, "入会に関係ない変更では何も足さない");

// --- 文面（下書き） -------------------------------------------------------------
for (const step of ONBOARDING_STEPS) {
  const text = buildOnboardingMessage(step.key);
  assert(text.length > 0 && text.length <= 200, `${step.key}: 文面があり、200文字以内`);
  // 営業・料金・引き止めの言葉を入れない（入会後の声かけは営業ではない）
  assert(!/円|料金|月会費|キャンペーン|割引|口コミ|紹介|退会|休会/.test(text), `${step.key}: 営業・料金・退会の言葉を含まない`);
  assert(!/絶対|必ず|最強/.test(text), `${step.key}: 断定・煽りの言葉を含まない`);
}
assert(buildOnboardingMessage("welcome").includes("ご入会ありがとうございます"), "入会当日はお礼から");
assert(buildOnboardingMessage("week2").includes("週1回でも"), "無理をさせない一言が入る");

console.log("crm onboarding tests passed");
