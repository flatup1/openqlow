// Instagram への画像投稿（Facebook Graph API 経由）。
// 必要権限: instagram_content_publish / instagram_basic / pages_show_list（オーナーが Meta 側で設定）。
// 投稿は2段階: ① メディアコンテナ作成(image_url+caption) → ② 公開(creation_id)。
// Instagram はテキスト単独投稿不可（画像 or 動画が必須）。image_url は Meta が外部から取得できる
// 公開HTTPS URL である必要がある。

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

export interface PublishInstagramImageInput {
  /** Instagram ビジネスアカウントID（Facebookページに紐づくIG-User-ID） */
  igUserId: string;
  accessToken: string;
  /** キャプション（本文＋ハッシュタグ） */
  caption: string;
  /** Meta が取得できる公開HTTPSの画像URL */
  imageUrl: string;
  fetchImpl?: typeof fetch;
}

export interface PublishInstagramImageResult {
  creationId: string;
  mediaId: string;
}

// Meta系APIのエラーから人間に読める一文だけ取り出す（生JSON/内部IDは出さない）。
function summarizeApiError(json: Record<string, unknown>): string {
  const error = (json.error ?? {}) as Record<string, unknown>;
  const userMsg = typeof error.error_user_msg === "string" ? error.error_user_msg : "";
  const msg = typeof error.message === "string" ? error.message : "";
  return userMsg || msg || "詳細不明のエラー";
}

async function postForm(
  url: string,
  params: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams(params);
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Instagram API returned non-JSON response: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`Instagram API ${res.status}: ${summarizeApiError(json)}`);
  }
  return json;
}

export async function publishInstagramImage(
  input: PublishInstagramImageInput,
): Promise<PublishInstagramImageResult> {
  const fetchImpl = input.fetchImpl ?? fetch;

  // ① メディアコンテナ作成
  const container = await postForm(
    `${GRAPH_BASE}/${input.igUserId}/media`,
    {
      image_url: input.imageUrl,
      caption: input.caption,
      access_token: input.accessToken,
    },
    fetchImpl,
  );
  const creationId = typeof container.id === "string" ? container.id : "";
  if (!creationId) throw new Error("Instagram API: media container id missing");

  // ② 公開
  const published = await postForm(
    `${GRAPH_BASE}/${input.igUserId}/media_publish`,
    {
      creation_id: creationId,
      access_token: input.accessToken,
    },
    fetchImpl,
  );
  const mediaId = typeof published.id === "string" ? published.id : "";
  if (!mediaId) throw new Error("Instagram API: published media id missing");

  return { creationId, mediaId };
}
