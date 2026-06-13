import { resolveStatus, normalizeProspectInput, PROSPECT_STATUSES } from "./prospect.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// --- 日本語別名 → 正規ステータス ---------------------------------------------
assert(resolveStatus("入会") === "joined", "入会 => joined");
assert(resolveStatus("体験予約") === "trial_scheduled", "体験予約 => trial_scheduled");
assert(resolveStatus("体験済み") === "trial_done", "体験済み => trial_done");
assert(resolveStatus("返信した") === "replied", "返信した => replied");
assert(resolveStatus("見送り") === "lost", "見送り => lost");
assert(resolveStatus(" 入会 ") === "joined", "前後空白を許容");

// --- 英語コードもそのまま通る ------------------------------------------------
for (const s of PROSPECT_STATUSES) {
  assert(resolveStatus(s) === s, `English code ${s} resolves to itself`);
}

// --- 未知の入力は undefined --------------------------------------------------
assert(resolveStatus("ぴよぴよ") === undefined, "unknown => undefined");
assert(resolveStatus("") === undefined, "empty => undefined");

// --- normalizeProspectInput の joined 正規化（既存挙動の確認） ---------------
assert(normalizeProspectInput({ joined: "1" as unknown as 1 }).joined === 1, "joined '1' => 1");
assert(normalizeProspectInput({}).joined === 0, "default joined 0");

console.log("prospect tests passed");
