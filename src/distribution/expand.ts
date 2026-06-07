import type { ContentIdea, PlatformDraft } from "../types.js";

function nowIso(): string {
  return new Date().toISOString();
}

function baseDraft(idea: ContentIdea, platform: PlatformDraft["platform"], createdAt: string): Pick<PlatformDraft, "id" | "ideaId" | "approvalId" | "platform" | "publicationLevel" | "cta" | "safetyNotes" | "createdAt"> {
  const suffix = platform === "x" ? "x" : platform;
  return {
    id: `${idea.id}_${suffix}`,
    ideaId: idea.id,
    approvalId: idea.id,
    platform,
    publicationLevel: "level_2_draft",
    cta: "",
    safetyNotes: [],
    createdAt,
  };
}

// canon_2026 連動テーマ別の本文セット。
// テーマがマップにあれば専用本文、無ければ defaultBody にフォールバック。
interface BodySet {
  xClosing: string[];
  instagramSegments: { intro: string; middle: string; end: string };
  instagramSubtitle: string[];
  threadsClosing: string[];
}

const bodyByTheme: Record<string, BodySet> = {
  "親子で始める、優しい強さ": {
    xClosing: [
      "「お父さん、見てた？」そんな瞬間が、子どもの心に残ります。",
      "☀ 親子割：親子合計で月-¥500",
      "ワンコイン体験500円から。",
    ],
    instagramSegments: {
      intro: "親と子が一緒にミットを持つ瞬間",
      middle: "子どもが嬉しそうに技を見せ、親が拍手する",
      end: "親子でハイタッチで終わる",
    },
    instagramSubtitle: [
      "怒鳴らない太陽のジムで、親子の時間を増やしませんか？",
      "親子でご入会で月-¥500。",
      "ワンコイン体験500円から。",
      "☀ FLATUP GYM",
    ],
    threadsClosing: [
      "「子どもにキックボクシングなんて」と思っていた親御さんが、",
      "気がついたら一緒に練習している。",
      "そんな光景が、太陽のジムにはあります。",
      "",
      "☀ 親子割：合計月-¥500",
    ],
  },
  "お友達と一緒に始める格闘技": {
    xClosing: [
      "一人で頑張るのもいいけど、誰かと一緒は、もっと続く。",
      "🥊 ご紹介でお友達がご入会されると、両方にFLATUPバンテージ",
      "ワンコイン体験500円から。",
    ],
    instagramSegments: {
      intro: "二人で並んでミット打ち",
      middle: "友達同士で笑い合う練習風景",
      end: "ハイタッチで終わる",
    },
    instagramSubtitle: [
      "一緒に始めたら、続けやすい。",
      "ご紹介でお友達がご入会されると、",
      "紹介者・新入会者 両方にバンテージプレゼント。",
      "",
      "ワンコイン体験500円から。",
    ],
    threadsClosing: [
      "「あの子も一緒だったら楽しいだろうな」",
      "その気持ちで紹介してくれたら、",
      "お友達がご入会された時、お互いにバンテージをプレゼント。",
      "",
      "優しさは、増やすと倍になる。",
    ],
  },
  "昨日の自分を、ほんの少し超える": {
    xClosing: [
      "格闘技を売るんじゃない。昨日の自分を超えた感覚を、ここに来て確かめる。",
      "☀ 世界一優しい太陽のジム",
      "ワンコイン体験500円から。",
    ],
    instagramSegments: {
      intro: "鏡の前で自分の姿を見ている",
      middle: "集中して練習する横顔",
      end: "練習後、満足そうな表情",
    },
    instagramSubtitle: [
      "強くなることは、優しくなること。",
      "昨日の自分を、ほんの少し超えた感覚。",
      "それが本当の強さです。",
      "",
      "☀ 太陽のジムで、ワンコイン体験500円から。",
      "☀ FLATUP GYM",
    ],
    threadsClosing: [
      "格闘技は、誰かを倒すためじゃない。",
      "昨日できなかったことが、今日少しできるようになる。",
      "その感覚を、誰かと分かち合える場所がここにあります。",
      "",
      "☀ 世界一優しい太陽のジム",
    ],
  },
  "太陽のジムって、どんな空気？": {
    xClosing: [
      "格闘技ジム＝怒鳴る、というイメージ、もう古い。",
      "☀ FLATUPは「太陽」の格闘技。",
      "ワンコイン体験500円から、ぜひ空気を感じに。",
    ],
    instagramSegments: {
      intro: "明るいジム内の俯瞰",
      middle: "インストラクターと会員が笑い合う",
      end: "練習を終えた皆の集合",
    },
    instagramSubtitle: [
      "☀ 世界一優しい太陽のジム",
      "怒鳴らない。笑顔がある。",
      "初心者・女性・キッズが安心して通える。",
      "",
      "ワンコイン体験500円から。",
    ],
    threadsClosing: [
      "怒鳴らない格闘技ジムは、本当にあります。",
      "ここは、応援・称賛・思いやりで人を照らす場所。",
      "北風じゃなく、太陽で人を動かす。",
      "",
      "☀ FLATUP GYM ｜ ワンコイン体験500円",
    ],
  },
  "UIZIN（初陣）で分かる、強さの正体": {
    xClosing: [
      "UIZIN（初陣）は、勝ち負けの大会じゃない。",
      "自分の弱さに向き合い、ほんの少しでも超えた瞬間を仲間と分かち合う場。",
      "☀ 太陽のジム FLATUP GYM",
    ],
    instagramSegments: {
      intro: "UIZIN会場の準備風景",
      middle: "子どもの真剣な表情・親の見守る目",
      end: "終わった後の抱擁",
    },
    instagramSubtitle: [
      "敵は相手じゃない、敵は自分だ。",
      "UIZIN（初陣）で見えるのは、勝ち負けじゃなく、",
      "自分を超えた瞬間の輝き。",
      "",
      "☀ 太陽のジムで、ワンコイン体験500円から。",
      "☀ FLATUP GYM",
    ],
    threadsClosing: [
      "「勝った・負けた」じゃ語れない。",
      "自分の弱さと、真っ向から向き合った人にしか分からない景色。",
      "UIZINは、そんな瞬間を仲間と分かち合う場所です。",
      "",
      "☀ FLATUP GYM",
    ],
  },
};

const defaultBody: BodySet = {
  xClosing: [
    "強く見せるためじゃなく、今日の自分から逃げなかったことを静かに認める。",
    "FLATUP GYMは、そういう一日がちゃんと残る場所です。",
  ],
  instagramSegments: {
    intro: "うまくできなくて笑っている一瞬",
    middle: "トレーナーがゆっくり説明し、会員が自分のペースで試す",
    end: "練習後の安心した表情",
  },
  instagramSubtitle: [
    "強くなる前に、安心できる場所がいる。",
    "できない日も、笑って終われる格闘技ジム。",
    "",
    "FLATUP GYMは、弱い自分と向き合うための世界一優しい格闘技ジムです。",
  ],
  threadsClosing: [
    "格闘技は、強い人だけのものじゃない。",
    "不安なまま来た人が、少し笑って帰れる日がある。",
    "それだけで、今日の練習には意味があると思う。",
    "",
    "FLATUP GYMは、弱い自分と向き合うための場所です。",
  ],
};

export function expandIdea(idea: ContentIdea): PlatformDraft[] {
  const hashtags = ["成田市", "格闘技", "初心者", "FLATUPGYM"];
  const createdAt = nowIso();
  const body = bodyByTheme[idea.theme] ?? defaultBody;

  return [
    {
      ...baseDraft(idea, "x", createdAt),
      body: [
        idea.theme,
        "",
        idea.angle,
        "",
        ...body.xClosing,
      ].join("\n"),
      hashtags: ["FLATUPGYM", "成田市", "格闘技"],
    },
    {
      ...baseDraft(idea, "instagram", createdAt),
      title: idea.theme,
      body: [
        "リール案",
        "",
        `冒頭: ${body.instagramSegments.intro}`,
        `中盤: ${body.instagramSegments.middle}`,
        `終盤: ${body.instagramSegments.end}`,
        "",
        "字幕案:",
        ...body.instagramSubtitle,
      ].join("\n"),
      hashtags,
    },
    {
      ...baseDraft(idea, "threads", createdAt),
      body: [
        idea.theme,
        "",
        ...body.threadsClosing,
      ].join("\n"),
      hashtags: ["FLATUPGYM"],
    },
  ];
}
