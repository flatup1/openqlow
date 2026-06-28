import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { tryServePublicMedia } from "./media_server.js";

const dir = await mkdtemp(path.join(tmpdir(), "openqlow-media-server-"));
await writeFile(path.join(dir, "photo.jpg"), "JPEGDATA");
await writeFile(path.join(dir, "note.txt"), "secret");
const env = { OPENQLOW_PUBLIC_MEDIA_DIR: dir };

const server = http.createServer(async (req, res) => {
  const requestPath = new URL(req.url || "/", "http://localhost").pathname;
  if (await tryServePublicMedia(req.method || "GET", requestPath, res, env)) return;
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("fallthrough");
});
await new Promise<void>((resolve) => server.listen(0, resolve));
const address = server.address();
const portNumber = typeof address === "object" && address ? address.port : 0;
const base = `http://127.0.0.1:${portNumber}`;

// 1. 画像を正しい content-type で配信する。
{
  const res = await fetch(`${base}/openqlow/media/photo.jpg`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/jpeg");
  assert.equal(await res.text(), "JPEGDATA");
}

// 2. HEAD は本文なしで 200。
{
  const res = await fetch(`${base}/openqlow/media/photo.jpg`, { method: "HEAD" });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "");
}

// 3. 存在しないファイルは 404。
{
  const res = await fetch(`${base}/openqlow/media/missing.jpg`);
  assert.equal(res.status, 404);
}

// 4. パストラバーサルは 404（公開ディレクトリ外を読ませない）。
{
  const res = await fetch(`${base}/openqlow/media/..%2f..%2fetc%2fpasswd`);
  assert.equal(res.status, 404);
}

// 5. 非対応拡張子（.txt等）は 404（任意ファイルを公開しない）。
{
  const res = await fetch(`${base}/openqlow/media/note.txt`);
  assert.equal(res.status, 404);
}

// 6. POST 等は 405。
{
  const res = await fetch(`${base}/openqlow/media/photo.jpg`, { method: "POST" });
  assert.equal(res.status, 405);
}

// 7. メディアパス以外は未処理（false → フォールスルー）。
{
  const res = await fetch(`${base}/openqlow/webhook`);
  assert.equal(await res.text(), "fallthrough");
}

server.close();
console.log("media server tests passed");
