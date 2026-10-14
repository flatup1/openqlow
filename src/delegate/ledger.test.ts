import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { appendLedger, formatSummary, ledgerPath, readLedger, summarize, type LedgerEntry } from "./ledger.js";

const dir = mkdtempSync(path.join(tmpdir(), "delegate-ledger-"));
const file = path.join(dir, "sub", "delegate_ledger.jsonl");

function entry(overrides: Partial<LedgerEntry>): LedgerEntry {
  return {
    at: "2026-09-12T00:00:00.000Z",
    engine: "chatgpt",
    task_kind: "review",
    sent_tokens_estimate: 100,
    received_tokens_estimate: 50,
    mode: "answered",
    ...overrides,
  };
}

try {
  // --- 置き場所 ---
  assert.equal(ledgerPath({ OPENQLOW_DATA_DIR: "/d" }, "/w"), path.join("/d", "delegate_ledger.jsonl"));
  assert.equal(ledgerPath({}, "/w"), path.join("/w", "data", "delegate_ledger.jsonl"));

  // --- まだ何も無い ---
  assert.deepEqual([...readLedger(file)], [], "ファイルが無いのは「記録なし」");
  {
    const s = summarize([]);
    assert.equal(s.entries, 0);
    assert.equal(s.routed_share_to_chatgpt, null, "記録が無いときは 0% ではなく「算出不可」");
    assert.equal(formatSummary(s), "記録なし（まだ1件も委任していません）");
  }

  // --- 追記して読み戻す（親フォルダが無くても作る） ---
  appendLedger(entry({}), file);
  appendLedger(entry({ engine: "claude", task_kind: "edit", sent_tokens_estimate: 300, received_tokens_estimate: 200, mode: "claude_local" }), file);
  const read = readLedger(file);
  assert.equal(read.length, 2);
  assert.equal(read[0]?.engine, "chatgpt");
  assert.equal(read[1]?.task_kind, "edit");

  // --- 集計 ---
  {
    const s = summarize(read);
    assert.equal(s.chatgpt_tokens_estimate, 150);
    assert.equal(s.claude_tokens_estimate, 500);
    assert.equal(s.claude_avoided_tokens_estimate, 150);
    assert.equal(s.routed_share_to_chatgpt, 150 / 650);
    const text = formatSummary(s);
    assert.ok(text.includes("概算"), "概算だと明示する");
    assert.ok(text.includes("ChatGPT の定額枠を消費"), "ChatGPT 側も消費すると明示する");
    assert.ok(!text.includes("ゼロ"), "「トークンゼロ」とは書かない");
    assert.ok(text.includes("これは削減率ではありません"), "測れないことを隠さない");
  }

  // --- 失敗や DRY-RUN は「節約できた分」に数えない ---
  {
    const s = summarize([entry({ mode: "dry_run", received_tokens_estimate: 0 }), entry({ mode: "failed", received_tokens_estimate: 0 })]);
    assert.equal(s.claude_avoided_tokens_estimate, 0, "答えが返っていないなら節約していない");
    assert.equal(s.chatgpt_tokens_estimate, 200, "送った分は ChatGPT 側の消費として数える");
    assert.equal(s.routed_share_to_chatgpt, null, "Claude 側の実績が無ければ算出不可");
  }

  // --- 壊れた行で全体を失わない ---
  {
    const broken = path.join(dir, "broken.jsonl");
    writeFileSync(broken, `${JSON.stringify(entry({}))}\n{ これはJSONではない\n\n${JSON.stringify(entry({ task_kind: "plan" }))}\n`, "utf8");
    const rows = readLedger(broken);
    assert.equal(rows.length, 2, "読めた2件は残る");
    assert.equal(rows[1]?.task_kind, "plan");
  }
  {
    // 形が違う行（数値でない）は捨てる。
    const odd = path.join(dir, "odd.jsonl");
    writeFileSync(odd, `{"engine":"chatgpt","sent_tokens_estimate":"たくさん"}\n`, "utf8");
    assert.equal(readLedger(odd).length, 0);
  }

  console.log("delegate ledger tests passed");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
