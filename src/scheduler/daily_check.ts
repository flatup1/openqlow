import { pathToFileURL } from "node:url";
import { pushLineMessage } from "../line_bot/notifier.js";

export function formatDailyCheckPrompt(): string {
  return [
    "【OPENQLOW Daily Check】",
    "おはようございます。",
    "昨日のFLATUPを1通で送ってください。",
    "",
    "例：",
    "体験 ひかりちゃん1名",
    "入会予定あり",
    "気になる会員 森田さん",
    "口コミ レディースと全会員",
    "今日やること 広告を打つ",
    "",
    "「なし」だけでもOKです。",
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
