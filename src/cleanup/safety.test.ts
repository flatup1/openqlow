import assert from "node:assert/strict";
import path from "node:path";
import { UnsafePathError, assertSafeToMove, assertSafeToPurge, assertSafeTargetRoot, isInside } from "./safety.js";

const HOME = "/Users/test";

// 中にあるか判定。名前の途中一致で誤判定しない。
{
  assert.equal(isInside("/a/b", "/a/b/c.txt"), true);
  assert.equal(isInside("/a/b", "/a/b"), true);
  assert.equal(isInside("/a/b", "/a/bc/d.txt"), false, "/a/bc は /a/b の中ではない");
  assert.equal(isInside("/a/b", "/a"), false);
}

// 片づけ対象にしてよい場所。
{
  assertSafeTargetRoot(path.join(HOME, "Desktop"), HOME);
  assertSafeTargetRoot(path.join(HOME, "Downloads"), HOME);
}

// 設定ミスでシステムやホーム直下を指しても、ここで止まる。
{
  for (const bad of ["/", "/System", "/Applications", "/Users", "/Volumes", HOME]) {
    assert.throws(() => assertSafeTargetRoot(bad, HOME), UnsafePathError, `${bad} は拒否される`);
  }
}

// リポジトリや鍵の置き場も拒否する。
{
  assert.throws(() => assertSafeTargetRoot(`${HOME}/work/repo/.git`, HOME), UnsafePathError);
  assert.throws(() => assertSafeTargetRoot(`${HOME}/work/node_modules/x`, HOME), UnsafePathError);
  assert.throws(() => assertSafeTargetRoot(`${HOME}/.ssh`, HOME), UnsafePathError);
  assert.throws(() => assertSafeTargetRoot(`${HOME}/Library/Mail`, HOME), UnsafePathError);
}

// 完全削除はゴミ箱待ちの中だけ。ここが最後の砦。
{
  const quarantine = `${HOME}/Desktop/99_ゴミ箱待ち`;
  assertSafeToPurge(`${quarantine}/2026-09-01/.DS_Store`, [quarantine]);

  assert.throws(
    () => assertSafeToPurge(`${HOME}/Desktop/大事な資料.pdf`, [quarantine]),
    UnsafePathError,
    "ゴミ箱待ちの外は消さない",
  );
  assert.throws(
    () => assertSafeToPurge(quarantine, [quarantine]),
    UnsafePathError,
    "ゴミ箱待ちフォルダ自体は消さない",
  );
  assert.throws(
    () => assertSafeToPurge(`${quarantine}/../大事な資料.pdf`, [quarantine]),
    UnsafePathError,
    ".. で外へ出られない",
  );
  assert.throws(
    () => assertSafeToPurge(`${quarantine}/x.txt`, []),
    UnsafePathError,
    "削除先が未設定なら何も消さない",
  );
}

// Macのゴミ箱を対象に加えたときだけ、その中を消せる。
{
  const trash = `${HOME}/.Trash`;
  assertSafeToPurge(`${trash}/古い動画.mp4`, [trash]);
  assert.throws(() => assertSafeToPurge(`${trash}/古い動画.mp4`, []), UnsafePathError);
}

// 移動の禁止パターン。
{
  assertSafeToMove(`${HOME}/Desktop/a.png`, `${HOME}/Desktop/00_整理済み/2026/09/画像/a.png`);

  assert.throws(() => assertSafeToMove("/", `${HOME}/Desktop/x`), UnsafePathError);
  assert.throws(() => assertSafeToMove(`${HOME}/Desktop/a.png`, `${HOME}/Desktop/a.png`), UnsafePathError);
  assert.throws(
    () => assertSafeToMove(`${HOME}/Desktop/素材`, `${HOME}/Desktop/素材/中/素材`),
    UnsafePathError,
    "自分の中へは入れられない",
  );
}

console.log("cleanup safety tests passed");
