import assert from "node:assert/strict";
import { formatErrorReply, formatWebhookReply, replyLineMessage } from "./reply.js";

async function testFormatWebhookReply(): Promise<void> {
  const text = formatWebhookReply([
    {
      ok: false,
      message: "No approval command found. Expected: OK FG-YYYYMMDD-NNN / OK FG-YYYYMMDD-NNN all / 修正 FG-YYYYMMDD-NNN: comment / NO FG-YYYYMMDD-NNN",
    },
  ]);

  assert.match(text, /OPENQLOW/);
  assert.match(text, /受信しました/);
  assert.match(text, /OK FG-YYYYMMDD-NNN/);
}

async function testFormatWebhookReplyUsesCommandMessage(): Promise<void> {
  const text = formatWebhookReply([
    {
      ok: true,
      action: "append_obsidian",
      message: "Obsidianに追記しました。\n/path/to/log.md",
    },
  ]);

  assert.equal(text, "Obsidianに追記しました。\n/path/to/log.md");
}

async function testReplyLineMessageCallsLineApi(): Promise<void> {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response("{}", { status: 200 });
  };

  const result = await replyLineMessage("reply-token", "hello", {
    token: "line-token",
    fetchImpl: fakeFetch,
  });

  assert.deepEqual(result, { ok: true, mode: "sent" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.line.me/v2/bot/message/reply");
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer line-token");
  assert.equal(calls[0].init.body, JSON.stringify({ replyToken: "reply-token", messages: [{ type: "text", text: "hello" }] }));
}

async function testReplyLineMessageSkipsWithoutToken(): Promise<void> {
  const result = await replyLineMessage("reply-token", "hello", { token: "" });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "skipped");
}

async function testFormatErrorReplyClassifies(): Promise<void> {
  assert.match(formatErrorReply("Record not found: FG-1"), /見つかりませんでした/);
  assert.match(formatErrorReply("Safety check failed: NG"), /安全チェック/);
  assert.match(
    formatErrorReply("Phase 1 physical publish lock blocked non-draft publication levels: x:level_4_publish"),
    /Phase1の安全ロック/,
  );
  assert.match(formatErrorReply("Invalid approval. Required reply: OK FG-1"), /承認コマンドの形式/);
  assert.match(formatErrorReply("LINE reply 400: bad"), /接続でエラー/);
  assert.match(formatErrorReply("something unexpected"), /処理中にエラー/);
}

async function testFormatErrorReplyHidesRawSecrets(): Promise<void> {
  // 生のエラーにトークンらしき文字列が混ざっても、返信にそのまま出さない。
  const reply = formatErrorReply("threads publish failed: token=abcdef0123456789SECRET");
  assert.doesNotMatch(reply, /SECRET/);
  assert.doesNotMatch(reply, /abcdef0123456789/);
}

await testFormatWebhookReply();
await testFormatWebhookReplyUsesCommandMessage();
await testReplyLineMessageCallsLineApi();
await testReplyLineMessageSkipsWithoutToken();
await testFormatErrorReplyClassifies();
await testFormatErrorReplyHidesRawSecrets();

console.log("line reply tests passed");
