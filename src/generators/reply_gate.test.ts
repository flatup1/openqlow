import { generateInquiryReply } from "./inquiry_reply.js";
import { gateInquiryReplies, renderGate } from "./reply_gate.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// 生成した返信が出力ゲートで採点される。
const result = generateInquiryReply({
  message: "小学生の子供に習わせたいのですが初心者でも大丈夫ですか？",
});
const gate = gateInquiryReplies(result);

// 即時返信5種（難条件なしなので obstacle は無し）を採点している。
assert(gate.gated.length === 5, `should gate 5 replies, got ${gate.gated.length}`);
assert(gate.gated.some(g => g.label === "予約誘導"), "booking reply is gated");

// 生成器は「却下級(reject)」の返信を出してはいけない。
for (const g of gate.gated) {
  assert(g.quality.decision !== "reject", `${g.label} must never be reject (got ${g.quality.total})`);
}

// 最低点でも実用水準（60以上）であること。
assert(gate.worstTotal >= 60, `worst total should be >= 60, got ${gate.worstTotal}`);

// 表示テキストに各返信のスコアが出る。
const rendered = renderGate(gate);
assert(/\/100/.test(rendered), "rendered gate shows /100 scores");
assert(/丁寧な返信/.test(rendered), "rendered gate lists labels");

// 難条件の相談がある問い合わせでは6種を採点する。
const obstacle = generateInquiryReply({
  message: "仕事の後だと間に合うか不安です。キックボクシングは途中参加できますか？",
});
const obstacleGate = gateInquiryReplies(obstacle);
assert(obstacleGate.gated.length === 6, `obstacle case should gate 6 replies, got ${obstacleGate.gated.length}`);
for (const g of obstacleGate.gated) {
  assert(g.quality.decision !== "reject", `${g.label} must never be reject`);
}

console.log("reply_gate tests passed");
