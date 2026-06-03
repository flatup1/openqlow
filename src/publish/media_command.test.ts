import assert from "node:assert/strict";
import { parseMediaCommand } from "./media_command.js";

const parsed = parseMediaCommand([
  "/投稿",
  "本文: 弱い自分と向き合う練習。",
  "ファイル: /Users/jin/Desktop/post.mp4",
  "投稿先: all",
].join("\n"));

assert(parsed);
assert.equal(parsed.body, "弱い自分と向き合う練習。");
assert.deepEqual(parsed.mediaFiles, ["/Users/jin/Desktop/post.mp4"]);
assert.deepEqual(parsed.targets, ["google_business", "threads", "line_voom"]);

const inline = parseMediaCommand("/投稿 ファイル=/tmp/a.jpg,/tmp/b.png 本文=今日の練習 投稿先=threads,google");
assert(inline);
assert.equal(inline.body, "今日の練習");
assert.deepEqual(inline.mediaFiles, ["/tmp/a.jpg", "/tmp/b.png"]);
assert.deepEqual(inline.targets, ["threads", "google_business"]);

assert.equal(parseMediaCommand("普通のLINEメッセージ"), undefined);

console.log("media command tests passed");
