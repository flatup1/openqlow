import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openProspectStore } from "./store.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const dir = await mkdtemp(path.join(tmpdir(), "crm-store-"));
const file = path.join(dir, "prospects.json");

try {
  let clock = Date.parse("2026-06-11T00:00:00.000Z");
  const store = openProspectStore(file, () => new Date(clock));

  // create: 採番と timestamps
  const a = await store.create({ name: "田中", status: "new_inquiry", inquiryText: "初心者でも大丈夫？" });
  assert(a.id === 1, "first id is 1");
  assert(a.createdAt === "2026-06-11T00:00:00.000Z", "createdAt set");
  assert(a.updatedAt === a.createdAt, "updatedAt equals createdAt on create");
  assert(a.joined === 0 && a.status === "new_inquiry", "defaults applied");

  const b = await store.create({ name: "佐藤" });
  assert(b.id === 2, "ids auto-increment");

  // getAll / get
  assert((await store.getAll()).length === 2, "getAll returns 2");
  assert((await store.get(1))?.name === "田中", "get by id");
  assert((await store.get(999)) === undefined, "get missing returns undefined");

  // update: updatedAt は進むが createdAt/id は不変
  clock = Date.parse("2026-06-12T00:00:00.000Z");
  const updated = await store.update(1, { status: "replied", joined: "1" as unknown as 1 });
  assert(updated?.status === "replied", "status updated");
  assert(updated?.joined === 1, "joined normalized to 1");
  assert(updated?.id === 1 && updated?.createdAt === "2026-06-11T00:00:00.000Z", "id/createdAt preserved");
  assert(updated?.updatedAt === "2026-06-12T00:00:00.000Z", "updatedAt advanced");

  // update missing
  assert((await store.update(999, { status: "lost" })) === undefined, "update missing returns undefined");

  // 永続化されている（別ストアから読める）
  const store2 = openProspectStore(file);
  assert((await store2.get(1))?.status === "replied", "persisted to disk");

  // JSONとして妥当
  const raw = await readFile(file, "utf8");
  assert(Array.isArray(JSON.parse(raw)), "file is a JSON array");

  // remove
  assert((await store.remove(2)) === true, "remove existing returns true");
  assert((await store.remove(2)) === false, "remove missing returns false");
  assert((await store.getAll()).length === 1, "one prospect left");

  console.log("crm store tests passed");
} finally {
  await rm(dir, { recursive: true, force: true });
}
