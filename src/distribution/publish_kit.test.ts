import { buildKitItem, buildPublishKit, formatKitItem } from "./publish_kit.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const safeBody = "「お父さん、見てた？」その一言、聞いたことありますか？\n親子割で月-¥500。ワンコイン体験500円から、空気を感じに。";

// ── X: 安全なら本文入りの intent リンクができる ──
const x = buildKitItem({ platform: "x", body: safeBody, hashtags: ["成田市", "FLATUPGYM"] });
assert(x.safe, "safe X copy should pass the re-gate");
assert(x.launchKind === "x_intent", "X should use x_intent");
assert(x.launchUrl?.startsWith("https://twitter.com/intent/tweet?text="), "X launch url should be the tweet intent");
assert(decodeURIComponent(x.launchUrl!.split("text=")[1]).includes("お父さん"), "launch url should carry the body");
assert(x.finalText.includes("#成田市") && x.finalText.includes("#FLATUPGYM"), "hashtags should be rendered with #");

// ── Threads: threads intent ──
const threads = buildKitItem({ platform: "threads", body: safeBody });
assert(threads.launchKind === "threads_intent", "threads should use threads_intent");
assert(threads.launchUrl?.startsWith("https://www.threads.net/intent/post?text="), "threads launch url should be the post intent");

// ── Instagram: プリフィル不可 → リンク無し・コピー運用、本文は出る ──
const ig = buildKitItem({ platform: "instagram", body: safeBody });
assert(ig.safe, "safe IG copy passes");
assert(ig.launchUrl === null, "instagram has no prefill link");
assert(ig.launchKind === "copy_only", "instagram is copy_only");
assert(ig.finalText.includes("ワンコイン体験"), "IG finalText still available for copy");

// ── 再ゲート(C): 承認後に危険が混ざっていたらリンクを作らない ──
const unsafe = buildKitItem({ platform: "x", body: "体験希望は090-1234-5678へ連絡してください。FLATUP GYM" });
assert(!unsafe.safe, "phone number should fail the re-gate");
assert(unsafe.launchUrl === null, "unsafe copy must not produce a launch link");
assert(unsafe.blockedReasons.length > 0, "unsafe copy should report block reasons");

// 営業CTAも再ゲートで弾く
const salesy = buildKitItem({ platform: "x", body: "体験は公式LINEからお気軽にご連絡ください。FLATUP GYM" });
assert(!salesy.safe, "salesy CTA should fail the re-gate");
assert(salesy.launchUrl === null, "salesy copy must not produce a launch link");

// ── buildPublishKit: 複数ドラフトをまとめる / allSafe を集計 ──
const kit = buildPublishKit({
  id: "FG-20260609-001",
  drafts: [
    { platform: "x", body: safeBody, hashtags: ["成田市"] },
    { platform: "threads", body: safeBody },
    { platform: "instagram", body: safeBody },
  ],
});
assert(kit.items.length === 3, "kit should have 3 items");
assert(kit.allSafe, "all safe drafts -> allSafe true");

const mixedKit = buildPublishKit({
  drafts: [
    { platform: "x", body: safeBody },
    { platform: "x", body: "090-1234-5678 まで連絡を。" },
  ],
});
assert(!mixedKit.allSafe, "one unsafe draft -> allSafe false");

// ── 整形が落ちない / ブロック時は明示 ──
assert(formatKitItem(x).includes("起動リンク"), "safe item shows a launch line");
assert(formatKitItem(unsafe).includes("ブロック"), "blocked item is clearly marked");

console.log("publish kit tests passed");
