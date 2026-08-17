import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const scriptPath = path.join(root, "deploy/scripts/deploy-vps.sh");
const script = await readFile(scriptPath, "utf8");

// 途中で失敗したら止まる（本番を半端な状態にしない）
assert.match(script, /set -euo pipefail/, "失敗時に止まる設定が必要");

// 4ステップが揃っている
assert.match(script, /git pull --rebase --autostash origin main/, "取り込みは autostash で安全に");
assert.match(script, /sync-to-vps\.sh/, "VPSへの同期を呼ぶ");
assert.match(script, /npm ci/, "依存をインストールする");
assert.match(script, /npm run build/, "ビルドする");
assert.match(script, /systemctl restart/, "webhookを再起動する");

// どのコードを反映するか / 本番で何が動いているかを必ず表示する
assert.match(script, /反映するコード/, "反映するコミットを表示する");
assert.match(script, /本番で動いているコード/, "本番のコミットを表示する");
assert.match(script, /deployed-version\.txt/, "本番にバージョンの印を置いて読み返す");
assert.match(script, /LIVE_SHA.*!=.*DEPLOY_SHA|\$LIVE_SHA" != "\$DEPLOY_SHA/, "一致しなければ知らせる");

// 起動確認をして、ダメなら落とす
assert.match(script, /systemctl is-active/, "起動したか確認する");
assert.match(script, /journalctl -u/, "失敗時はログを出す");
assert.match(script, /exit 1/, "起動失敗時は異常終了する");

// 危険な操作を含まない
assert.doesNotMatch(script, /--force|force-with-lease/, "force push はしない");
assert.doesNotMatch(script, /rm -rf \//, "危険な削除はしない");
assert.doesNotMatch(script, /StrictHostKeyChecking=no/, "ホスト鍵チェックを無効化しない");

// 秘密情報を埋め込んでいない
assert.doesNotMatch(script, /LINE_CHANNEL_ACCESS_TOKEN=[A-Za-z0-9+/]{10,}/, "トークンを直書きしない");

// 実行ビットが立っている（bash 経由でも動くが、直接実行できると手数が減る）
const mode = (await stat(scriptPath)).mode;
assert.ok((mode & 0o111) !== 0, "実行権限が必要");

// --- 同期スクリプト側 -----------------------------------------------------
const sync = await readFile(path.join(root, "deploy/scripts/sync-to-vps.sh"), "utf8");

// npm キャッシュを本番へ送らない（--delete が消せず rsync 23 で落ちる原因になる）
assert.match(sync, /--exclude '\.npm\/'/, ".npm を除外する");
assert.match(sync, /--exclude '\.DS_Store'/, ".DS_Store を除外する");

// 本番データを消さない除外は維持されていること
for (const keep of ["state/", "drafts/", "logs/", ".env"]) {
  assert.ok(sync.includes(`--exclude '${keep}'`), `${keep} の除外を消さない`);
}

// rsync の軽微な警告(23/24)では止まらず、それ以外は異常終了する
assert.match(sync, /23\|24\)/, "23/24 は警告として扱う");
assert.match(sync, /exit "\$rsync_status"/, "その他の失敗はそのまま落とす");

console.log("deploy-vps tests passed");
