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

export function expandIdea(idea: ContentIdea): PlatformDraft[] {
  const hashtags = ["成田市", "格闘技", "初心者", "FLATUPGYM"];
  const createdAt = nowIso();

  return [
    {
      ...baseDraft(idea, "x", createdAt),
      body: [
        idea.theme,
        "",
        idea.angle,
        "",
        "強く見せるためじゃなく、今日の自分から逃げなかったことを静かに認める。",
        "FLATUP GYMは、そういう一日がちゃんと残る場所です。",
      ].join("\n"),
      hashtags: ["FLATUPGYM", "成田市", "格闘技"],
    },
    {
      ...baseDraft(idea, "instagram", createdAt),
      title: idea.theme,
      body: [
        "リール案",
        "",
        "冒頭: うまくできなくて笑っている一瞬",
        "中盤: トレーナーがゆっくり説明し、会員が自分のペースで試す",
        "終盤: 練習後の安心した表情",
        "",
        "字幕案:",
        "強くなる前に、安心できる場所がいる。",
        "できない日も、笑って終われる格闘技ジム。",
        "",
        "FLATUP GYMは、弱い自分と向き合うための世界一優しい格闘技ジムです。",
      ].join("\n"),
      hashtags,
    },
    {
      ...baseDraft(idea, "threads", createdAt),
      body: [
        idea.theme,
        "",
        "格闘技は、強い人だけのものじゃない。",
        "不安なまま来た人が、少し笑って帰れる日がある。",
        "それだけで、今日の練習には意味があると思う。",
        "",
        "FLATUP GYMは、弱い自分と向き合うための場所です。",
      ].join("\n"),
      hashtags: ["FLATUPGYM"],
    },
  ];
}
