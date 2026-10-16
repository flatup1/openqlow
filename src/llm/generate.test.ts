import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { generatePostBody, imageDataUrlFor, refinePostBody } from "./generate.js";

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

// 写真つき: 写真は data URL で送られ、本文は写真に触れる指示になる。
{
  const dir = await mkdtemp(path.join(tmpdir(), "openqlow-gen-img-"));
  const file = path.join(dir, "a.jpg");
  await writeFile(file, Buffer.from([0xff, 0xd8, 0xff]));
  let sentBody = "";
  const capture = (async (_url: unknown, init?: RequestInit) => {
    sentBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ choices: [{ message: { content: "ミットを構える一歩目が、今日の自分を少し超える。" } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const result = await generatePostBody({ dateJst: "2026-06-17", env: { OPENROUTER_API_KEY: "sk-or-test" }, fetchImpl: capture, imagePath: file });
  assert.equal(result.ok, true);
  assert.match(sentBody, /"type":"image_url"/);
  assert.match(sentBody, /data:image\/jpeg;base64,/);
  assert.match(sentBody, /写真に写っている動き/);
  await rm(dir, { recursive: true, force: true });
}

// 写真が条件外（対応外の形式・存在しない）なら、写真を送らず文字だけで生成する。
{
  assert.equal(await imageDataUrlFor(undefined), undefined);
  assert.equal(await imageDataUrlFor("/no/such/file.jpg"), undefined);
  const dir = await mkdtemp(path.join(tmpdir(), "openqlow-gen-heic-"));
  const heic = path.join(dir, "a.heic");
  await writeFile(heic, "x");
  assert.equal(await imageDataUrlFor(heic), undefined);
  await rm(dir, { recursive: true, force: true });
}

console.log("generate tests passed");
