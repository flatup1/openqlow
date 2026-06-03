import assert from "node:assert/strict";
import { FAMILY_EXPLANATION, getOwnerInfoReply, isOwnerInfoCommand } from "./owner_info.js";

// 1. 主要バリエーション全部マッチ
assert.equal(isOwnerInfoCommand("今何してる"), true);
assert.equal(isOwnerInfoCommand("今何"), true);
assert.equal(isOwnerInfoCommand("/今何"), true);
assert.equal(isOwnerInfoCommand("/今何してる"), true);
assert.equal(isOwnerInfoCommand("今なに"), true);
assert.equal(isOwnerInfoCommand("今なにしてる"), true);
assert.equal(isOwnerInfoCommand("何してる"), true);
assert.equal(isOwnerInfoCommand("何やってる"), true);
assert.equal(isOwnerInfoCommand("妻向け"), true);
assert.equal(isOwnerInfoCommand("/妻向け"), true);
assert.equal(isOwnerInfoCommand("妻に"), true);
assert.equal(isOwnerInfoCommand("家族向け"), true);
assert.equal(isOwnerInfoCommand("家族に"), true);
assert.equal(isOwnerInfoCommand("何作ってる"), true);
assert.equal(isOwnerInfoCommand("何作ってるの"), true);
assert.equal(isOwnerInfoCommand("/説明"), true);

// 2. 全角スラッシュも OK
assert.equal(isOwnerInfoCommand("／今何"), true);
assert.equal(isOwnerInfoCommand("／妻向け"), true);

// 3. 末尾の ? も OK（妻が「今何してる？」と聞く想定）
assert.equal(isOwnerInfoCommand("今何してる?"), true);
assert.equal(isOwnerInfoCommand("今何?"), true);

// 4. 似てるが違うコマンドはマッチしない
assert.equal(isOwnerInfoCommand("/日記"), false);
assert.equal(isOwnerInfoCommand("/中止"), false);
assert.equal(isOwnerInfoCommand("OK FG-20260524-001"), false);
assert.equal(isOwnerInfoCommand("hello"), false);
assert.equal(isOwnerInfoCommand("今"), false);
assert.equal(isOwnerInfoCommand("何"), false);
assert.equal(isOwnerInfoCommand("今何やってよ"), false);

// 5. 返信本文は所定のヘッダで始まる
const reply = getOwnerInfoReply();
assert.equal(reply, FAMILY_EXPLANATION);
assert.ok(reply.startsWith("📱 パパが今やっていること"));

// 6. 返信本文に主要メッセージが含まれている
assert.ok(reply.includes("AI お手伝いロボット"));
assert.ok(reply.includes("30 秒"));
assert.ok(reply.includes("月 1,500 円"));
assert.ok(reply.includes("250 万円"));
assert.ok(reply.includes("12 ヶ月"));
assert.ok(reply.includes("心配ないよ"));

// 7. LINE 制限（5000 文字）以内
assert.ok(reply.length <= 5000, `LINE 5000 文字制限超過: ${reply.length}`);

console.log("owner info tests passed");
