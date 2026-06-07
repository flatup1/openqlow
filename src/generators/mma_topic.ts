import { createHash } from "node:crypto";
import type { ContentIdea } from "../types.js";
import { formatDateInTimeZone } from "../utils/date.js";

// canon_2026 連動テーマ（2026-06-06施行の親子割・紹介キャンペーン・太陽のジム・北極星を反映）
// 配列の先頭5つが「canon系新テーマ」、後ろ5つが既存テーマ。
// 日付ベースで3つローテーション選択（毎日違うテーマで配信される）。
const themes = [
  // ===== Canon 2026 新テーマ =====
  {
    theme: "親子で始める、優しい強さ",
    angle: "親子で月-¥500。怒鳴らない太陽のジムで、家族の時間が増える",
    audience: "kids_parents" as const,
  },
  {
    theme: "お友達と一緒に始める格闘技",
    angle: "ご紹介でお友達がご入会されると、紹介者と新入会者の両方にバンテージプレゼント",
    audience: "beginners" as const,
  },
  {
    theme: "昨日の自分を、ほんの少し超える",
    angle: "強くなることは、優しくなること。勝ち負けより、自分との約束を守る場所",
    audience: "beginners" as const,
  },
  {
    theme: "太陽のジムって、どんな空気？",
    angle: "怒鳴らない・笑顔がある・初心者が安心して通える格闘技。怖くないキックボクシング",
    audience: "beginners" as const,
  },
  {
    theme: "UIZIN（初陣）で分かる、強さの正体",
    angle: "敵は相手じゃない、敵は自分だ。勝ち負けより、自分の超え方を仲間と分かち合う",
    audience: "kids_parents" as const,
  },
  // ===== 既存テーマ（バックアップ） =====
  {
    theme: "弱い自分と戦う人へ",
    angle: "格闘技は相手を倒す前に、自分の不安と向き合う練習になる",
    audience: "beginners" as const,
  },
  {
    theme: "親が安心できるキッズ格闘技",
    angle: "勝ち負けより、礼儀と挑戦する勇気を育てる",
    audience: "kids_parents" as const,
  },
  {
    theme: "女性が安心して始める格闘技",
    angle: "強さを押し付けず、自分を守れる感覚を少しずつ作る",
    audience: "women" as const,
  },
  {
    theme: "MMAから学ぶ安全な成長",
    angle: "強い選手ほど基礎と安全管理を大事にしている",
    audience: "mma_fans" as const,
  },
  {
    theme: "成田で始める最初の一歩",
    angle: "運動が苦手でも、怖くない環境なら挑戦は続けやすい",
    audience: "local_narita" as const,
  },
];

export function buildMmaIdeas(date = new Date()): ContentIdea[] {
  const isoDate = formatDateInTimeZone(date);
  // canon系（先頭5つ）から3つを日替わりローテーション選択。
  // 既存テーマ（インデックス5-9）は当面待機。必要に応じて将来mix予定。
  const dayIndex = date.getDate();
  const canonPoolSize = 5;
  const selected: typeof themes = [
    themes[dayIndex % canonPoolSize],
    themes[(dayIndex + 1) % canonPoolSize],
    themes[(dayIndex + 2) % canonPoolSize],
  ];
  return selected.map((item, index) => {
    const seed = `${isoDate}:${item.theme}:${index}`;
    const id = `idea_${createHash("sha1").update(seed).digest("hex").slice(0, 10)}`;
    return {
      id,
      date: isoDate,
      theme: item.theme,
      angle: item.angle,
      audience: item.audience,
      source: "mma_topic",
      valueConnection: "FLATUPの安全思想、初心者へのやさしさ、挑戦する勇気に接続する。",
    };
  });
}
