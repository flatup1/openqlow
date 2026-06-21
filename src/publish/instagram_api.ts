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
  /** コンテナ準備待ちのポーリング設定（テスト用に調整可）。 */
  pollAttempts?: number;
  pollDelayMs?: number;
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

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * 画像コンテナが公開可能(FINISHED)になるまで待つ。
 * Instagramは image_url から画像を取り込むのに時間がかかり、
 * 取り込み完了前に media_publish するとエラー(9007/2207027)になる。
 */
async function waitForContainerReady(
  base: string,
  creationId: string,
  accessToken: string,
  fetchImpl: typeof fetch,
  attempts: number,
  delayMs: number,
): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    const url = `${base}/${creationId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetchImpl(url);
    const status = (await readJson(res)).status_code;
    if (status === "FINISHED") return;
    if (status === "ERROR" || status === "EXPIRED") {
      throw new Error(`Instagram container status ${String(status)}`);
    }
    if (i < attempts - 1) await sleep(delayMs);
  }
  throw new Error("Instagram container not ready (timeout)");
}

export async function publishInstagramImage(input: PublishInstagramImageInput): Promise<PublishInstagramImageResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const base = "https://graph.facebook.com/v19.0";
  const pollAttempts = input.pollAttempts ?? 10;
  const pollDelayMs = input.pollDelayMs ?? 3000;

  const createBody = new URLSearchParams({
    image_url: input.imageUrl,
    caption: input.caption,
    access_token: input.accessToken,
  });
  const create = await fetchImpl(`${base}/${input.igUserId}/media`, { method: "POST", body: createBody });
  const creationId = requireString((await readJson(create)).id, "creation id");

  // 取り込み完了を待ってから公開（即公開だと 9007「準備ができていません」になる）。
  await waitForContainerReady(base, creationId, input.accessToken, fetchImpl, pollAttempts, pollDelayMs);

  const publishBody = new URLSearchParams({
    creation_id: creationId,
    access_token: input.accessToken,
  });
  const publish = await fetchImpl(`${base}/${input.igUserId}/media_publish`, { method: "POST", body: publishBody });
  const postId = requireString((await readJson(publish)).id, "post id");

  return { creationId, postId };
}
