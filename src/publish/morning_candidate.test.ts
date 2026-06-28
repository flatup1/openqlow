import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FLATUP_CANON } from "../shared/canon.js";

const root = await mkdtemp(path.join(os.tmpdir(), "openqlow-morning-candidate-"));
process.env.OPENQLOW_ROOT = root;

const { createMorningPublishCandidate } = await import("./morning_candidate.js");

// 1. 投稿候補が生成され、本文がブランドの芯（世界一優しいジム）と正本の価格を含む。
const a = await createMorningPublishCandidate({ dateJst: "2026-06-27" });
const bodyA = a.drafts[0].body;
assert.equal(a.status, "pending_approval");
assert.ok(bodyA.length > 0, "本文が空でない");
assert.match(bodyA, /FLATUP GYM|FLATUP|格闘技/, "ブランド名/領域に触れる");

// 多言語併記: EN/中文/한국어/ไทย の招待が付く（成田・空港圏向け）。
assert.match(bodyA, /EN:.*welcome/i, "英語の招待を併記");
assert.match(bodyA, /欢迎/, "中国語の招待を併記");
assert.match(bodyA, /환영/, "韓国語の招待を併記");
assert.match(bodyA, /ยินดีต้อนรับ/, "タイ語の招待を併記");
assert.match(bodyA, new RegExp(`¥?${FLATUP_CANON.trialFirst.match(/\\d+/)?.[0] ?? "500"}`), "体験価格を正本から各言語に反映");

// 2. 公開投稿に内部情報（会員名・入会状況・個別対応）を出さない。
assert.doesNotMatch(bodyA, /気になる会員|入会予定|返信が必要|個別対応|退会/, "内部記録の語を公開投稿に出さない");

// 3. 価格は正本(FLATUP_CANON)から引く（直書きしない）。少なくとも1日分の本文に体験価格が載る。
const bodies = [];
for (const d of ["2026-06-27", "2026-06-28", "2026-06-29", "2026-06-30", "2026-07-01"]) {
  const rec = await createMorningPublishCandidate({ dateJst: d });
  bodies.push(rec.drafts[0].body);
}
assert.ok(bodies.some(b => b.includes(FLATUP_CANON.trialFirst)), "どこかの日に体験価格を正本から提示");

// 4. 毎日同じ文面にならない（ローテーションで複数種類）。
assert.ok(new Set(bodies).size >= 2, "日替わりで本文が変化する");

// 4b. 全variantを網羅して、どれも安全・PII無し・ハッシュタグ付きであることを確認。
const seen = new Set<string>();
const seenTags = new Set<string>();
for (let day = 1; day <= 16; day++) {
  const d = `2026-08-${String(day).padStart(2, "0")}`;
  const rec = await createMorningPublishCandidate({ dateJst: d });
  const b = rec.drafts[0].body;
  seen.add(b);
  seenTags.add(rec.drafts[0].hashtags.join(","));
  assert.ok(rec.drafts[0].hashtags.length >= 2, "各投稿にハッシュタグが2つ以上");
  assert.doesNotMatch(b, /気になる会員|入会予定|返信が必要|個別対応|退会/, "内部記録の語を出さない");
  assert.doesNotMatch(rec.approvalMessage, /安全チェック.*(NG|ストップ|止め)/, "安全チェックで止められない");
}
assert.ok(seen.size >= 6, `バリエーションが豊富（${seen.size}種）`);
assert.ok(seenTags.size >= 4, "ハッシュタグも日替わりで変化する");

// 5. 同じ日付なら決定的（再現性）。
const again = await createMorningPublishCandidate({ dateJst: "2026-06-27" });
assert.equal(again.drafts[0].body, bodyA, "同じ日付は同じ本文（決定的）");

// 6. 安全チェックを通過し、優しさで止められていない。
assert.doesNotMatch(a.approvalMessage, /安全チェック.*(NG|ストップ|止め)/);

await rm(root, { recursive: true, force: true });

console.log("morning candidate tests passed");
