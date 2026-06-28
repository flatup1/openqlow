import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type http from "node:http";
import path from "node:path";

// 公開メディア配信のパス接頭辞。nginx が /openqlow/media/ をこのNodeアプリへ proxy_pass する。
const MEDIA_PREFIX = "/openqlow/media/";

// 画像/動画のみ配信する（任意ファイルを公開しないための allowlist）。
const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
};

interface MediaServerEnv {
  OPENQLOW_PUBLIC_MEDIA_DIR?: string;
}

function notFound(res: http.ServerResponse): void {
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
}

// /openqlow/media/<file> への GET/HEAD を、公開メディアディレクトリ内のファイルとして配信する。
// 戻り値 true = このリクエストを処理した（呼び出し側は return する）。false = メディアパスではない。
// Instagram/Threads など外部APIが image_url を取得できるよう、正しい content-type で返す。
export async function tryServePublicMedia(
  method: string,
  requestPath: string,
  res: http.ServerResponse,
  env: MediaServerEnv = process.env,
): Promise<boolean> {
  if (!requestPath.startsWith(MEDIA_PREFIX)) return false;
  // ここから先はメディアパス。必ずレスポンスを返して true を返す。

  if (method !== "GET" && method !== "HEAD") {
    res.writeHead(405, { "content-type": "text/plain" });
    res.end("method not allowed");
    return true;
  }

  const dir = env.OPENQLOW_PUBLIC_MEDIA_DIR;
  if (!dir) {
    notFound(res);
    return true;
  }

  let relative: string;
  try {
    relative = decodeURIComponent(requestPath.slice(MEDIA_PREFIX.length));
  } catch {
    notFound(res);
    return true;
  }

  const root = path.resolve(dir);
  const file = path.resolve(root, relative);
  // パストラバーサル防止: 解決後のパスが必ず公開ディレクトリ内に収まること。
  const rel = path.relative(root, file);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    notFound(res);
    return true;
  }

  const contentType = CONTENT_TYPES[path.extname(file).toLowerCase()];
  if (!contentType) {
    notFound(res);
    return true;
  }

  const info = await stat(file).catch(() => undefined);
  if (!info?.isFile()) {
    notFound(res);
    return true;
  }

  res.writeHead(200, {
    "content-type": contentType,
    "content-length": info.size,
    "cache-control": "public, max-age=300",
  });
  if (method === "HEAD") {
    res.end();
    return true;
  }
  createReadStream(file).pipe(res);
  return true;
}
