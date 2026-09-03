// 重複判定テスト。
// 「同じイベントは1件」「同じ日でも別の問い合わせは別件」を固定する（要件 §17-20）。

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { draftIdFor, eventKey, hasSeen, markSeen, seenStorePath } from "./dedupe.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), "reply-drafts-dedupe-"));

// ---- 鍵の安定性 ----
const withId = { source: "line" as const, eventId: "evt-1", sender: "U1", timestamp: 1, text: "体験したいです" };
assert(eventKey(withId) === eventKey(withId), "同じ入力なら同じ鍵");
assert(eventKey(withId) === "line:evt-1", "eventId があればそれを使う");

// eventId が無いときは指紋。本文のゆらぎ（空白・改行）では変わらない。
const a = eventKey({ source: "line", sender: "U1", timestamp: 1_700_000_000_000, text: "体験 したいです" });
const b = eventKey({ source: "line", sender: "U1", timestamp: 1_700_000_000_000, text: "体験  したいです\n" });
assert(a === b, "空白のゆらぎで別イベントにしない");

// 再送でミリ秒だけずれても同じ鍵（1分バケット）。
const c = eventKey({ source: "line", sender: "U1", timestamp: 1_700_000_000_500, text: "体験 したいです" });
assert(a === c, "同一分内の再送は同じ鍵");

// 送信者が違えば別件。本文が違っても別件。
assert(
  a !== eventKey({ source: "line", sender: "U2", timestamp: 1_700_000_000_000, text: "体験 したいです" }),
  "送信者が違えば別件",
);
assert(
  a !== eventKey({ source: "line", sender: "U1", timestamp: 1_700_000_000_000, text: "料金は？" }),
  "本文が違えば別件",
);

// Gmail と LINE で鍵が衝突しない。
assert(eventKey({ source: "gmail", eventId: "evt-1" }) !== eventKey({ source: "line", eventId: "evt-1" }), "送信元で鍵が分かれる");

// ---- ID は鍵から決まる（再処理しても同じファイルへ上書きされる）----
assert(draftIdFor("2026-09-02", "line:evt-1") === draftIdFor("2026-09-02", "line:evt-1"), "同じ鍵なら同じID");
assert(draftIdFor("2026-09-02", "line:evt-1") !== draftIdFor("2026-09-02", "line:evt-2"), "違う鍵なら違うID");

// ---- 台帳 ----
const now = new Date("2026-09-02T09:00:00+09:00");
assert(!(await hasSeen(root, "line", "line:evt-1")), "最初は未処理");
assert(await markSeen(root, "line", "line:evt-1", now, 30), "初回の記録は新規");
assert(await hasSeen(root, "line", "line:evt-1"), "記録後は処理済み");
assert(!(await markSeen(root, "line", "line:evt-1", now, 30)), "2回目の記録は新規ではない");

// 同じ日でも別の問い合わせは別件のまま（要件 §20）。
assert(!(await hasSeen(root, "line", "line:evt-2")), "同じ日の別イベントは未処理");

// 送信元ごとに台帳が分かれる。
assert(!(await hasSeen(root, "gmail", "gmail:evt-1")), "Gmail の台帳は別ファイル");
assert(seenStorePath(root, "line") !== seenStorePath(root, "gmail"), "台帳のパスが分かれる");

// ---- 保持期間（要件 §19）----
const later = new Date("2026-10-15T09:00:00+09:00"); // 43日後
await markSeen(root, "line", "line:evt-3", later, 30);
assert(!(await hasSeen(root, "line", "line:evt-1")), "保持期間を過ぎた記録は間引かれる");
assert(await hasSeen(root, "line", "line:evt-3"), "新しい記録は残る");

// ---- 壊れた台帳でも処理を止めない ----
await fs.writeFile(seenStorePath(root, "line"), "{壊れている", "utf8");
assert(!(await hasSeen(root, "line", "line:evt-3")), "壊れた台帳は空として扱う");
assert(await markSeen(root, "line", "line:evt-4", later, 30), "壊れた台帳でも記録できる");

await fs.rm(root, { recursive: true, force: true });
console.log("reply_drafts dedupe tests passed");
