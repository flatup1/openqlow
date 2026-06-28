import { readdir } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";
import type { ContentIdea, DraftRecord, PlatformDraft } from "../types.js";
import { formatApprovalMessage } from "../approval/message.js";
import { checkDraftSafety } from "../safety/check.js";
import { saveRecord } from "../state/file_store.js";
import { FLATUP_CANON } from "../shared/canon.js";
import { consumeRecentUploadedMedia } from "./pending_media.js";

export interface MorningCandidateInput {
  dateJst: string;
}

function yyyymmdd(dateJst: string): string {
  return dateJst.replaceAll("-", "");
}

async function nextMorningApprovalId(root: string, dateJst: string): Promise<string> {
  const date = yyyymmdd(dateJst);
  const dir = path.join(root, "state");
  const files = await readdir(dir).catch(() => []);
  const used = files
    .map((file) => file.match(new RegExp(`^FG-${date}-(\\d{3})\\.json$`))?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number(value));

  let index = 901;
  while (used.includes(index)) index += 1;
  return `FG-${date}-${String(index).padStart(3, "0")}`;
}

function allDraftText(drafts: PlatformDraft[]): string {
  return drafts.map(draft => `${draft.body}\n${draft.cta}\n${draft.hashtags.join(" ")}`).join("\n\n");
}

interface MorningPost {
  body: string;
  hashtags: string[];
}

// 公開投稿は内部記録（会員名・入会状況・個別対応）を一切出さず、ブランドの芯だけを温かく伝える。
// 「世界一優しい格闘技ジム」の声で、初心者・女性・キッズ・保護者が安心できる招待文にする。
// 料金・持ち物・クラス等の事実は正本(FLATUP_CANON)から引き（直書きしない）、毎日同じにならないよう日付で選ぶ。
function morningPostVariants(): MorningPost[] {
  const trial = FLATUP_CANON.trialFirst; // 例: 初回体験500円
  const bring = FLATUP_CANON.bring; // 例: 動きやすい服・タオル・水
  return [
    {
      body: [
        "「強くなりたい」も「ただ体を動かしたい」も、どちらも大歓迎です。",
        "",
        "FLATUP GYMは、怒鳴らない・威圧しない、初心者も女性もキッズも安心して通える格闘技ジム。",
        `はじめての方は${trial}から、気軽にどうぞ。`,
        "",
        "勝ち負けより、挑戦するあなたを応援します。",
      ].join("\n"),
      hashtags: ["FLATUPGYM", "成田", "格闘技", "初心者歓迎"],
    },
    {
      body: [
        "「格闘技ってこわい?」——大丈夫です。",
        "",
        "運動が苦手でも、体力に自信がなくても、一人ひとりのペースで始められます。",
        "スタッフは、あなたの「できた」を一緒に喜ぶ仲間です。",
        "",
        `成田で、世界一優しい格闘技ジム。まずは見学・${trial}からどうぞ。`,
      ].join("\n"),
      hashtags: ["FLATUPGYM", "成田", "キックボクシング", "体験"],
    },
    {
      body: [
        "お子さんの「やってみたい」、お母さんの「私も動きたい」。",
        "",
        "FLATUP GYMは、キッズもレディースも安心して通える場所です。",
        "できないことを責めない。できたことを、一緒に喜ぶ。",
        "",
        "そんな太陽みたいなジムで、はじめの一歩を踏み出しませんか。",
      ].join("\n"),
      hashtags: ["FLATUPGYM", "成田", "キッズ", "習い事"],
    },
    {
      body: [
        "強さは、急に作るものじゃない。",
        "昨日より少しだけ自分と向き合えた——それで十分かっこいいんです。",
        "",
        "FLATUP GYMは、その小さな一歩を静かに応援します。",
        `初心者大歓迎。${trial}から、お待ちしています。`,
      ].join("\n"),
      hashtags: ["FLATUPGYM", "成田", "ボクシング", "ダイエット"],
    },
    {
      body: [
        "ここには、年齢も体力もバラバラの仲間がいます。",
        "共通しているのは「自分のペースで前に進みたい」という気持ちだけ。",
        "",
        "怒鳴らない・比べない・置いていかない。",
        "成田の世界一優しい格闘技ジム、FLATUP GYMです。",
      ].join("\n"),
      hashtags: ["FLATUPGYM", "成田", "ムエタイ", "社会人"],
    },
    {
      body: [
        "ボクシング、キックボクシング、ムエタイ、寝技、柔術、MMA……。",
        "",
        "「どれが合うかな?」は、やってみてから決めて大丈夫。",
        "気になったものから、ひとつずつ体験できます。",
        "",
        `成田のFLATUP GYMで、まずは${trial}から。`,
      ].join("\n"),
      hashtags: ["FLATUPGYM", "成田", "総合格闘技", "ブラジリアン柔術"],
    },
    {
      body: [
        "体験は、手ぶらでOK。",
        "グローブもレガースも貸し出します。",
        `持ち物は「${bring}」だけで大丈夫です。`,
        "",
        `気負わず、${trial}でのぞいてみてください。スタッフが最後まで隣で見ています。`,
      ].join("\n"),
      hashtags: ["FLATUPGYM", "成田", "体験", "キックボクシング"],
    },
    {
      body: [
        "親子で同じジムに通える——それって、けっこう特別なことかもしれません。",
        "",
        "FLATUP GYMは、お子さんのキッズクラスも、お母さん・お父さんのクラスもあります。",
        "送り迎えのついでに、ご自身も少しだけ体を動かしてみませんか。",
        "",
        "成田の、世界一優しい格闘技ジムです。",
      ].join("\n"),
      hashtags: ["FLATUPGYM", "成田", "親子", "キッズ"],
    },
  ];
}

// 夏（6〜9月）向けの最適化コピー。暑さ・夏休み・水分補給など季節の入口で誘う。
// 医療・減量の断定（痩せる/絶対/必ず 等）は使わず、「動いて気持ちいい」を軸にする。
function summerPostVariants(): MorningPost[] {
  const trial = FLATUP_CANON.trialFirst; // 例: 初回体験500円
  const bring = FLATUP_CANON.bring; // 例: 動きやすい服・タオル・水
  return [
    {
      body: [
        "この夏、お子さんの「やってみたい!」を応援しませんか。",
        "",
        "FLATUP GYMのキッズクラスは、礼儀も体力も、楽しみながら身につきます。",
        `夏休みの習い事に、まずは${trial}から。`,
      ].join("\n"),
      hashtags: ["FLATUPGYM", "成田", "夏休み", "キッズ"],
    },
    {
      body: [
        "外は暑い。でも、ジムの中はあなたに集中できる時間。",
        "",
        "冷房の効いた室内で、水分をとりながら、自分のペースで体を動かしませんか。",
        `初心者も女性も安心。成田のFLATUP GYM、${trial}からどうぞ。`,
      ].join("\n"),
      hashtags: ["FLATUPGYM", "成田", "キックボクシング", "運動不足解消"],
    },
    {
      body: [
        "夏バテ気味の体に、ほどよい運動を。",
        "",
        "激しすぎず、楽しく汗をかけるのがFLATUP GYM。",
        "怒鳴らない・比べない、世界一優しい格闘技ジムです。",
        `${trial}から、気軽に。`,
      ].join("\n"),
      hashtags: ["FLATUPGYM", "成田", "ムエタイ", "夏"],
    },
    {
      body: [
        "暑い夏こそ、新しいことを始める季節。",
        "",
        "ボクシング、キック、ムエタイ、寝技、柔術……気になったものから体験できます。",
        "成田のFLATUP GYMで、自分だけの一歩を。",
      ].join("\n"),
      hashtags: ["FLATUPGYM", "成田", "総合格闘技", "習い事"],
    },
    {
      body: [
        "夏休みは、親子で同じジムに通えるチャンス。",
        "",
        "FLATUP GYMなら、お子さんのキッズクラスも、お母さん・お父さんのクラスもあります。",
        "送り迎えのついでに、ご自身も少しだけ汗を流しませんか。",
      ].join("\n"),
      hashtags: ["FLATUPGYM", "成田", "親子", "夏休み"],
    },
    {
      body: [
        "「夏のあいだに、何か体を動かしたいな」",
        "",
        `その気持ちだけで、もう十分。手ぶらでOK、持ち物は「${bring}」だけ。`,
        "グローブもレガースも貸し出します。",
        `スタッフが最後まで隣で見ています。FLATUP GYMの${trial}からどうぞ。`,
      ].join("\n"),
      hashtags: ["FLATUPGYM", "成田", "体験", "夏"],
    },
  ];
}

function isSummer(dateJst: string): boolean {
  const month = Number.parseInt(dateJst.slice(5, 7), 10);
  return month >= 6 && month <= 9; // 6〜9月は夏コピーを使う
}

// 成田・空港圏の外国人居住者/旅行者向けに、日本語本文へ短い多言語の招待を併記する。
// 価格は正本(FLATUP_CANON.trialFirst)から数字だけ抜き出して各言語に反映（直書きしない）。
function multilingualFooter(): string {
  const price = FLATUP_CANON.trialFirst.match(/\d[\d,]*/)?.[0] ?? "500"; // 例: 500
  return [
    "───────",
    `🌏 EN: Beginners, women & kids welcome. First trial ¥${price}. Narita's kindest martial arts gym.`,
    `🇨🇳 欢迎初学者、女性和儿童。首次体验${price}日元。成田最友善的格斗馆。`,
    `🇰🇷 초보자·여성·어린이 환영. 첫 체험 ${price}엔. 나리타에서 가장 친절한 격투기 체육관.`,
    `🇹🇭 ยินดีต้อนรับผู้เริ่มต้น ผู้หญิง และเด็ก ทดลองครั้งแรก ${price} เยน`,
  ].join("\n");
}

function buildMorningPost(dateJst: string): MorningPost {
  const variants = isSummer(dateJst) ? summerPostVariants() : morningPostVariants();
  const key = Number.parseInt(yyyymmdd(dateJst), 10);
  const index = Number.isFinite(key) ? key % variants.length : 0;
  const base = variants[index];
  return { body: `${base.body}\n\n${multilingualFooter()}`, hashtags: base.hashtags };
}

export async function createMorningPublishCandidate(
  input: MorningCandidateInput
): Promise<DraftRecord> {
  const config = loadConfig();
  const id = await nextMorningApprovalId(config.root, input.dateJst);
  const now = new Date().toISOString();
  const idea: ContentIdea = {
    id,
    date: input.dateJst,
    theme: "FLATUP GYMの招待（世界一優しい格闘技ジム）",
    angle: "初心者・女性・キッズ・保護者が安心できる、温かい入口を伝える",
    audience: "local_narita",
    source: "obsidian_inbox",
    valueConnection: "朝の営業記録は内部に留め、個人情報を出さずブランドの芯だけをSNS投稿候補にする。",
    canonReferences: [
      {
        layer: "AGENTS.md",
        canonPath: "AGENTS.md#Daily openQLOW Dialogue",
        description: "毎朝のopenQLOWヒアリングと人間確認ルール",
      },
    ],
  };

  const post = buildMorningPost(input.dateJst);
  const drafts: PlatformDraft[] = [
    {
      id: `${id}_threads`,
      ideaId: id,
      approvalId: id,
      platform: "threads",
      publicationLevel: "level_2_draft",
      body: post.body,
      hashtags: post.hashtags,
      cta: "",
      safetyNotes: [
        "朝の内部記録から個人名や個別対応の詳細は出さない。",
        "公開はOKコマンド後の投稿準備まで。最終投稿はオーナー確認。",
      ],
      createdAt: now,
    },
  ];

  const safety = checkDraftSafety(allDraftText(drafts));

  // 「写真→投稿」「投稿→写真」どちらの順でも画像が付くよう、直近に送られた写真を引き継ぐ。
  const adoptedMedia = await consumeRecentUploadedMedia(config.root);
  const approvalMessage = adoptedMedia
    ? `📷 さきほど送ってもらった写真を、この投稿に添付しました（Instagram投稿に使えます）。\n\n${formatApprovalMessage(idea, drafts, safety)}`
    : formatApprovalMessage(idea, drafts, safety);

  const record: DraftRecord = {
    id,
    idea,
    drafts,
    status: "pending_approval",
    approvalMessage,
    createdAt: now,
    updatedAt: now,
    ...(adoptedMedia ? { mediaFiles: [adoptedMedia] } : {}),
  };

  await saveRecord(config.root, record);
  return record;
}
