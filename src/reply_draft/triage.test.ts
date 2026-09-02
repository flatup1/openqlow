import assert from "node:assert/strict";
import { triageInbound } from "./triage.js";

// 普通の問い合わせは下書きを作ってよい。
{
  for (const text of [
    "体験に興味があります。土曜の昼は空いていますか？",
    "小学3年の子どもでも通えますか？",
    "運動が苦手な女性でも大丈夫でしょうか。",
    "見学だけでもできますか？",
  ]) {
    assert.equal(triageInbound(text).route, "draft", text);
  }
}

// 言葉を選び間違えると取り返しがつかないものは、下書きを作らない。
{
  const cases: Array<[string, string]> = [
    ["先日の対応が最悪でした。責任者の方をお願いします。", "complaint"],
    ["肩に持病があり、病院に通っています。参加できますか。", "health"],
    ["中学生の息子の保護者ですが、同意書は必要ですか。", "minor"],
    ["今月の引き落としが二重になっています。返金してください。", "money"],
    ["来月で退会したいのですが手続きを教えてください。", "membership"],
    ["弁護士に相談すべき内容かもしれません。契約書を見せてください。", "legal"],
  ];
  for (const [text, category] of cases) {
    const result = triageInbound(text);
    assert.equal(result.route, "human_only", text);
    assert.equal(result.category, category);
    assert.ok(result.reason.length > 0, "理由が日本語で入る");
  }
}

// 短すぎる本文は材料にならない。JIN確認へ回す。
{
  assert.equal(triageInbound("").route, "human_only");
  assert.equal(triageInbound("はい").route, "human_only");
  assert.equal(triageInbound("   ").route, "human_only");
}

console.log("reply draft triage tests passed");
