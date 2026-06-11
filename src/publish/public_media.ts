import { stat } from "node:fs/promises";
import path from "node:path";

export interface PublicMediaEnv {
  OPENQLOW_PUBLIC_MEDIA_DIR?: string;
  OPENQLOW_PUBLIC_MEDIA_BASE_URL?: string;
}

function isRemoteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isInsideDir(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function encodeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).map(segment => encodeURIComponent(segment)).join("/");
}

function joinBaseUrl(baseUrl: string, relativePath: string): string | undefined {
  try {
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    return new URL(encodeRelativePath(relativePath), normalizedBase).toString();
  } catch {
    return undefined;
  }
}

async function fileExists(file: string): Promise<boolean> {
  const info = await stat(file).catch(() => undefined);
  return Boolean(info?.isFile());
}

export async function resolvePublicMediaUrl(
  mediaFile: string,
  env: PublicMediaEnv = process.env,
): Promise<string | undefined> {
  if (isRemoteUrl(mediaFile)) return mediaFile;

  const publicDir = env.OPENQLOW_PUBLIC_MEDIA_DIR;
  const publicBaseUrl = env.OPENQLOW_PUBLIC_MEDIA_BASE_URL;
  if (!publicDir || !publicBaseUrl) return undefined;

  const root = path.resolve(publicDir);
  const file = path.resolve(mediaFile);
  if (!isInsideDir(root, file)) return undefined;
  if (!await fileExists(file)) return undefined;

  return joinBaseUrl(publicBaseUrl, path.relative(root, file));
}
