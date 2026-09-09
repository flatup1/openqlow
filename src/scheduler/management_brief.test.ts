import assert from "node:assert/strict";
import { appendFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { executeTrialKpiCommand } from "../commands/trial_kpi.js";
import { buildManagementBrief } from "./management_brief.js";

const NOW = new Date("2026-08-13T00:00:00.000Z");

{
  const vault = await mkdtemp(path.join(tmpdir(), "openqlow-management-brief-"));
  const logDir = path.join(vault, "01_DAILY_OPERATIONS", "daily_logs");
  await mkdir(logDir, { recursive: true });
  await appendFile(path.join(logDir, "2026-08-12.md"), [
    "## LINE自動メモ 2026-08-12T21:00:00.000Z",
    "- source: LINE",
    "- status: CONSIDERING",
    "- capture: automatic",
    "",
    "検討: レディース体験会を月1回にする",
    "",
    "## LINE自動メモ 2026-08-12T22:00:00.000Z",
    "- source: LINE",
    "- status: DECIDED",
    "- capture: automatic",
    "",
    "決定: 朝の要約は6時にする",
    "",
    "## 関係のない後続セクション",
    "この本文はLINEメモには含めない",
    "",
  ].join("\n"), "utf8");

  await executeTrialKpiCommand("予約 山田 T. 8/13", { vaultRoot: vault, now: NOW });
  await executeTrialKpiCommand("体験完了 山田 T. 入会 紹介", { vaultRoot: vault, now: NOW });
  const brief = await buildManagementBrief(vault, "2026-08-13", NOW);

  assert.match(brief, /【前回】/);
  assert.match(brief, /【現在】/);
  assert.match(brief, /月間体験完了: 1\/30件/);
  assert.match(brief, /流入: LINE 0 \/ Google 0 \/ SNS 0 \/ 紹介 1/);
  assert.match(brief, /【今日】\n- 月間体験完了30件/);
  assert.match(brief, /【正式決定】\n- 決定: 朝の要約は6時にする/);
  assert.match(brief, /【保留・実装中】\n- \[CONSIDERING\] 検討: レディース体験会を月1回にする/);
  assert.match(brief, /【今やらなくていいこと】/);
  assert.match(brief, /根拠: Obsidian日次ログ \/ 体験予約・入会管理/);
  assert.doesNotMatch(brief, /関係のない後続セクション/);
  assert.doesNotMatch(brief, /この本文はLINEメモには含めない/);

  await rm(vault, { recursive: true, force: true });
}

{
  const vault = await mkdtemp(path.join(tmpdir(), "openqlow-management-brief-empty-"));
  const brief = await buildManagementBrief(vault, "2026-08-13", NOW);
  assert.match(brief, /前回】\n- 記録なし/);
  assert.match(brief, /月間体験完了: 0\/30件/);
  assert.match(brief, /約10件\/月（2026-08-23、JIN自己申告/);
  assert.match(brief, /入会率: 未集計/);
  assert.match(brief, /正式決定なし/);
  await rm(vault, { recursive: true, force: true });
}

console.log("management brief tests passed");
