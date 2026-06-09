import { scoreCraft, scoreDraftLike, formatCraftReport } from "./craft_score.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// 強い投稿: 問いかけ冒頭 + 数字 + 情景 + やわらかい誘い
const strong = scoreCraft(
  [
    "「お父さん、見てた？」その一言、聞いたことありますか？",
    "",
    "親子でミットを持つと、ハイタッチで終わる日が増える。",
    "親子割で月-¥500。ワンコイン体験500円から、空気を感じに来てください。",
  ].join("\n"),
  { platform: "x" },
);
assert(strong.total >= 20, `strong copy should ship (got ${strong.total})`);
assert(strong.verdict === "ship", "strong copy verdict should be ship");
assert(strong.hook.score >= 4, "strong copy should have a strong hook");
assert(strong.invitation.score >= 4, "strong copy should have a soft invite");

// 弱い投稿: テーマ名の貼り付け + 抽象語のみ + 誘い無し
const weak = scoreCraft("昨日の自分を、ほんの少し超える\n\n強さとは優しさだ。", { platform: "x" });
assert(weak.total < 15, `bare abstract copy should rework (got ${weak.total})`);
assert(weak.verdict === "rework", "weak copy verdict should be rework");
assert(weak.topFix !== null, "weak copy should surface a top fix");

// 新鮮さ: 直近とほぼ同一なら freshness が落ちる
const body = "親子でミットを持つ瞬間、ハイタッチで終わる。親子割で月-¥500。";
const fresh = scoreCraft(body, { platform: "threads", recentBodies: [] });
const stale = scoreCraft(body, { platform: "threads", recentBodies: [body] });
assert(fresh.freshness.score === 3, "no recent bodies should be neutral (judgement impossible)");
assert(stale.freshness.score <= 1, `identical recent body should tank freshness (got ${stale.freshness.score})`);
assert(stale.freshness.hints.length > 0, "stale copy should warn about reuse");

// やや被り（部分的に共通）でも中間スコアになる
const partial = scoreCraft(
  "親子でミットを持つ瞬間。UIZINでは抱擁で終わる。ワンコイン体験500円から。",
  { platform: "threads", recentBodies: [body] },
);
assert(
  partial.freshness.score > stale.freshness.score && partial.freshness.score < 5,
  `partial overlap should be mid freshness (got ${partial.freshness.score})`,
);

// 硬い煽りは誘いの点が下がる
const hardSell = scoreCraft("今だけ限定！今すぐお申し込みは公式から。", { platform: "x" });
assert(hardSell.invitation.score <= 1, "hard-sell should score low on invitation");

// X 長さ超過の検出（重み付け280超）
const longX = scoreCraft("あ".repeat(200), { platform: "x" });
assert(
  longX.platformFit.hints.some(h => h.includes("長さ超過")),
  "over-length X copy should warn about length",
);

// Instagram リール構成の検出
const reel = scoreCraft(
  "リール案\n\n冒頭: 親子でミット\n中盤: 笑い合う\n終盤: ハイタッチ\n\n字幕案:\n親子割で月-¥500",
  { platform: "instagram" },
);
assert(reel.platformFit.score >= 4, "well-structured reel should fit instagram");

// scoreDraftLike: 不明 platform は unknown 扱いで落ちない
const draftScore = scoreDraftLike({ body: "FLATUP GYMでワンコイン体験500円から。", platform: "x" });
assert(draftScore.total >= 0 && draftScore.total <= 25, "draft score in range");

// レポート整形が落ちない
const report = formatCraftReport(strong);
assert(report.includes("クラフト採点"), "report should contain header");
assert(report.includes("/25"), "report should contain total");

console.log("craft score tests passed");
