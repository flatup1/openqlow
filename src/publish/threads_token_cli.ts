import { pathToFileURL } from "node:url";
import { loadConfig } from "../config.js";
import {
  exchangeForLongLivedToken,
  getActiveThreadsToken,
  loadThreadsToken,
  needsRefresh,
  refreshLongLivedToken,
  saveThreadsToken,
} from "./threads_token.js";

// 使い方:
//   npm run threads:setup -- <短期トークン>   # 短期→長期に交換して保存（最初に1回）
//   npm run threads:refresh                   # 長期トークンを更新（systemd timer で定期実行）
//   npm run threads:status                    # 現在の保存状態を表示（トークンは出さない）
// THREADS_APP_SECRET を env に設定しておくこと。トークン・シークレットは出力しない。

function daysLeft(expiresAt: string): number {
  return Math.round((Date.parse(expiresAt) - Date.now()) / (24 * 60 * 60 * 1000));
}

async function main(): Promise<void> {
  const config = loadConfig();
  const command = process.argv[2];

  if (command === "setup") {
    const shortLivedToken = process.argv[3];
    const clientSecret = process.env.THREADS_APP_SECRET ?? "";
    if (!shortLivedToken) throw new Error("Usage: threads:setup -- <短期トークン>");
    if (!clientSecret) throw new Error("THREADS_APP_SECRET が未設定です");
    const { accessToken, expiresInSec } = await exchangeForLongLivedToken({ shortLivedToken, clientSecret });
    const stored = await saveThreadsToken(config.root, accessToken, expiresInSec);
    console.log(`✅ 長期トークンを保存しました（残り約${daysLeft(stored.expiresAt)}日）`);
    return;
  }

  if (command === "refresh") {
    const stored = await loadThreadsToken(config.root);
    if (!stored) {
      console.log("保存済みトークンがありません。先に threads:setup を実行してください。");
      return;
    }
    if (!needsRefresh(stored)) {
      console.log(`まだ更新不要です（残り約${daysLeft(stored.expiresAt)}日）`);
      return;
    }
    const { accessToken, expiresInSec } = await refreshLongLivedToken({ token: stored.accessToken });
    const updated = await saveThreadsToken(config.root, accessToken, expiresInSec);
    console.log(`✅ トークンを更新しました（残り約${daysLeft(updated.expiresAt)}日）`);
    return;
  }

  if (command === "status") {
    const stored = await loadThreadsToken(config.root);
    if (!stored) {
      console.log("保存済み長期トークン: なし（env の THREADS_ACCESS_TOKEN を使用）");
    } else {
      console.log(`保存済み長期トークン: あり（残り約${daysLeft(stored.expiresAt)}日, 取得 ${stored.obtainedAt}）`);
    }
    const active = await getActiveThreadsToken(config.root);
    console.log(`有効トークン: ${active ? "あり" : "なし"}`);
    return;
  }

  throw new Error("Usage: threads_token_cli.ts <setup|refresh|status>");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
