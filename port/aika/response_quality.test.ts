// 移植版スコアラーの自己テスト。AIKA 接客ログの実例で検証する。
// 実行: npx tsx port/aika/response_quality.test.ts
import {
  scoreResponseQuality,
  scoreEmpathy,
  scoreNaturalness,
  scoreNonDuplication,
} from "./response_quality.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// --- 理想の受付返信は 100/100 ---
const perfect = scoreResponseQuality(
  "ご不安ですよね😊 FLATUP GYMは怒鳴らない、世界一優しい格闘技ジムです。" +
    "初心者の方も自分のペースで安心して始められますよ。" +
    "まずはご希望の曜日だけ教えていただけますか？",
);
assert(perfect.total === 100, `ideal reply should be 100, got ${perfect.total}`);
assert(perfect.decision === "perfect", "ideal reply should be perfect");

// --- ① AIKAログ実例: 機械的な3点要求 ---
const mech = scoreEmpathy("体験予約ですね。以下の3点を教えてください。1.お名前 2.種目 3.日時");
assert(mech.score < 15, `mechanical 3-point demand should lose empathy, got ${mech.score}`);

// --- ② AIKAログ実例: 取次ぎスタック ---
const stuck = scoreNaturalness("只今担当者が対応中です。少々お待ちください😊");
assert(stuck.score < 15, `stuck phrase should lose naturalness, got ${stuck.score}`);

// --- ② AIKAログ実例: 知っている住所を出し渋る ---
const deflect = scoreNaturalness(
  "申し訳ございません。現在、正確な住所やアクセス方法の情報を確認できていません。担当者から折り返しご連絡いたします😊",
);
assert(deflect.score < 20, `deflecting a known fact should lose points, got ${deflect.score}`);
assert(deflect.issues.some(i => i.includes("出し渋")), "deflection should be flagged");

// --- ② AIKAログ実例: 曜日を聞いた直後にまた曜日（文脈喪失） ---
const reAsk = scoreNaturalness("水曜日のご希望ですね。ご希望の曜日を教えていただけますか？", { knownFacts: ["曜日"] });
assert(reAsk.score < 20, `re-asking weekday should lose points, got ${reAsk.score}`);

// --- ③ AIKAログ実例: 同じ案内文の連投 ---
const prev = "こんにちは😊 体験は500円です。ご希望の曜日を教えてください。";
const dup = scoreNonDuplication(prev, { recentReplies: [prev] });
assert(dup.score < 10, `duplicate resend should lose points, got ${dup.score}`);

// --- ④ 煽り・選民・恐怖はreject ---
const harsh = scoreResponseQuality("本気じゃないなら来るな。根性で限界まで追い込め。");
assert(harsh.decision === "reject", "harsh reply must be rejected");
assert(harsh.kindness.score <= 8, `harsh reply kindness should be low, got ${harsh.kindness.score}`);

// --- 正本に基づき料金を即答する優しい返信は高得点 ---
const priceReply = scoreResponseQuality(
  "ご質問ありがとうございます😊 初回体験は500円です。月会費はキッズ7,700円、女性8,800円、男性9,900円ですよ。" +
    "初心者の方も安心して始められます。気になるクラスはありますか？",
);
assert(priceReply.total >= 80, `kind canon-based price reply should score high, got ${priceReply.total}`);
assert(priceReply.decision !== "reject" && priceReply.decision !== "revise", "price reply should pass");

// --- 定休日でも代案を添える返信は高得点 ---
const closed = scoreResponseQuality(
  "本日は日曜で定休日なんです😊 ご不便おかけしてすみません。" +
    "明日からでしたら安心してご案内できますよ。ご希望の曜日だけ教えてくださいね。",
);
assert(closed.total >= 80, `kind closed-day reply should score high, got ${closed.total}`);

// --- 期限・希少性で急かす販売圧力は落とす（憲法「煽り・安売り・威圧NG」）-------
// 恐怖で釣る fearBaiting は既に検出できていたが、「今すぐ決めないと損」型の
// 販売圧力は素通りしていた（2026-08-06 実測で98/100 good だった）。
for (const pushy of [
  "今すぐ入会しないと損します！絶対に後悔しますよ！早く決めてください！",
  "残りわずかです。本日限りのご案内なので、お早めにお決めください。",
  "定員間近です。このチャンスを逃すと次はありません。",
]) {
  const q = scoreResponseQuality(pushy);
  assert(
    q.decision === "reject" || q.decision === "revise",
    `pushy sales copy must not pass: ${pushy} (got ${q.decision} ${q.total})`,
  );
  assert(
    q.kindness.issues.some(i => i.includes("販売圧力")),
    `pushy sales copy should be flagged as 販売圧力: ${pushy}`,
  );
}

// --- 1つの返信で取次ぎを繰り返すのは落とす ------------------------------------
const punting = scoreNaturalness(
  "詳しくはスタッフにご確認ください。店舗までお問い合わせください。担当に確認いたします。",
);
assert(punting.score < 25, `repeated punting should lose points, got ${punting.score}`);
assert(
  punting.issues.some(i => i.includes("取次ぎに逃げている")),
  "repeated punting should be flagged",
);

// 1〜2回の案内は正常（本当に人が確認すべきことは案内してよい）
const okPunt = scoreNaturalness(
  "ご契約内容によって異なりますので、スタッフがご確認のうえご案内いたします。",
);
assert(okPunt.score === 25, `single legitimate handoff should not lose points, got ${okPunt.score}`);

// --- FLATUPらしい言葉があれば満点になる ---------------------------------------
const brandWarm = scoreResponseQuality(
  "ご入会ありがとうございます。初心者の方も、ご自身のペースで安心して始めていただけます。",
);
assert(brandWarm.total === 100, `brand-warm reply should be 100, got ${brandWarm.total}`);
assert(brandWarm.decision === "perfect", `brand-warm reply should be perfect, got ${brandWarm.decision}`);

console.log("aika port response_quality tests passed");
