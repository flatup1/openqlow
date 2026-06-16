// X (Twitter) API への投稿。OAuth 1.0a ユーザーコンテキスト署名を依存ゼロで実装。
// 前提: X開発者アカウントの4キー（API Key/Secret, Access Token/Secret）。
// 成功時のみ tweetId を返す（検証できなければ throw = fail closed）。
// 鍵・署名・トークンはログに出さない。

import crypto from "node:crypto";

export interface XCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

/** RFC3986 percent-encode（OAuth1.0a 仕様）。 */
export function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export interface OAuthOverrides {
  nonce?: string;
  timestamp?: string;
}

/**
 * OAuth 1.0a Authorization ヘッダを作る。
 * 署名対象は oauth_* とクエリのみ（JSON/multipart ボディは仕様どおり署名に含めない）。
 */
export function buildOAuth1Header(
  method: string,
  url: string,
  creds: XCredentials,
  extraParams: Record<string, string> = {},
  overrides: OAuthOverrides = {},
): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: overrides.nonce ?? crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: overrides.timestamp ?? String(Math.floor(Date.now() / 1000)),
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };

  const all = { ...oauth, ...extraParams };
  const paramString = Object.keys(all)
    .sort()
    .map((key) => `${rfc3986(key)}=${rfc3986(all[key])}`)
    .join("&");
  const baseString = [method.toUpperCase(), rfc3986(url), rfc3986(paramString)].join("&");
  const signingKey = `${rfc3986(creds.apiSecret)}&${rfc3986(creds.accessSecret)}`;
  const signature = crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");

  const header: Record<string, string> = { ...oauth, oauth_signature: signature };
  return (
    "OAuth " +
    Object.keys(header)
      .sort()
      .map((key) => `${rfc3986(key)}="${rfc3986(header[key])}"`)
      .join(", ")
  );
}

/** 画像をアップロードして media_id を得る（multipart/form-data・ボディは署名対象外）。 */
export async function uploadXMedia(
  creds: XCredentials,
  bytes: Uint8Array,
  fetchImpl: typeof fetch = fetch,
  overrides: OAuthOverrides = {},
): Promise<string> {
  const url = "https://upload.twitter.com/1.1/media/upload.json";
  const boundary = `openqlow${crypto.randomBytes(12).toString("hex")}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="media"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    "utf8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const body = Buffer.concat([head, Buffer.from(bytes), tail]);

  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: buildOAuth1Header("POST", url, creds, {}, overrides),
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`X media upload ${res.status}`);
  const json = JSON.parse(text) as { media_id_string?: string };
  if (!json.media_id_string) throw new Error("X media upload: missing media_id_string");
  return json.media_id_string;
}

export interface PublishXPostInput {
  creds: XCredentials;
  text: string;
  /** 添付画像（任意）。 */
  mediaBytes?: Uint8Array;
  fetchImpl?: typeof fetch;
  overrides?: OAuthOverrides;
}

/** Xに投稿する。tweet id が取れた時だけ成功。 */
export async function publishXPost(input: PublishXPostInput): Promise<{ tweetId: string }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const overrides = input.overrides ?? {};

  let mediaIds: string[] | undefined;
  if (input.mediaBytes && input.mediaBytes.byteLength > 0) {
    mediaIds = [await uploadXMedia(input.creds, input.mediaBytes, fetchImpl, overrides)];
  }

  const url = "https://api.twitter.com/2/tweets";
  const payload: Record<string, unknown> = { text: input.text };
  if (mediaIds) payload.media = { media_ids: mediaIds };

  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: buildOAuth1Header("POST", url, input.creds, {}, overrides),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`X post ${res.status}`);
  const json = JSON.parse(text) as { data?: { id?: string } };
  const tweetId = json.data?.id;
  if (!tweetId) throw new Error("X post: missing tweet id");
  return { tweetId };
}
