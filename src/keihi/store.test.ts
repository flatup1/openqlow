import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openExpenseStore } from "./store.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const dir = await mkdtemp(path.join(tmpdir(), "keihi-store-"));
const file = path.join(dir, "expenses.json");

try {
  let clock = Date.parse("2026-08-03T00:00:00.000Z");
  const store = openExpenseStore(file, () => new Date(clock));

  const a = await store.create({ date: "2026-08-03", vendor: "コメリ", amount: 12800, note: "エアコン工事" });
  assert(a.id === 1, "最初のIDは1");
  assert(a.createdAt === "2026-08-03T00:00:00.000Z", "createdAt が入る");
  assert(a.updatedAt === a.createdAt, "作成時は updatedAt == createdAt");
  assert(a.account === "消耗品費", "科目が推定される");

  const b = await store.create({ date: "2026-08-04", vendor: "東京電力", amount: 28400, note: "電気代" });
  assert(b.id === 2, "IDは自動採番");
  assert(b.account === "水道光熱費", "電気代は水道光熱費");

  assert((await store.getAll()).length === 2, "getAll は2件");
  assert((await store.get(1))?.vendor === "コメリ", "IDで取得");
  assert((await store.get(999)) === undefined, "無いIDは undefined");

  // 部分更新: 指定しなかった欄は消えない
  clock = Date.parse("2026-08-05T00:00:00.000Z");
  const updated = await store.update(1, { businessRatio: "80", account: "修繕費" });
  assert(updated?.businessRatio === 80, "按分が更新される");
  assert(updated?.account === "修繕費", "科目が更新される");
  assert(updated?.vendor === "コメリ", "触っていない支払先は残る");
  assert(updated?.note === "エアコン工事", "触っていない摘要は残る");
  assert(updated?.amount === 12800, "触っていない金額は残る");
  assert(updated?.id === 1 && updated?.createdAt === "2026-08-03T00:00:00.000Z", "id/createdAt は不変");
  assert(updated?.updatedAt === "2026-08-05T00:00:00.000Z", "updatedAt が進む");

  assert((await store.update(999, { note: "x" })) === undefined, "無いIDの更新は undefined");

  // 別ストアから読める（ディスクに残っている）
  const store2 = openExpenseStore(file);
  assert((await store2.get(1))?.account === "修繕費", "ディスクに永続化されている");

  const raw = await readFile(file, "utf8");
  assert(Array.isArray(JSON.parse(raw)), "ファイルはJSON配列");

  assert((await store.remove(2)) === true, "既存の削除は true");
  assert((await store.remove(2)) === false, "無いIDの削除は false");
  assert((await store.getAll()).length === 1, "1件残る");

  // 原子的書き込み: 一時ファイルが残らない
  const entries = await readdir(dir);
  assert(entries.length === 1 && entries[0] === "expenses.json", "一時ファイルが残らない");

  console.log("keihi store tests passed");
} finally {
  await rm(dir, { recursive: true, force: true });
}
