import { mkdtemp, mkdir, writeFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { extractBody, loadRecentBodies, scoreCraftWithHistory } from "./recent_bodies.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// ── extractBody: adapters の .md からヘッダ／メタ／ハッシュタグを落として本文を取る ──
const threadsFile = [
  "# Threads Draft",
  "",
  "- id: idea_abc_threads",
  "- approval_id: idea_abc",
  "- platform: threads",
  "- publication_level: level_2_draft",
  "",
  "親子でミットを持つ瞬間、ハイタッチで終わる。",
  "怒鳴らない太陽のジムで、家族の時間が増える。",
  "",
  "#FLATUPGYM",
].join("\n");
const extracted = extractBody(threadsFile);
assert(extracted.includes("親子でミットを持つ瞬間"), "body line should survive extraction");
assert(!extracted.includes("# Threads Draft"), "title should be stripped");
assert(!extracted.includes("approval_id"), "metadata should be stripped");
assert(!extracted.includes("#FLATUPGYM"), "hashtag-only line should be stripped");

// X 形式（フッタに CTA / approval_id / publication_level が来る）も本文だけ残る
const xFile = [
  "# X Draft",
  "",
  "- id: idea_abc_x",
  "- platform: x",
  "- typefully_mode: draft_only",
  "",
  "昨日の自分を、ほんの少し超える",
  "",
  "強くなることは、優しくなること。",
  "",
  "#FLATUPGYM #成田市",
  "",
  "approval_id: idea_abc",
  "publication_level: level_2_draft",
].join("\n");
const xBody = extractBody(xFile);
assert(xBody.includes("昨日の自分を"), "x body should survive");
assert(!xBody.includes("approval_id"), "x footer should be stripped");
assert(!xBody.includes("typefully_mode"), "x typefully_mode should be stripped");

// ── loadRecentBodies: register(index.jsonl) を新しい順・除外・件数で読む ──
const root = await mkdtemp(path.join(tmpdir(), "openqlow-recent-bodies-"));
const dir = path.join(root, "drafts", "threads");
await mkdir(dir, { recursive: true });

async function writeDraft(id: string, createdAt: string, body: string): Promise<void> {
  const file = path.join(dir, `${id}.md`);
  await writeFile(
    file,
    ["# Threads Draft", "", `- id: ${id}`, "- platform: threads", "", body, "", "#FLATUPGYM"].join("\n"),
    "utf8",
  );
  await appendFile(path.join(dir, "index.jsonl"), `${JSON.stringify({ id, file, createdAt })}\n`, "utf8");
}

await writeDraft("d_old", "2026-06-01T00:00:00.000Z", "古いテーマ：成田で始める最初の一歩。");
await writeDraft("d_mid", "2026-06-05T00:00:00.000Z", "中くらい：女性が安心して始める格闘技。");
await writeDraft("d_new", "2026-06-09T00:00:00.000Z", "新しい：親子でミットを持つ瞬間、ハイタッチで終わる。");

const all = await loadRecentBodies("threads", { root });
assert(all.length === 3, `should load all 3 bodies (got ${all.length})`);
assert(all[0].includes("親子でミットを持つ"), "newest should be first");
assert(all[2].includes("成田で始める"), "oldest should be last");

const limited = await loadRecentBodies("threads", { root, limit: 2 });
assert(limited.length === 2, "limit should cap results");
assert(limited[0].includes("親子でミットを持つ") && limited[1].includes("女性が安心"), "limit keeps newest");

const excluded = await loadRecentBodies("threads", { root, excludeId: "d_new" });
assert(excluded.length === 2, "excludeId should drop the matching draft");
assert(!excluded.some(b => b.includes("親子でミットを持つ")), "excluded body should be absent");

// 存在しない register は空配列（freshness 中立）
const empty = await loadRecentBodies("instagram", { root });
assert(empty.length === 0, "missing index should yield no bodies");

// ── scoreCraftWithHistory: 直近とほぼ同一なら freshness が落ちる ──
const repeat = await scoreCraftWithHistory(
  { id: "d_dup", body: "親子でミットを持つ瞬間、ハイタッチで終わる。", platform: "threads" },
  { root },
);
assert(repeat.freshness.score <= 2, `repeat of recent body should tank freshness (got ${repeat.freshness.score})`);

// 自分自身は除外されるので、既存IDで採点しても自分とは比較しない
const novel = await scoreCraftWithHistory(
  { id: "d_unique", body: "全く新しい切り口：UIZINで見える強さの正体と、仲間との約束。", platform: "threads" },
  { root },
);
assert(novel.freshness.score >= 3, `novel body should stay fresh (got ${novel.freshness.score})`);

console.log("recent bodies tests passed");
