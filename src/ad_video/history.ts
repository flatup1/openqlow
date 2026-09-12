// 広告動画: 作ったものを残す（指示書 §11「保存」）。
//
// 生成結果を fal.ai 上だけに置かない。1本ごとに次を追記する:
//   動画の場所 / 使ったプロンプト / モデル / 解像度 / 尺 / 生成日時 / コスト / request_id / 採点 / 改善内容
//
// 同じ失敗を繰り返さないための記録なので、追記だけ。上書きも削除もしない。
// 保存先は Git 追跡外（`.gitignore` の `/runtime/`）。APIキーは絶対に書かない。

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const DEFAULT_HISTORY_SUBDIR = path.join("runtime", "ad_video");
export const HISTORY_FILENAME = "generations.jsonl";

export interface GenerationRecord {
  readonly concept_id: string;
  readonly output_basename: string;
  /** 保存した動画の場所（ローカルパス or 保管先の識別子）。まだ無ければ null。 */
  readonly video_path: string | null;
  readonly prompt: string;
  readonly model_key: string;
  readonly endpoint: string;
  readonly resolution: string;
  readonly duration_seconds: number;
  /** ISO8601。呼び出し側が渡す（この module は時計を読まない）。 */
  readonly generated_at: string;
  readonly estimated_cost_usd: number;
  readonly request_id: string | null;
  /** 100点満点。未採点なら null。 */
  readonly score_total: number | null;
  /** 次に直すこと。 */
  readonly improvement_ja: string | null;
}

export class HistoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HistoryError";
  }
}

/** 秘密情報の取り違えを防ぐ。キーらしき値が混ざっていたら書かずに止める。 */
const SECRET_HINT = /(fal[_-]?key|api[_-]?key|authorization|bearer\s|secret)/i;

export function historyFilePath(root: string): string {
  if (!path.isAbsolute(root)) {
    throw new HistoryError(`保存先は絶対パスで渡す（受け取った値: ${root}）`);
  }
  return path.join(root, DEFAULT_HISTORY_SUBDIR, HISTORY_FILENAME);
}

/** 1本ぶんを追記する。ディレクトリが無ければ作る。 */
export function appendRecord(root: string, record: GenerationRecord): string {
  const line = JSON.stringify(record);
  if (SECRET_HINT.test(line)) {
    throw new HistoryError("記録に秘密情報らしき文字列が入っている。書き込みを中止した");
  }
  const file = historyFilePath(root);
  mkdirSync(path.dirname(file), { recursive: true });
  appendFileSync(file, `${line}\n`, "utf8");
  return file;
}

/** 記録を読み戻す。壊れた行は捨てずに、読めた分だけ返し、件数を添える。 */
export function readRecords(root: string): {
  readonly records: readonly GenerationRecord[];
  readonly broken_lines: number;
} {
  const file = historyFilePath(root);
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return Object.freeze({ records: Object.freeze([]), broken_lines: 0 });
  }

  const records: GenerationRecord[] = [];
  let broken = 0;
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    try {
      records.push(JSON.parse(line) as GenerationRecord);
    } catch {
      broken += 1;
    }
  }
  return Object.freeze({ records: Object.freeze(records), broken_lines: broken });
}
