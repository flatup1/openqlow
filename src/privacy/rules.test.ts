import assert from "node:assert/strict";
import {
  PrivacyViolationError,
  anonymiseFamilyName,
  assertNoForbiddenContent,
  detectForbiddenContent,
  formatAge,
  formatName,
  sanitiseFreeText,
} from "./rules.js";

// formatName: 空白区切りの「姓 名」はイニシャル化
assert.equal(formatName("山田 太郎"), "山田 ★.");
assert.equal(formatName("Yamada Taro"), "Yamada T.");
assert.equal(formatName("山田太郎"), "山田 ★.");
assert.equal(formatName("山田"), "山田");
assert.equal(formatName("山田 T."), "山田 T.");
assert.equal(formatName("Yamada T"), "Yamada T.");
assert.equal(formatName(""), "");

// オプションで off にした場合は変換しない
assert.equal(formatName("山田 太郎", { initialiseGivenName: false }), "山田 太郎");

// formatAge: 数値 → 年代
assert.equal(formatAge(28), "20代");
assert.equal(formatAge(35), "30代");
assert.equal(formatAge(7), "幼児");
assert.equal(formatAge(72), "70代以上");
assert.equal(formatAge("30"), "30代");
assert.equal(formatAge("30代"), "30代");
assert.equal(formatAge("30代後半"), "30代後半");
assert.equal(formatAge("不明"), "不明");
assert.equal(formatAge(35, { bandifyAge: false }), "35");

// detectForbiddenContent: 電話番号
const phone = detectForbiddenContent("お電話は 090-1234-5678 までお願いします。");
assert.equal(phone.ok, false);
if (!phone.ok) {
  assert.equal(phone.label, "phone_japanese");
}

// detectForbiddenContent: メールアドレス
const email = detectForbiddenContent("ご連絡先: test@example.com");
assert.equal(email.ok, false);
if (!email.ok) {
  assert.equal(email.label, "email");
}

// detectForbiddenContent: 通常テキストは ok
const clean = detectForbiddenContent("山田 T. が体験に来てくれた。楽しそうにしていた。");
assert.equal(clean.ok, true);

// assertNoForbiddenContent: 例外 throw
assert.throws(
  () => assertNoForbiddenContent("電話 090-1234-5678", "test"),
  (err: unknown) => err instanceof PrivacyViolationError && err.label === "phone_japanese",
);

// assertNoForbiddenContent: 健全な文は通す
assert.doesNotThrow(() => assertNoForbiddenContent("山田 T. の体験記録", "test"));

// sanitiseFreeText: 連絡先を伏字化
const sanitised = sanitiseFreeText("電話 090-1234-5678 で test@example.com まで連絡");
assert.ok(!sanitised.includes("090-1234-5678"));
assert.ok(!sanitised.includes("test@example.com"));
assert.ok(sanitised.includes("████"));

// anonymiseFamilyName: 退会 30 日後の姓置換
assert.equal(anonymiseFamilyName("山田 T."), "███ T.");
assert.equal(anonymiseFamilyName("Yamada T."), "███ T.");
assert.equal(anonymiseFamilyName("山田 ★."), "███ ★.");

console.log("privacy rules tests passed");
