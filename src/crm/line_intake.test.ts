import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openProspectStore } from "./store.js";
import { intakeFromLineMessage } from "./line_intake.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const dir = await mkdtemp(path.join(tmpdir(), "crm-line-"));
const file = path.join(dir, "prospects.json");

try {
  let clock = Date.parse("2026-06-11T00:00:00.000Z");
  const store = openProspectStore(file, () => new Date(clock));
  const now = () => new Date(clock);

  // 新規: LINE受信 → 下書き作成、externalId 紐付け、返信案あり
  const first = await intakeFromLineMessage(
    { lineUserId: "U123", text: "小学生の子供に習わせたい。初心者でも大丈夫ですか？", displayName: "タナカ" },
    store,
    now,
  );
  assert(first.created === true, "first message creates a prospect");
  assert(first.prospect.externalId === "U123", "externalId stored");
  assert(first.prospect.contactSource === "LINE", "contact source LINE");
  assert(first.prospect.category === "kids", "kids classified");
  assert(first.prospect.name === "タナカ", "display name stored as name");
  assert(first.prospect.status === "new_inquiry", "new prospect status");
  assert(first.replyDraft.trimEnd().endsWith("AIKA"), "reply draft generated, not sent");

  // 同一ユーザーの2通目: 重複登録せず更新（id 不変・件数1）
  clock = Date.parse("2026-06-12T00:00:00.000Z");
  // 先にステータスを進めておく（前進状態を尊重するか確認）
  await store.update(first.prospect.id, { status: "replied" });
  const second = await intakeFromLineMessage(
    { lineUserId: "U123", text: "やっぱり体験予約したいです", displayName: "タナカ" },
    store,
    now,
  );
  assert(second.created === false, "same user updates, not creates");
  assert(second.prospect.id === first.prospect.id, "same prospect id");
  assert((await store.getAll()).length === 1, "still one prospect (no duplicate)");
  assert(second.prospect.inquiryText === "やっぱり体験予約したいです", "inquiry text updated to latest");
  assert(second.prospect.temperature === "A", "temperature updated (予約 => A)");
  assert(second.prospect.status === "replied", "existing status not reset to new_inquiry");
  assert(second.prospect.lastContactAt === "2026-06-12T00:00:00.000Z", "last contact updated");

  // 別ユーザーは新規
  const other = await intakeFromLineMessage({ lineUserId: "U999", text: "料金を教えてください" }, store, now);
  assert(other.created === true, "different user creates new");
  assert((await store.getAll()).length === 2, "now two prospects");

  // 本文なしはエラー
  let threw = false;
  try {
    await intakeFromLineMessage({ lineUserId: "U123", text: "  " }, store, now);
  } catch {
    threw = true;
  }
  assert(threw, "empty text throws");

  console.log("crm line intake tests passed");
} finally {
  await rm(dir, { recursive: true, force: true });
}
