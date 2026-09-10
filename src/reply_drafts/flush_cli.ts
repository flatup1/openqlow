// 保留になっている通知を、いま流す。
//
//   npm run reply-drafts:flush
//
// 静音時間（22:00〜翌7:00）にたまった下書きを、朝まとめて1回だけJINへ届ける。
// 通常はその朝いちばんの問い合わせで自動的に流れるが、問い合わせが1件も来ない朝でも
// 取りこぼさないよう、手で叩ける入口を用意しておく。
//
// 新しいスケジューラは足さない。定時実行（launchd / systemd）に載せるのは Phase 2。
//
// お客様へは何も送らない。送る先はJINだけ。

import { loadReplyDraftConfig } from "./config.js";
import { flushPendingNotifications } from "./notify.js";

const config = loadReplyDraftConfig();

if (config.mode !== "live") {
  console.log(`[reply-drafts] mode=${config.mode} のため何もしません。`);
  process.exit(0);
}

const result = await flushPendingNotifications(config.root, new Date(), config);

if (result.notified) {
  console.log(`[reply-drafts] 保留 ${result.notifiedCount}件 をJINへ通知しました。`);
} else if (result.reason === "quiet_hours") {
  console.log("[reply-drafts] 静音時間のため通知しません（下書きは保存済みです）。");
} else if (result.reason === "push_failed") {
  console.error(`[reply-drafts] 通知に失敗しました。保留 ${result.queuedCount}件 はそのまま残しています。`);
  process.exit(1);
} else {
  console.log("[reply-drafts] 保留はありません。");
}
