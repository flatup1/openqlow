// 広告動画: 採点（§9 STEP3）と記録（§11）のテスト。
//
// ファイルは一時ディレクトリだけを使う。リポジトリの中には書かない。

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { AXIS_META, ScoringError, scoreVideo, topConcepts, type AxisScores } from "./scoring.js";
import { appendRecord, historyFilePath, readRecords, type GenerationRecord } from "./history.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// --- 重みの合計は100 -----------------------------------------------------------------------
{
  const total = AXIS_META.reduce((sum, meta) => sum + meta.weight, 0);
  assert(total === 100, `重みの合計は100点: ${total}`);
  assert(AXIS_META.length === 8, "観点は8つ（指示書 §9 STEP3）");
}

// --- 採点 ---------------------------------------------------------------------------------
{
  const perfect = Object.fromEntries(AXIS_META.map(m => [m.axis, 10])) as AxisScores;
  assert(scoreVideo(perfect).total === 100, "全部10なら100点");

  const zero = Object.fromEntries(AXIS_META.map(m => [m.axis, 0])) as AxisScores;
  const zeroResult = scoreVideo(zero);
  assert(zeroResult.total === 0, "全部0なら0点");
  assert(zeroResult.weakest_ja.length === 2, "弱いところを2つ返す（次の改善はここから）");

  const mixed = { ...perfect, hook_within_3s: 0 } as AxisScores;
  const mixedResult = scoreVideo(mixed);
  assert(mixedResult.total === 80, `3秒の引きが0なら80点: ${mixedResult.total}`);
  assert(
    mixedResult.weakest_ja[0].includes("3秒以内の引き"),
    `一番弱いところが先頭: ${mixedResult.weakest_ja.join(" / ")}`,
  );
}

// --- 範囲外は推測せず止める ------------------------------------------------------------------
{
  const bad = Object.fromEntries(AXIS_META.map(m => [m.axis, 10])) as Record<string, number>;
  bad.cost = 11;
  let threw = false;
  try {
    scoreVideo(bad as AxisScores);
  } catch (error) {
    threw = error instanceof ScoringError;
  }
  assert(threw, "0〜10の外は ScoringError で止める");
}

// --- 上位2案だけ残す（§9 STEP4） ---------------------------------------------------------------
{
  const entries = [
    { id: "a", total: 71 },
    { id: "b", total: 83 },
    { id: "c", total: 83 },
    { id: "d", total: 60 },
  ];
  const top = topConcepts(entries, 2);
  assert(top.length === 2, "2案だけ残す");
  assert(top[0].id === "b" && top[1].id === "c", `同点は元の順を保つ: ${top.map(t => t.id).join(",")}`);
}

// --- 記録 ---------------------------------------------------------------------------------
{
  const root = mkdtempSync(path.join(tmpdir(), "ad-video-test-"));
  try {
    const record: GenerationRecord = {
      concept_id: "flatup_women_beginner_002",
      output_basename: "flatup_women_beginner_002__480p_5s",
      video_path: null,
      prompt: "a bright clean gym",
      model_key: "minimax/h3-max-turbo",
      endpoint: "minimax/h3-max-turbo/text-to-video",
      resolution: "480p",
      duration_seconds: 5,
      generated_at: "2026-09-07T10:00:00.000Z",
      estimated_cost_usd: 0.05,
      request_id: "req_test_1",
      score_total: null,
      improvement_ja: null,
    };

    const file = appendRecord(root, record);
    assert(file === historyFilePath(root), "保存先は決められた場所");
    assert(file.includes(path.join("runtime", "ad_video")), `Git追跡外に置く: ${file}`);

    appendRecord(root, { ...record, request_id: "req_test_2", score_total: 84 });
    const { records, broken_lines } = readRecords(root);
    assert(records.length === 2, `追記される（上書きしない）: ${records.length}`);
    assert(broken_lines === 0, "壊れた行はない");
    assert(records[1].score_total === 84, "採点も残る");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// --- 記録が無いときは空で返す（例外にしない） ------------------------------------------------------
{
  const root = mkdtempSync(path.join(tmpdir(), "ad-video-empty-"));
  try {
    const { records } = readRecords(root);
    assert(records.length === 0, "まだ何も無ければ空");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// --- 秘密情報が混ざったら書かない ---------------------------------------------------------------
{
  const root = mkdtempSync(path.join(tmpdir(), "ad-video-secret-"));
  try {
    let threw = false;
    try {
      appendRecord(root, {
        concept_id: "x",
        output_basename: "x",
        video_path: null,
        prompt: "Authorization: Key abc123",
        model_key: "m",
        endpoint: "e",
        resolution: "480p",
        duration_seconds: 5,
        generated_at: "2026-09-07T10:00:00.000Z",
        estimated_cost_usd: 0,
        request_id: null,
        score_total: null,
        improvement_ja: null,
      });
    } catch {
      threw = true;
    }
    assert(threw, "キーらしき文字列が混ざったら書かずに止める");
    assert(readRecords(root).records.length === 0, "止めたので1行も書かれていない");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log("ad_video record tests passed");
