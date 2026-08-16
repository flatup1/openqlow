// Brand Growth Phase 3 Director: 人の状況と感情の流れ。
//
// 参照: PROMPT_BIBLE の rule-based baseline。
// ここは「誰の、どんな気持ちの話か」を決める場所であり、画の話はまだしない。
//
// 事実（料金・時間・住所）は一切書かない。

import type { PersonContext, StoryRoleOfFlatup } from "../contracts/creative_brief.js";
import type { TargetPrimary } from "../contracts/route_decision.js";

export interface ArcBaseline {
  readonly person_context: PersonContext;
  /** 感情の移り変わり。緊張から始めて、良い余韻で終える。 */
  readonly arc: readonly string[];
  readonly story_role_of_flatup: StoryRoleOfFlatup;
  readonly audio_intent: string;
}

/**
 * Target ごとの土台。
 * 主人公は必ずお客さま。FLATUP は場所・仲間・導き手・舞台のいずれか。
 */
const BASELINE: Record<TargetPrimary, ArcBaseline> = {
  women_beginners: {
    person_context: {
      fear: "こわい人がいそう、浮いてしまいそう",
      frustration: "運動を始めても続かなかった",
      desire: "自分のことを少し好きになりたい",
      barrier: "何から始めればいいか分からない",
    },
    arc: ["緊張", "小さな一歩", "初めてのミット", "笑顔"],
    story_role_of_flatup: "safe_place",
    audio_intent: "静かで柔らかい。打撃音は強調しすぎない",
  },
  women_30_40: {
    person_context: {
      fear: "若い人ばかりだったら気まずい",
      frustration: "自分の時間が取れない",
      desire: "体力と気持ちを取り戻したい",
      barrier: "続けられる自信がない",
    },
    arc: ["ためらい", "やってみる", "できた", "また来たくなる"],
    story_role_of_flatup: "safe_place",
    audio_intent: "落ち着いたテンポ。急かさない",
  },
  kids: {
    person_context: {
      fear: "怒られたらいやだ",
      frustration: "うまくできないとつまらない",
      desire: "できた！と言いたい",
      barrier: "知らない場所がちょっと不安",
    },
    arc: ["わくわく", "やってみる", "できた", "もっとやりたい"],
    story_role_of_flatup: "stage_for_challenge",
    audio_intent: "明るく軽い。うるさくしない",
  },
  kids_parents: {
    person_context: {
      fear: "うちの子が馴染めるか心配",
      frustration: "習い事が続かない",
      desire: "子どもに自信を持ってほしい",
      barrier: "雰囲気が分からないと決められない",
    },
    arc: ["ためらい", "一緒にやってみる", "ハイタッチ", "また来たい"],
    story_role_of_flatup: "safe_place",
    audio_intent: "やわらかい。親子の声が聞こえる程度",
  },
  parents: {
    person_context: {
      fear: "厳しすぎる指導だったらどうしよう",
      frustration: "子どもに合う場所が見つからない",
      desire: "安心して預けたい",
      barrier: "指導の様子が見えない",
    },
    arc: ["心配", "様子を見る", "納得", "任せられる"],
    story_role_of_flatup: "guide",
    audio_intent: "静か。指導の声が聞き取れる",
  },
  men_beginners: {
    person_context: {
      fear: "経験者ばかりで気後れしそう",
      frustration: "運動から遠ざかっている",
      desire: "また動ける自分に戻りたい",
      barrier: "今さら始めていいのか分からない",
    },
    arc: ["気後れ", "始めていいと分かる", "動けた", "また来る"],
    story_role_of_flatup: "companions",
    audio_intent: "落ち着いたテンポ。煽らない",
  },
  inactive_men: {
    person_context: {
      fear: "体力が落ちたのを見られたくない",
      frustration: "何度も三日坊主になった",
      desire: "家族に元気な姿を見せたい",
      barrier: "きつい運動は続かない",
    },
    arc: ["ためらい", "無理のない一歩", "息が整う", "続けられそう"],
    story_role_of_flatup: "companions",
    audio_intent: "静か。呼吸の音を残す",
  },
  senior: {
    person_context: {
      fear: "けがをしないか不安",
      frustration: "体が思うように動かない",
      desire: "自分の足で歩き続けたい",
      barrier: "自分のペースでできるか分からない",
    },
    arc: ["不安", "無理のない動き", "できた", "続けられそう"],
    story_role_of_flatup: "guide",
    audio_intent: "とても静か。急かす音を入れない",
  },
  family: {
    person_context: {
      fear: "家族で楽しめるか分からない",
      frustration: "一緒に過ごす時間が減った",
      desire: "同じ時間を共有したい",
      barrier: "全員に合う場所が少ない",
    },
    arc: ["ばらばら", "一緒にやる", "笑い合う", "また行こう"],
    story_role_of_flatup: "safe_place",
    audio_intent: "あたたかい。生活音を少し残す",
  },
  sparring_fans: {
    person_context: {
      fear: "実力が通用しないかもしれない",
      frustration: "本気で打ち合える相手がいない",
      desire: "自分の技を試したい",
      barrier: "相手のレベルが分からない",
    },
    arc: ["集中", "読み合い", "決まる", "礼"],
    story_role_of_flatup: "stage_for_challenge",
    audio_intent: "呼吸と足音。過度な効果音を入れない",
  },
  competition: {
    person_context: {
      fear: "負けるのが怖い",
      frustration: "納得のいく試合ができていない",
      desire: "自分の技を出し切りたい",
      barrier: "準備の質が足りない",
    },
    arc: ["集中", "読み合い", "決まる", "礼"],
    story_role_of_flatup: "stage_for_challenge",
    audio_intent: "呼吸と足音中心。恐怖を煽る音を使わない",
  },
  event: {
    person_context: {
      fear: "行っても楽しめないかもしれない",
      frustration: "予定が分からない",
      desire: "その場の熱を感じたい",
      barrier: "詳細が分からないと動けない",
    },
    arc: ["気配", "集まる", "盛り上がる", "余韻"],
    story_role_of_flatup: "stage_for_challenge",
    audio_intent: "会場の空気。断定的なナレーションを入れない",
  },
  facility: {
    person_context: {
      fear: "汚かったり怖い雰囲気だったらいやだ",
      frustration: "中の様子が分からない",
      desire: "安心して通える場所がほしい",
      barrier: "入口をくぐる勇気が出ない",
    },
    arc: ["入口", "明るさ", "清潔さ", "ここなら大丈夫"],
    story_role_of_flatup: "safe_place",
    audio_intent: "環境音のみ。人物がいなくても成立させる",
  },
  instructor: {
    person_context: {
      fear: "厳しく怒られそう",
      frustration: "教え方が合わなかった経験がある",
      desire: "ちゃんと見てもらいたい",
      barrier: "どんな人が教えるか分からない",
    },
    arc: ["距離", "目を合わせる", "できた", "信頼"],
    story_role_of_flatup: "guide",
    audio_intent: "声が聞き取れる静けさ",
  },
  member_story: {
    person_context: {
      fear: "自分には無理かもしれない",
      frustration: "変われない気がする",
      desire: "同じような人ができたなら自分もと思いたい",
      barrier: "きっかけがない",
    },
    arc: ["以前の自分", "きっかけ", "変化", "今"],
    story_role_of_flatup: "companions",
    audio_intent: "静か。本人の声を主役にする",
  },
  general_beginner: {
    person_context: {
      fear: "運動が苦手だと笑われそう",
      frustration: "何度も続かなかった",
      desire: "始めてみたい",
      barrier: "始めていいのか分からない",
    },
    arc: ["ためらい", "始めていいと分かる", "一歩", "続けられそう"],
    story_role_of_flatup: "safe_place",
    audio_intent: "静かで柔らかい",
  },
};

export function arcFor(target: TargetPrimary): ArcBaseline {
  return BASELINE[target];
}
