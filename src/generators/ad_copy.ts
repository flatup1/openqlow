// FLATUP集客AI司令塔 — 広告文生成（スペック ⑦）
//
// ターゲット×媒体ごとに、Google広告 / Instagram広告 / LINE配信用の広告文を生成する。
// 既存の問い合わせ返信・体験後フォローと同じく、コンテンツ層（Claude担当）の純粋関数。
//
// 安全方針:
//   - 生成のみ。配信は人間が確認してから行う（自動配信なし）。
//   - 誇大表現（「必ず痩せる」等）・ビフォーアフター煽り・体型を否定する表現は使わない。
//   - 医療的・法律的な断定をしない。
//   - 料金は FLATUP_INFO（正本値）の初回体験500円を使用する。
//
// 広告は AIKA 個人の1:1返信ではなく媒体向けの配信文のため、末尾「AIKA」署名は付けない。

import { FLATUP_INFO } from "./inquiry_reply.js";

export type AdSegment =
  | "women_beginner"
  | "kids"
  | "men_40s"
  | "diet"
  | "self_defense"
  | "exercise_shortage";

export type AdPlatform = "google" | "instagram" | "line";

export const AD_SEGMENTS: AdSegment[] = [
  "women_beginner",
  "kids",
  "men_40s",
  "diet",
  "self_defense",
  "exercise_shortage",
];

export interface AdCopyInput {
  segment: AdSegment;
}

export interface GoogleAd {
  /** 見出し（全角15文字程度が目安） */
  headlines: string[];
  /** 説明文（全角45文字程度が目安） */
  descriptions: string[];
}

export interface InstagramAd {
  caption: string;
  hashtags: string[];
}

export interface AdCopyVariant {
  google: GoogleAd;
  instagram: InstagramAd;
  line: string;
}

export interface AdCopyResult {
  segment: AdSegment;
  label: string;
  variant: AdCopyVariant;
  notes: string[];
}

interface SegmentDef {
  label: string;
  /** Google見出し用の短いフック（全角10文字前後） */
  shortHead: string;
  /** 課題提起（共感フック） */
  hook: string;
  /** FLATUPの価値 */
  value: string;
  /** 安心材料 */
  proof: string;
  /** Instagram用ハッシュタグ（# は付けない） */
  tags: string[];
}

const COMMON_TAGS = ["成田市", "キックボクシング", "成田キックボクシング"];

const SEGMENTS: Record<AdSegment, SegmentDef> = {
  women_beginner: {
    label: "女性初心者",
    shortHead: "女性初心者も安心",
    hook: "「ジムは怖い、続くか不安」——そんな女性にこそ来てほしいジムです。",
    value: "女性インストラクターが在籍し、怒鳴らない雰囲気で初心者の方が通いやすいキックボクシング。",
    proof: "ガチスパー禁止で安全第一。運動が苦手でも、自分のペースで大丈夫です。",
    tags: ["女性向けジム", "初心者歓迎", "キックボクシング女子"],
  },
  kids: {
    label: "キッズ",
    shortHead: "礼儀と自信が育つ",
    hook: "礼儀・集中力・自信を、楽しく身につけるキッズキックボクシング。",
    value: "勝ち負けより「昨日の自分を超える」を大切にする、太陽のような雰囲気のジムです。",
    proof: "怒鳴らない指導で、はじめてのお子様も安心して続けられます。",
    tags: ["習い事", "キッズ格闘技", "成田キッズ"],
  },
  men_40s: {
    label: "40代男性",
    shortHead: "40代から始める",
    hook: "「運動不足、でも今さら…」は、もう終わりにしませんか。",
    value: "40代からでも無理なく始められるキックボクシング。仕事帰りに気持ちよく汗を流せます。",
    proof: "平日夜も通いやすく、24時間サンドバッグ利用も可能。専用駐車場あり。",
    tags: ["40代", "運動不足解消", "ストレス発散"],
  },
  diet: {
    label: "ダイエット",
    shortHead: "楽しく続く運動",
    hook: "続かないダイエットに、楽しさを取り戻しませんか。",
    value: "サンドバッグを打つたびにスッキリ。楽しく動いて続けやすいキックボクシングです。",
    proof: "初心者・運動が苦手な方も、無理のないペースで体を動かせます。",
    tags: ["ダイエット", "有酸素運動", "ストレス発散"],
  },
  self_defense: {
    label: "護身",
    shortHead: "護身にもつながる",
    hook: "いざという時に、落ち着いて動ける自分へ。",
    value: "基礎から安全に学べるキックボクシング。護身にもつながる体の使い方が身につきます。",
    proof: "ガチスパー禁止なので、痛い・怖いが苦手な方でも安心して始められます。",
    tags: ["護身術", "初心者歓迎", "自分を守る"],
  },
  exercise_shortage: {
    label: "運動不足",
    shortHead: "運動不足を解消",
    hook: "体、なまっていませんか？久しぶりの運動にこそキックボクシング。",
    value: "運動が久しぶりの方でも続けやすく、楽しく体を動かせるジムです。",
    proof: "初心者歓迎、怒鳴らない太陽のジム。専用駐車場ありで通いやすい立地です。",
    tags: ["運動不足解消", "初心者歓迎", "健康づくり"],
  },
};

const TRIAL_CTA = `初回体験は${FLATUP_INFO.trialFirst.replace("初回体験", "").trim()}。まずは見学だけでもお気軽にどうぞ。`;

function buildGoogle(def: SegmentDef): GoogleAd {
  return {
    headlines: ["成田のキックボクシング", def.shortHead, "初回体験500円"],
    descriptions: [
      `${def.value}`,
      `${def.proof} ${TRIAL_CTA}`,
    ],
  };
}

function buildInstagram(def: SegmentDef): InstagramAd {
  const caption = [def.hook, "", def.value, def.proof, "", TRIAL_CTA].join("\n");
  return {
    caption,
    hashtags: [...def.tags, ...COMMON_TAGS],
  };
}

function buildLine(def: SegmentDef): string {
  return [
    def.hook,
    def.value,
    def.proof,
    TRIAL_CTA,
  ].join("\n");
}

/**
 * ターゲットセグメントの広告文（Google / Instagram / LINE）を生成する。
 * 配信は行わない。必ず人間が確認してから配信すること。
 */
export function generateAdCopy(input: AdCopyInput): AdCopyResult {
  const def = SEGMENTS[input.segment];
  if (!def) {
    throw new Error(`unknown ad segment: ${input.segment}`);
  }

  const variant: AdCopyVariant = {
    google: buildGoogle(def),
    instagram: buildInstagram(def),
    line: buildLine(def),
  };

  const notes = [
    "⚠ これは下書きです。自動配信はしません。配信前に必ず内容を確認してください。",
    "誇大表現（必ず痩せる等）・ビフォーアフター煽り・体型を否定する表現は避けています。",
    "料金は正本（FLATUP_INFO）の初回体験500円を使用しています。変更時は正本を更新してください。",
    "Google広告の見出しは全角15文字・説明文は全角45文字程度が目安です。媒体の文字数制限に合わせて調整してください。",
  ];

  return { segment: input.segment, label: def.label, variant, notes };
}
