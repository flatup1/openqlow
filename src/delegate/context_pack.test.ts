import assert from "node:assert/strict";
import { buildContextPack, truncateToTokens } from "./context_pack.js";
import { estimateTokens, redactSensitive, verifySafeToSend } from "./redact.js";

// 検証用のダミーは実行時に組み立てる。
// ソースに“鍵の形”をそのまま書くと、リポジトリ全体の秘密スキャンに当たってしまうため。
const fakeKey = "sk-" + "or-" + "v1" + "0123456789abcdef0123456789";
const fakeEmail = "taro" + "@" + "example.com";
const fakePhone = "090" + "-" + "1234" + "-" + "5678";
const fakeLineId = "U" + "0".repeat(32);

// --- 概算トークン ---
assert.equal(estimateTokens(""), 0);
assert.equal(estimateTokens("あいうえお"), 5, "日本語は1文字≒1トークン");
assert.equal(estimateTokens("abcd"), 1, "英数字は4文字≒1トークン");
assert.ok(estimateTokens("あ".repeat(100)) > estimateTokens("あ".repeat(10)), "長い方が多い");

// --- 伏せる ---
{
  const r = redactSensitive(`key=${fakeKey} mail=${fakeEmail} tel=${fakePhone} uid=${fakeLineId}`);
  assert.ok(!r.text.includes(fakeKey), "鍵が消えている");
  assert.ok(!r.text.includes(fakeEmail), "メールが消えている");
  assert.ok(!r.text.includes(fakePhone), "電話が消えている");
  assert.ok(!r.text.includes(fakeLineId), "LINE userId が消えている");
  assert.ok(verifySafeToSend(r.text).safe, "既存ガードで確認しても安全");
  const kinds = r.redactions.map(x => x.kind);
  for (const kind of ["openai_or_openrouter_key", "email", "phone", "line_user_id"]) {
    assert.ok(kinds.includes(kind), `${kind} を記録している`);
  }
}
{
  // 同じ種類が複数あれば全部消して、件数を数える。
  const r = redactSensitive(`a=${fakeEmail} b=${"hanako" + "@" + "example.jp"}`);
  assert.ok(!r.text.includes("@example"), "2件とも消えている");
  assert.equal(r.redactions.find(x => x.kind === "email")?.count, 2);
}
{
  // 環境変数は「名前を残して値だけ」消す。何の設定の話かは伝えたい。
  const r = redactSensitive("LINE_CHANNEL_ACCESS_TOKEN=" + "abcdefgh12345678");
  assert.ok(r.text.includes("LINE_CHANNEL_ACCESS_TOKEN=[REDACTED:env_value]"));
}
{
  // 空やプレースホルダを誤って伏せない（.env.example を壊さないため）。
  const r = redactSensitive("OPENROUTER_API_KEY=<your token>");
  assert.equal(r.redactions.length, 0);
  assert.equal(r.text, "OPENROUTER_API_KEY=<your token>");
}
{
  const r = redactSensitive("ただの日本語です。数字は12345。");
  assert.equal(r.redactions.length, 0, "普通の文は何も伏せない");
}

// --- 予算内へ切る ---
{
  const body = Array.from({ length: 50 }, (_, i) => `行${i}です`).join("\n");
  const cut = truncateToTokens(body, 30);
  assert.ok(cut.truncated, "切ったことが分かる");
  assert.ok(cut.text.includes("以下"), "省略の印が入る");
  assert.ok(estimateTokens(cut.text) <= 60, "だいたい予算内に収まる");
  assert.equal(truncateToTokens("短い", 100).truncated, false, "収まるなら切らない");
}

// --- 本文づくり ---
{
  const pack = buildContextPack({ question: "この差分をレビューして" });
  assert.ok(pack.text.includes("この差分をレビューして"), "依頼が入る");
  assert.ok(pack.text.includes("あなたは計画・レビュー・説明の担当です"), "固定の前置きが入る");
  assert.deepEqual([...pack.included], ["依頼"]);
  assert.ok(pack.safe);
  assert.ok(pack.token_estimate > 0);
}
{
  // 前置きは毎回同じ文（キャッシュを効かせるため）。
  const a = buildContextPack({ question: "A" });
  const b = buildContextPack({ question: "B" });
  const head = "## 依頼";
  assert.equal(a.text.slice(0, a.text.indexOf(head)), b.text.slice(0, b.text.indexOf(head)));
}
{
  const pack = buildContextPack({
    question: "直し方を教えて",
    errors: "TypeError: x is not a function",
    diff: "- old\n+ new",
    files: [{ path: "src/a.ts", excerpt: "export const a = 1;" }],
    notes: ["急ぎ"],
  });
  assert.deepEqual([...pack.included], ["依頼", "エラー", "差分", "ファイル src/a.ts", "補足"]);
  assert.equal(pack.dropped.length, 0);
}
{
  // 予算が足りないときは下（優先度の低い方）から外す。依頼は絶対に残る。
  const long = "あ".repeat(3000);
  const pack = buildContextPack(
    { question: "レビューして", errors: long, diff: long, notes: ["補足です"] },
    { budget_tokens: 300 },
  );
  assert.ok(pack.included.includes("依頼"), "依頼は残る");
  assert.ok(pack.dropped.includes("補足"), "優先度の低い補足を外す");
  assert.ok(pack.truncated.includes("エラー") || pack.dropped.includes("エラー"));
  assert.ok(pack.token_estimate <= 400, `予算のおおよそ内に収まる: ${pack.token_estimate}`);
}
{
  // ファイル全文を丸ごと渡さない（行数上限で必ず切る）。
  const big = Array.from({ length: 500 }, (_, i) => `line ${i}`).join("\n");
  const pack = buildContextPack(
    { question: "説明して", files: [{ path: "src/big.ts", excerpt: big }] },
    { budget_tokens: 100_000, max_file_lines: 10 },
  );
  assert.ok(pack.text.includes("line 9"), "先頭は入る");
  assert.ok(!pack.text.includes("line 400"), "後ろは入らない");
}
{
  // 秘密情報が混ざっていても、伏せた上で安全判定が立つ。
  const pack = buildContextPack({ question: "説明して", errors: `failed with ${fakeKey}` });
  assert.ok(!pack.text.includes(fakeKey));
  assert.ok(pack.safe);
  assert.equal(pack.unsafe_kinds.length, 0);
}

console.log("delegate context_pack tests passed");
