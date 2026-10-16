// コードそのものの検査。AT-P1-08（許可リスト）・AT-P1-12／AT-ALL-03（秘密・実名）・AT-ALL-05
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { allowedRequests, NEVER_REQUESTS } from "../src/obs/allowlist.mjs";
import { TOOL_DIR } from "./helpers.mjs";

function files(dir) {
  const list = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) list.push(...files(path));
    else list.push(path);
  }
  return list;
}

const SOURCE = files(join(TOOL_DIR, "src")).filter(path => /\.(mjs|js)$/.test(path));
const ALL = files(TOOL_DIR).filter(path => !path.includes(`${TOOL_DIR}/node_modules`));

test("コードが OBS に送る命令名は、すべて許可リストの中にある", () => {
  const allowed = allowedRequests();
  const used = new Set();
  for (const path of SOURCE.filter(file => file.includes("/src/obs/") && !file.endsWith("fake_obs.mjs"))) {
    const text = readFileSync(path, "utf8");
    for (const match of text.matchAll(/\b(?:req|tryReq|request)\(\s*"([A-Za-z]+)"/g)) used.add(match[1]);
  }
  assert.ok(used.size >= 15, `見つかった命令が少なすぎます（${used.size}）`);
  for (const name of used) assert.ok(allowed.has(name), `許可リストに無い命令: ${name}`);
});

test("配信キーを読む命令や設定を書き換える命令は、許可リスト以外のどこにも書かれていない", () => {
  for (const path of SOURCE) {
    if (path.endsWith("allowlist.mjs")) continue;
    const text = readFileSync(path, "utf8");
    for (const name of NEVER_REQUESTS) assert.ok(!text.includes(`"${name}"`), `${relative(TOOL_DIR, path)} に ${name}`);
  }
});

test("設定のひな形にパスワード・配信キーを書く欄が無い（環境変数の名前だけ）", () => {
  const config = JSON.parse(readFileSync(join(TOOL_DIR, "config.example.json"), "utf8"));
  const text = JSON.stringify(config);
  assert.doesNotMatch(text, /"password"\s*:|"streamKey"|"key"\s*:/i);
  assert.equal(config.obs.passwordEnv, "EVENT_OS_OBS_PASSWORD");
});

test("秘密情報らしい文字列・本番の設定ファイル・大会データが入っていない", () => {
  const patterns = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\bsk-[A-Za-z0-9]{20,}/,
    /\bAIza[0-9A-Za-z_-]{30,}/,
    /\bgh[pousr]_[A-Za-z0-9]{30,}/,
    /\b[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}\b/,
    /rtmps?:\/\/[^\s"']*\/live2\/[A-Za-z0-9-]{8,}/,
  ];
  for (const path of ALL) {
    const name = relative(TOOL_DIR, path);
    assert.ok(!/(^|\/)(config\.json|secrets\.env|access_token|.*\.jsonl)$/.test(name), `コミットしないファイル: ${name}`);
    if (/\.(png|jpg|ico)$/.test(name)) continue;
    const text = readFileSync(path, "utf8");
    for (const pattern of patterns) assert.doesNotMatch(text, pattern, `${name} に秘密情報らしい文字列`);
  }
});

test("Event OS は外のインターネットにつながない（大会はネット無しで動く）", () => {
  for (const path of SOURCE) {
    const name = relative(TOOL_DIR, path);
    const text = readFileSync(path, "utf8");
    assert.doesNotMatch(text, /from "node:(https|net|tls|dgram)"|require\(/, name);
    // node:http は画面を出すための待ち受け（createServer）だけに使う。
    for (const match of text.matchAll(/import \{([^}]*)\} from "node:http"/g)) {
      assert.deepEqual(match[1].split(",").map(part => part.trim()), ["createServer"], name);
    }
    assert.doesNotMatch(text, /fetch\(\s*["'`]https?:/, name);
  }
});

test("リポジトリの .gitignore が、Event OS の大会データを除外している", () => {
  const ignore = readFileSync(join(TOOL_DIR, "../../.gitignore"), "utf8");
  for (const rule of ["tools/uizin-event-os/runtime/", "tools/uizin-event-os/**/*.jsonl", "tools/uizin-event-os/**/secrets.env", "tools/uizin-event-os/**/config.json"]) {
    assert.ok(ignore.includes(rule), `.gitignore に ${rule} がありません`);
  }
});
