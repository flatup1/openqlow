import assert from "node:assert/strict";
import { buildPostAssistMessage, buildThreadsIntentUrl } from "./post_assist.js";

function testIntentUrl(): void {
  const url = buildThreadsIntentUrl("こんにちは #FLATUPGYM");
  assert.match(url, /^https:\/\/www\.threads\.net\/intent\/post\?text=/);
  assert.ok(url.includes(encodeURIComponent("こんにちは #FLATUPGYM")));
}

function testAllTargetsWithThreadsPosted(): void {
  const msg = buildPostAssistMessage({
    body: "本文です",
    targets: ["google_business", "threads", "line_voom"],
    threadsPostId: "POST123",
  });
  assert.match(msg, /本文です/);
  assert.match(msg, /Threads】✅ 自動投稿しました（id: POST123）/);
  assert.match(msg, /business\.google\.com\/posts/);
  assert.match(msg, /LINE VOOM/);
  // 自動投稿成功時は intent リンクを出さない。
  assert.doesNotMatch(msg, /intent\/post/);
}

function testThreadsFallbackLinkWhenNotPosted(): void {
  const msg = buildPostAssistMessage({
    body: "本文",
    targets: ["threads"],
  });
  assert.match(msg, /intent\/post\?text=/);
  assert.doesNotMatch(msg, /自動投稿しました/);
}

function testMediaNote(): void {
  const withMedia = buildPostAssistMessage({ body: "b", targets: ["threads"], hasMedia: true });
  assert.match(withMedia, /手動で添付/);
  const noMedia = buildPostAssistMessage({ body: "b", targets: ["threads"] });
  assert.doesNotMatch(noMedia, /手動で添付/);
}

testIntentUrl();
testAllTargetsWithThreadsPosted();
testThreadsFallbackLinkWhenNotPosted();
testMediaNote();

console.log("post assist tests passed");
