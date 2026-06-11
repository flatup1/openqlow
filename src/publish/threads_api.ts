export interface PublishThreadsTextInput {
  userId: string;
  accessToken: string;
  text: string;
  fetchImpl?: typeof fetch;
}

export interface PublishThreadsImageInput extends PublishThreadsTextInput {
  imageUrl: string;
}

export interface PublishThreadsTextResult {
  creationId: string;
  postId: string;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const body = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new Error(`Threads API returned non-JSON response: ${body.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`Threads API ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

function requireString(value: unknown, label: string): string {
  if (typeof value === "string" && value) return value;
  throw new Error(`Threads API response missing ${label}`);
}

async function publishThreadsContainer(input: {
  userId: string;
  accessToken: string;
  body: URLSearchParams;
  fetchImpl?: typeof fetch;
}): Promise<PublishThreadsTextResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const create = await fetchImpl(`https://graph.threads.net/v1.0/${input.userId}/threads`, {
    method: "POST",
    body: input.body,
  });
  const createJson = await readJson(create);
  const creationId = requireString(createJson.id, "creation id");

  const publishBody = new URLSearchParams({
    creation_id: creationId,
    access_token: input.accessToken,
  });
  const publish = await fetchImpl(`https://graph.threads.net/v1.0/${input.userId}/threads_publish`, {
    method: "POST",
    body: publishBody,
  });
  const publishJson = await readJson(publish);
  const postId = requireString(publishJson.id, "post id");

  return { creationId, postId };
}

export async function publishThreadsText(input: PublishThreadsTextInput): Promise<PublishThreadsTextResult> {
  const createBody = new URLSearchParams({
    media_type: "TEXT",
    text: input.text,
    access_token: input.accessToken,
  });

  return publishThreadsContainer({
    userId: input.userId,
    accessToken: input.accessToken,
    body: createBody,
    fetchImpl: input.fetchImpl,
  });
}

export async function publishThreadsImage(input: PublishThreadsImageInput): Promise<PublishThreadsTextResult> {
  const createBody = new URLSearchParams({
    media_type: "IMAGE",
    image_url: input.imageUrl,
    text: input.text,
    access_token: input.accessToken,
  });

  return publishThreadsContainer({
    userId: input.userId,
    accessToken: input.accessToken,
    body: createBody,
    fetchImpl: input.fetchImpl,
  });
}
