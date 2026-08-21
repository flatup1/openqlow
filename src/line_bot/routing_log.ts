// 「何が起きたか」を残すだけの運用ログ（エラーではない）。
//
// なぜ分けるか:
//   正常なルーティングを self_repair（エラーログ）へ書くと、本物の障害が
//   毎日の正常記録に埋もれる。障害調査のとき「エラーログを見る」が効かなくなる。
//   起きた事実の記録と、直すべき異常の記録は、置き場所を分ける。
//
// 個人情報は書かない:
//   LINE userId は `pseudonymize` で復元できない短いハッシュにする。
//   本文そのものは残さず、長さだけにする（AGENTS.md「LINE User ID等をログへ不用意に全文出力しない」）。
//   ここへ渡す値も、呼び出し側ではなくこの関数の中で必ず仮名化する。

import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";
import { pseudonymize } from "./pseudonymize.js";

/** 記録できる出来事の種類。増やすときはここに足す。 */
export type RoutingEvent = "brand_growth_routing";

export interface RoutingLogInput {
  /** 出来事の種類 */
  event: RoutingEvent;
  /** LINE userId。この関数の中で仮名化される（生のまま保存されない） */
  lineUserId?: string;
  /** 受信本文。長さだけ記録し、中身は保存しない */
  text?: string;
  /** 分類結果など、個人情報を含まない補足 */
  details?: Record<string, string | undefined>;
}

export interface RoutingLogResult {
  filePath: string;
  line: string;
}

/**
 * 1行のログ本文を作る（I/Oなし・テスト用に公開）。
 * @param at ISO8601 の時刻
 */
export function formatRoutingLogLine(input: RoutingLogInput, at: string): string {
  const parts = [
    at,
    input.event,
    `user=${pseudonymize(input.lineUserId)}`,
    `len=${input.text ? input.text.length : 0}`,
  ];
  for (const [key, value] of Object.entries(input.details ?? {})) {
    parts.push(`${key}=${value || "n/a"}`);
  }
  return parts.join(" ");
}

/**
 * 運用ログを `logs/routing/YYYY-MM-DD.md` へ1行追記する。
 * 失敗しても呼び出し側の処理は止めない（記録は本業ではない）。
 * @param baseDir データのベースディレクトリ
 */
export async function logRoutingEvent(
  input: RoutingLogInput,
  baseDir: string,
  now: Date = new Date(),
): Promise<RoutingLogResult> {
  const at = now.toISOString();
  const line = formatRoutingLogLine(input, at);
  const dir = path.join(baseDir, "logs", "routing");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${at.slice(0, 10)}.md`);
  await appendFile(filePath, `${line}\n`, "utf8");
  return { filePath, line };
}
