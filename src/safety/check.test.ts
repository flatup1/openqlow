import { checkDraftSafety } from "./check.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const safe = checkDraftSafety([
  "FLATUP GYMは、弱い自分と向き合うための世界一優しい格闘技ジムです。",
  "初心者が安心して笑える場所。怒鳴らない、威圧しない。",
].join("\n"));
assert(safe.ok, "safe FLATUP value copy should pass");
assert(safe.kindnessScore.total >= 22, "safe copy should have strong kindness score");

const phone = checkDraftSafety("体験希望は090-1234-5678へ連絡してください。FLATUP GYM");
assert(!phone.ok, "phone number should block");
assert(phone.issues.some(i => i.code === "pii_phone"), "phone issue should be present");

const fullWidthPhone = checkDraftSafety("電話は０９０−１２３４−５６７８です。FLATUP GYM");
assert(!fullWidthPhone.ok, "full-width phone number should block");
assert(fullWidthPhone.issues.some(i => i.code === "pii_phone"), "full-width phone issue should be present");

const japaneseDashPhone = checkDraftSafety("電話は090ー1234ー5678です。FLATUP GYM");
assert(!japaneseDashPhone.ok, "Japanese dash phone number should block");
assert(japaneseDashPhone.issues.some(i => i.code === "pii_phone"), "Japanese dash phone issue should be present");

const email = checkDraftSafety("問い合わせはtest@example.comへ。FLATUP GYM");
assert(!email.ok, "email should block");
assert(email.issues.some(i => i.code === "pii_email"), "email issue should be present");

const attack = checkDraftSafety("他のジムは最悪です。FLATUPだけが正しいです。");
assert(!attack.ok, "other gym attack should block");
assert(attack.issues.some(i => i.code === "other_gym_attack"), "attack issue should be present");

const reversedAttack = checkDraftSafety("最悪なのは他のジムです。FLATUP GYM");
assert(!reversedAttack.ok, "reversed other gym attack should block");
assert(reversedAttack.issues.some(i => i.code === "other_gym_attack"), "reversed attack issue should be present");

const multilineAttack = checkDraftSafety("他のジムは\n最低です。FLATUP GYM");
assert(!multilineAttack.ok, "multiline other gym attack should block");
assert(multilineAttack.issues.some(i => i.code === "other_gym_attack"), "multiline attack issue should be present");

const overclaim = checkDraftSafety("FLATUPなら必ず痩せる。絶対に強くなる。");
assert(!overclaim.ok, "overclaim should block");
assert(overclaim.issues.some(i => i.code === "overclaim"), "overclaim issue should be present");

const overclaimVariants = checkDraftSafety("FLATUPなら絶対痩せます。100％保証です。");
assert(!overclaimVariants.ok, "overclaim variants should block");
assert(overclaimVariants.issues.some(i => i.code === "overclaim"), "overclaim variant issue should be present");

const publish = checkDraftSafety("今すぐ自動投稿して公開します。FLATUP GYM");
assert(!publish.ok, "auto publish language should block");
assert(publish.issues.some(i => i.code === "unsafe_auto_publish"), "auto publish issue should be present");

const platformPublish = checkDraftSafety("Instagramに投稿します。Threadsへ公開します。FLATUP GYM");
assert(!platformPublish.ok, "platform publish language should block");
assert(platformPublish.issues.some(i => i.code === "unsafe_auto_publish"), "platform publish issue should be present");

const salesCta = checkDraftSafety("体験は公式LINEからお気軽にご連絡ください。FLATUP GYM");
assert(!salesCta.ok, "sales CTA should block");
assert(salesCta.issues.some(i => i.code === "salesy_cta"), "sales CTA issue should be present");

const bodyShaming = checkDraftSafety("そのだらしない体を変えよう。FLATUP GYM");
assert(!bodyShaming.ok, "body shaming should block");
assert(bodyShaming.issues.some(i => i.code === "body_shaming"), "body shaming issue should be present");

const fearBait = checkDraftSafety("舐められる前に格闘技を始めろ。FLATUP GYM");
assert(!fearBait.ok, "fear bait should block");
assert(fearBait.issues.some(i => i.code === "fear_baiting"), "fear bait issue should be present");

const beforeAfter = checkDraftSafety("たった30日で別人級のビフォーアフター。FLATUP GYM");
assert(!beforeAfter.ok, "before after bait should block");
assert(beforeAfter.issues.some(i => i.code === "before_after_baiting"), "before after issue should be present");

const elitist = checkDraftSafety("本気の人だけ来い。甘えるな。FLATUP GYM");
assert(!elitist.ok, "elitist phrasing should block");
assert(elitist.issues.some(i => i.code === "elitist_phrasing"), "elitist issue should be present");

const medical = checkDraftSafety("腰痛が治ります。FLATUP GYM");
assert(!medical.ok, "medical claim should block");
assert(medical.issues.some(i => i.code === "medical_claim"), "medical claim issue should be present");

const mockWeakness = checkDraftSafety("運動音痴を笑いに変える。FLATUP GYM");
assert(!mockWeakness.ok, "mocking weakness should block");
assert(mockWeakness.issues.some(i => i.code === "mocking_weakness"), "mocking weakness issue should be present");

const blamingEffort = checkDraftSafety("変われないのは努力不足。言い訳するな。FLATUP GYM");
assert(!blamingEffort.ok, "blaming effort should block");
assert(blamingEffort.issues.some(i => i.code === "blaming_effort"), "blaming effort issue should be present");

const lowKindness = checkDraftSafety("怖い本格派の経験者向け。倒すために追い込み、失敗は晒す場所。");
assert(!lowKindness.ok, "low kindness score should block");
assert(lowKindness.issues.some(i => i.code === "low_kindness_score"), "low kindness issue should be present");

console.log("safety tests passed");
