// 調達CLI — FLAT UP 調達AI（海外調達・価格比較・納期管理）
//
//   npm run sourcing -- plan      --case docs/sourcing/cases/2026-09-medal.json
//   npm run sourcing -- keywords  --case <案件ファイル>
//   npm run sourcing -- template
//   npm run sourcing -- rfq       --case <案件ファイル>
//   npm run sourcing -- negotiate --case <案件ファイル> --round 1
//   npm run sourcing -- confirm   --case <案件ファイル>
//   npm run sourcing -- compare   --case <案件ファイル> [--out data/sourcing/report.md]
//
// このCLIは検索も送信も発注も決済もしない。
// 出るのは逆算・採点・比較表・問い合わせの**下書き**だけで、実行判断は人間が行う。

import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseFlags, section } from "../generators/shared.js";
import { searchKeywords } from "./requirement.js";
import { screenAll } from "./candidate.js";
import { formatLandedCost, landedCost } from "./cost.js";
import { assessFeasibility, formatLeadTime, latestOrderDate } from "./schedule.js";
import { scoreAll } from "./score.js";
import { buildReport } from "./report.js";
import { buildDeadlineConfirmation, buildNegotiation, buildRfq, type NegotiationRound } from "./message.js";
import { candidateTemplate, parseCaseFile, type SourcingCase } from "./case_file.js";

const USAGE = `使い方:
  npm run sourcing -- plan      --case <案件ファイル> [--today YYYY-MM-DD]
  npm run sourcing -- keywords  --case <案件ファイル>
  npm run sourcing -- template
  npm run sourcing -- rfq       --case <案件ファイル>
  npm run sourcing -- negotiate --case <案件ファイル> --round 1|2|3
  npm run sourcing -- confirm   --case <案件ファイル>
  npm run sourcing -- compare   --case <案件ファイル> [--out <出力先.md>]

送信・発注・決済は行わない。出力は下書きと判断材料のみ。`;

async function loadCase(file: string): Promise<SourcingCase> {
  const raw = await readFile(path.resolve(file), "utf8");
  const parsed = parseCaseFile(JSON.parse(raw));
  if (!parsed.value) {
    throw new Error(`案件ファイルに問題があります:\n- ${parsed.errors.join("\n- ")}`);
  }
  return parsed.value;
}

function todayIso(flags: Record<string, string>): string {
  return flags.today || new Date().toISOString().slice(0, 10);
}

async function writeOut(file: string, body: string): Promise<void> {
  const target = path.resolve(file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body, "utf8");
  console.log(`\n保存: ${file}`);
}

async function main(): Promise<void> {
  const { flags, positional } = parseFlags(process.argv.slice(2));
  const command = positional[0] ?? "";

  if (!command || command === "help") {
    console.log(USAGE);
    return;
  }

  if (command === "template") {
    console.log(JSON.stringify(candidateTemplate(), null, 2));
    console.log("\n未確認は null のままにする。埋めた値だけが採点に使われる。");
    return;
  }

  if (!flags.case) {
    console.error("--case <案件ファイル> を指定してください。\n\n" + USAGE);
    process.exitCode = 1;
    return;
  }

  const sourcing = await loadCase(flags.case);
  const { requirement, itemEnglish, lead, assumption, candidates } = sourcing;

  switch (command) {
    case "plan": {
      const today = todayIso(flags);
      const feasibility = assessFeasibility(requirement, lead, today);
      console.log(section("案件", `${requirement.item} ${requirement.quantity}個 → ${requirement.destination}`));
      console.log(
        section(
          "必着",
          `${requirement.arrivalDeadline} ${requirement.deadlineHalf === "AM" ? "午前中" : "中"}（到着日で判断。発送日ではない）`,
        ),
      );
      console.log(section("所要日数", formatLeadTime(lead)));
      console.log(section("最終発注期限", `${latestOrderDate(requirement, lead)}（本日 ${today} から残り${feasibility.daysToOrderDeadline}日）`));
      console.log(section("今日発注した場合の到着", `${feasibility.arrivalIfOrderedToday}（必着まで${feasibility.marginDays}日の余裕）`));
      console.log(section("判定", `${feasibility.verdict} — ${feasibility.reason}`));
      return;
    }

    case "keywords": {
      console.log(searchKeywords(requirement, itemEnglish).join("\n"));
      return;
    }

    case "rfq": {
      const draft = buildRfq(requirement, itemEnglish);
      console.log(draft.full);
      if (flags.out) await writeOut(flags.out, draft.full);
      return;
    }

    case "negotiate": {
      const round = Number(flags.round || "1");
      if (round !== 1 && round !== 2 && round !== 3) {
        console.error("--round は 1 / 2 / 3 のいずれかにしてください（値引き 5% / 10% / 15%）。");
        process.exitCode = 1;
        return;
      }
      const draft = buildNegotiation(requirement, itemEnglish, round as NegotiationRound);
      console.log(draft.full);
      if (flags.out) await writeOut(flags.out, draft.full);
      return;
    }

    case "confirm": {
      const draft = buildDeadlineConfirmation(requirement);
      console.log(draft.full);
      if (flags.out) await writeOut(flags.out, draft.full);
      return;
    }

    case "compare": {
      if (candidates.length === 0) {
        console.log("候補が0件です。まず調査して candidates を埋めてください。");
        console.log(`テンプレート: npm run sourcing -- template`);
        return;
      }
      const { screenings } = screenAll(candidates, requirement);
      const scored = scoreAll(candidates, requirement, assumption);
      const report = buildReport({ requirement, lead, today: todayIso(flags), scored, screenings });
      console.log(report);

      // 総額の内訳は表に載せきれないので、見積のある候補だけ内訳を続けて出す。
      for (const c of candidates) {
        if (!c.quote) continue;
        console.log(section(`内訳: ${c.supplier}`, formatLandedCost(landedCost(c.quote, assumption), c.quote.quantity)));
      }
      console.log(
        "\n※ 関税・消費税は前提値による概算。確定額は通関業者・税関の判断による。発注前に必ず確認する。",
      );
      if (flags.out) await writeOut(flags.out, report);
      return;
    }

    default:
      console.error(`不明なコマンド: ${command}\n\n${USAGE}`);
      process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
