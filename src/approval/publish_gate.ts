import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * 「ok を押したが、まだ写真の判断をしていない」候補を1件だけ覚えるゲート。
 *
 * 狙い（JINの希望フロー）:
 *   投稿 → ok（ここで一旦停止して写真を聞く）→ 画像選択 → 自動投稿。
 * ok 時にこのマーカーを立て、写真の判断（画像N / 画像なし / 直接送信）が来たら
 * マーカーを見て自動投稿を実行する。状態は1件だけ（最新のokのみ有効）。
 */

interface AwaitingPublish {
  id: string;
  at: string;
}

function markerPath(root: string): string {
  return path.join(root, "state", "awaiting_publish.json");
}

export async function setAwaitingPublish(root: string, id: string, now = new Date()): Promise<void> {
  const dir = path.join(root, "state");
  await mkdir(dir, { recursive: true });
  const marker: AwaitingPublish = { id, at: now.toISOString() };
  await writeFile(markerPath(root), `${JSON.stringify(marker, null, 2)}\n`, "utf8");
}

export async function loadAwaitingPublish(root: string): Promise<AwaitingPublish | undefined> {
  const text = await readFile(markerPath(root), "utf8").catch(() => "");
  if (!text) return undefined;
  try {
    const parsed = JSON.parse(text) as AwaitingPublish;
    return parsed.id ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export async function clearAwaitingPublish(root: string): Promise<void> {
  await rm(markerPath(root), { force: true }).catch(() => undefined);
}
