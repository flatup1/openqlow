#!/usr/bin/env node
import { createSiteAdapter, runSiteAdapter } from "./lib/site_adapter.mjs";

export const googleBusinessAdapter = createSiteAdapter({
  destination: "google_business",
  label: "Googleビジネス",
  defaultUrl: "https://business.google.com/",
  steps: [
    "Googleビジネスプロフィールが正しい店舗になっているか見る",
    "「最新情報を追加」または投稿作成画面を開く",
    "本文を貼り付け、内容に違和感がないか見る",
    "画面上で投稿まで完了する",
  ],
});

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = await runSiteAdapter({ adapter: googleBusinessAdapter });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
