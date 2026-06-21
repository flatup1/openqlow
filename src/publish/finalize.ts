import { createBrowserPanel } from "./browser_panel.js";
import { runFinalPublish } from "./final_publish.js";
import { publishExtraPlatforms } from "./extra_publish.js";
import { approveRecord } from "../scheduler/daily.js";
import { loadRecord } from "../state/file_store.js";

import type { QuickReplyItem } from "../line_bot/reply.js";

export interface FinalizeResult {
  ok: boolean;
  id: string;
  published: string[];
  message: string;
  quickReplies?: QuickReplyItem[];
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

  // 返信は短く。詳細（ID・コマンド）は出さず、操作は下のボタンに寄せる。
  const message = [
    published.length
      ? "✅ 自動投稿しました（" + published.map(p => p.split(":")[0]).join(" / ") + "）"
      : "📝 投稿準備しました（外部への自動投稿はまだです）",
    skipped.length ? `未投稿: ${skipped.join(" / ")}` : "",
    panel ? "Googleビジネス / LINE VOOM は下の「パネルを開く」から本文をコピーして投稿してください。" : "",
  ].filter(Boolean).join("\n");

  const quickReplies: QuickReplyItem[] = [];
  if (panel) quickReplies.push({ label: "📋 パネルを開く", uri: panel });

  return { ok: true, id, published, message, quickReplies: quickReplies.length ? quickReplies : undefined };
}

/** 写真選択プロンプト（短く。操作は下のボタン）。previewCount=表示した候補画像の枚数。 */
export function photoPromptMessage(previewCount = 0): string {
  if (previewCount <= 0) {
    return [
      "📸 写真はどうしますか？",
      "使いたい写真があれば、このままLINEに送ってください。",
      "写真なしで出すなら下のボタンを押してください。",
    ].join("\n");
  }
  const order = previewCount === 1 ? "上の写真が「画像1」です" : `上の写真が順に「画像1」〜「画像${previewCount}」です`;
  return [
    "📸 写真はどれにしますか？",
    `${order}。下のボタンで選べます。`,
    "別の写真を使うなら、このままLINEに送ってください。",
    "選んだら Threads・X に自動投稿します。",
  ].join("\n");
}

/** 写真選択ボタン（表示中の候補枚数ぶんの画像N ＋ 写真なし）。 */
export function photoQuickReplies(previewCount = 0): QuickReplyItem[] {
  const items: QuickReplyItem[] = [];
  for (let i = 1; i <= previewCount; i += 1) {
    items.push({ label: `📷 画像${i}`, text: `画像 ${i}` });
  }
  items.push({ label: "写真なしで投稿", text: "画像なし" });
  return items;
}

/** 承認ボタン（これで投稿 / 修正 / やめる）。 */
export function approveQuickReplies(): QuickReplyItem[] {
  return [
    { label: "✅ これで投稿", text: "ok" },
    { label: "✏️ 修正", text: "修正" },
    { label: "❌ やめる", text: "NO" },
  ];
}
