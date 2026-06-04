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

// /月報 系
assert.equal(canonicalLineCommand("月報"), "/月報");
assert.equal(canonicalLineCommand("/月報"), "/月報");
assert.equal(canonicalLineCommand("/monthly"), "/月報");

// 連結形（スペース無し）も /おはよう 扱い
assert.equal(canonicalLineCommand("日報まとめ"), "/おはよう", "no-space concat");
assert.equal(canonicalLineCommand("/日報まとめ"), "/おはよう");
assert.equal(canonicalLineCommand("おはようまとめ"), "/おはよう");
assert.equal(canonicalLineCommand("朝まとめ"), "/おはよう");
assert.equal(canonicalLineCommand("日報bulk"), "/おはよう");
assert.equal(canonicalLineCommand("日報テンプレ"), "/おはよう");
assert.equal(canonicalLineCommand("日報template"), "/おはよう");

// 関係ない接尾辞は誤マッチしない
assert.equal(canonicalLineCommand("朝食"), undefined, "朝食 は morning コマンドではない");
assert.equal(canonicalLineCommand("日報書く"), undefined, "未定義サフィックスは無視");
assert.equal(canonicalLineCommand("おはようございます"), undefined);

console.log("line command normalization tests passed");
