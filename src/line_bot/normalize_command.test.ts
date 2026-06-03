import assert from "node:assert/strict";
import {
  canonicalLineCommand,
  normalizeLineText,
} from "./normalize_command.js";

assert.equal(normalizeLineText("　／ PUSH　"), "/push");
assert.equal(normalizeLineText("/ push"), "/push");
assert.equal(normalizeLineText("ＰＵＳＨ"), "push");
assert.equal(normalizeLineText("／ 追記　 今日の体験１件"), "/追記 今日の体験1件");

assert.equal(canonicalLineCommand("／ ｐｕｓｈ"), "/push");
assert.equal(canonicalLineCommand("プッシュ"), "/push");
assert.equal(canonicalLineCommand("ぷっしゅ"), "/push");
assert.equal(canonicalLineCommand("追記 今日のメモ"), "/追記");
assert.equal(canonicalLineCommand("きのうの記録"), "/昨日の記録");
assert.equal(canonicalLineCommand("昨日"), "/昨日の記録");
assert.equal(canonicalLineCommand("朝"), "/おはよう");
assert.equal(canonicalLineCommand("おはよー"), "/おはよう");

console.log("line command normalization tests passed");
