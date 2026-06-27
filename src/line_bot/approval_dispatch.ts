import { parseApprovalCommand } from "../approval/command.js";
import { expandApprovalShortcut, expandRejectionShortcut } from "../approval/shortcut.js";
import { loadConfig } from "../config.js";
import { createBrowserPanel } from "../publish/browser_panel.js";
import { approveRecord, rejectRecord, requestRevision } from "../scheduler/daily.js";
import { executeLineCommand } from "./commands.js";

function fallbackMessage(): string {
  return [
    "メッセージありがとうございます😊 受け取りました。",
    "",
    "・日報を残す → 体験 / 入会 / 口コミ / 今日やること を1通でどうぞ",
    "　例: 体験ひかりちゃん1名 入会予定 今日やること広告",
    "・投稿候補を作る → 「投稿」",
    "・直したい → 「修正 新しい本文」",
    "・使い方を見る → 「ヘルプ」",
  ].join("\n");
}

async function handleParsedApproval(
  parsed: NonNullable<ReturnType<typeof parseApprovalCommand>>,
  okShortcutUsed: boolean,
): Promise<Record<string, unknown>> {
  const config = loadConfig();

  if (parsed.response === "OK") {
    const files = await approveRecord(parsed.id, parsed.raw);
    const hasPublishDestinations = parsed.targets.some(target => target !== "drafts_only");
    const panel = hasPublishDestinations ? await createBrowserPanel(config.root, parsed.id) : undefined;
    const message = [
      hasPublishDestinations ? "投稿準備キューを作りました。外部投稿はまだしていません。" : "下書きを保存しました。",
      `ID: ${parsed.id}`,
      panel ? `ブラウザ投稿パネル: ${panel}` : "",
      panel ? "Threads / Googleビジネス / LINE VOOM は、このパネルから本文コピーして確認できます。" : "",
      okShortcutUsed && hasPublishDestinations ? "完全自動投稿はまだ保留中です。最終投稿ボタンは、Jinさんが画面で確認してから押してください。" : "",
      !okShortcutUsed && panel ? "最終投稿ボタンは、Jinさんが画面で確認してから押してください。" : "",
    ].filter(Boolean).join("\n");
    return { ok: true, action: "approved", id: parsed.id, saved: files, panel, message };
  }

  if (parsed.response === "revision") {
    const record = await requestRevision(parsed.id, parsed.note ?? "");
    return { ok: true, action: "needs_revision", id: record.id };
  }

  const record = await rejectRecord(parsed.id);
  return { ok: true, action: "rejected", id: record.id };
}

export async function executeApprovalText(text: string, userId?: string): Promise<Record<string, unknown>> {
  const config = loadConfig();
  const approvalText =
    await expandApprovalShortcut(text, config.root)
    ?? await expandRejectionShortcut(text, config.root)
    ?? text;
  const okShortcutUsed = approvalText !== text;
  const parsed = parseApprovalCommand(approvalText);

  // OK/NO must beat any ongoing memory session. Revision text remains a LINE
  // command first so `修正 FG-...: 新本文` edits the draft instead of only
  // marking it needs_revision.
  if (parsed && parsed.response !== "revision") {
    return handleParsedApproval(parsed, okShortcutUsed);
  }

  const lineCommand = await executeLineCommand(text, { userId });
  if (lineCommand.handled) return { ...lineCommand };

  if (parsed) return handleParsedApproval(parsed, okShortcutUsed);

  return {
    ok: false,
    message: fallbackMessage(),
  };
}
