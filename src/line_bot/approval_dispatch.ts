import { parseApprovalCommand } from "../approval/command.js";
import { expandApprovalShortcut, expandRejectionShortcut } from "../approval/shortcut.js";
import { loadConfig } from "../config.js";
import { createBrowserPanel } from "../publish/browser_panel.js";
import { runFinalPublish } from "../publish/final_publish.js";
import { approveRecord, rejectRecord, requestRevision } from "../scheduler/daily.js";
import { executeLineCommand } from "./commands.js";

function fallbackMessage(): string {
  return [
    "受け取りました。",
    "日報として残すなら、体験・入会・口コミ・今日やることを1通で送ってください。",
    "例: 体験ひかりちゃん1名 入会予定 今日やること広告",
    "投稿候補を作るなら「投稿」と送ってください。",
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
    if (!hasPublishDestinations) {
      return {
        ok: true,
        action: "approved",
        id: parsed.id,
        saved: files,
        message: ["OPENQLOW: 下書きを保存しました。", `ID: ${parsed.id}`].join("\n"),
      };
    }

    const panel = await createBrowserPanel(config.root, parsed.id);

    // 素の「ok」ショートカット時は自動投稿まで実行（API対応＝Threads。写真は公開URL経由）。
    // 明示の「OK <id> all」はパネルのみ（従来どおり）。
    // 投稿成功（postId取得）したものだけ「投稿済み」と報告し、失敗・未対応は正直に出す。
    let publish: Awaited<ReturnType<typeof runFinalPublish>> | undefined;
    if (okShortcutUsed) {
      try {
        publish = await runFinalPublish(config.root, parsed.id);
      } catch (error) {
        console.error("[final-publish] failed:", error instanceof Error ? error.message : String(error));
      }
    }

    const published = publish?.published.map(item => `${item.destination}: ${item.externalId}`) ?? [];
    const queued = publish?.browserQueued.map(job => job.destination) ?? [];
    const skipped = publish?.skipped.map(item => `${item.destination}: ${item.reason}`) ?? [];

    const message = [
      published.length
        ? "OPENQLOW: 自動投稿しました ✅（投稿できたものだけ）"
        : "OPENQLOW: 投稿準備キューを作りました。外部投稿はまだしていません。",
      `ID: ${parsed.id}`,
      published.length ? `投稿済み: ${published.join(" / ")}` : "",
      queued.length ? `ブラウザで投稿: ${queued.join(" / ")}（パネルから本文コピー）` : "",
      skipped.length ? `未投稿: ${skipped.join(" / ")}` : "",
      panel ? `ブラウザ投稿パネル: ${panel}` : "",
      "Googleビジネス / LINE VOOM はパネルから本文をコピーして投稿してください。",
    ].filter(Boolean).join("\n");

    return { ok: true, action: "approved", id: parsed.id, saved: files, panel, published, message };
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
