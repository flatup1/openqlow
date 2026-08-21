import assert from "node:assert/strict";
import { expandIdea } from "./expand.js";
import { checkDraftSafety } from "../safety/check.js";
import type { ContentIdea } from "../types.js";

function idea(overrides: Partial<ContentIdea> = {}): ContentIdea {
  return {
    id: "FG-20260821-001",
    date: "2026-08-21",
    theme: "太陽のジムって、どんな空気？",
    angle: "怒鳴らないジムの一日を、そのまま見せる。",
    audience: "beginners",
    source: "rotation",
    valueConnection: "安心して最初の一歩を踏み出せる",
    ...overrides,
  };
}

// --- 3媒体そろって出ること ---
{
  const drafts = expandIdea(idea());
  assert.equal(drafts.length, 3, "X / Instagram / Threads の3本");
  assert.deepEqual(
    drafts.map(d => d.platform),
    ["x", "instagram", "threads"],
    "順番も固定（承認メッセージの並びが毎回変わらないように）",
  );
}

// --- 公開レベルは必ず下書き（Phase 1の物理ロックが効く前提） ---
{
  const drafts = expandIdea(idea());
  for (const draft of drafts) {
    assert.equal(
      draft.publicationLevel,
      "level_2_draft",
      "生成時点で予約投稿・即時公開のレベルを作らない",
    );
  }
}

// --- 元ネタとの紐付けが切れないこと（承認時に辿れないと事故になる） ---
{
  const source = idea({ id: "FG-20260821-042" });
  const drafts = expandIdea(source);
  for (const draft of drafts) {
    assert.equal(draft.ideaId, source.id);
    assert.equal(draft.approvalId, source.id);
    assert.ok(draft.id.startsWith(`${source.id}_`), "IDは元ネタIDから作る");
  }
  assert.equal(new Set(drafts.map(d => d.id)).size, 3, "3本のIDが重複しない");
  assert.equal(new Set(drafts.map(d => d.createdAt)).size, 1, "同時に作ったものは同じ時刻を持つ");
}

// --- 既知テーマは専用本文、未知テーマは既定本文へ倒れること ---
{
  const known = expandIdea(idea({ theme: "親子で始める、優しい強さ" }));
  const knownX = known.find(d => d.platform === "x");
  assert.ok(knownX?.body.includes("親子割"), "既知テーマは専用の締め文を使う");

  const unknown = expandIdea(idea({ theme: "存在しないテーマ" }));
  const unknownX = unknown.find(d => d.platform === "x");
  assert.ok(
    unknownX?.body.includes("弱い自分") || unknownX?.body.includes("逃げなかった"),
    "未知テーマでも空にならず、既定の本文へ倒れる",
  );
  assert.ok(unknownX && unknownX.body.trim().length > 0, "本文が空にならない");
}

// --- テーマと切り口が本文に入ること（何のネタか分からない下書きを作らない） ---
{
  const source = idea({ theme: "存在しないテーマ", angle: "この切り口が本文に入る" });
  const drafts = expandIdea(source);
  const x = drafts.find(d => d.platform === "x");
  assert.ok(x?.body.includes(source.theme));
  assert.ok(x?.body.includes(source.angle));

  const instagram = drafts.find(d => d.platform === "instagram");
  assert.equal(instagram?.title, source.theme, "Instagramはタイトルにテーマを持つ");
}

// --- ハッシュタグが媒体ごとに用意されていること ---
{
  const drafts = expandIdea(idea());
  for (const draft of drafts) {
    assert.ok(draft.hashtags.length > 0, `${draft.platform} にハッシュタグがある`);
    assert.ok(draft.hashtags.includes("FLATUPGYM"), "ブランド名は全媒体に入れる");
    assert.ok(
      draft.hashtags.every(tag => !tag.startsWith("#")),
      "タグに # を含めない（媒体ごとの付け方は publish 側が決める）",
    );
  }
}

// --- 出来上がった本文が安全ゲートを通ること（お客様の目に触れる文なので） ---
{
  const themes = [
    "親子で始める、優しい強さ",
    "お友達と一緒に始める格闘技",
    "昨日の自分を、ほんの少し超える",
    "太陽のジムって、どんな空気？",
    "UIZIN（初陣）で分かる、強さの正体",
    "存在しないテーマ",
  ];

  for (const theme of themes) {
    for (const draft of expandIdea(idea({ theme }))) {
      const result = checkDraftSafety(draft.body);
      const blocking = result.issues.filter(issue => issue.severity === "block");
      assert.equal(
        blocking.length,
        0,
        `${theme} / ${draft.platform} に block 級の問題: ${blocking.map(i => i.code).join(", ")}`,
      );
    }
  }
}

console.log("expand tests passed");
