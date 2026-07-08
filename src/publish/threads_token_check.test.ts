import assert from "node:assert/strict";
import { checkThreadsToken } from "./threads_token_check.js";

// 1. 有効なトークン: id / username を返す。
{
  const result = await checkThreadsToken({
    accessToken: "valid-token",
    fetchImpl: (async () =>
      new Response(JSON.stringify({ id: "27094603243501125", username: "hitoshi_flatupgym" }), { status: 200 })) as typeof fetch,
  });
  assert.equal(result.ok, true);
  assert.equal(result.id, "27094603243501125");
  assert.equal(result.username, "hitoshi_flatupgym");
}

// 2. 無効なトークン: エラーメッセージを取り出す（生JSONは出さない）。
{
  const result = await checkThreadsToken({
    accessToken: "bad-token",
    fetchImpl: (async () =>
      new Response(JSON.stringify({ error: { message: "Invalid OAuth access token - Cannot parse access token" } }), { status: 400 })) as typeof fetch,
  });
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /Cannot parse access token/);
}

// 3. 未設定: fetch せず即エラー。
{
  let called = false;
  const result = await checkThreadsToken({
    accessToken: "",
    fetchImpl: (async () => { called = true; return new Response("{}"); }) as typeof fetch,
  });
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /未設定/);
  assert.equal(called, false, "未設定ならAPIを呼ばない");
}

// 4. 非JSON応答でも落ちない。
{
  const result = await checkThreadsToken({
    accessToken: "x",
    fetchImpl: (async () => new Response("<html>oops</html>", { status: 502 })) as typeof fetch,
  });
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /非JSON応答/);
}

console.log("threads token check tests passed");
