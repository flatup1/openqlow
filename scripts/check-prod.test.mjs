// 本番の健康診断（npm run check）が「確かめていないのに ✅ と言わない」ことのテスト。
//
// この道具の役目は「本当にできてる？」に答えることなので、
// 確かめられなかったものを「できている」と言うのが、いちばん困る壊れ方になる。
//
// 実際にあった2つ:
//
//   ① GitHubのmainを取り直さずに比べていた
//        GitHubの本当のmain : 4506882
//        本番に載っているの : bf30c99 ← 古い
//        → ✅ 本番 bf30c99 ＝ GitHubのmainと同じ
//
//   ② 版の目印が読めないとき、黙って比較を飛ばしていた
//        公開中のページが古いままでも「✅ 公開されています」で終わる

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const script = await readFile(
  path.join(process.cwd(), "deploy/scripts/check-prod.sh"),
  "utf8",
);

// ---- ① 比べる前に、GitHubから取り直す ----
assert.match(
  script,
  /git fetch --quiet origin main/,
  "比べる前にGitHubのmainを取り直す（origin/main は最後に取った時点の記録）",
);
assert.match(
  script,
  /rev-parse --short FETCH_HEAD/,
  "比較には取り直した結果（FETCH_HEAD）を使う",
);
assert.doesNotMatch(
  script,
  /rev-parse --short origin\/main/,
  "取り直していない origin/main を GitHubのmain として出さない",
);

// 認証を聞かれて固まらない。固まる診断は、失敗する診断より悪い。
assert.match(script, /GIT_TERMINAL_PROMPT=0/, "認証プロンプトを出さない");
assert.match(script, /BatchMode=yes/, "SSHでも認証を聞かない");

// 取れなかったときに「同じです」と言わない。
assert.match(
  script,
  /ng "GitHubの最新を取れないため/,
  "比べられないときは、できているとみなさず異常として報告する",
);

// ---- ② 版を比べられないときは、黙って飛ばさない ----
assert.match(
  script,
  /warn "手元の index\.html に版の目印/,
  "手元の版が読めないなら、比べていないと言う",
);
assert.match(
  script,
  /warn "公開中のページの中身を読めず/,
  "公開中のページが読めないなら、比べていないと言う",
);
// 「目印が無ければ何も言わずに次へ」という書き方に戻っていないこと。
assert.doesNotMatch(
  script,
  /elif \[\[ -n "\$LOCAL_V" \]\]/,
  "目印の有無で分岐を打ち切らない（比べなかったことが黙って消える）",
);

// ---- 読むだけ。本番を変えない ----
//
// TODO の助言文に "npm run deploy" のような文字列は出てよい（次の一手の案内）。
// 見たいのは「実行される行」なので、コメントと文字列を落としてから調べる。
const executable = script
  .split("\n")
  .filter(line => !line.trim().startsWith("#"))
  .map(line => line.replace(/TODO\+=\(.*\)/g, "").replace(/(ok|ng|warn)\s+".*"/g, ""))
  .join("\n");

for (const dangerous of [/systemctl restart/, /npm run deploy/, /rm -rf/, /git push/, /git pull/]) {
  assert.doesNotMatch(executable, dangerous, `健康診断は本番も手元も変えない: ${dangerous}`);
}
// 取り直しは fetch だけ。pull（手元のブランチを動かす）はしない。
assert.match(script, /git fetch/, "取り直しは fetch で行う");
assert.doesNotMatch(executable, /^set -e\b/m, "途中で止まらず最後まで全部見る");

console.log("check-prod tests passed");
