import http from "node:http";
import crypto from "node:crypto";
import { loadConfig } from "../config.js";
import { approveRecord, rejectRecord } from "../scheduler/daily.js";
import { parseApprovalCommand } from "../approval/command.js";
import { expandApprovalShortcut, resolveLatestPendingId } from "../approval/shortcut.js";
import { applyBodyEdit, isUsableRevisionText } from "../approval/revise_content.js";
import { applyInsert, parseInsertCommand, resolveMediaDir } from "../publish/media_insert.js";
import { applyLineMedia } from "../publish/line_media.js";
import { createBrowserPanel } from "../publish/browser_panel.js";
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
    const hasPublishDestinations = parsed.targets.some(target => target !== "drafts_only");
    // `ok` は「投稿準備パネルまで」（半自動）。最終投稿は JIN が画面で行う。
    // 完全自動（runFinalPublish）は投稿成功検証の完成後に明示フラグで解禁する想定
    // （docs/HANDOFF_20260607_claude→codex_v2.md §7 / 機能①）。ここでは自動投稿しない。
    const panel = hasPublishDestinations ? await createBrowserPanel(config.root, parsed.id) : undefined;
    const message = [
      hasPublishDestinations ? "OPENQLOW: 投稿準備をしました。最後は画面で投稿してください。" : "OPENQLOW: 下書きを保存しました。",
      `ID: ${parsed.id}`,
      panel ? `ブラウザ投稿パネル: ${panel}` : "",
      panel ? "Threads / Googleビジネス / LINE VOOM は、このパネルから本文をコピーして確認できます。" : "",
      panel ? "最終投稿ボタンは、Jinさんが画面で確認してから押してください。（自動では投稿しません）" : "",
    ].filter(Boolean).join("\n");
    return { ok: true, action: "approved", id: parsed.id, saved: files, panel, message };
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
