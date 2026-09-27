// 判定だけを行う入口。外部へは一切送らない。
//
// 使い方:
//   npm run ask:route -- "この設計をレビューして"
//   echo "この設計をレビューして" | npm run ask:route -- --stdin
//
// 出力は1行のJSON。フックやスクリプトから読むためのもの。
// ネットワークを使わず、記録も残さない（判定は何度やっても副作用が無い）。

import { readFileSync } from "node:fs";
import { classifyDelegation } from "./classify.js";

function readQuestion(argv: readonly string[]): string {
  if (argv.includes("--stdin")) {
    try {
      return readFileSync(0, "utf8").trim();
    } catch {
      return "";
    }
  }
  return argv.filter(arg => arg !== "--stdin").join(" ").trim();
}

const question = readQuestion(process.argv.slice(2));

if (question === "") {
  console.log(JSON.stringify({ error: "依頼文が空です" }));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(classifyDelegation(question)));
}
