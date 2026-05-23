import { createHash } from "node:crypto";
import type { ContentIdea } from "../types.js";
import { formatDateInTimeZone } from "../utils/date.js";

const themes = [
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
  return themes.slice(0, 3).map((item, index) => {
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
