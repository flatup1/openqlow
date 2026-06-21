import { parseApprovalCommand } from "../approval/command.js";
import { expandApprovalShortcut, expandRejectionShortcut, resolveLatestPendingId } from "../approval/shortcut.js";
import { applyBodyEdit, isUsableRevisionText } from "../approval/revise_content.js";
import { setAwaitingPublish, loadAwaitingPublish, clearAwaitingPublish } from "../approval/publish_gate.js";
import { rewriteDraftBody } from "../llm/rewrite.js";
import { loadConfig } from "../config.js";
import { createBrowserPanel } from "../publish/browser_panel.js";
import { finalizePublish, photoPromptMessage, photoQuickReplies, approveQuickReplies } from "../publish/finalize.js";
import { candidatePreviewUrls } from "../publish/media_library.js";
import { loadRecord, saveRecord } from "../state/file_store.js";
import { checkDraftSafety } from "../safety/check.js";
import { approveRecord, rejectRecord } from "../scheduler/daily.js";
import { executeLineCommand } from "./commands.js";

// ok の後の「写真の判断」を表すコマンド。これらが来たら自動投稿まで進める。
const MEDIA_DECISION_ACTIONS = new Set(["image_choice", "media_insert"]);

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
    const hasPublishDestinations = parsed.targets.some(target => target !== "drafts_only");
    if (!hasPublishDestinations) {
      const files = await approveRecord(parsed.id, parsed.raw);
      return {
        ok: true,
        action: "approved",
        id: parsed.id,
        saved: files,
        message: ["OPENQLOW: 下書きを保存しました。", `ID: ${parsed.id}`].join("\n"),
      };
    }

    // 明示の「OK <id> all」（ショートカットでない）は従来どおりパネルのみ（自動投稿しない）。
    if (!okShortcutUsed) {
      const files = await approveRecord(parsed.id, parsed.raw);
      let panel: string | undefined;
      try {
        panel = await createBrowserPanel(config.root, parsed.id);
      } catch (error) {
        console.error("[panel] failed:", error instanceof Error ? error.message : String(error));
      }
      const message = [
        "OPENQLOW: 投稿準備キューを作りました。",
        `ID: ${parsed.id}`,
        panel ? `📋 投稿パネル（タップで開く）:\n${panel}` : "",
      ].filter(Boolean).join("\n");
      return { ok: true, action: "approved", id: parsed.id, saved: files, panel, message };
    }

    // 素の「ok」: 写真ゲート。
    // 写真の判断がまだ（mediaFiles 未設定）なら投稿せず、写真を聞いて停止する。
    // 写真の判断済み（画像N / 画像なし）か、2回目のok なら投稿を実行する。
    const record = await loadRecord(config.root, parsed.id);
    const mediaDecided = record?.mediaFiles !== undefined;
    const awaiting = await loadAwaitingPublish(config.root);
    if (!mediaDecided && awaiting?.id !== parsed.id) {
      await setAwaitingPublish(config.root, parsed.id);
      // 候補写真を実際に表示してから選ばせる（「画像1が何か分からない」を解消）。
      const previews = await candidatePreviewUrls(process.env, 3);
      return {
        ok: true,
        action: "awaiting_media",
        id: parsed.id,
        message: photoPromptMessage(previews.length),
        quickReplies: photoQuickReplies(previews.length),
        images: previews,
      };
    }

    await clearAwaitingPublish(config.root);
    const result = await finalizePublish(config.root, parsed.id);
    return { ok: result.ok, action: "approved", id: parsed.id, published: result.published, message: result.message, quickReplies: result.quickReplies };
  }

  if (parsed.response === "revision") {
    // id 省略時は直近の承認待ち候補を対象に、本文をそのまま差し替える。
    const id = parsed.id || (await resolveLatestPendingId(config.root)) || "";
    if (!id) {
      return { ok: false, message: "直せる投稿候補が見つかりませんでした。先に「投稿」で候補を作ってください。" };
    }
    if (!isUsableRevisionText(parsed.note ?? "")) {
      return { ok: false, message: ["何をどう直しますか？", "例: 修正 もっとやさしい雰囲気で"].join("\n") };
    }
    const record = await loadRecord(config.root, id);
    if (!record) {
      return { ok: false, message: `投稿候補が見つかりませんでした: ${id}` };
    }

    // 指示モード: 送られた文章は「新本文」ではなく「書き直しの指示」。
    // ローカルLLM(Ollama)で今の本文を指示どおり書き直す。
    // 失敗時は本文を一切書き換えず正直に伝える（変な本文の投稿事故を防ぐ）。
    const baseDraft = record.drafts.find(draft => draft.platform === "threads") ?? record.drafts[0];
    const currentBody = baseDraft?.body ?? "";
    const rewrite = await rewriteDraftBody({ currentBody, instruction: parsed.note ?? "" });
    if (!rewrite.ok) {
      return {
        ok: false,
        action: "revise_failed",
        id,
        message: [
          "OPENQLOW: うまく直せませんでした（本文は変えていません）。",
          `理由: ${rewrite.reason}`,
          "もう一度「修正 〇〇」で試すか、全文を自分で書くなら本文をそのまま送ってください。",
        ].join("\n"),
      };
    }

    const edited = applyBodyEdit(record, rewrite.body);
    await saveRecord(config.root, edited);
    const safety = checkDraftSafety(edited.drafts.map(draft => draft.body).join("\n\n"));
    // 確認メッセージには「AIが書き直した新しい本文」を出す（指示文ではない）。下のボタンで操作。
    const message = safety.ok
      ? ["✏️ 直しました。これでいいですか？", "", rewrite.body].join("\n")
      : ["直しましたが安全チェックに引っかかりました。", safety.issues.map(issue => issue.message).join(" / "), "もう一度「修正 〇〇」で直してください。"].join("\n");
    return { ok: true, action: "revised", id, message, quickReplies: safety.ok ? approveQuickReplies() : undefined };
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

  // OK / NO / 修正 などの承認コマンドは、進行中の日報セッションより先に処理する。
  // （特に「修正 <新本文>」は本文編集なので、memory keeper に日報として保存されないようにする）
  if (parsed) {
    return handleParsedApproval(parsed, okShortcutUsed);
  }

  const lineCommand = await executeLineCommand(text, { userId });
  if (lineCommand.handled) {
    // 「ok → 写真を選ぶ」の後の画像選択なら、添付に続けてそのまま自動投稿まで進める。
    if (lineCommand.ok && typeof lineCommand.action === "string" && MEDIA_DECISION_ACTIONS.has(lineCommand.action)) {
      const awaiting = await loadAwaitingPublish(config.root);
      const targetId = (lineCommand.meta as { id?: string } | undefined)?.id ?? awaiting?.id;
      if (awaiting && targetId === awaiting.id) {
        await clearAwaitingPublish(config.root);
        const result = await finalizePublish(config.root, awaiting.id);
        return { ...lineCommand, action: "approved", id: awaiting.id, published: result.published, message: result.message, quickReplies: result.quickReplies };
      }
    }
    return { ...lineCommand };
  }

  return {
    ok: false,
    message: fallbackMessage(),
  };
}
