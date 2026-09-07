import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  DAILY_LOG_DIRECTORY,
  buildWeeklyReview,
  collectWeeklyMemos,
  datesInRange,
  executeWeeklyOrganizeCommand,
  extractTrialLines,
  isDecisionMemo,
  parseDailyLog,
  parseWeeklyOrganizeCommand,
  summariseWeek,
  weeklyReviewRelativePath,
} from "./weekly_organize.js";

const NOW = new Date("2026-08-16T03:00:00Z"); // JST 2026-08-16 12:00

// --- コマンド解釈 ---------------------------------------------------------

{
  const range = parseWeeklyOrganizeCommand("整理", NOW);
  assert.deepEqual(range, { start: "2026-08-10", end: "2026-08-16" }, "引数なしは直近7日");
}

{
  assert.ok(parseWeeklyOrganizeCommand("/整理", NOW), "スラッシュ付きも通る");
  assert.ok(parseWeeklyOrganizeCommand("せいり", NOW), "ひらがなも通る");
  assert.ok(parseWeeklyOrganizeCommand("organize", NOW), "英語も通る");
}

{
  const range = parseWeeklyOrganizeCommand("整理 先週", NOW);
  assert.deepEqual(range, { start: "2026-08-03", end: "2026-08-09" }, "先週は1週間前の7日");
}

{
  // 認識できない引数はコマンド扱いしない（普通のメモとして保存させる）
  assert.equal(parseWeeklyOrganizeCommand("整理 ロッカーを買う", NOW), undefined);
  assert.equal(parseWeeklyOrganizeCommand("整理したい棚がある", NOW), undefined);
  assert.equal(parseWeeklyOrganizeCommand("push", NOW), undefined);
}

{
  assert.equal(datesInRange({ start: "2026-08-10", end: "2026-08-16" }).length, 7);
}

// --- daily log の切り出し -------------------------------------------------

{
  const content = [
    "## LINE追記 2026-08-07T22:28:26.077Z",
    "- source: LINE",
    "",
    "参加者少ない",
    "入会なし体験なし",
    "## 今日の要約",
    "- これは日次チェックの自動生成セクション",
    "## 追記 2026-08-07T09:00:00+09:00",
    "- source: Codex",
    "- status: 未確認メモ",
    "",
    "決定: 体験は月4枠にする",
  ].join("\n");

  const memos = parseDailyLog("2026-08-07", content);
  assert.equal(memos.length, 2, "追記系の見出しだけ拾う（自動生成セクションは無視）");
  assert.equal(memos[0].body, "参加者少ない\n入会なし体験なし");
  assert.ok(!memos[0].body.includes("- source:"), "メタ行は本文に混ぜない");
  assert.equal(memos[1].body, "決定: 体験は月4枠にする");
}

{
  // 本文が空のエントリは落とす
  assert.equal(parseDailyLog("2026-08-07", "## LINE追記 x\n- source: LINE\n").length, 0);
}

// --- 拾い上げ -------------------------------------------------------------

{
  assert.ok(isDecisionMemo("決定: 体験は月4枠にする"));
  assert.ok(isDecisionMemo("正式決定：料金は据え置き"));
  assert.ok(!isDecisionMemo("決定したい気持ちがある"));
}

{
  const lines = extractTrialLines("参加者少ない\n入会なし体験なし\n寝技クラス");
  assert.deepEqual(lines, ["入会なし体験なし"], "体験・入会に触れた行だけ拾う");
}

// --- 週次まとめ -----------------------------------------------------------

{
  const range = { start: "2026-08-10", end: "2026-08-16" };
  const memos = [
    { date: "2026-08-11", heading: "## LINE追記 a", body: "寝技\nアンディ マサキ" },
    { date: "2026-08-13", heading: "## LINE追記 b", body: "入会なし体験なし" },
    { date: "2026-08-13", heading: "## LINE追記 c", body: "決定: 体験は月4枠にする" },
    { date: "2026-08-14", heading: "## 追記 d", body: "x".repeat(2000) },
  ];

  const summary = summariseWeek(range, memos);
  assert.equal(summary.totalMemos, 4);
  assert.deepEqual(summary.daysWithMemos, ["2026-08-11", "2026-08-13", "2026-08-14"]);
  assert.deepEqual(summary.missingDays, ["2026-08-10", "2026-08-12", "2026-08-15", "2026-08-16"]);
  assert.equal(summary.trialLines.length, 1);
  assert.equal(summary.decisions.length, 1);
  assert.equal(summary.longMemos.length, 1);

  const review = buildWeeklyReview(summary, memos);
  assert.match(review, /# 週次整理 2026-08-10 〜 2026-08-16/);
  assert.match(review, /未承認ドラフト/, "承認前であることを明記する");
  assert.match(review, /記録がなかった日: 2026-08-10, 2026-08-12/);
  assert.match(review, /決定: 体験は月4枠にする/);
  assert.match(review, /アンディ マサキ/, "原文をそのまま残す");
  assert.match(review, /長文のため省略/, "長文メモは原文を貼らない");
  assert.ok(!review.includes("x".repeat(2000)), "長文の本文は出力しない");
  assert.match(review, /## 6. JIN記入欄/);
}

{
  // メモがない週でも壊れない
  const range = { start: "2026-08-10", end: "2026-08-16" };
  const review = buildWeeklyReview(summariseWeek(range, []), []);
  assert.match(review, /今週はメモがありません/);
  assert.match(review, /今週は体験・入会の記載なし/);
}

{
  assert.equal(
    weeklyReviewRelativePath({ start: "2026-08-10", end: "2026-08-16" }),
    "01_DAILY_OPERATIONS/weekly_reviews/2026-08-16_週次整理.md",
  );
}

// --- 実行（下書きの書き出し） --------------------------------------------

{
  const vaultRoot = await mkdtemp(path.join(tmpdir(), "weekly-organize-"));
  const logDir = path.join(vaultRoot, DAILY_LOG_DIRECTORY);
  await mkdir(logDir, { recursive: true });
  await writeFile(
    path.join(logDir, "2026-08-13.md"),
    "## LINE追記 2026-08-13T10:00:00.000Z\n- source: LINE\n\n入会なし体験なし\n",
    "utf8",
  );
  // 期間外の日は読まない
  await writeFile(
    path.join(logDir, "2026-07-01.md"),
    "## LINE追記 old\n- source: LINE\n\n期間外のメモ\n",
    "utf8",
  );

  const collected = await collectWeeklyMemos(vaultRoot, { start: "2026-08-10", end: "2026-08-16" });
  assert.equal(collected.length, 1, "期間内のファイルだけ読む");

  const result = await executeWeeklyOrganizeCommand("整理", { now: NOW, vaultRoot });
  assert.equal(result.handled, true);
  assert.equal(result.ok, true);
  assert.match(result.message, /週次整理の下書きを作りました/);
  assert.match(result.message, /01_DAILY_OPERATIONS\/weekly_reviews\/2026-08-16_週次整理\.md/);
  assert.match(result.message, /\/push/, "次にすることを案内する");

  const written = await readFile(
    path.join(vaultRoot, "01_DAILY_OPERATIONS/weekly_reviews/2026-08-16_週次整理.md"),
    "utf8",
  );
  assert.match(written, /入会なし体験なし/);
  assert.ok(!written.includes("期間外のメモ"), "期間外のメモは混ぜない");
}

{
  // コマンドでないテキストは何もしない
  const vaultRoot = await mkdtemp(path.join(tmpdir(), "weekly-organize-noop-"));
  const result = await executeWeeklyOrganizeCommand("今日は寒い", { now: NOW, vaultRoot });
  assert.equal(result.handled, false);
}

console.log("weekly organize tests passed");
