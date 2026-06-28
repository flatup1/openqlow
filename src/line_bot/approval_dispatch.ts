import { parseApprovalCommand } from "../approval/command.js";
import {
  describeHandledApprovalCandidate,
  expandApprovalShortcut,
  expandRejectionShortcut,
} from "../approval/shortcut.js";
import { loadConfig } from "../config.js";
import { createBrowserPanel } from "../publish/browser_panel.js";
import { runFinalPublish, type FinalPublishResult } from "../publish/final_publish.js";
import { approveRecord, rejectRecord, requestRevision } from "../scheduler/daily.js";
import { executeLineCommand } from "./commands.js";

// OPENQLOW_ENABLE_PUBLIC_POSTING=true の時、承認(OK)で実際にSNSへ投稿する。
// Threadsは即API投稿、Google/LINE VOOM等はMacブラウザ投稿ランナーへ積む。
function autoPublishEnabled(): boolean {
  return process.env.OPENQLOW_ENABLE_PUBLIC_POSTING === "true";
}

function formatAutoPublishMessage(id: string, result: FinalPublishResult): string {
  const lines = ["自動投稿しました ✅（投稿できたものだけ）", `ID: ${id}`];
  if (result.published.length) {
    lines.push(`投稿完了: ${result.published.map(p => p.destination).join(", ")} ✓`);
  }
  if (result.browserQueued.length) {
    lines.push(`ブラウザ投稿待ち（Mac投稿ランナーで実行）: ${result.browserQueued.map(j => j.destination).join(", ")}`);
  }
  if (result.skipped.length) {
    lines.push("投稿できなかったもの:");
    for (const s of result.skipped) lines.push(`- ${s.destination}: ${s.reason}`);
  }
  if (!result.published.length && !result.browserQueued.length && !result.skipped.length) {
    lines.push("（投稿先がありませんでした）");
  }
  return lines.join("\n");
}

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

    // 公開投稿が有効なら、ここで実際にSNSへ投稿する（Threadsは即API投稿）。
    if (hasPublishDestinations && autoPublishEnabled()) {
      const result = await runFinalPublish(config.root, parsed.id);
      return {
        ok: true,
        action: "published",
        id: parsed.id,
        saved: files,
        message: formatAutoPublishMessage(parsed.id, result),
      };
    }

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

  // bare「ok/やめる」だが直近候補はもう承認/却下済み → 無言で汎用fallbackに落とさず明示する。
  const handledNote = await describeHandledApprovalCandidate(text, config.root);
  if (handledNote) {
    return { ok: true, action: "already_handled", message: handledNote };
  }

  return {
    ok: false,
    message: fallbackMessage(),
  };
}
