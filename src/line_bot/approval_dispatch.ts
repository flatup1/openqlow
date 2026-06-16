import { parseApprovalCommand } from "../approval/command.js";
import { expandApprovalShortcut, expandRejectionShortcut, resolveLatestPendingId } from "../approval/shortcut.js";
import { applyBodyEdit, isUsableRevisionText } from "../approval/revise_content.js";
import { rewriteDraftBody } from "../llm/rewrite.js";
import { loadConfig } from "../config.js";
import { createBrowserPanel } from "../publish/browser_panel.js";
import { runFinalPublish } from "../publish/final_publish.js";
import { publishExtraPlatforms } from "../publish/extra_publish.js";
import { loadRecord, saveRecord } from "../state/file_store.js";
import { checkDraftSafety } from "../safety/check.js";
import { approveRecord, rejectRecord } from "../scheduler/daily.js";
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

    // X / Instagram（キーがあれば自動投稿）。Threadsと同じ本文＋写真を使う。
    if (okShortcutUsed) {
      const record = await loadRecord(config.root, parsed.id);
      if (record) {
        try {
          const extra = await publishExtraPlatforms({ record });
          for (const item of extra.published) published.push(`${item.platform}: ${item.externalId}`);
          for (const item of extra.skipped) skipped.push(`${item.platform}: ${item.reason}`);
        } catch (error) {
          console.error("[extra-publish] failed:", error instanceof Error ? error.message : String(error));
        }
      }
    }

    const message = [
      published.length
        ? "OPENQLOW: 自動投稿しました ✅（投稿できたものだけ）"
        : "OPENQLOW: 投稿準備キューを作りました。外部投稿はまだしていません。",
      `ID: ${parsed.id}`,
      published.length ? `投稿済み: ${published.join(" / ")}` : "",
      queued.length ? `手動投稿（パネルから本文コピー）: ${queued.join(" / ")}` : "",
      skipped.length ? `未投稿: ${skipped.join(" / ")}` : "",
      panel ? `📋 投稿パネル（タップで開く）:\n${panel}` : "",
      "Googleビジネス / LINE VOOM はパネルを開き、本文をコピー→各アプリに貼って投稿してください。",
    ].filter(Boolean).join("\n");

    return { ok: true, action: "approved", id: parsed.id, saved: files, panel, published, message };
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
    // 確認メッセージには「AIが書き直した新しい本文」を出す（指示文ではない）。
    const message = safety.ok
      ? ["OPENQLOW: 下書きを直しました。これでいいですか？", `ID: ${id}`, "", rewrite.body, "", "OK / さらに修正 〇〇 / NO"].join("\n")
      : ["OPENQLOW: 直しましたが、安全チェックに引っかかりました。", safety.issues.map(issue => issue.message).join(" / "), "もう一度「修正 〇〇」で直してください。"].join("\n");
    return { ok: true, action: "revised", id, message };
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
  if (lineCommand.handled) return { ...lineCommand };

  return {
    ok: false,
    message: fallbackMessage(),
  };
}
