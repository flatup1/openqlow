import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { formatRoutingLogLine, logRoutingEvent } from "./routing_log.js";

const at = "2026-08-21T10:00:00.000Z";

// --- 個人情報を書かないこと（この関数の一番の仕事） ---
{
  const line = formatRoutingLogLine(
    {
      event: "brand_growth_routing",
      lineUserId: "U0123456789abcdef0123456789abcdef",
      text: "動画を作ってほしい",
    },
    at,
  );

  assert.ok(!line.includes("U0123456789abcdef0123456789abcdef"), "生の LINE userId がログに出てはいけない");
  assert.ok(!line.includes("動画"), "受信本文がログに出てはいけない");
  assert.match(line, /user=u_[0-9a-f]{8}/, "仮名化された userId が入る");
  assert.match(line, /len=9/, "本文は長さだけ残す");
}

// --- 同じ人は同じ表記、違う人は違う表記（運用で追えること） ---
{
  const a1 = formatRoutingLogLine({ event: "brand_growth_routing", lineUserId: "Uaaa" }, at);
  const a2 = formatRoutingLogLine({ event: "brand_growth_routing", lineUserId: "Uaaa" }, at);
  const b1 = formatRoutingLogLine({ event: "brand_growth_routing", lineUserId: "Ubbb" }, at);

  assert.equal(a1, a2, "同じ人は毎回同じ表記になる");
  assert.notEqual(a1, b1, "違う人は違う表記になる");
}

// --- userId も本文も無い場合でも壊れない ---
{
  const line = formatRoutingLogLine({ event: "brand_growth_routing" }, at);
  assert.match(line, /user=anonymous/);
  assert.match(line, /len=0/);
}

// --- 分類結果は読める形で残る（未指定は n/a） ---
{
  const line = formatRoutingLogLine(
    {
      event: "brand_growth_routing",
      details: { target: "kids", objective: "trial", intent: undefined },
    },
    at,
  );

  assert.match(line, /target=kids/);
  assert.match(line, /objective=trial/);
  assert.match(line, /intent=n\/a/);
}

// --- エラーログとは別の場所へ書くこと（本物の障害が埋もれないように） ---
{
  const base = await mkdtemp(path.join(tmpdir(), "routing-log-"));
  try {
    const result = await logRoutingEvent(
      { event: "brand_growth_routing", lineUserId: "Uccc", text: "テスト" },
      base,
      new Date(at),
    );

    assert.ok(
      result.filePath.includes(path.join("logs", "routing")),
      "logs/routing/ へ書く（logs/self_repair/ ではない）",
    );
    assert.ok(result.filePath.endsWith("2026-08-21.md"), "日付でファイルが分かれる");

    const saved = await readFile(result.filePath, "utf8");
    assert.ok(saved.endsWith("\n"), "1行として追記される");
    assert.ok(!saved.includes("Uccc"), "保存後のファイルにも生IDは残らない");

    // 2回目は追記される（上書きしない）
    await logRoutingEvent({ event: "brand_growth_routing", lineUserId: "Uddd" }, base, new Date(at));
    const appended = await readFile(result.filePath, "utf8");
    assert.equal(appended.trim().split("\n").length, 2, "追記されて2行になる");
  } finally {
    await rm(base, { recursive: true, force: true });
  }
}

console.log("routing log tests passed");
