// Brand Growth Phase 3 Director: 見せ場をひとつだけ決める。
//
// 条件:
//   - 1本につき1つ。2つ入れると、どちらも記憶に残らない。
//   - 台詞やテロップの説明が無くても意味が伝わること。
//   - 主人公はお客さま。コーチや施設は主人公にしない。
//   - 恐怖・痛み・屈辱で心を動かさない。

import type { HeroMoment } from "../contracts/creative_brief.js";
import type { TargetPrimary } from "../contracts/route_decision.js";

const MOMENTS: Record<TargetPrimary, HeroMoment> = {
  women_beginners: {
    moment: "初めてミットを打った直後、コーチと目が合って自然に笑顔になる",
    why_it_lands: "怖さが安心へ変わる瞬間が、言葉なしで見える",
    readable_without_explanation: true,
  },
  women_30_40: {
    moment: "息を整えたあと、自分でもう一度構え直す",
    why_it_lands: "誰かに言われてではなく自分で選んだ動きだと分かる",
    readable_without_explanation: true,
  },
  kids: {
    moment: "うまく蹴れた瞬間に、自分でガッツポーズをする",
    why_it_lands: "できた喜びが本人の動きだけで伝わる",
    readable_without_explanation: true,
  },
  kids_parents: {
    moment: "親子でグローブを合わせてハイタッチする",
    why_it_lands: "共有した動作そのものが関係を語る",
    readable_without_explanation: true,
  },
  parents: {
    moment: "コーチが子どもの目線まで腰を落として話を聞く",
    why_it_lands: "指導の質が説明なしで伝わる",
    readable_without_explanation: true,
  },
  men_beginners: {
    moment: "軽く打ったあと、思わず息をついて口元がゆるむ",
    why_it_lands: "気後れが解ける瞬間が見える",
    readable_without_explanation: true,
  },
  inactive_men: {
    moment: "呼吸を整えたあと、もう一度サンドバッグへ手を伸ばす",
    why_it_lands: "続けられそうだという実感が動きに出る",
    readable_without_explanation: true,
  },
  senior: {
    moment: "自分のペースで一歩踏み出し、コーチが静かにうなずく",
    why_it_lands: "無理をしていないことと、見守られていることが同時に伝わる",
    readable_without_explanation: true,
  },
  family: {
    moment: "全員が同じ動きをして、最後に顔を見合わせて笑う",
    why_it_lands: "同じ時間を共有したことが一目で分かる",
    readable_without_explanation: true,
  },
  sparring_fans: {
    moment: "読みの効いた一撃が決まり、崩れずに構えへ戻る",
    why_it_lands: "技術の高さが動きの質だけで伝わる",
    readable_without_explanation: true,
  },
  competition: {
    moment: "決まった直後に相手へ礼をする",
    why_it_lands: "強さと敬意が同じ画に収まる",
    readable_without_explanation: true,
  },
  event: {
    moment: "会場の視線が一点に集まる",
    why_it_lands: "熱量が人の向きだけで伝わる",
    readable_without_explanation: true,
  },
  facility: {
    moment: "入口の扉が開き、明るく整った床が奥まで見える",
    why_it_lands: "人物がいなくても、入りやすさが伝わる",
    readable_without_explanation: true,
  },
  instructor: {
    moment: "会員が成功した瞬間、コーチは後ろで静かに見守っている",
    why_it_lands: "主人公が会員であることが構図で分かる",
    readable_without_explanation: true,
  },
  member_story: {
    moment: "以前は下を向いていた人が、まっすぐ前を見て構える",
    why_it_lands: "変化が姿勢だけで伝わる",
    readable_without_explanation: true,
  },
  general_beginner: {
    moment: "初めての一歩を踏み出し、周りが自然に受け入れる",
    why_it_lands: "始めていいのだと言葉なしで分かる",
    readable_without_explanation: true,
  },
};

export function heroMomentFor(target: TargetPrimary): HeroMoment {
  return MOMENTS[target];
}

/** 1本の主要な動作。詰め込みを防ぐため、必ず1つに絞る。 */
export function primaryActionFor(target: TargetPrimary): string {
  switch (target) {
    case "kids":
      return "子どもが1回蹴る";
    case "kids_parents":
      return "親子が1回グローブを合わせる";
    case "competition":
    case "sparring_fans":
      return "選手が1つの技を出す";
    case "facility":
      return "カメラが入口から中へ1回進む";
    case "instructor":
      return "コーチが1回うなずく";
    case "senior":
      return "自分のペースで1歩踏み出す";
    default:
      return "1回ミットを打つ";
  }
}
