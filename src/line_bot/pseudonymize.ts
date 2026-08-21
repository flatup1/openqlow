// ログに人を書かないための仮名化。
//
// 運用では「同じ人が何度も来ているか」を追えないと困る。しかし LINE userId を
// そのままログへ書くと、ログが個人情報の塊になる（AGENTS.md / 指示書§26 で禁止）。
// そこで、元に戻せないハッシュの先頭だけを使う。
//   - 同じ人 → 毎回同じ表記になる（追跡できる）
//   - 表記 → 元のIDには戻せない（漏れても本人に辿り着けない）
//
// 既存の crm_intake.ts が外部ID生成で使っている sha256 と同じ考え方で、依存を増やさない。

import crypto from "node:crypto";

/**
 * LINE userId などの識別子を、ログに書ける短い仮名にする。
 * 空なら "anonymous"。
 * @param id 仮名化したい識別子
 * @param length 仮名の長さ（既定8桁。衝突より読みやすさを優先）
 */
export function pseudonymize(id: string | undefined, length = 8): string {
  if (!id) return "anonymous";
  const digest = crypto.createHash("sha256").update(id).digest("hex").slice(0, length);
  return `u_${digest}`;
}
