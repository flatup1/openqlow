import assert from "node:assert/strict";
import path from "node:path";
import type { ApplyResult } from "./apply.js";
import { loadCleanupConfig } from "./config.js";
import type { CleanupPlan } from "./plan.js";
import { buildCleanupLineMessage, buildCleanupLog, formatBytes, summariseCleanup } from "./report.js";

const HOME = "/Users/test";
const CONFIG = loadCleanupConfig({}, HOME);
const DESKTOP = path.join(HOME, "Desktop");

const plan: CleanupPlan = {
  dateJst: "2026-09-01",
  moves: [
    {
      kind: "organize",
      from: path.join(DESKTOP, "写真.png"),
      to: path.join(CONFIG.organizedRoot, "2026", "08", "画像", "写真.png"),
      category: "image",
      reason: "10日触っていない",
      size: 2048,
    },
    {
      kind: "organize",
      from: path.join(DESKTOP, "資料.pdf"),
      to: path.join(CONFIG.organizedRoot, "2026", "08", "書類", "資料.pdf"),
      category: "document",
      reason: "5日触っていない",
      size: 4096,
    },
    {
      kind: "trash",
      from: path.join(DESKTOP, ".DS_Store"),
      to: path.join(CONFIG.quarantineRoot, "2026-09-01", ".DS_Store"),
      category: "other",
      reason: "システムの残骸・未完了ファイル",
      size: 6148,
    },
  ],
  purges: [
    { path: path.join(CONFIG.quarantineRoot, "2026-07-01", "古い.tmp"), ageDays: 62, size: 1024 * 1024, source: "quarantine" },
  ],
  keptCount: 4,
  errors: [],
};

const result: ApplyResult = {
  dryRun: false,
  organized: [
    { ok: true, from: plan.moves[0].from, to: plan.moves[0].to },
    { ok: false, from: plan.moves[1].from, to: plan.moves[1].to, error: "権限がありません" },
  ],
  trashed: [{ ok: true, from: plan.moves[2].from, to: plan.moves[2].to }],
  purged: [{ ok: true, from: plan.purges[0].path }],
  backup: { available: true, copied: 3, skipped: 12, bytes: 5 * 1024 * 1024, errors: [] },
  errors: [],
};

// 大きさは人が読める形に。
{
  assert.equal(formatBytes(512), "512B");
  assert.equal(formatBytes(2048), "2.0KB");
  assert.equal(formatBytes(5 * 1024 * 1024), "5.0MB");
}

// 集計。失敗した1件は「整頓できた件数」に入れない。
{
  const summary = summariseCleanup(plan, result, CONFIG);
  assert.equal(summary.organizedCount, 1);
  assert.equal(summary.trashedCount, 1);
  assert.equal(summary.purgedCount, 1);
  assert.equal(summary.purgedBytes, 1024 * 1024);
  assert.equal(summary.keptCount, 4);
  assert.deepEqual(summary.categoryCounts, { 画像: 1 });
  assert.equal(summary.failures.length, 1);
  assert.equal(summary.failures[0].message, "権限がありません");
}

// LINEは結論だけ。件数、外付けの状態、戻し方が分かること。
{
  const summary = summariseCleanup(plan, result, CONFIG);
  const message = buildCleanupLineMessage(summary);
  assert.match(message, /【ゴミ収集クリーン】2026-09-01/);
  assert.match(message, /整頓 1件 \/ ゴミ箱待ちへ 1件/);
  assert.match(message, /内訳: 画像1/);
  assert.match(message, /外付け保存 3件/);
  assert.match(message, /完全削除 1件/);
  assert.match(message, /30日は消えません/);
  assert.match(message, /うまくいかなかったもの: 1件/);
  assert.doesNotMatch(message, /お試し実行/);
  assert.ok(message.length <= 5000, "LINEの上限を超えない");
}

// お試し実行のときは、その旨をいちばん上に出す。誤解させない。
{
  const summary = summariseCleanup(plan, { ...result, dryRun: true }, CONFIG);
  const message = buildCleanupLineMessage(summary);
  assert.match(message, /お試し実行です。ファイルはまだ動かしていません。/);
}

// つながっているのにコピーが0件のときは、理由をそのまま出す。
{
  const summary = summariseCleanup(
    plan,
    { ...result, backup: { available: true, reason: "整頓済みフォルダがまだありません", copied: 0, skipped: 0, bytes: 0, errors: [] } },
    CONFIG,
  );
  assert.match(buildCleanupLineMessage(summary), /外付け保存 追加なし（整頓済みフォルダがまだありません）/);

  const same = summariseCleanup(
    plan,
    { ...result, backup: { available: true, copied: 0, skipped: 8, bytes: 0, errors: [] } },
    CONFIG,
  );
  assert.match(buildCleanupLineMessage(same), /外付け保存 追加なし（すでに同じ内容）/);
}

// 外付けがつながっていないときは、理由をそのまま出す。
{
  const summary = summariseCleanup(
    plan,
    { ...result, backup: { available: false, reason: "外付けドライブが見つかりません（未接続）", copied: 0, skipped: 0, bytes: 0, errors: [] } },
    CONFIG,
  );
  const message = buildCleanupLineMessage(summary);
  assert.match(message, /外付け保存 スキップ（外付けドライブが見つかりません（未接続））/);
}

// 電話番号やメールがファイル名に入っていても、通知には出さない。
{
  const withPii: CleanupPlan = {
    ...plan,
    moves: [{ ...plan.moves[0], from: path.join(DESKTOP, "090-1234-5678のメモ.png") }],
  };
  const piiResult: ApplyResult = {
    ...result,
    organized: [{ ok: false, from: withPii.moves[0].from, error: "test@example.com は読めません" }],
    trashed: [],
    purged: [],
  };
  const summary = summariseCleanup(withPii, piiResult, CONFIG);
  const message = buildCleanupLineMessage(summary);
  const log = buildCleanupLog(summary, withPii, piiResult);
  assert.doesNotMatch(log, /090-1234-5678/);
  assert.doesNotMatch(log, /test@example\.com/);
  assert.doesNotMatch(message, /090-1234-5678/);
}

// ログは1件ずつ。どこへ行ったか、なぜ動かせなかったかが残る。
{
  const summary = summariseCleanup(plan, result, CONFIG);
  const log = buildCleanupLog(summary, plan, result);
  assert.match(log, /# ゴミ収集クリーン 2026-09-01/);
  assert.match(log, /本番実行/);
  assert.match(log, /OK 写真\.png →/);
  assert.match(log, /NG\(権限がありません\) 資料\.pdf/);
  assert.match(log, /OK \.DS_Store（システムの残骸・未完了ファイル）/);
  assert.match(log, /OK 古い\.tmp（ゴミ箱待ち \/ 62日経過 \/ 1\.0MB）/);
  assert.match(log, /## うまくいかなかったもの/);
}

console.log("cleanup report tests passed");
