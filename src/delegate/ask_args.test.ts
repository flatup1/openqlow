import assert from "node:assert/strict";
import { parseAskArgs } from "./ask_args.js";

// --- 既定は「送らない」 ---
{
  const o = parseAskArgs(["この設計を", "レビューして"]);
  assert.equal(o.question, "この設計を レビューして");
  assert.equal(o.send, false, "外部送信は既定で止める");
  assert.equal(o.withDiff, false);
  assert.equal(o.budget, undefined, "未指定は undefined（0 と区別する）");
  assert.equal(o.summaryOnly, false);
  assert.equal(o.errorsFile, null);
}

// --- 旗（フラグ） ---
{
  const o = parseAskArgs(["--send", "--diff", "レビューして"]);
  assert.equal(o.send, true);
  assert.equal(o.withDiff, true);
  assert.equal(o.question, "レビューして", "旗は依頼文に混ざらない");
}
{
  const o = parseAskArgs(["--file", "src/a.ts", "--file", "src/b.ts", "説明して"]);
  assert.deepEqual([...o.files], ["src/a.ts", "src/b.ts"]);
  assert.equal(o.question, "説明して");
}
{
  const o = parseAskArgs(["--errors-file", "/tmp/err.log", "--budget", "500", "直し方を教えて"]);
  assert.equal(o.errorsFile, "/tmp/err.log");
  assert.equal(o.budget, 500);
}
{
  // 値の無い旗、壊れた数値で落ちない。
  const o = parseAskArgs(["--budget", "ゼロ", "--file"]);
  assert.equal(o.budget, undefined);
  assert.equal(o.files.length, 0);
  assert.equal(o.question, "");
}
{
  const o = parseAskArgs(["--budget", "-5", "説明して"]);
  assert.equal(o.budget, undefined, "0 以下は採用しない");
}
assert.equal(parseAskArgs(["--summary"]).summaryOnly, true);
assert.equal(parseAskArgs([]).question, "", "空でも落ちない");

console.log("delegate ask_args tests passed");
