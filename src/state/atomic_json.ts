import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";

/**
 * ファイルを「いったん隣へ書いてから置き換える」形で保存する。
 *
 * writeFile だけだと、途中で止まったとき書きかけの壊れたファイルが残る。
 * 一時ファイル名は毎回変える（同時に書いたとき互いの一時ファイルを奪い合わない）。
 */
export async function writeFileAtomic(file: string, text: string): Promise<void> {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, text, "utf8");
  await rename(temporary, file);
}

export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * JSONを読む。「無い」ときだけ undefined を返す。
 *
 * 読めなかった・壊れていた場合は例外にする。「読めなかった」を「無い」と
 * 同じに扱うと、あとで空の状態を書き戻して本物を消してしまう。
 */
export async function readJsonIfExists<T>(file: string): Promise<T | undefined> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return undefined;
    throw error;
  }
  return JSON.parse(text) as T;
}

/**
 * JSONを読む。処理を止めたくない台帳向け。
 *
 * - 無いとき: undefined
 * - 中身が壊れているとき: 元のファイルを `.corrupt-<時刻>` へ退避して undefined
 *   （空で上書きしても、壊れた元の中身は消えずに残る）
 * - 読めないとき（権限・I/Oエラー）: 例外。「読めなかった」を「無い」と同じに
 *   すると、空の状態を書き戻して本物を消してしまう。
 */
export async function readJsonOrQuarantine<T>(file: string, now: Date = new Date()): Promise<T | undefined> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return undefined;
    throw error;
  }
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    try {
      // 名前に乱数を足す。同じミリ秒に二度退避しても、証拠を上書きしない。
      await rename(file, `${file}.corrupt-${stamp}-${randomUUID().slice(0, 8)}`);
    } catch (renameError) {
      // 同時に別の読み手が先に退避していた。壊れていた事実は変わらないので、空として続ける。
      if ((renameError as NodeJS.ErrnoException).code !== "ENOENT") throw renameError;
    }
    return undefined;
  }
}
