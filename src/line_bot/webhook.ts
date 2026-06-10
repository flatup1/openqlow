import http from "node:http";
import crypto from "node:crypto";
import { loadConfig } from "../config.js";
import { approveRecord, rejectRecord } from "../scheduler/daily.js";
import { parseApprovalCommand } from "../approval/command.js";
import { expandApprovalShortcut, resolveLatestPendingId } from "../approval/shortcut.js";
import { applyBodyEdit, isUsableRevisionText } from "../approval/revise_content.js";
import { applyInsert, clearMedia, parseImageCommand, parseInsertCommand, resolveMediaDir } from "../publish/media_insert.js";
import { applyLineMedia, mediaContentType, safeMediaPath } from "../publish/line_media.js";
import { buildPostAssistMessage } from "../publish/post_assist.js";
import { publishThreadsImage, publishThreadsText } from "../publish/threads_api.js";
import { publishInstagramImage } from "../publish/instagram_api.js";
import { publishXPost } from "../publish/x_api.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadRecord, saveRecord } from "../state/file_store.js";
import { checkDraftSafety } from "../safety/check.js";
import { executeLineCommand } from "./commands.js";
import { formatErrorReply, formatWebhookReply, replyLineMessage } from "./reply.js";

const port = Number(process.env.OPENQLOW_LINE_PORT || 8787);
const webhookPaths = new Set(["/line/webhook", "/openqlow/webhook"]);
const channelSecret = process.env.LINE_CHANNEL_SECRET || "";
const jinLineUserId = process.env.JIN_LINE_USER_ID || "";
const backupApproverLineUserId = process.env.BACKUP_APPROVER_LINE_USER_ID || "";
const allowedApproverIds = new Set([jinLineUserId, backupApproverLineUserId].filter(Boolean));

function verifyLineSignature(rawBody: string, signature: string | string[] | undefined): boolean {
  if (!channelSecret) {
    return process.env.OPENQLOW_DRY_RUN !== "false";
  }

  const expected = crypto.createHmac("sha256", channelSecret).update(rawBody).digest("base64");
  const actual = Array.isArray(signature) ? signature[0] : signature;
  if (!actual) return false;
  if (Buffer.byteLength(expected) !== Buffer.byteLength(actual)) return false;

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

interface ExtractedEvent {
  text?: string;
  messageType?: string;
  messageId?: string;
  userId?: string;
}

function extractLineTexts(rawBody: string): { events: ExtractedEvent[]; linePayload: boolean; ignored?: string; replyToken?: string } {
  try {
    const payload = JSON.parse(rawBody) as {
      events?: Array<{
        type?: string;
        replyToken?: string;
        source?: { userId?: string };
        message?: { type?: string; text?: string; id?: string };
      }>;
    };

    if (!Array.isArray(payload.events)) {
      return { events: [{ text: rawBody, messageType: "text" }], linePayload: false };
    }

    const events: ExtractedEvent[] = [];
    let replyToken: string | undefined;
    for (const event of payload.events) {
      if (event.type !== "message") continue;
      const messageType = event.message?.type;
      const userId = event.source?.userId;

      if (messageType === "text") {
        if (!event.message?.text) continue;
        console.log(`LINE message received from ${userId || "unknown"}: ${event.message.text}`);
      } else if (messageType === "image" || messageType === "video") {
        if (!event.message?.id) continue;
        // バイナリ・取得URLはログに出さない（種別のみ）。
        console.log(`LINE ${messageType} message received from ${userId || "unknown"}`);
      } else {
        continue;
      }

      if (allowedApproverIds.size > 0 && !allowedApproverIds.has(userId || "")) {
        return { events: [], linePayload: true, ignored: "non_approver_user" };
      }
      replyToken ??= event.replyToken;
      events.push({ text: event.message?.text, messageType, messageId: event.message?.id, userId });
    }

    return { events, linePayload: true, replyToken };
  } catch {
    return { events: [{ text: rawBody, messageType: "text" }], linePayload: false };
  }
}

async function handleLineMedia(messageType: string, messageId: string): Promise<Record<string, unknown>> {
  const config = loadConfig();
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
  return {
    ...(await applyLineMedia({
      root: config.root,
      mediaDir: resolveMediaDir(),
      messageId,
      messageType,
      token,
    })),
  };
}

async function executeApproval(text: string, userId?: string): Promise<Record<string, unknown>> {
  const lineCommand = await executeLineCommand(text, { userId });
  if (lineCommand.handled) return { ...lineCommand };

  const config = loadConfig();

  // 「挿入」「挿入 N」：メディアフォルダから画像/動画を下書きに添付する（機能③）。
  const insert = parseInsertCommand(text);
  if (insert) {
    return { ...(await applyInsert(config.root, resolveMediaDir(), insert)) };
  }

  // 朝フロー（④）の「画像 N」「画像なし」：候補の画像を選ぶ／無しにする。
  const image = parseImageCommand(text);
  if (image) {
    if (image.kind === "none") return { ...(await clearMedia(config.root)) };
    return { ...(await applyInsert(config.root, resolveMediaDir(), { kind: "pick", index: image.index })) };
  }

  const approvalText = await expandApprovalShortcut(text, config.root) ?? text;
  const parsed = parseApprovalCommand(approvalText);
  if (!parsed) {
    return {
      ok: false,
      message: [
        "受け取りました。",
        "日報として残すなら、体験・入会・口コミ・今日やることを1通で送ってください。",
        "例: 体験ひかりちゃん1名 入会予定 今日やること広告",
        "投稿候補を作るなら「投稿」と送ってください。",
      ].join("\n"),
    };
  }

  if (parsed.response === "OK") {
    const files = await approveRecord(parsed.id, parsed.raw);
    const publishTargets = parsed.targets.filter(target => target !== "drafts_only");
    if (publishTargets.length === 0) {
      return {
        ok: true,
        action: "approved",
        id: parsed.id,
        saved: files,
        message: ["OPENQLOW: 下書きを保存しました。", `ID: ${parsed.id}`].join("\n"),
      };
    }

    // 携帯から最短で複数サイト投稿するためのアシスト（機能①）。
    // Threads は API 自動投稿（postId が取れた時だけ成功扱い）。Google/VOOM はコピー＋リンク補助。
    const record = await loadRecord(config.root, parsed.id);
    const draft = record?.drafts.find(d => d.platform === "threads") ?? record?.drafts[0];
    const body = [
      draft?.body ?? "",
      draft?.hashtags?.length ? draft.hashtags.map(tag => `#${tag}`).join(" ") : "",
    ].filter(Boolean).join("\n");
    const hasMedia = Boolean(record?.mediaFiles?.length);

    let threadsPostId: string | undefined;
    const threadsUserId = process.env.THREADS_USER_ID ?? "";
    const threadsToken = process.env.THREADS_ACCESS_TOKEN ?? "";
    // 公開ベースURL（cloudflaredトンネル等）。設定されていれば写真付きでもAPI自動投稿できる。
    const publicBaseUrl = (process.env.OPENQLOW_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
    if (parsed.targets.includes("threads") && threadsUserId && threadsToken) {
      try {
        if (!hasMedia) {
          const published = await publishThreadsText({ userId: threadsUserId, accessToken: threadsToken, text: body });
          threadsPostId = published.postId;
        } else if (publicBaseUrl) {
          // 先頭の画像を公開URL（このwebhookの /openqlow/media/ 配信）経由で添付して投稿する。
          const first = record?.mediaFiles?.[0] ?? "";
          const name = path.basename(first);
          if (safeMediaPath(resolveMediaDir(), name)) {
            const imageUrl = `${publicBaseUrl}/openqlow/media/${encodeURIComponent(name)}`;
            const published = await publishThreadsImage({ userId: threadsUserId, accessToken: threadsToken, text: body, imageUrl });
            threadsPostId = published.postId;
          }
        }
        // hasMedia かつ publicBaseUrl 未設定の場合は自動投稿しない（リンク案内にfallback）。
      } catch (error) {
        // 失敗は postId 無し＝成功扱いにしない。詳細はログのみ（応答に秘密を出さない）。
        console.error("[threads auto-post] failed:", error instanceof Error ? error.message : String(error));
      }
    }

    // X：4キーが設定されていれば自動投稿（写真があれば添付）。tweet id が取れた時だけ成功。
    let xPostId: string | undefined;
    const xCreds = {
      apiKey: process.env.X_API_KEY ?? "",
      apiSecret: process.env.X_API_SECRET ?? "",
      accessToken: process.env.X_ACCESS_TOKEN ?? "",
      accessSecret: process.env.X_ACCESS_SECRET ?? "",
    };
    if (xCreds.apiKey && xCreds.apiSecret && xCreds.accessToken && xCreds.accessSecret) {
      try {
        const first = record?.mediaFiles?.[0];
        const mediaBytes = first ? await readFile(first).catch(() => undefined) : undefined;
        const published = await publishXPost({ creds: xCreds, text: body, mediaBytes });
        xPostId = published.tweetId;
      } catch (error) {
        console.error("[x auto-post] failed:", error instanceof Error ? error.message : String(error));
      }
    }

    // Instagram：トークン＋IGユーザーID＋写真＋公開URLが揃っていれば自動投稿（IGは画像必須）。
    let igPostId: string | undefined;
    const igUserId = process.env.IG_USER_ID ?? "";
    const igToken = process.env.IG_ACCESS_TOKEN ?? "";
    if (igUserId && igToken && hasMedia && publicBaseUrl) {
      try {
        const name = path.basename(record?.mediaFiles?.[0] ?? "");
        if (safeMediaPath(resolveMediaDir(), name)) {
          const imageUrl = `${publicBaseUrl}/openqlow/media/${encodeURIComponent(name)}`;
          const published = await publishInstagramImage({ igUserId, accessToken: igToken, imageUrl, caption: body });
          igPostId = published.postId;
        }
      } catch (error) {
        console.error("[instagram auto-post] failed:", error instanceof Error ? error.message : String(error));
      }
    }

    const message = buildPostAssistMessage({ body, targets: parsed.targets, threadsPostId, xPostId, igPostId, hasMedia });
    return { ok: true, action: "approved", id: parsed.id, saved: files, threadsPostId, xPostId, igPostId, message };
  }

  if (parsed.response === "revision") {
    // id 省略時は直近の承認待ち候補を対象にする。
    const id = parsed.id || (await resolveLatestPendingId(config.root)) || "";
    if (!id) {
      return {
        ok: false,
        message: "直せる投稿候補が見つかりませんでした。先に「投稿」で候補を作ってください。",
      };
    }
    if (!isUsableRevisionText(parsed.note ?? "")) {
      return {
        ok: false,
        message: ["何をどう直しますか？", "例: 修正 セールは6/10までに変更"].join("\n"),
      };
    }
    const record = await loadRecord(config.root, id);
    if (!record) {
      return { ok: false, message: `投稿候補が見つかりませんでした: ${id}` };
    }

    // 入力テキストを新しい本文として反映（修正後は再承認待ちに戻す）。
    const edited = applyBodyEdit(record, parsed.note);
    await saveRecord(config.root, edited);

    // 修正後の本文に安全チェックを再適用する。
    const safety = checkDraftSafety(edited.drafts.map(draft => draft.body).join("\n\n"));
    const message = safety.ok
      ? [
          "OPENQLOW: 下書きを直しました。これでいいですか？",
          `ID: ${id}`,
          "",
          parsed.note,
          "",
          "OK / さらに修正 〇〇 / NO",
        ].join("\n")
      : [
          "OPENQLOW: 直しましたが、安全チェックに引っかかりました。",
          safety.issues.map(issue => issue.message).join(" / "),
          "もう一度「修正 〇〇」で直してください。",
        ].join("\n");
    return { ok: true, action: "revised", id, message };
  }

  const record = await rejectRecord(parsed.id);
  return { ok: true, action: "rejected", id: record.id };
}

const server = http.createServer(async (req, res) => {
  const requestPath = new URL(req.url || "/", "http://localhost").pathname;

  // 画像/動画の公開配信（Threads等のAPIが画像をダウンロードするための公開URL）。
  // ファイル名のみ許可（パストラバーサル防止）。メディアフォルダ外は配信しない。
  if (req.method === "GET" && requestPath.startsWith("/openqlow/media/")) {
    const name = decodeURIComponent(requestPath.slice("/openqlow/media/".length));
    const filePath = safeMediaPath(resolveMediaDir(), name);
    const data = filePath ? await readFile(filePath).catch(() => null) : null;
    if (!data) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": mediaContentType(name), "cache-control": "no-store" });
    res.end(data);
    return;
  }

  if (req.method !== "POST" || !webhookPaths.has(requestPath)) {
    res.writeHead(404);
    res.end("not found");
    return;
  }

  let body = "";
  req.on("data", chunk => {
    body += chunk;
  });
  req.on("end", async () => {
    if (req.headers["content-type"]?.includes("application/json") && !verifyLineSignature(body, req.headers["x-line-signature"])) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "invalid_line_signature" }));
      return;
    }

    const extracted = extractLineTexts(body);
    if (extracted.ignored) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, ignored: extracted.ignored }));
      return;
    }

    if (extracted.events.length === 0) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, ignored: "no_text_message" }));
      return;
    }

    try {
      const results = [];
      for (const ev of extracted.events) {
        if ((ev.messageType === "image" || ev.messageType === "video") && ev.messageId) {
          results.push(await handleLineMedia(ev.messageType, ev.messageId));
        } else {
          results.push(await executeApproval(ev.text ?? "", ev.userId));
        }
      }
      if (extracted.linePayload) {
        await replyLineMessage(extracted.replyToken, formatWebhookReply(results));
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: results.every(result => result.ok === true), results }));
    } catch (error) {
      console.error("[webhook] executeApproval failed:", error);
      const message = error instanceof Error ? error.message : String(error);
      // 例外時も必ずユーザーへ返信する（無言終了させない）。
      // 生のエラーはログのみ。LINE へは秘密情報を含まない分類済みメッセージを返す。
      if (extracted.linePayload) {
        await replyLineMessage(extracted.replyToken, formatErrorReply(message)).catch(replyErr =>
          console.error("[webhook] error reply failed:", replyErr),
        );
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: message }));
    }
  });
});

server.listen(port, () => {
  console.log(`OPENQLOW LINE webhook listening on http://localhost:${port}/openqlow/webhook`);
});
