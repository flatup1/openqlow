import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { saveRecord, loadRecord, readRecord } from "./file_store.js";
import type { DraftRecord } from "../types.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const tmp = await mkdtemp(path.join(os.tmpdir(), "openqlow-store-"));
const record: DraftRecord = {
  id: "record_test",
  idea: {
    id: "idea_test",
    date: "2026-05-17",
    theme: "弱い自分と戦う人へ",
    angle: "最初の一歩",
    audience: "beginners",
    source: "mma_topic",
    valueConnection: "FLATUPの挑戦に接続",
  },
  drafts: [],
  status: "pending_approval",
  approvalMessage: "承認依頼",
  createdAt: "2026-05-17T00:00:00.000Z",
  updatedAt: "2026-05-17T00:00:00.000Z",
};

await saveRecord(tmp, record);
const loaded = await loadRecord(tmp, "record_test");

assert(loaded?.id === "record_test", "loads saved record");
assert(loaded?.status === "pending_approval", "keeps status");

// 保存は原子的（隣に書いてから置き換える）。
// 直接 writeFile すると、途中で止まったとき書きかけのファイルが残り、
// あとで読むと JSON が壊れている（「修正 FG-…」が SyntaxError で落ちていた）。
{
  const left = (await readdir(path.join(tmp, "state"))).filter(f => f.endsWith(".tmp"));
  assert(left.length === 0, `一時ファイルを残さない（残り: ${left.join(", ")}）`);

  // 一時ファイル名が固定だと、同時に保存したとき互いの一時ファイルを奪い合い、
  // 片方の rename が ENOENT で落ちる。同時に保存しても壊れないことを固定する。
  const settled = await Promise.allSettled(
    [1, 2, 3, 4, 5].map(n => saveRecord(tmp, { ...record, approvalMessage: `承認依頼${n}` })),
  );
  for (const [i, r] of settled.entries()) {
    assert(r.status === "fulfilled", `同時保存で落ちない（${i}）: ${String((r as PromiseRejectedResult).reason)}`);
  }
  const after = await loadRecord(tmp, "record_test");
  assert(after?.id === "record_test", "同時保存のあとも記録が読める（壊れていない）");
  const leftAfter = (await readdir(path.join(tmp, "state"))).filter(f => f.endsWith(".tmp"));
  assert(leftAfter.length === 0, `同時保存でも一時ファイルを残さない（残り: ${leftAfter.join(", ")}）`);
}

// 「無い」と「読めなかった」を区別する。
{
  assert((await readRecord(tmp, "no_such_record")).status === "missing", "無い記録は missing");

  const file = path.join(tmp, "state", "record_test.json");
  const whole = await readFile(file, "utf8");
  await writeFile(file, whole.slice(0, Math.floor(whole.length / 2)), "utf8"); // 書きかけ
  const broken = await readRecord(tmp, "record_test");
  assert(broken.status === "unreadable", `壊れた記録は unreadable（${broken.status}）`);

  // 例外を投げない。投げるとLINEのコマンドが理由を返さずに落ちる。
  let threw = false;
  try {
    await loadRecord(tmp, "record_test");
  } catch {
    threw = true;
  }
  assert(!threw, "壊れた記録を読んでも例外にしない");

  await writeFile(file, whole, "utf8"); // 元に戻す
}

await rm(tmp, { recursive: true, force: true });
console.log("file store tests passed");
