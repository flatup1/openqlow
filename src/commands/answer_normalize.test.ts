import assert from "node:assert/strict";
import { normalizeEmptyAnswer } from "./answer_normalize.js";

// 基本: "なし" はそのまま
assert.equal(normalizeEmptyAnswer("なし"), "なし");

// カタカナ / 漢字
assert.equal(normalizeEmptyAnswer("ナシ"), "なし");
assert.equal(normalizeEmptyAnswer("無し"), "なし");
assert.equal(normalizeEmptyAnswer("無"), "なし");
assert.equal(normalizeEmptyAnswer("ない"), "なし");

// フリック入力ミス（Jin の実機ケース「なひ」を含む）
assert.equal(normalizeEmptyAnswer("なひ"), "なし");
assert.equal(normalizeEmptyAnswer("なs"), "なし");
assert.equal(normalizeEmptyAnswer("なl"), "なし");

// 英字
assert.equal(normalizeEmptyAnswer("n"), "なし");
assert.equal(normalizeEmptyAnswer("N"), "なし");
assert.equal(normalizeEmptyAnswer("no"), "なし");
assert.equal(normalizeEmptyAnswer("NO"), "なし");
assert.equal(normalizeEmptyAnswer("none"), "なし");
assert.equal(normalizeEmptyAnswer("N/A"), "なし");
assert.equal(normalizeEmptyAnswer("n/a"), "なし");

// 記号
assert.equal(normalizeEmptyAnswer("-"), "なし");
assert.equal(normalizeEmptyAnswer("—"), "なし");
assert.equal(normalizeEmptyAnswer("ー"), "なし");

// よくある言い回し
assert.equal(normalizeEmptyAnswer("特になし"), "なし");
assert.equal(normalizeEmptyAnswer("とくになし"), "なし");

// 前後空白は trim される
assert.equal(normalizeEmptyAnswer("  なし  "), "なし");
assert.equal(normalizeEmptyAnswer("\tなひ\n"), "なし");

// 実値はそのまま返る
assert.equal(normalizeEmptyAnswer("山田さん"), "山田さん");
assert.equal(normalizeEmptyAnswer("せいじ"), "せいじ");
assert.equal(normalizeEmptyAnswer("看板撮影"), "看板撮影");

// 空文字は空のまま（呼び出し側で扱う）
assert.equal(normalizeEmptyAnswer(""), "");
assert.equal(normalizeEmptyAnswer("   "), "");

// 似てるけど違う語は誤救済しない
assert.equal(normalizeEmptyAnswer("ない人"), "ない人");
assert.equal(normalizeEmptyAnswer("無理"), "無理");
assert.equal(normalizeEmptyAnswer("なしです"), "なしです");

console.log("answer normalize tests passed");
