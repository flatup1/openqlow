import assert from "node:assert/strict";
import { photoQuickReplies, photoPromptMessage } from "./finalize.js";

// 候補が2枚なら 画像1/画像2＋写真なし の3ボタン。
{
  const items = photoQuickReplies(2);
  assert.equal(items.length, 3);
  assert.equal(items[0].text, "画像 1");
  assert.equal(items[1].text, "画像 2");
  assert.equal(items[2].text, "画像なし");
}

// 候補0枚なら 写真なし のみ。
{
  const items = photoQuickReplies(0);
  assert.equal(items.length, 1);
  assert.equal(items[0].text, "画像なし");
}

// プロンプトは枚数に応じて案内を変える。
assert.match(photoPromptMessage(2), /画像1.*画像2/);
assert.match(photoPromptMessage(0), /写真/);

console.log("finalize photo-ui tests passed");
