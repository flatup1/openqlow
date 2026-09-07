import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { executeTrialKpiCommand, readTrialKpiSummary, readTrialRecords } from "./trial_kpi.js";

const NOW = new Date("2026-08-13T00:00:00.000Z");

{
  const vault = await mkdtemp(path.join(tmpdir(), "openqlow-trial-kpi-"));

  const reservation = await executeTrialKpiCommand("予約 山田 太郎 8/20", { vaultRoot: vault, now: NOW });
  assert.equal(reservation?.ok, true);
  assert.equal(reservation?.summary?.bookings, 1);
  assert.match(reservation?.message ?? "", /TRIAL-20260813-001/);

  const duplicate = await executeTrialKpiCommand("予約 山田 太郎 8/20", { vaultRoot: vault, now: NOW });
  assert.equal(duplicate?.ok, true);
  assert.match(duplicate?.message ?? "", /登録済み/);
  assert.equal((await readTrialRecords(vault)).length, 1, "同じ予約を二重計上しない");

  const prematureEnrollment = await executeTrialKpiCommand("入会 山田 太郎", { vaultRoot: vault, now: NOW });
  assert.equal(prematureEnrollment?.ok, false);
  assert.match(prematureEnrollment?.message ?? "", /先に `参加/);

  const attended = await executeTrialKpiCommand("参加 山田 太郎", { vaultRoot: vault, now: NOW });
  assert.equal(attended?.ok, true);
  assert.equal(attended?.summary?.completed, 1);

  const enrolled = await executeTrialKpiCommand("入会 山田 太郎", { vaultRoot: vault, now: NOW });
  assert.equal(enrolled?.ok, true);
  assert.equal(enrolled?.summary?.enrolled, 1);
  assert.equal(enrolled?.summary?.enrollmentRate, 1);

  const summary = await executeTrialKpiCommand("体験集計", { vaultRoot: vault, now: NOW });
  assert.match(summary?.message ?? "", /月間体験完了: 1\/30件/);
  assert.match(summary?.message ?? "", /入会率: 100\.0%/);

  const oneShot = await executeTrialKpiCommand("体験完了 佐藤 H. 検討 SNS", { vaultRoot: vault, now: NOW });
  assert.equal(oneShot?.ok, true);
  assert.equal(oneShot?.summary?.completed, 2);
  assert.equal(oneShot?.summary?.sourceBreakdown.SNS, 1);
  const oneShotRecord = (await readTrialRecords(vault)).find(record => record.displayName === "佐藤 H.");
  assert.equal(oneShotRecord?.enrollment, "検討");
  assert.equal(oneShotRecord?.acquisitionSource, "SNS");

  const tracker = await readFile(path.join(vault, "01_DAILY_OPERATIONS", "体験予約・入会管理.md"), "utf8");
  assert.match(tracker, /このファイルが体験完了・入会・流入経路の正本/);
  assert.match(tracker, /山田 ★\./);
  assert.doesNotMatch(tracker, /山田 太郎/);
  assert.match(tracker, /入会者数 ÷ 体験完了数/);
  assert.match(tracker, /\| SNS \|/);

  await rm(vault, { recursive: true, force: true });
}

{
  const vault = await mkdtemp(path.join(tmpdir(), "openqlow-trial-kpi-invalid-"));
  const invalid = await executeTrialKpiCommand("予約 佐藤 2/30", { vaultRoot: vault, now: NOW });
  assert.equal(invalid?.ok, false, "存在しない日付は登録しない");
  const records = await readTrialRecords(vault);
  assert.equal(records.length, 0, "存在しない日付を実績データにしない");

  const emptyVault = await mkdtemp(path.join(tmpdir(), "openqlow-trial-kpi-empty-"));
  const empty = await readTrialKpiSummary(emptyVault, NOW);
  assert.equal(empty.enrollmentRate, null);
  assert.equal(empty.targetCompleted, 30);

  await rm(vault, { recursive: true, force: true });
  await rm(emptyVault, { recursive: true, force: true });
}

{
  const vault = await mkdtemp(path.join(tmpdir(), "openqlow-trial-kpi-corrupt-"));
  const tracker = path.join(vault, "01_DAILY_OPERATIONS", "体験予約・入会管理.md");
  await mkdir(path.dirname(tracker), { recursive: true });
  const malformed = "| TRIAL-20260813-001 | 山田 T. | 2026-08-13 | 2026-02-30 | 予約 | 未確認 | - | 2026-08-13 | LINE |\n";
  await writeFile(tracker, malformed, "utf8");

  await assert.rejects(
    executeTrialKpiCommand("予約 佐藤 8/20", { vaultRoot: vault, now: NOW }),
    /不正な記録行/,
  );
  assert.equal(await readFile(tracker, "utf8"), malformed, "不正な手動編集を検出したらファイルを上書きしない");
  await rm(vault, { recursive: true, force: true });
}

console.log("trial KPI tests passed");
