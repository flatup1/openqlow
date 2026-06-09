import type { PublishTarget } from "../approval/command.js";

// 携帯のLINEから最短で複数サイトに投稿するためのアシスト文を組み立てる。
// Threads は API 自動投稿（成功時）。API が無い Google/VOOM はコピー用本文＋リンクで補助。
// 「投稿できていないのに成功扱いしない」を守り、Threads は postId が取れた時だけ「投稿しました」。

/** Threads の本文プリフィル投稿リンク（タップで本文入りの投稿画面が開く）。 */
export function buildThreadsIntentUrl(text: string): string {
  return `https://www.threads.net/intent/post?text=${encodeURIComponent(text)}`;
}

export interface PostAssistInput {
  body: string;
  targets: PublishTarget[];
  /** Threads を API 自動投稿できた場合の postId。失敗/未投稿なら undefined。 */
  threadsPostId?: string;
  /** 添付メディアがある場合は true（各アプリで手動添付が必要、と案内する）。 */
  hasMedia?: boolean;
}

/** ok 後に LINE へ返す「最短投稿アシスト」メッセージを組み立てる。 */
export function buildPostAssistMessage(input: PostAssistInput): string {
  const want = new Set(input.targets);
  const lines: string[] = ["OPENQLOW: 投稿の準備ができました📲", ""];

  lines.push("本文（コピー用）:", input.body, "");

  if (want.has("threads")) {
    if (input.threadsPostId) {
      lines.push(`【Threads】✅ 自動投稿しました（id: ${input.threadsPostId}）`);
    } else {
      lines.push("【Threads】タップで本文入り → 投稿:", buildThreadsIntentUrl(input.body));
    }
  }
  if (want.has("google_business")) {
    lines.push("【Google ビジネス】開いて本文を貼り付け → 投稿:", "https://business.google.com/posts");
  }
  if (want.has("line_voom")) {
    lines.push("【LINE VOOM】LINEの「VOOM」で本文を貼り付け → 投稿");
  }

  lines.push("");
  if (input.hasMedia) {
    lines.push("※ 写真/動画は各アプリで手動で添付してください（自動添付はできません）。");
  }
  lines.push("Threads 以外は、本文を貼り付けて投稿してください。");
  return lines.join("\n");
}
