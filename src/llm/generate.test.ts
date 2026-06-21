import assert from "node:assert/strict";
import { generatePostBody, refinePostBody } from "./generate.js";

// OpenRouter 応答を正しくパースして本文を返す（キーあり時）。
{
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: "成田のFLATUP GYMで、今日も一歩ずつ。" } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;

  const result = await generatePostBody({
    dateJst: "2026-06-17",
    env: { OPENROUTER_API_KEY: "sk-or-test" },
    fetchImpl: fakeFetch,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.match(result.body, /FLATUP GYM/);
    assert.equal(result.provider, "openrouter");
  }
}

// 応答エラー時は ok:false（呼び出し側が定型文へフォールバックできる）。
{
  const errFetch = (async () =>
    new Response("nope", { status: 401 })) as unknown as typeof fetch;
  const result = await generatePostBody({
    dateJst: "2026-06-17",
    env: { OPENROUTER_API_KEY: "sk-or-test" },
    fetchImpl: errFetch,
  });
  assert.equal(result.ok, false);
}

// 空応答は採用しない。
{
  const emptyFetch = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: "  " } }] }), { status: 200 })) as unknown as typeof fetch;
  const result = await generatePostBody({
    dateJst: "2026-06-17",
    env: { OPENROUTER_API_KEY: "sk-or-test" },
    fetchImpl: emptyFetch,
  });
  assert.equal(result.ok, false);
}

// 推敲: 目標点に達したら早期終了し、改善本文を返す。
{
  let calls = 0;
  const refineFetch = (async () => {
    calls += 1;
    const content = "SCORE: 97\n---\n成田のFLATUP GYMで、今日も自分のペースで一歩ずつ。";
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  }) as unknown as typeof fetch;

  const result = await refinePostBody({
    body: "FLATUPで頑張ろう",
    env: { OPENROUTER_API_KEY: "sk-or-test" },
    fetchImpl: refineFetch,
    maxRounds: 3,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.match(result.body, /FLATUP GYM/);
    assert.equal(result.score, 97);
    assert.equal(calls, 1); // 97>=95 で1回で終了
  }
}

// 推敲: APIが落ちても ok:false（呼び出し側はたたき台を使える）。
{
  const downFetch = (async () => new Response("err", { status: 500 })) as unknown as typeof fetch;
  const result = await refinePostBody({
    body: "たたき台",
    env: { OPENROUTER_API_KEY: "sk-or-test" },
    fetchImpl: downFetch,
  });
  assert.equal(result.ok, false);
}

console.log("generate tests passed");
