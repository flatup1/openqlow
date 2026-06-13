import {
  generateInquiryReply,
  FLATUP_INFO,
  type InquiryInput,
} from "./inquiry_reply.js";
import { parseArgs, renderResult } from "./inquiry_reply_cli.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// --- キッズの問い合わせ：属性=kids、体験誘導、AIKA締め -------------------------
const kids = generateInquiryReply({
  message: "小学生の子供にキックボクシングを習わせたいのですが、初心者でも大丈夫ですか？",
});
assert(kids.classification.attribute === "kids", `kids attribute, got ${kids.classification.attribute}`);
assert(kids.classification.priority === "A", "kids inquiries are high priority");
assert(kids.replies.polite.includes("初回体験は500円"), "polite reply mentions trial price");
assert(kids.replies.polite.includes(FLATUP_INFO.scheduleKids), "kids reply mentions kids schedule");
assert(kids.replies.polite.trimEnd().endsWith("AIKA"), "polite reply is signed AIKA");
assert(kids.replies.short.trimEnd().endsWith("AIKA"), "short reply is signed AIKA");
assert(kids.replies.bookingFocused.trimEnd().endsWith("AIKA"), "booking reply is signed AIKA");
// 予約意思がある人向け：名前・種目・希望日時を一度に確認し、記入例と候補枠を見せる
assert(kids.replies.bookingFocused.includes("①お名前"), "booking asks name");
assert(kids.replies.bookingFocused.includes("②体験したい種目"), "booking asks discipline");
assert(kids.replies.bookingFocused.includes("③ご希望の曜日と時間"), "booking asks day and time together");
assert(kids.replies.bookingFocused.includes("例："), "booking shows a fill-in example");
assert(kids.replies.bookingFocused.includes("初回500円"), "booking mentions trial price");
assert(!kids.replies.bookingFocused.includes("どの種目に興味がありますか"), "booking does NOT split the question across turns");

// --- 女性・ダイエット・料金あり：属性=women、温度=high、料金行が入る ----------
const woman = generateInquiryReply({
  message: "ダイエット目的で体験予約したい女性です。料金を教えてください。",
});
assert(woman.classification.attribute === "women", `women attribute, got ${woman.classification.attribute}`);
assert(woman.classification.temperature === "high", "予約 keyword => high temperature");
assert(woman.classification.purpose === "ダイエット", `purpose=ダイエット, got ${woman.classification.purpose}`);
assert(woman.classification.nextAction === "propose_schedule", "high temp => propose schedule");
assert(woman.replies.polite.includes(FLATUP_INFO.priceWomen), "price-asking woman reply includes women price");
assert(woman.replies.polite.includes(FLATUP_INFO.bookingWomen), "women reply includes women booking days");

// --- 男性・運動不足：属性=men、平日夜案内 -------------------------------------
const man = generateInquiryReply({
  message: "運動不足を解消したいです。見学できますか？",
  gender: "male",
});
assert(man.classification.attribute === "men", `men attribute, got ${man.classification.attribute}`);
assert(man.replies.polite.includes(FLATUP_INFO.bookingMen), "men reply includes weekday-evening booking");
assert(man.classification.purpose === "運動不足", "purpose=運動不足");

// --- 低温度（検討中・料金だけ）：温度=low、優先度=C -----------------------------
const cool = generateInquiryReply({
  message: "まだ迷っているのですが、とりあえず料金だけ教えてください。",
});
assert(cool.classification.temperature === "low", `low temperature, got ${cool.classification.temperature}`);
assert(cool.classification.priority === "C", "low temperature => priority C");

// --- 料金を聞いていない場合は料金行を入れない ---------------------------------
const noPrice = generateInquiryReply({ message: "初心者ですが大丈夫ですか？" });
assert(!noPrice.replies.polite.includes("月会費"), "no price line when price not asked");

// --- 追客文は必ず生成され、AIKA で締める -------------------------------------
assert(kids.replies.followUp24h.includes("お問い合わせ"), "24h follow-up references the inquiry");
assert(kids.replies.followUp24h.trimEnd().endsWith("AIKA"), "24h follow-up signed AIKA");
assert(kids.replies.followUp3d.trimEnd().endsWith("AIKA"), "3d follow-up signed AIKA");

// --- 安全：注意書きに自動送信禁止が必ず入る ----------------------------------
assert(
  kids.notes.some(n => n.includes("自動送信はしません")),
  "notes must warn that auto-send is disabled",
);

// --- 最適化: 「男です」単独で男性に分類し、案内を平日夜に絞る -----------------
const manBare = generateInquiryReply({ message: "護身術として習いたい男です。" });
assert(manBare.classification.attribute === "men", `男です => men, got ${manBare.classification.attribute}`);
assert(manBare.replies.polite.includes(FLATUP_INFO.bookingMen), "男です reply guides weekday evening");
assert(!manBare.replies.polite.includes(FLATUP_INFO.bookingWomen), "男 confirmed => does not also list women days");

// --- 最適化: 「60歳」でシニアに分類 ------------------------------------------
const senior = generateInquiryReply({ message: "60歳ですが運動不足解消で通えますか" });
assert(senior.classification.attribute === "senior", `60歳 => senior, got ${senior.classification.attribute}`);

// --- 最適化: 料金表示時は「初回体験は500円ですので」を重複させない -----------
const womanPrice = generateInquiryReply({ message: "料金を教えてください。女性です。" });
assert(womanPrice.replies.polite.includes("初回体験500円"), "price line still present");
assert(
  !womanPrice.replies.polite.includes("初回体験は500円ですので"),
  "price-shown reply must not repeat the long trial-price phrase",
);
assert(womanPrice.replies.polite.includes("まずは一度、雰囲気を見に"), "price-shown reply uses the short invite line");
assert(
  (womanPrice.replies.polite.match(/500円/g) ?? []).length === 1,
  "500円 appears exactly once when price is shown",
);

// --- 最適化: 不安キーワードに安心の一言を返す --------------------------------
const scary = generateInquiryReply({ message: "怖くないですか？運動神経も悪いです" });
assert(scary.replies.polite.includes("激しいスパーリングは行いません"), "fear keyword => reassurance line in polite reply");
const calm = generateInquiryReply({ message: "初心者ですが大丈夫ですか？" });
assert(!calm.replies.polite.includes("怖い・きつそう"), "no reassurance line when no concern keyword");

// --- 場面2：難条件の相談（希望種目を変えない・必要情報を聞く・代替案・会話を終わらせない） ---
const obstacle = generateInquiryReply({ message: "レスリング希望です。仕事後に途中参加できますか？" });
assert(obstacle.replies.obstacleConsult, "obstacle reply is generated for attendance-difficulty question");
assert(obstacle.replies.obstacleConsult!.includes("レスリングクラス"), "echoes the requested discipline (no redirect)");
assert(!obstacle.replies.obstacleConsult!.includes("キックボクシング"), "does NOT redirect to kickboxing");
assert(obstacle.replies.obstacleConsult!.includes("到着できそうな時間"), "asks the info needed to confirm");
assert(obstacle.replies.obstacleConsult!.includes("別の日時をご案内"), "offers an alternative, keeps the conversation open");
assert(obstacle.replies.obstacleConsult!.trimEnd().endsWith("AIKA"), "obstacle reply is signed AIKA");

// 種目が無くても汎用クラス名で成立
const obstacleNoDiscipline = generateInquiryReply({ message: "仕事が終わってからだと間に合うか不安です" });
assert(obstacleNoDiscipline.replies.obstacleConsult!.includes("ご希望のクラス"), "generic class when discipline not stated");

// 難条件でない通常問い合わせには付かない
const normal = generateInquiryReply({ message: "初心者ですが大丈夫ですか？" });
assert(!normal.replies.obstacleConsult, "no obstacle reply for a normal inquiry");

// --- 空メッセージはエラー -----------------------------------------------------
let threw = false;
try {
  generateInquiryReply({ message: "   " } as InquiryInput);
} catch {
  threw = true;
}
assert(threw, "empty message should throw");

// --- CLI 引数パース ----------------------------------------------------------
const parsed = parseArgs(["女性です", "通いたい", "--gender", "female", "--purpose", "護身"]);
assert(parsed.message === "女性です 通いたい", `joined positional message, got ${parsed.message}`);
assert(parsed.gender === "female", "parses --gender");
assert(parsed.purpose === "護身", "parses --purpose");

// --- CLI レンダリングが5パターン＋分類を含む --------------------------------
const rendered = renderResult({ message: "子供を習わせたいです" });
assert(rendered.includes("属性分類"), "rendered output includes classification");
assert(rendered.includes("① 丁寧な返信文"), "rendered output includes polite reply");
assert(rendered.includes("⑤ 3日後の追客文"), "rendered output includes 3d follow-up");

console.log("inquiry reply tests passed");
