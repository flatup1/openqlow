import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildRichMenuPayload, RICH_MENU_IMAGE, RICH_MENU_NAME } from "./setup-rich-menu.mjs";

const payload = buildRichMenuPayload();

// サイズはLINE仕様の 2500x843（コンパクト）
assert.equal(payload.size.width, 2500);
assert.equal(payload.size.height, 843);
assert.ok(payload.name.startsWith(RICH_MENU_NAME));

// ボタンは3つ: push / ヘルプ / 日報（すべて既存コマンドのエイリアス）
assert.equal(payload.areas.length, 3);
assert.deepEqual(
  payload.areas.map(a => a.action.text),
  ["push", "ヘルプ", "日報"],
);
for (const area of payload.areas) {
  assert.equal(area.action.type, "message");
}

// 領域が重ならず、キャンバス全体を覆う
const sorted = [...payload.areas].sort((a, b) => a.bounds.x - b.bounds.x);
let x = 0;
for (const area of sorted) {
  assert.equal(area.bounds.x, x, "領域が隙間なく並ぶ");
  assert.equal(area.bounds.y, 0);
  assert.equal(area.bounds.height, payload.size.height);
  x += area.bounds.width;
}
assert.equal(x, payload.size.width, "領域の合計幅がキャンバス幅と一致");

// 画像が存在し、PNGである
const image = await readFile(RICH_MENU_IMAGE);
assert.ok(image.length > 1000, "画像が空でない");
assert.deepEqual([...image.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], "PNGシグネチャ");

console.log("rich menu tests passed");
