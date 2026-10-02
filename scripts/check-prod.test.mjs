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

// 301/302 を「ページが無い」と誤報しないこと。
// 本番の /webos/ が 301 を返したとき、追いかけずに落第にして
// 「XServer に index.html があるか確かめろ」と間違った案内を出した。
// 転送は「別の住所へ案内されている」だけなので、最後まで追って着いた先で判定する。
assert.match(script, /curl -s -o \/dev\/null -L/, "転送を追いかけて最後の答えを見る");
assert.match(script, /url_effective/, "着いた先のURLを読む");
assert.match(script, /\^3\[0-9\]\[0-9\]\$/, "3xx を転送として扱う");
assert.match(script, /へ転送されています/, "どこへ転送されたかを表示する");
// 中身の読み出しも転送後のURLから行う（転送前から読むと空になる）
assert.match(script, /curl -s -L -m 15 "\$\{WEBOS_TARGET\}"/, "版の比較は転送先の中身で行う");

// 「ページが古い」の原因を2つに切り分けること。
// 2026-10-02、ファイルは全部上がっていたのに .htaccess の RewriteRule が
// /webos/ を古い webos.html へ向けていた。検査は「上げ直せ」としか言えず、
// すでに上げ終えた人に、やり直す必要のない作業をさせるところだった。
// index.html を直接開いて新しければ、届いている＝振り分けの問題と分かる。
assert.match(script, /index\.html" 2>\/dev\/null/, "index.htmlを直接開いて切り分ける");
assert.match(script, /振り分けられています/, "振り分けの問題だと名指しする");
assert.match(script, /\.htaccess/, "直す場所を案内する");
assert.match(script, /バックアップ/, ".htaccessの編集前にバックアップを促す");
assert.match(script, /8ファイル全部/, "上げ直す場合は全部だと伝える");

console.log("check-prod tests passed");
