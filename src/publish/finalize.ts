import { createBrowserPanel } from "./browser_panel.js";
import { runFinalPublish } from "./final_publish.js";
import { publishExtraPlatforms } from "./extra_publish.js";
import { approveRecord } from "../scheduler/daily.js";
import { loadRecord } from "../state/file_store.js";

export interface FinalizeResult {
  ok: boolean;
  id: string;
  published: string[];
  message: string;
}

/**
 * 承認済み候補を実際に投稿する一本道。
 * - approveRecord で下書き保存＋投稿キュー作成
 * - createBrowserPanel で Google / LINE VOOM 用パネル（iPhoneで開けるURL）
 * - runFinalPublish（Threads ほかAPI媒体）＋ publishExtraPlatforms（X / Instagram）
 * postId/tweetId が取れたものだけ「投稿済み」と報告し、失敗・未対応は正直に「未投稿」に出す。
 * 鍵・トークンはログ・返信に出さない。
 */
export async function finalizePublish(root: string, id: string): Promise<FinalizeResult> {
  // approveRecord は `OK <id>` 形式の承認文を要求するため、内部的に合成して呼ぶ。
  const savedFiles = await approveRecord(id, `OK ${id} all`);

  let panel: string | undefined;
  try {
    panel = await createBrowserPanel(root, id);
  } catch (error) {
    console.error("[finalize] panel failed:", error instanceof Error ? error.message : String(error));
  }

  const published: string[] = [];
  const queued: string[] = [];
  const skipped: string[] = [];

  try {
    const result = await runFinalPublish(root, id);
    for (const item of result.published) published.push(`${item.destination}: ${item.externalId}`);
    for (const job of result.browserQueued) queued.push(job.destination);
    for (const item of result.skipped) skipped.push(`${item.destination}: ${item.reason}`);
  } catch (error) {
    console.error("[finalize] final-publish failed:", error instanceof Error ? error.message : String(error));
  }

  const record = await loadRecord(root, id);
  if (record) {
    try {
      const extra = await publishExtraPlatforms({ record });
      for (const item of extra.published) published.push(`${item.platform}: ${item.externalId}`);
      for (const item of extra.skipped) skipped.push(`${item.platform}: ${item.reason}`);
    } catch (error) {
      console.error("[finalize] extra-publish failed:", error instanceof Error ? error.message : String(error));
    }
  }

  const message = [
    published.length
      ? "OPENQLOW: 自動投稿しました ✅（投稿できたものだけ）"
      : "OPENQLOW: 投稿準備キューを作りました。外部投稿はまだしていません。",
    `ID: ${id}`,
    published.length ? `投稿済み: ${published.join(" / ")}` : "",
    queued.length ? `手動投稿（パネルから本文コピー）: ${queued.join(" / ")}` : "",
    skipped.length ? `未投稿: ${skipped.join(" / ")}` : "",
    panel ? `📋 投稿パネル（タップで開く）:\n${panel}` : "",
    "Googleビジネス / LINE VOOM はパネルを開き、本文をコピー→各アプリに貼って投稿してください。",
  ].filter(Boolean).join("\n");

  return { ok: true, id, published, message };
}

/** 投稿候補に出す写真選択プロンプト。 */
export function photoPromptMessage(id: string): string {
  return [
    "OPENQLOW: 内容OKです。最後に写真を選んでください 📸",
    `ID: ${id}`,
    "",
    "・一覧から選ぶ: 画像1 / 画像2",
    "・自分の写真を使う: そのままLINEに写真を送る",
    "・写真なしで投稿: 画像なし（または もう一度 ok）",
    "",
    "選んだら、そのまま Threads・X に自動投稿します。",
  ].join("\n");
}
