import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Threads アクセストークンの長期化＋自動更新。
// Threads の「生成直後トークン」は短期（約1時間）。これを長期トークン（約60日）に交換し、
// 期限前に自動更新することで、手動更新を不要にする。
// 保存先は state/threads_token.json（webhook と同じ openqlow ユーザーが読み書き）。
// トークン・シークレットはログに出さない。

const GRAPH_BASE = "https://graph.threads.net";
const TOKEN_FILE = "threads_token.json";
// 期限の何日前から更新するか（Threads長期トークンは発行から24時間経過後に更新可能）。
const REFRESH_MARGIN_MS = 5 * 24 * 60 * 60 * 1000; // 5日前

export interface StoredThreadsToken {
  accessToken: string;
  expiresAt: string; // ISO8601
  obtainedAt: string;
}

interface TokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: { message?: string };
}

async function readTokenJson(res: Response): Promise<TokenResponse> {
  const text = await res.text();
  let json: TokenResponse;
  try {
    json = JSON.parse(text) as TokenResponse;
  } catch {
    throw new Error(`Threads token endpoint returned non-JSON (status ${res.status})`);
  }
  if (!res.ok || !json.access_token) {
    // メッセージのみ。トークン・シークレットは出さない。
    throw new Error(`Threads token endpoint failed: status ${res.status}`);
  }
  return json;
}

/** 短期トークン → 長期トークン（約60日）に交換する。 */
export async function exchangeForLongLivedToken(opts: {
  shortLivedToken: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}): Promise<{ accessToken: string; expiresInSec: number }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = new URL(`${GRAPH_BASE}/access_token`);
  url.searchParams.set("grant_type", "th_exchange_token");
  url.searchParams.set("client_secret", opts.clientSecret);
  url.searchParams.set("access_token", opts.shortLivedToken);
  const json = await readTokenJson(await fetchImpl(url.toString()));
  return { accessToken: json.access_token!, expiresInSec: json.expires_in ?? 0 };
}

/** 長期トークンを更新（さらに約60日延長）する。 */
export async function refreshLongLivedToken(opts: {
  token: string;
  fetchImpl?: typeof fetch;
}): Promise<{ accessToken: string; expiresInSec: number }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = new URL(`${GRAPH_BASE}/refresh_access_token`);
  url.searchParams.set("grant_type", "th_refresh_token");
  url.searchParams.set("access_token", opts.token);
  const json = await readTokenJson(await fetchImpl(url.toString()));
  return { accessToken: json.access_token!, expiresInSec: json.expires_in ?? 0 };
}

function tokenPath(root: string): string {
  return path.join(root, "state", TOKEN_FILE);
}

export async function saveThreadsToken(
  root: string,
  accessToken: string,
  expiresInSec: number,
  now = new Date(),
): Promise<StoredThreadsToken> {
  const stored: StoredThreadsToken = {
    accessToken,
    expiresAt: new Date(now.getTime() + expiresInSec * 1000).toISOString(),
    obtainedAt: now.toISOString(),
  };
  await mkdir(path.join(root, "state"), { recursive: true });
  await writeFile(tokenPath(root), `${JSON.stringify(stored, null, 2)}\n`, "utf8");
  return stored;
}

export async function loadThreadsToken(root: string): Promise<StoredThreadsToken | undefined> {
  const text = await readFile(tokenPath(root), "utf8").catch(() => "");
  if (!text) return undefined;
  try {
    return JSON.parse(text) as StoredThreadsToken;
  } catch {
    return undefined;
  }
}

/**
 * 投稿時に使う有効な Threads トークンを返す。
 * 保存済みの長期トークンが未失効ならそれを、無ければ env の THREADS_ACCESS_TOKEN を使う。
 */
export async function getActiveThreadsToken(
  root: string,
  env: Record<string, string | undefined> = process.env,
  now = new Date(),
): Promise<string> {
  const stored = await loadThreadsToken(root);
  if (stored?.accessToken && Date.parse(stored.expiresAt) > now.getTime()) {
    return stored.accessToken;
  }
  return env.THREADS_ACCESS_TOKEN ?? "";
}

/** 保存済みトークンが更新時期（期限の REFRESH_MARGIN 以内）かどうか。 */
export function needsRefresh(stored: StoredThreadsToken, now = new Date()): boolean {
  return Date.parse(stored.expiresAt) - now.getTime() < REFRESH_MARGIN_MS;
}
