// 広告動画: 検証する広告仮説（コンセプト）。
//
// 参照: 指示書 §9「量産ルール」STEP1 / §17「最初の実行」/ §5「動画の目的」/ §6「主なターゲット」。
//
// 決めごと:
//   - 最初のバッチは「初心者女性がFLAT UP GYMを初めて体験する」1テーマで5案（§17）。
//   - 料金・住所・時間は書かない。CTAは `src/shared/canon.ts` から引く（正本は1か所）。
//   - プロンプトは英語。モデルに渡す文字列そのもの。
//   - 5秒1本につき、動作は1つだけ（詰め込むとAI感と破綻が出る）。

import { FLATUP_CANON } from "../shared/canon.js";
import type { FalTaskKind } from "./catalog.js";

/** 5秒の中の1コマ。 */
export interface Beat {
  /** 何秒のところか（例 "0.0-1.5s"）。 */
  readonly at: string;
  readonly ja: string;
}

export interface AdConcept {
  /** ファイル名にもなる識別子（指示書 §12）。 */
  readonly id: string;
  readonly title_ja: string;
  /** この1本で何を狙うか。 */
  readonly aim_ja: string;
  readonly target_ja: string;
  /** 5秒の構成。 */
  readonly beats: readonly Beat[];
  /** モデルへ渡す本文。 */
  readonly prompt_en: string;
  /** 絵に入れたくないもの（人が読む用。モデルは negative 引数を持たない前提）。 */
  readonly avoid_ja: readonly string[];
  /** 動画の最後に重ねる誘導の一言。送信・公開は承認後。 */
  readonly cta_ja: string;
  /** 押した先。 */
  readonly cta_destination: "line" | "lp";
  readonly task_kind: FalTaskKind;
  /** image_to_video にするなら、どの素材が要るか。text_to_video なら null。 */
  readonly needed_asset_ja: string | null;
}

/** 全案に共通で足す、FLATUPらしさの土台。 */
const BASE_SCENE_EN =
  "Bright, clean, modern Japanese martial arts gym in the daytime. Large windows, warm natural light, " +
  "pale wood floor, tidy equipment. Calm and welcoming atmosphere. Realistic documentary look, " +
  "handheld but steady, shallow depth of field, natural color grading. Vertical 9:16 framing.";

/**
 * 全案に共通で足す、避けたいものの一言。
 * モデルに negative 引数が無いので、送る直前に本文の後ろへ足す（`plan.ts`）。
 * `prompt_en` 自体には入れない。入れると表現チェック（`guard.ts`）が
 * 「避けたい語」と「描いてほしい語」を区別できなくなるため。
 */
export const BASE_AVOID_EN =
  "Avoid: dark or basement setting, harsh red lighting, injuries, anyone shouting, crowding, " +
  "anyone looking scared or humiliated, on-screen text, logos, watermarks.";

const CTA_TRIAL = `まずは${FLATUP_CANON.trialFirst}から`;
const CTA_LINE = "LINEで空いている日を聞いてみる";

export const AD_CONCEPTS: readonly AdConcept[] = Object.freeze([
  Object.freeze({
    id: "flatup_women_beginner_001",
    title_ja: "入口で止まっていた人",
    aim_ja: "「格闘技ジム＝怖い」を最初の1秒で否定する。入口の心理的ハードルを下げる。",
    target_ja: "格闘技未経験の20〜40代女性。前から気になっているが、扉を開けられていない人。",
    beats: Object.freeze([
      Object.freeze({ at: "0.0-1.5s", ja: "扉の前。少し息を整える手元と肩。表情は不安寄り。" }),
      Object.freeze({ at: "1.5-3.5s", ja: "扉が開き、明るく清潔な室内が一気に見える。" }),
      Object.freeze({ at: "3.5-5.0s", ja: "中の人が顔を上げて、静かに会釈する。表情がゆるむ。" }),
    ]),
    prompt_en:
      `${BASE_SCENE_EN} A Japanese woman in her early thirties in plain workout clothes stands at the ` +
      "entrance door, takes one steady breath, then opens it. The door swings open and the bright, " +
      "airy training room is revealed. A friendly instructor inside looks up and gives a small, warm nod. " +
      "Her nervous expression softens into a shy smile. One continuous shot.",
    avoid_ja: Object.freeze(["暗い廊下", "大人数がこちらを見る画", "看板・ロゴの写り込み"]),
    cta_ja: CTA_TRIAL,
    cta_destination: "line",
    task_kind: "text_to_video",
    needed_asset_ja: null,
  }),
  Object.freeze({
    id: "flatup_women_beginner_002",
    title_ja: "はじめてのミット",
    aim_ja: "3秒以内の引きと達成感を同時に作る。体験の中身を1動作で伝える。",
    target_ja: "運動が続かなかった20〜40代女性。「私にもできる」を確かめたい人。",
    beats: Object.freeze([
      Object.freeze({ at: "0.0-1.0s", ja: "ミットが構えられ、彼女がそこを見る。" }),
      Object.freeze({ at: "1.0-2.5s", ja: "まっすぐ1発。当たる音が想像できる当たり方。" }),
      Object.freeze({ at: "2.5-5.0s", ja: "自分で驚いて笑う。インストラクターも笑う。" }),
    ]),
    prompt_en:
      `${BASE_SCENE_EN} A Japanese woman in her thirties, clearly a beginner, wearing borrowed gloves, ` +
      "throws one straight punch into a coaching mitt held by a calm instructor standing beside her. " +
      "The mitt moves with the impact. She immediately breaks into a surprised, delighted laugh and looks " +
      "at the instructor, who smiles back and nods. One single action, one continuous shot.",
    avoid_ja: Object.freeze(["連打", "相手のいる打ち合い", "痛そうな表情"]),
    cta_ja: CTA_TRIAL,
    cta_destination: "line",
    task_kind: "text_to_video",
    needed_asset_ja: null,
  }),
  Object.freeze({
    id: "flatup_women_beginner_003",
    title_ja: "教わり方が見える",
    aim_ja: "怒鳴らない・置いていかないを、説明ではなく絵で見せる。安心感の核。",
    target_ja: "強い人に混じるのが怖い女性。体育会系の空気が苦手な人。",
    beats: Object.freeze([
      Object.freeze({ at: "0.0-2.0s", ja: "インストラクターが横に立ち、拳の形をそっと直す。" }),
      Object.freeze({ at: "2.0-3.5s", ja: "彼女がうなずいて、もう一度構え直す。" }),
      Object.freeze({ at: "3.5-5.0s", ja: "二人とも小さく笑う。距離が近すぎない。" }),
    ]),
    prompt_en:
      `${BASE_SCENE_EN} A patient instructor stands beside a Japanese woman in her thirties and gently ` +
      "adjusts the shape of her fist and the angle of her shoulder, speaking quietly. She listens, nods, " +
      "and resets her stance. Both share a small quiet laugh. Respectful distance, no physical restraint. " +
      "Unhurried pace. One continuous shot.",
    avoid_ja: Object.freeze(["密着しすぎる指導", "見下ろす角度", "他の人が見ている画"]),
    cta_ja: CTA_TRIAL,
    cta_destination: "line",
    task_kind: "text_to_video",
    needed_asset_ja: null,
  }),
  Object.freeze({
    id: "flatup_women_beginner_004",
    title_ja: "隣も初心者",
    aim_ja: "「一人だけ浮く」不安を消す。比べない空気を見せる。",
    target_ja: "一人で申し込むのが不安な女性。友達と来たいと思っている人。",
    beats: Object.freeze([
      Object.freeze({ at: "0.0-2.0s", ja: "同じくらいの初心者2人が並んで、同じ動きをゆっくり。" }),
      Object.freeze({ at: "2.0-3.5s", ja: "片方がずれて、二人で顔を見合わせて笑う。" }),
      Object.freeze({ at: "3.5-5.0s", ja: "もう一度そろえる。上手さより空気。" }),
    ]),
    prompt_en:
      `${BASE_SCENE_EN} Two Japanese women in their twenties and thirties stand side by side, both clearly ` +
      "beginners, slowly repeating the same simple guard motion. One of them is slightly out of sync; they " +
      "glance at each other and laugh, relaxed and unembarrassed, then try again together. Nobody is " +
      "watching or judging them. One continuous shot.",
    avoid_ja: Object.freeze(["上手い人と並ぶ画", "順番待ちの列", "競争に見える構図"]),
    cta_ja: CTA_LINE,
    cta_destination: "line",
    task_kind: "text_to_video",
    needed_asset_ja: null,
  }),
  Object.freeze({
    id: "flatup_women_beginner_005",
    title_ja: "帰り道の顔",
    aim_ja: "体験後の自分を想像させる。入会に一番近い感情（やってよかった）を置く。",
    target_ja: "自分のための時間がほしい30〜40代女性。続けられるか不安な人。",
    beats: Object.freeze([
      Object.freeze({ at: "0.0-2.0s", ja: "汗をタオルで拭きながら、荷物を持つ。" }),
      Object.freeze({ at: "2.0-3.5s", ja: "扉を出るときに一度だけ振り返る。" }),
      Object.freeze({ at: "3.5-5.0s", ja: "外の光。歩き出す。表情が明るい。" }),
    ]),
    prompt_en:
      `${BASE_SCENE_EN} A Japanese woman in her thirties wipes her forehead with a towel, picks up her bag, ` +
      "and walks toward the exit. At the door she glances back once into the room with a satisfied " +
      "expression, then steps out into soft daylight and starts walking, looking calm and pleased with " +
      "herself. One continuous shot.",
    avoid_ja: Object.freeze(["疲れ切った表情", "夜の暗い道", "住所が分かる看板"]),
    cta_ja: CTA_TRIAL,
    cta_destination: "lp",
    task_kind: "text_to_video",
    needed_asset_ja: null,
  }),
]);

export function findConcept(id: string): AdConcept | null {
  return AD_CONCEPTS.find(c => c.id === id) ?? null;
}
