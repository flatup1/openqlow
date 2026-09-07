import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = relative => readFile(path.join(root, relative), "utf8");

const [concierge, coordination, journeyGuide, envExample, webhook] = await Promise.all([
  read("flatup-webos/app/js/concierge.js"),
  read("COORDINATION.md"),
  read("docs/webos_line_journey.md"),
  read("deploy/openqlow.vps.env.example"),
  read("src/line_bot/webhook.ts"),
]);

assert.match(
  concierge,
  /PROD_JOURNEY_ENDPOINT = "https:\/\/aika\.flatupnarita\.jp\/journey"/,
  "WebOSの本番journeyはAIKA公開URLだけを使う",
);
assert.match(coordination, /openQLOW VPS \| `162\.43\.41\.182`/, "openQLOW VPSの正しいIPを保持する");
assert.match(coordination, /AIKA VPS \| `162\.43\.90\.71`/, "AIKA VPSの正しいIPを保持する");
assert.match(coordination, /WebOS journey本番.*aika\.flatupnarita\.jp\/journey/, "journeyの正本を明示する");
assert.match(journeyGuide, /openQLOW VPS `162\.43\.41\.182` へjourneyを反映・公開しません/, "運用ガイドで誤配備を禁止する");
assert.doesNotMatch(journeyGuide, /proxy_pass http:\/\/127\.0\.0\.1:8787\/journey/, "openQLOW nginxへのjourney中継を案内しない");
assert.match(envExample, /OPENQLOW_ENABLE_WEBOS_JOURNEY=false/, "openQLOW待機実装は既定で無効にする");
assert.match(webhook, /OPENQLOW_ENABLE_WEBOS_JOURNEY === "true"/, "待機実装は明示設定なしに動かさない");

console.log("VPS role guard tests passed");
