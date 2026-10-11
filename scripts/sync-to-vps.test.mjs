// Mac → VPS 同期（sync-to-vps.sh）の除外リストのテスト。
//
// この道具のいちばん怖い壊れ方は「送ったつもりで送っていない」こと。
// 送られなかったファイルは VPS に古いまま残り続ける。手元もCIも正しいので、
// 本番だけが壊れる。原因にたどり着くのが極端に難しい。
//
// 2026-10-02 に実際に起きたこと:
//
//   --exclude 'state/'  と書いてあった
//     → rsync は先頭に / が無いパターンを「どの階層でも」一致させる
//     → 本番で増える /state/ だけでなく、ソースの src/state/ も除外された
//     → VPS の src/state/file_store.ts が古いまま固定され、本番ビルドが
//          error TS2724: has no exported member named 'readRecord'
//        で失敗した（readRecord は手元には存在する）
//
// 証拠: 本番の rsync -av の一覧に src/sources/ と src/utils/ はあるのに
//       src/state/ だけが無かった。

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const script = await readFile(path.join(root, "deploy/scripts/sync-to-vps.sh"), "utf8");

// ---- ① 本番で増えるフォルダは「一番上だけ」を指す ----
//
// 消したいのは /opt/openqlow/state のような一番上のフォルダだけ。
// ソースの中の同じ名前のフォルダを巻き込んではいけない。
for (const dir of ["dist", "state", "drafts", "logs"]) {
  assert.match(
    script,
    new RegExp(`--exclude '/${dir}/'`),
    `${dir}/ の除外は先頭に / を付けて一番上だけに限定する`,
  );
  assert.doesNotMatch(
    script,
    new RegExp(`--exclude '${dir}/'`),
    `--exclude '${dir}/' は どの階層でも 一致してしまう（src/${dir}/ まで送られなくなる）`,
  );
}

// ---- ② 本番のバージョンの印を --delete で消させない ----
//
// deployed-version.txt は deploy-vps.sh がビルド成功後に書く。
// リポジトリには無いので --delete の対象になる。先に消えてからビルドが
// 失敗すると、印だけが無くなり、健康診断が
//   「一度も新しいコードを送れていません」
// と出す。実際には前の版が動いているので、これは嘘になる。
assert.match(
  script,
  /--exclude '\/deployed-version\.txt'/,
  "本番のバージョンの印は同期で消さない",
);

// ---- ②の裏側: 一番上に限定したことで外れてしまった除外を取りこぼさない ----
//
// 以前の 'state/' は「どの階層でも」一致していたため、本来の目的とは関係なく
// uizin-eventos/worker/.wrangler/state/ まで偶然除外していた。
// /state/ に直した直後の反映で、その miniflare の sqlite が本番へ流れ始めた。
// VPS では一切読まないファイルで、中身が毎回変わるので送り直しも増える。
// 名指しで止める。
assert.match(
  script,
  /--exclude '\.wrangler\/'/,
  "Cloudflare の手元用データ（.wrangler）は本番へ送らない",
);

// ---- ③ 階層を限定していない除外が、実在するソースのフォルダ名と衝突しないこと ----
//
// ①は今わかっている4つを名指しで守る。ここは「次に同じ罠を踏むこと」を防ぐ。
// 除外リストから「先頭に / が無く、ワイルドカードも無い、フォルダ名の指定」を拾い、
// それがリポジトリの中に実在するフォルダ名と一致したら落とす。
//
// 例: あとで src/logs/ を作った瞬間に、このテストが止める。
const excludePatterns = [...script.matchAll(/--exclude\s+'?([^'\s)]+)'?/g)].map(m => m[1]);

const unanchoredDirPatterns = excludePatterns.filter(
  pattern =>
    pattern.endsWith("/") &&
    !pattern.startsWith("/") &&
    !pattern.includes("*"),
);

async function directoryNames(dir, depth = 0) {
  if (depth > 3) return [];
  const names = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
    names.push({ name: entry.name, full: path.relative(root, path.join(dir, entry.name)) });
    names.push(...(await directoryNames(path.join(dir, entry.name), depth + 1)));
  }
  return names;
}

// ソースとして本番で使うものだけを見る（素材や道具のフォルダは除外されて当然）。
const sourceDirs = [
  ...(await directoryNames(path.join(root, "src"))),
  ...(await directoryNames(path.join(root, "scripts"))),
  ...(await directoryNames(path.join(root, "deploy"))),
  ...(await directoryNames(path.join(root, "port"))),
];

for (const pattern of unanchoredDirPatterns) {
  const bare = pattern.replace(/\/$/, "");
  const hit = sourceDirs.find(dir => dir.name === bare);
  assert.ok(
    !hit,
    `--exclude '${pattern}' が実在する ${hit?.full} と一致します。` +
      `このままだと本番へ送られず、古いファイルが残り続けます。` +
      `一番上だけを消したいなら --exclude '/${pattern}' と書いてください。`,
  );
}

// ---- 読む向きは一方通行。本番から手元へは戻さない ----
assert.match(script, /--delete/, "本番側の余りを消して手元と同じ状態にする");
assert.doesNotMatch(script, /AIKA_RESERVED_HOST="162\.43\.41\.182"/, "openQLOWのIPを誤ってAIKA扱いしない");
assert.match(script, /AIKA_RESERVED_HOST="162\.43\.90\.71"/, "AIKA VPSへの誤同期を防ぐ");

console.log(`sync-to-vps tests passed（除外 ${excludePatterns.length}件 / ソースのフォルダ ${sourceDirs.length}件 を照合）`);
