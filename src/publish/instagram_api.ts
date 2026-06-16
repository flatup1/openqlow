// Instagram Graph API での画像投稿。
// 前提: Instagramビジネス/クリエイターアカウント + Meta開発者アプリのアクセストークン。
// 画像は公開URL（このwebhookの /openqlow/media/ 配信）から Instagram 側が取得する。
// 成功時のみ postId を返す（検証できなければ throw = fail closed）。

export interface PublishInstagramImageInput {
  igUserId: string;
  accessToken: string;
  imageUrl: string;
  caption: string;
  fetchImpl?: typeof fetch;
}

export interface PublishInstagramImageResult {
  creationId: string;
  postId: string;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const body = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new Error(`Instagram API returned non-JSON response: ${body.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`Instagram API ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json;
}

function requireString(value: unknown, label: string): string {
  if (typeof value === "string" && value) return value;
  throw new Error(`Instagram API response missing ${label}`);
}

export async function publishInstagramImage(input: PublishInstagramImageInput): Promise<PublishInstagramImageResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const base = "https://graph.facebook.com/v19.0";

  const createBody = new URLSearchParams({
    image_url: input.imageUrl,
    caption: input.caption,
    access_token: input.accessToken,
  });
  const create = await fetchImpl(`${base}/${input.igUserId}/media`, { method: "POST", body: createBody });
  const creationId = requireString((await readJson(create)).id, "creation id");

  const publishBody = new URLSearchParams({
    creation_id: creationId,
    access_token: input.accessToken,
  });
  const publish = await fetchImpl(`${base}/${input.igUserId}/media_publish`, { method: "POST", body: publishBody });
  const postId = requireString((await readJson(publish)).id, "post id");

  return { creationId, postId };
}
