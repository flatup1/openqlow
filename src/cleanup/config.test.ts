import assert from "node:assert/strict";
import path from "node:path";
import {
  DEFAULT_ORGANIZED_FOLDER,
  DEFAULT_QUARANTINE_FOLDER,
  expandHome,
  loadCleanupConfig,
  parsePathList,
  parsePositiveInt,
} from "./config.js";

const HOME = "/Users/test";

// ~ はホームに置き換わる。相対パスは絶対パスになる。
{
  assert.equal(expandHome("~/Desktop", HOME), path.join(HOME, "Desktop"));
  assert.equal(expandHome("~", HOME), HOME);
  assert.equal(expandHome("/Volumes/BACKUP", HOME), "/Volumes/BACKUP");
  assert.equal(expandHome("  ", HOME), "");
}

// カンマ区切り。空要素と重複は落とす。
{
  const list = parsePathList("~/Desktop, ~/Downloads , ~/Desktop,", HOME);
  assert.deepEqual(list, [path.join(HOME, "Desktop"), path.join(HOME, "Downloads")]);
  assert.deepEqual(parsePathList(undefined, HOME), []);
}

// 設定ミスで暴走させない。読めない値・マイナスは既定値へ戻す。
{
  assert.equal(parsePositiveInt("7", 30), 7);
  assert.equal(parsePositiveInt("0", 30), 0);
  assert.equal(parsePositiveInt("-5", 30), 30);
  assert.equal(parsePositiveInt("abc", 30), 30);
  assert.equal(parsePositiveInt(undefined, 30), 30);
  assert.equal(parsePositiveInt("", 30), 30);
}

// 何も設定しないときの既定。ここが「安全側」であることが一番大事。
{
  const config = loadCleanupConfig({}, HOME);
  assert.deepEqual(config.targets, [path.join(HOME, "Desktop"), path.join(HOME, "Downloads")]);
  assert.equal(config.organizedRoot, path.join(HOME, "Desktop", DEFAULT_ORGANIZED_FOLDER));
  assert.equal(config.quarantineRoot, path.join(HOME, "Desktop", DEFAULT_QUARANTINE_FOLDER));
  assert.equal(config.backupRoot, "", "外付けは明示しない限り使わない");
  assert.equal(config.apply, false, "既定はお試し実行");
  assert.equal(config.purgeEnabled, false, "既定では完全削除しない");
  assert.equal(config.emptyTrashEnabled, false, "既定ではゴミ箱を空にしない");
  assert.equal(config.includeFolders, false, "既定ではフォルダに触らない");
  assert.equal(config.retentionDays, 30);
  assert.equal(config.idleDays, 1);
  assert.deepEqual(config.trashRoots, [path.join(HOME, ".Trash")]);
}

// フラグは "true" ちょうどのときだけ有効。"1" や "yes" では動かない。
{
  const loose = loadCleanupConfig(
    { OPENQLOW_CLEANUP_APPLY: "1", OPENQLOW_CLEANUP_PURGE: "yes" },
    HOME,
  );
  assert.equal(loose.apply, false);
  assert.equal(loose.purgeEnabled, false);

  const strict = loadCleanupConfig(
    { OPENQLOW_CLEANUP_APPLY: "true", OPENQLOW_CLEANUP_PURGE: " TRUE " },
    HOME,
  );
  assert.equal(strict.apply, true);
  assert.equal(strict.purgeEnabled, true);
}

// 明示した設定はそのまま通る。
{
  const config = loadCleanupConfig(
    {
      OPENQLOW_CLEANUP_TARGETS: "~/Desktop",
      OPENQLOW_CLEANUP_BACKUP_ROOT: "/Volumes/FLATUP",
      OPENQLOW_CLEANUP_RETENTION_DAYS: "60",
      OPENQLOW_CLEANUP_IDLE_DAYS: "3",
      OPENQLOW_CLEANUP_DISABLED: "true",
    },
    HOME,
  );
  assert.deepEqual(config.targets, [path.join(HOME, "Desktop")]);
  assert.equal(config.backupRoot, "/Volumes/FLATUP");
  assert.equal(config.retentionDays, 60);
  assert.equal(config.idleDays, 3);
  assert.equal(config.disabled, true);
}

console.log("cleanup config tests passed");
