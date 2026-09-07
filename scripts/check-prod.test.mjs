import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const scriptPath = path.join(root, "deploy/scripts/check-prod.sh");
const script = await readFile(scriptPath, "utf8");

// 「実際に実行される部分」だけを取り出す。
// コメント行と、画面に出すだけの助言（TODO+=("…")）は命令ではないので外す。
// これをやらないと「次の一手: npm run deploy を実行する」という案内文まで
// 危険な操作とみなされてしまう。
const executable = script
  .split("\n")
  .filter(line => !/^\s*#/.test(line))
  .join("\n")
  .replace(/TODO\+=\([^)]*\)/g, "");

// 読むだけのスクリプト。本番を変える操作を含んではいけない。
for (const forbidden of [
  /systemctl restart/,
  /systemctl stop/,
  /npm run build/,
  /npm ci/,
  /rsync/,
  /git (pull|push|reset|checkout|stash)/,
  /rm -rf/,
]) {
  assert.doesNotMatch(executable, forbidden, `健康診断は本番を変えてはいけない: ${forbidden}`);
}

// 4つの診断が揃っている
assert.match(script, /deployed-version\.txt/, "本番のコミットを読む");
assert.match(script, /rev-parse --short origin\/main/, "GitHubのmainと比べる");
assert.match(script, /systemctl is-active/, "LINE自動応答が動いているか見る");
assert.match(script, /journey/i, "引き継ぎコードの受け口を見る");
assert.match(script, /webos/i, "WebOSのページを見る");

// 最初の1個で止まらない（全部の不具合を一度に出す）
assert.doesNotMatch(script, /^set -euo pipefail$/m, "set -e だと1個目で止まってしまう");
assert.match(script, /set -uo pipefail/, "未定義変数とパイプ失敗は拾う");

// 判定の根拠が固定されている
// /journey は AIKA VPS 側。docs/webos_line_journey.md と同じ
// 「CORSプリフライト → 204」で見る。GETの405で見てはいけない。
assert.match(script, /-X OPTIONS/, "受け口はプリフライトで確かめる");
assert.match(script, /Access-Control-Request-Method: POST/, "プリフライトの中身を送る");
assert.match(script, /204\)/, "受け口は204が正解");
assert.match(script, /404\)/, "404は未反映として扱う");
assert.match(script, /200/, "ページは200が正解");

// 3つのサーバーをまたぐことを、コメントで必ず断っている。
// ここが曖昧だと「openQLOWを反映したのに/journeyが直らない」で混乱する。
assert.match(script, /AIKA VPS/, "受け口が別サーバーだと明記する");
assert.match(script, /deploy_aika_release\.sh/, "AIKA側の反映手順を案内する");
assert.doesNotMatch(
  script,
  /npm run deploy のあと、まだ404/,
  "journeyの404を openQLOW の反映不足のせいにしない",
);

// 失敗したら「次の一手」を必ず出す
assert.match(script, /TODO\+=\(/, "不合格ごとに次の一手を積む");
assert.ok(
  (script.match(/TODO\+=\(/g) ?? []).length >= 4,
  "不合格のパターンごとに次の一手が用意されている",
);
assert.match(script, /次の一手/, "次の一手を表示する");
assert.match(script, /exit 1/, "不合格なら異常終了する");
assert.match(script, /exit 0/, "全部合格なら正常終了する");

// 鍵が無い場所でも公開側だけ見られる
assert.match(script, /--public/, "SSHなしモードがある");

// 危険・不作法な設定を含まない
assert.doesNotMatch(script, /StrictHostKeyChecking=no/, "ホスト鍵チェックを無効化しない");
assert.doesNotMatch(script, /-k\b|--insecure/, "TLS検証を無効化しない");
assert.doesNotMatch(
  script,
  /LINE_CHANNEL_ACCESS_TOKEN=[A-Za-z0-9+/]{10,}/,
  "トークンを直書きしない",
);

// 実行できる
const mode = (await stat(scriptPath)).mode;
assert.ok((mode & 0o111) !== 0, "実行権限が必要");

// package.json から1コマンドで呼べる
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
assert.equal(pkg.scripts.check, "bash deploy/scripts/check-prod.sh", "npm run check で呼べる");

console.log("check-prod tests passed");
