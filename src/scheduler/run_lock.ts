// 定時実行の二重発火を止めるロック。
//
// systemd timer / launchd / cron は、再起動・リトライ・設定の重複で
// 同じ日に2回以上発火することがある。そのたびにJinのLINEへ同じ通知が届くと、
// 「送ってはいけないものを送った」のと同じ実害になる。
//
// 仕組み:
//   1. 送信の「前」に、その日ぶんのロックファイルを作る
//   2. 作成は fs の wx フラグを使う。既にあれば失敗するので、
//      「見てから書く」方式と違って、同時に走った2つが両方とも通ることがない
//   3. 送信できなかったとき（失敗・dry run・資格情報なし）は release() で消す。
//      その日のうちにやり直せる
//
// 送信が成功したときだけロックが残るので、成功した日は二度と送らない。

import fs from "node:fs/promises";
import path from "node:path";

export interface RunLock {
  /** ロックを取れたか。false なら、その日は既に実行済み。 */
  acquired: boolean;
  /** ロックファイルの場所。 */
  path: string;
  /** 取ったロックを外す。取れていない場合は何もしない（他の実行のロックを消さない）。 */
  release(): Promise<void>;
}

export function runLockPath(stateDir: string, key: string, dateJst: string): string {
  return path.join(stateDir, `${key}_${dateJst}.txt`);
}

export async function acquireRunLock(
  stateDir: string,
  key: string,
  dateJst: string,
  isoNow: string,
): Promise<RunLock> {
  const file = runLockPath(stateDir, key, dateJst);
  await fs.mkdir(stateDir, { recursive: true });

  try {
    // wx = 既に存在したら失敗する。作成と存在確認が1回の操作で済むので、
    // 同時に走った2つのプロセスのうち片方だけが必ず失敗する。
    await fs.writeFile(file, isoNow, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return { acquired: false, path: file, release: async () => {} };
    }
    throw error;
  }

  return {
    acquired: true,
    path: file,
    release: async () => {
      try {
        await fs.unlink(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    },
  };
}
