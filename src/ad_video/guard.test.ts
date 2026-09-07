// 広告動画: 表現ルールのテスト。
//
// 守りたいこと:
//   - 怖い・煽る・断定の表現を止める（docs/AD_MASTER_COPY_2026-07.md §1、指示書 §7）
//   - 短い英単語が別の語に巻き込まれて誤検知しない
//   - 未成年が写る想定は、同意確認まで止める

import { checkExpression, mentionsMinor } from "./guard.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// --- 止めるべき表現 -------------------------------------------------------------------------
{
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["A dramatic KO finish in the ring", "KO"],
    ["blood on the mat", "流血"],
    ["two fighters sparring hard", "対戦"],
    ["最強のジムで必ず結果が出る", "断定"],
    ["3ヶ月で痩せる", "減量の断定"],
    ["護身術が身につく", "護身"],
    ["無料体験はこちら", "無料体験"],
    ["The coach is shouting at her", "怒鳴る"],
    ["A gritty underground gym in a dark basement", "地下"],
  ];
  for (const [text, label] of cases) {
    const result = checkExpression(text);
    assert(!result.ok, `${label} は止める: ${text}`);
    assert(result.hits[0].instead_ja.length > 0, `${label} は代わりの言い方も返す`);
  }
}

// --- 止めなくていい表現 ---------------------------------------------------------------------
{
  const safe = [
    "A bright clean gym with large windows and warm natural light",
    "はじめてでも、横について丁寧に教えます",
    "彼女は kodomo という言葉を知らない",
    "She is looking at the mitt and smiling",
    "sparse equipment along the wall",
  ];
  for (const text of safe) {
    const result = checkExpression(text);
    assert(result.ok, `止めなくていい: ${text} / 当たった語: ${result.hits.map(h => h.term).join(",")}`);
  }
}

// --- 未成年 --------------------------------------------------------------------------------
{
  assert(mentionsMinor("A kid throws a punch"), "kid は未成年として拾う");
  assert(mentionsMinor("キッズクラスの様子"), "キッズは未成年として拾う");
  assert(!mentionsMinor("A woman in her thirties"), "大人だけなら拾わない");
  assert(!mentionsMinor("kidney"), "kidney を kid と誤検知しない");
}

console.log("ad_video guard tests passed");
