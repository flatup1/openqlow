// Facebookページへの投稿（写真つき or テキスト）。
// 前提: Facebookページ + Meta開発者アプリのページアクセストークン（pages_manage_posts）。
// 写真は公開URL（このwebhookの /openqlow/media/ 配信）から Facebook 側が取得する。
// 成功時のみ postId を返す（検証できなければ throw = fail closed）。
// 鍵・トークンはログに出さない。

export interface PublishFacebookInput {
  pageId: string;
  accessToken: string;
  message: string;
  /** 公開画像URL（あれば写真投稿、無ければテキスト投稿）。 */
  imageUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface PublishFacebookResult {
  postId: string;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const body = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new Error(`Facebook API returned non-JSON response: ${body.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`Facebook API ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json;
}

export async function publishFacebookPost(input: PublishFacebookInput): Promise<PublishFacebookResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const base = "https://graph.facebook.com/v19.0";

  if (input.imageUrl) {
    // 写真投稿（フィードに画像つきで載る）。
    const body = new URLSearchParams({
      url: input.imageUrl,
      caption: input.message,
      access_token: input.accessToken,
    });
    const res = await fetchImpl(`${base}/${input.pageId}/photos`, { method: "POST", body });
    const json = await readJson(res);
    const postId = json.post_id ?? json.id;
    if (!postId) throw new Error("Facebook API response missing post id");
    return { postId: String(postId) };
  }

  // テキスト投稿。
  const body = new URLSearchParams({
    message: input.message,
    access_token: input.accessToken,
  });
  const res = await fetchImpl(`${base}/${input.pageId}/feed`, { method: "POST", body });
  const json = await readJson(res);
  if (!json.id) throw new Error("Facebook API response missing post id");
  return { postId: String(json.id) };
}
