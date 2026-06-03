import { pathToFileURL } from "node:url";
import { pushLineMessage } from "../line_bot/notifier.js";

export function formatDailyCheckPrompt(): string {
  return [
    "【OPENQLOW Daily Check】",
    "おはようございます。",
    "昨日のFLATUP GYMを整理します。",
    "",
    "このまま1回でまとめて返信してください。",
    "分かるところだけでOKです。空欄や「なし」も大丈夫です。",
    "",
    "1. 昨日の体験：",
    "2. 入会：",
    "3. 返信・フォローが必要な人：",
    "4. 気になる会員：",
    "5. 休みがち・退会しそうな人：",
    "6. 今日の最優先タスク：",
    "",
    "AIは決めません。OPENQLOWが聞いて、整理して、Obsidianに残します。",
  ].join("\n");
}

export async function runDailyCheck(): Promise<{
  ok: boolean;
  mode: "dry_run" | "sent" | "skipped";
  error?: string;
}> {
  return pushLineMessage(formatDailyCheckPrompt());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runDailyCheck();
  console.log(`[daily-check] ${result.mode}: ${result.ok ? "ok" : "failed"}`);
  if (!result.ok) {
    console.error(result.error ?? "unknown error");
    process.exit(1);
  }
}
