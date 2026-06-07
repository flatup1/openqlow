#!/usr/bin/env node
import { createSiteAdapter, runSiteAdapter } from "./lib/site_adapter.mjs";

export const lineVoomAdapter = createSiteAdapter({
  destination: "line_voom",
  label: "LINE VOOM",
  defaultUrl: "https://manager.line.biz/",
  steps: [
    "LINE Official Account Managerで正しいアカウントになっているか見る",
    "VOOM投稿画面を開く",
    "本文を貼り付け、内容に違和感がないか見る",
    "画面上で投稿まで完了する",
  ],
});

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = await runSiteAdapter({ adapter: lineVoomAdapter });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
