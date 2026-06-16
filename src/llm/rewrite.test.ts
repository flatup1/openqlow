import assert from "node:assert/strict";
import { rewriteDraftBody } from "./rewrite.js";

function okOpenRouterFetch(content: string): typeof fetch {
  return (async (_url: string | URL | Request, init?: RequestInit) => {
    // 指示モードは OpenRouter の /chat/completions を叩く。
    const url = String(_url);
    assert.match(url, /\/chat\/completions$/);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.messages.length, 2);
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

// 1) OpenRouterキーがあればOpenRouterを使い、本文を書き直して返す。
{
  const result = await rewriteDraftBody({
    currentBody: "今日は体験会です。",
    instruction: "もっとやさしく",
    env: { OPENROUTER_API_KEY: "sk-test" } as NodeJS.ProcessEnv,
    fetchImpl: okOpenRouterFetch("はじめての方も安心して参加できる体験会です。"),
  });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.provider, "openrouter");
  assert.equal(result.ok && result.body, "はじめての方も安心して参加できる体験会です。");
}

// 2) 出力を囲む引用符・コードフェンスは除去する。
{
  const result = await rewriteDraftBody({
    currentBody: "本文",
    instruction: "短く",
    env: { OPENROUTER_API_KEY: "sk-test" } as NodeJS.ProcessEnv,
    fetchImpl: okOpenRouterFetch("```\n「やさしい一歩を、FLATUPで。」\n```"),
  });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.body, "やさしい一歩を、FLATUPで。");
}

// 3) 指示が空なら、APIを叩かず失敗する（本文を壊さない）。
{
  let called = false;
  const result = await rewriteDraftBody({
    currentBody: "本文",
    instruction: "   ",
    env: { OPENROUTER_API_KEY: "sk-test" } as NodeJS.ProcessEnv,
    fetchImpl: (async () => { called = true; return new Response("{}"); }) as unknown as typeof fetch,
  });
  assert.equal(result.ok, false);
  assert.equal(called, false);
}

// 4) APIがエラーを返したら正直に失敗を返す（成功扱いにしない）。
{
  const result = await rewriteDraftBody({
    currentBody: "本文",
    instruction: "やさしく",
    env: { OPENROUTER_API_KEY: "sk-test" } as NodeJS.ProcessEnv,
    fetchImpl: (async () => new Response("rate limited", { status: 429 })) as unknown as typeof fetch,
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && /429/.test(result.reason), true);
}

// 5) 空応答も失敗扱い（空本文で上書きさせない）。
{
  const result = await rewriteDraftBody({
    currentBody: "本文",
    instruction: "やさしく",
    env: { OPENROUTER_API_KEY: "sk-test" } as NodeJS.ProcessEnv,
    fetchImpl: okOpenRouterFetch("   "),
  });
  assert.equal(result.ok, false);
}

// 6) キーが無ければローカルOllama(/api/chat)へフォールバックする。
{
  let hit = "";
  const ollamaFetch = (async (url: string | URL | Request) => {
    hit = String(url);
    return new Response(JSON.stringify({ message: { content: "ローカルで書き直した本文。" } }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  const result = await rewriteDraftBody({
    currentBody: "本文",
    instruction: "やさしく",
    env: {} as NodeJS.ProcessEnv,
    fetchImpl: ollamaFetch,
  });
  assert.match(hit, /\/api\/chat$/);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.provider, "ollama");
}

console.log("rewrite tests passed");
