import type { DraftRecord, PlatformDraft } from "../types.js";

/**
 * Instagram専用のキャプションを作る（Instagram集客の導線最適化）。
 *
 * 方針:
 * - InstagramはキャプションのURLがクリックできないため、本文末尾の
 *   「▼公式LINEから https://lin.ee/...」リンクは外す（非クリックで邪魔になるだけ）。
 * - 代わりに「プロフィールのリンク / DMで体験予約」へ誘導するCTAを足す
 *   （Instagram → LINE → 体験予約 の導線）。
 * - 成田ローカル＋ターゲット（初心者・女性・キッズ）のハッシュタグで地域発見を狙う。
 * - CTA・ハッシュタグは env で差し替え可能（OPENQLOW_IG_CTA / OPENQLOW_IG_HASHTAGS）。
 */

const DEFAULT_IG_CTA = [
  "ーーー",
  "📍成田の世界一やさしい格闘技ジム / FLATUP GYM",
  "体験は500円｜初心者・女性・キッズ・親子 歓迎",
  "▶︎ 体験予約は プロフィールのリンク、またはDMで「体験」とどうぞ",
].join("\n");

const DEFAULT_IG_HASHTAGS = [
  "成田", "成田ジム", "成田キックボクシング", "成田習い事", "成田女性",
  "キックボクシング", "ムエタイ", "格闘技", "ボクシング",
  "初心者歓迎", "女性歓迎", "キッズ", "習い事", "ダイエット",
  "FLATUPGYM",
];

/** 本文末尾のLINE友だち追加リンク（▼…公式LINEから + URL）を取り除く。 */
export function stripLineLink(body: string): string {
  return body
    .replace(/\n*▼[^\n]*\n?\s*https?:\/\/\S+/g, "")
    .replace(/\n*https?:\/\/lin\.ee\/\S+/g, "")
    .trim();
}

function normalizeHashtags(source: string): string {
  return source
    .split(/[\s,、]+/)
    .map(tag => tag.trim().replace(/^#+/, ""))
    .filter(Boolean)
    .slice(0, 30) // Instagramのハッシュタグ上限
    .map(tag => `#${tag}`)
    .join(" ");
}

export function buildInstagramCaption(
  record: DraftRecord,
  env: Record<string, string | undefined> = process.env,
): string {
  const draft: PlatformDraft | undefined =
    record.drafts.find(d => d.platform === "threads") ?? record.drafts[0];
  const body = stripLineLink(draft?.body ?? "");
  const cta = (env.OPENQLOW_IG_CTA || DEFAULT_IG_CTA).trim();
  const hashtags = normalizeHashtags(env.OPENQLOW_IG_HASHTAGS || DEFAULT_IG_HASHTAGS.join(" "));
  return [body, cta, hashtags].filter(Boolean).join("\n\n");
}
