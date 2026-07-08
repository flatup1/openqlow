// Threads の access token が「いま本当に有効か」を graph.threads.net に問い合わせて判定する。
// トークン差し替え作業の後、推測せずに一発で有効/無効・アカウントidを確認するための診断。

const THREADS_API = "https://graph.threads.net/v1.0";

export interface ThreadsTokenCheckResult {
  ok: boolean;
  id?: string;
  username?: string;
  error?: string;
}

export async function checkThreadsToken(input: {
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<ThreadsTokenCheckResult> {
  if (!input.accessToken) {
    return { ok: false, error: "THREADS_ACCESS_TOKEN が未設定です" };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const url = `${THREADS_API}/me?fields=id,username&access_token=${encodeURIComponent(input.accessToken)}`;

  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const body = await response.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return { ok: false, error: `非JSON応答 (HTTP ${response.status}): ${body.slice(0, 120)}` };
  }

  if (!response.ok) {
    const error = (json.error ?? {}) as Record<string, unknown>;
    const message = typeof error.message === "string" ? error.message : `HTTP ${response.status}`;
    return { ok: false, error: message };
  }

  return {
    ok: true,
    id: typeof json.id === "string" ? json.id : undefined,
    username: typeof json.username === "string" ? json.username : undefined,
  };
}
