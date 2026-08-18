// 経費CLI — レシート管理・確定申告の集計・補助金の申請準備
//
//   npm run keihi -- add "8/3 コメリ 12800 エアコン工事"
//   npm run keihi -- check
//   npm run keihi -- year 2026
//   npm run keihi -- csv --year 2026
//   npm run keihi -- grant           千葉市エネルギー高騰支援金（一律11万円）
//   npm run keihi -- jizokuka        小規模事業者持続化補助金（補助率2/3・上限50万円）
//
// 送信も提出もしない。出るのは下書きと集計だけで、申告と申請は人間が行う。

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseFlags } from "../generators/shared.js";
import {
  ACCOUNT_ORDER,
  assetJudgement,
  deductibleAmount,
  taxAmountOf,
  validateExpense,
  type Expense,
  type ExpenseInput,
} from "./expense.js";
import { importExpenseCsv } from "./import_csv.js";
import { parseExpenseLine } from "./parse.js";
import {
  auditExpenses,
  depreciationSchedule,
  filterByMonth,
  filterByYear,
  formatDepreciation,
  formatSummary,
  summarize,
  toExpenseCsv,
  toJournalCsv,
} from "./report.js";
import { openExpenseStore } from "./store.js";
import {
  DOCUMENTS_SOLE_PROPRIETOR,
  JIZOKUKA_R20,
  PLAN_STEPS as JIZOKUKA_PLAN_STEPS,
  buildApplicationPack as buildJizokukaPack,
  calcJizokuka,
  limitOf,
  rateOf,
  requiredCostFor,
  type CalcOptions,
} from "./jizokuka.js";
import {
  CHIBA_ENERGY_GRANT,
  PRECHECK_ITEMS,
  REQUIRED_DOCUMENTS,
  buildApplicationPack,
  checkEligibility,
  type EnergyGrantProgram,
} from "./subsidy.js";

const baseDir = process.env.OPENQLOW_DATA_DIR || path.join(process.cwd(), "data");
const storeFile = path.join(baseDir, "expenses.json");
const programFile = path.join(baseDir, "subsidy_program.json");
const outputDir = process.env.OPENQLOW_KEIHI_OUT || path.join(process.cwd(), "data", "keihi");

const YEN = new Intl.NumberFormat("ja-JP");

function jstToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/** 支援金の定義を読む。ファイルが無ければ千葉市・第4弾の内容を使う。 */
async function loadProgram(): Promise<EnergyGrantProgram> {
  try {
    const raw = await readFile(programFile, "utf8");
    return { ...CHIBA_ENERGY_GRANT, ...(JSON.parse(raw) as Partial<EnergyGrantProgram>) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return CHIBA_ENERGY_GRANT;
    throw error;
  }
}

async function writeOutput(fileName: string, body: string, withBom = false): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const file = path.join(outputDir, fileName);
  // Excel で開く CSV は BOM が無いと日本語が化けるため付ける
  await writeFile(file, withBom ? `﻿${body}` : body, "utf8");
  return file;
}

function formatExpenseLine(expense: Expense): string {
  const ratio = expense.businessRatio === 100 ? "" : ` 按分${expense.businessRatio}%`;
  const tag = expense.subsidyTag ? ` #${expense.subsidyTag}` : "";
  const warn = expense.receipt === "なし" ? " ⚠️レシート無" : "";
  return `#${String(expense.id).padStart(3)} ${expense.date} ${YEN.format(expense.amount).padStart(8)}円 [${expense.account}] ${expense.vendor} ${expense.note}${ratio}${tag}${warn}`;
}

function flagsToInput(flags: Record<string, string>): ExpenseInput {
  const input: ExpenseInput = {};
  if (flags.date) input.date = flags.date;
  if (flags.vendor) input.vendor = flags.vendor;
  if (flags.amount) input.amount = flags.amount;
  if (flags.account) input.account = flags.account;
  if (flags.tax) input.taxCategory = flags.tax;
  if (flags.note) input.note = flags.note;
  if (flags.ratio) input.businessRatio = flags.ratio;
  if (flags.method) input.paymentMethod = flags.method;
  if (flags.receipt) input.receipt = flags.receipt;
  if (flags.invoice) input.invoiceNumber = flags.invoice;
  if (flags.tag) input.subsidyTag = flags.tag;
  if (flags.life) input.assetLife = flags.life;
  return input;
}

/** 締切から逆算した準備スケジュール（締切日からの日数オフセット）。 */
const PLAN_STEPS: ReadonlyArray<{ offset: number; title: string; detail: string }> = [
  { offset: -30, title: "事務局に電話して対象かを確認する", detail: "最重要。所在地要件（千葉市内の本店／住所／主たる事業所）を満たすかをまず聞く。番号は公式サイトか docs/keihi/README.md" },
  { offset: -28, title: "申請の手引きと様式をダウンロード", detail: "様式第1号（申請書）・様式第2号（誓約書・同意書）。手引きで書類要件を最終確認する" },
  { offset: -25, title: "対象期間の電気・ガス・燃料の請求書を集める", detail: "2025年4月〜2026年3月分。Web明細はPDFで保存。集めたら keihi add で登録する" },
  { offset: -20, title: "要件を満たす月を確定", detail: "npm run keihi -- grant で1か月3万円以上の月を探す。満たす月の請求書を証拠にする" },
  { offset: -16, title: "確定申告書の控えを用意", detail: "収受印またはe-Tax受信通知が要る。無ければ税務署・e-Taxのメッセージボックスから取得（時間がかかる）" },
  { offset: -12, title: "本人確認書類・通帳の写しを用意", detail: "運転免許証、通帳の金融機関名・支店名・口座番号・カナ名義が見えるページ" },
  { offset: -8, title: "様式第1号・第2号を記入", detail: "全ページ作成。記入漏れは差し戻しの定番" },
  { offset: -5, title: "全書類を突合してチェックリストを消す", detail: "npm run keihi -- grant のチェックリストを1つずつ確認" },
  { offset: -3, title: "提出（オンラインまたは郵送）", detail: "締切当日を狙わない。不備の差し戻しに対応する余白を残す" },
  { offset: 0, title: "申請の締切", detail: "オンラインは23:59送信完了、郵送は消印有効。これ以降は受付されない" },
];

function shiftDate(isoDate: string, days: number): string {
  const time = Date.parse(`${isoDate}T00:00:00Z`);
  return new Date(time + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function printHelp(): void {
  console.log(`経費・確定申告・補助金アシスタントの使い方

  npm run keihi -- <コマンド>

■ レシートを入れる（一番よく使う）
  add "8/3 コメリ 12800 エアコン工事"      一行でそのまま登録（日付・金額・科目を自動で読む）
  add "今日 ダイソー 1200円 消毒液 現金"    「今日」「昨日」も使える
  add "8/20 ○○電機 132000 エアコン #省エネ" #タグで補助金の対象経費として印をつける
  add --vendor コメリ --amount 12800 ...     項目を1つずつ指定したいとき
  import <明細.csv> [--method クレジット]    カード・銀行明細のCSVをまとめて取り込む

■ 見る・直す
  list [--month 2026-08] [--tag 省エネ]     一覧
  show <番号>                                1件の詳しい内容と判定
  fix <番号> --account 修繕費 --ratio 80     あとから直す
  rm <番号>                                  消す

■ 確定申告の準備
  month [2026-08]                            その月の科目別まとめ
  year [2026]                                その年の科目別まとめ（決算書の並び）
  check                                      申告前に潰すべき不備を全部出す
  csv [--year 2026] [--type journal|list]    会計ソフト取込用CSVを書き出す

■ エネルギー高騰支援金（千葉市・第4弾／一律11万円・締切8/31）
  grant [--applicant "屋号"] [--address "住所"]
                                             要件を満たす月を自動で探し、申請メモを書き出す
  plan                                       締切から逆算した準備スケジュール
  program                                    支援金の要件・締切・問い合わせ先を表示

■ 小規模事業者持続化補助金（第20回・補助率2/3・上限50万円・締切12/15）
  jizokuka [--deficit] [--invoice] [--wage]  区分別に補助額を計算し、申請メモを書き出す
    --deficit  赤字事業者（補助率3/4）
    --invoice  インボイス特例（上限+50万円）
    --wage     賃金引上げ特例（上限+150万円）
  jizokuka-plan                              締切から逆算した準備スケジュールと提出書類

■ その他
  accounts                                   使える勘定科目の一覧
  help                                       この使い方

ヒント: どのコマンドも提出も送信もしません。出るのは下書きと集計だけです。`);
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const { flags, positional } = parseFlags(rest);
  const store = openExpenseStore(storeFile);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }

  switch (command) {
    case "add": {
      const line = positional.join(" ").trim();
      const parsed = line ? parseExpenseLine(line) : { input: {}, leftovers: [] };
      // 明示フラグは一行入力より優先（"--amount で上書き" ができる）
      const input: ExpenseInput = { ...parsed.input, ...flagsToInput(flags) };

      if (!input.amount) {
        console.error('金額が読めませんでした。例: npm run keihi -- add "8/3 コメリ 12800 エアコン工事"');
        return 1;
      }

      const created = await store.create(input);
      console.log(`登録しました。\n  ${formatExpenseLine(created)}`);

      // 耐用年数が入っていれば償却の案内は済んでいるので繰り返さない
      const judgement = assetJudgement(created.amount);
      if (judgement.kind === "少額減価償却資産" || (judgement.kind === "減価償却" && !created.assetLife)) {
        console.log(`  ※ ${judgement.message}`);
      }

      const problems = validateExpense(created);
      if (problems.length > 0) {
        console.log(`  未入力: ${problems.join(" / ")}`);
        console.log(`  直すとき: npm run keihi -- fix ${created.id} --note "..."`);
      }
      if (parsed.leftovers.length > 0) {
        console.log(`  読み飛ばした語: ${parsed.leftovers.join(" ")}`);
      }
      return 0;
    }

    case "import": {
      const file = positional[0] ?? flags.file;
      if (!file) {
        console.error("Usage: npm run keihi -- import <明細.csv> [--method クレジット]");
        return 1;
      }
      const text = await readFile(file, "utf8");
      const result = importExpenseCsv(text, flags.method || "クレジット");
      console.log(`使った列: 日付=${result.columns.date} / 利用先=${result.columns.vendor} / 金額=${result.columns.amount}`);

      for (const row of result.rows) {
        const created = await store.create(row);
        console.log(`  ${formatExpenseLine(created)}`);
      }
      console.log(`\n${result.rows.length}件を取り込みました。`);
      if (result.skipped.length > 0) {
        console.log(`取り込まなかった行 ${result.skipped.length}件:`);
        for (const skip of result.skipped) console.log(`  ${skip.line}行目: ${skip.reason}`);
      }
      console.log("※ 勘定科目は推定です。npm run keihi -- check で確認してください。");
      return 0;
    }

    case "list": {
      let list = await store.getAll();
      if (flags.month) list = filterByMonth(list, flags.month);
      if (flags.year) list = filterByYear(list, Number(flags.year));
      if (flags.tag) list = list.filter(e => e.subsidyTag === flags.tag.replace(/^#/, ""));
      if (flags.account) list = list.filter(e => e.account === flags.account);

      if (list.length === 0) {
        console.log("該当する経費はありません。");
        return 0;
      }
      for (const expense of list.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)) {
        console.log(formatExpenseLine(expense));
      }
      const total = list.reduce((sum, e) => sum + e.amount, 0);
      const deductible = list.reduce((sum, e) => sum + deductibleAmount(e), 0);
      console.log(`\n${list.length}件 / 支払 ${YEN.format(total)}円 / 必要経費 ${YEN.format(deductible)}円`);
      return 0;
    }

    case "show": {
      const id = Number(positional[0]);
      const expense = await store.get(id);
      if (!expense) {
        console.error(`#${positional[0]} は見つかりません。`);
        return 1;
      }
      const judgement = assetJudgement(expense.amount);
      console.log(`#${expense.id} ${expense.date} ${expense.vendor}`);
      console.log(`  摘要      : ${expense.note || "(未記入)"}`);
      console.log(`  金額(税込): ${YEN.format(expense.amount)}円`);
      console.log(`  うち消費税: ${YEN.format(taxAmountOf(expense))}円 (${expense.taxCategory})`);
      console.log(`  勘定科目  : ${expense.account}`);
      console.log(`  事業按分  : ${expense.businessRatio}% → 必要経費 ${YEN.format(deductibleAmount(expense))}円`);
      console.log(`  支払方法  : ${expense.paymentMethod}`);
      console.log(`  レシート  : ${expense.receipt}`);
      console.log(`  インボイス: ${expense.invoiceNumber ?? "(なし)"}`);
      console.log(`  補助金タグ: ${expense.subsidyTag ? `#${expense.subsidyTag}` : "(なし)"}`);
      console.log(`  資産判定  : ${judgement.kind} — ${judgement.message}`);
      const problems = validateExpense(expense);
      if (problems.length > 0) console.log(`  要対応    : ${problems.join(" / ")}`);
      return 0;
    }

    case "fix": {
      const id = Number(positional[0]);
      const updated = await store.update(id, flagsToInput(flags));
      if (!updated) {
        console.error(`#${positional[0]} は見つかりません。`);
        return 1;
      }
      console.log(`直しました。\n  ${formatExpenseLine(updated)}`);
      return 0;
    }

    case "rm": {
      const id = Number(positional[0]);
      const removed = await store.remove(id);
      console.log(removed ? `#${id} を消しました。` : `#${id} は見つかりません。`);
      return removed ? 0 : 1;
    }

    case "month": {
      const yearMonth = positional[0] || flags.month || jstToday().slice(0, 7);
      const list = filterByMonth(await store.getAll(), yearMonth);
      console.log(formatSummary(summarize(list, yearMonth)));
      return 0;
    }

    case "year": {
      const year = Number(positional[0] || flags.year || jstToday().slice(0, 4));
      const all = await store.getAll();
      const summary = summarize(filterByYear(all, year), `${year}年`);
      console.log(formatSummary(summary));

      // 過年度に買った資産も今年の償却対象になるので帳簿全件を渡す
      const lines = depreciationSchedule(all, year);
      console.log("");
      console.log(formatDepreciation(lines, year));

      const depreciation = lines.reduce((sum, line) => sum + line.depreciation.deductible, 0);
      console.log(`\n■ ${year}年の必要経費 合計: ${YEN.format(summary.deductible + depreciation)}円`);
      console.log(`  （経費 ${YEN.format(summary.deductible)}円 ＋ 減価償却費 ${YEN.format(depreciation)}円）`);
      console.log("\n※ この並びは青色申告決算書の経費欄と同じです。上から順に転記できます。");
      return 0;
    }

    case "check": {
      const list = await store.getAll();
      const issues = auditExpenses(list);
      if (issues.length === 0) {
        console.log(`経費 ${list.length}件、不備なし。このまま申告の集計に進めます。`);
        return 0;
      }
      console.log(`■ 申告前に潰す項目（${issues.length}件）\n`);
      for (const issue of issues) {
        console.log(`  ${issue.label}\n    → ${issue.problem}`);
      }
      console.log(`\n直し方: npm run keihi -- fix <番号> --note "..." --ratio 80 --receipt あり`);
      return 0;
    }

    case "csv": {
      const year = Number(flags.year || jstToday().slice(0, 4));
      const list = filterByYear(await store.getAll(), year);
      const type = flags.type || "journal";
      const body = type === "list" ? toExpenseCsv(list) : toJournalCsv(list);
      const file = await writeOutput(`${year}_${type === "list" ? "経費一覧" : "仕訳"}.csv`, body, true);
      console.log(`${list.length}件を書き出しました。\n  ${file}`);
      if (type === "journal") {
        console.log("会計ソフトの「汎用CSV取込」に読ませてください。按分がある行は事業分と事業主貸に分かれています。");
      }
      return 0;
    }

    case "plan": {
      const program = await loadProgram();
      const today = jstToday();
      console.log(`■ ${program.name}\n  締切: ${program.deadline}（今日: ${today}）\n`);
      for (const step of PLAN_STEPS) {
        const date = shiftDate(program.deadline, step.offset);
        const mark = date < today ? "済/期限切れ" : "  ";
        console.log(`  ${date} ${mark} ${step.title}`);
        console.log(`             ${step.detail}`);
      }
      for (const forWhom of ["共通", "個人", "法人"] as const) {
        const docs = REQUIRED_DOCUMENTS.filter(d => d.forWhom === forWhom);
        console.log(`\n■ 提出書類（${forWhom}）`);
        for (const doc of docs) console.log(`  □ ${doc.name} — ${doc.hint}`);
      }
      console.log(`\n※ 書類の最終確認は公式の「申請の手引き」で。${program.reference}`);
      return 0;
    }

    case "grant":
    case "subsidy": {
      const program = await loadProgram();
      const all = await store.getAll();
      const result = checkEligibility(all, program);

      console.log(`■ ${program.name}`);
      console.log(`  給付額: ${YEN.format(program.amount)}円（一律）`);
      console.log(`  締切  : ${program.deadline}（今日: ${jstToday()}）\n`);
      console.log(`  ⚠️ 所在地要件: ${program.locationRequirement}`);
      console.log(`     ここを満たさないと申請できません。まず ${program.contact} に確認してください。\n`);

      console.log(`■ 要件A の判定（${program.periodFrom}〜${program.periodTo} の任意の1か月で光熱費＋燃料費 ${YEN.format(program.monthlyEnergyThreshold)}円以上）`);
      if (!result.hasData) {
        console.log("  対象期間の光熱費・燃料費が1件も登録されていません。");
        console.log('  例: npm run keihi -- add "2025-08-10 東京電力 34200 電気代"');
      } else {
        for (const month of result.allMonths) {
          const mark = month.qualifies ? "✅" : "  ";
          console.log(`  ${mark} ${month.month}  光熱費 ${YEN.format(month.utility).padStart(8)}円 + 燃料費 ${YEN.format(month.fuel).padStart(7)}円 = ${YEN.format(month.total).padStart(8)}円`);
        }
        console.log("");
        if (result.eligibleByMonthly) {
          const best = result.qualifyingMonths[0];
          console.log(`  → 要件を満たす月: ${result.qualifyingMonths.map(m => m.month).join(" / ")}`);
          console.log(`  → 証拠書類にするなら ${best.month}（${YEN.format(best.total)}円）が一番安全です。内訳:`);
          for (const e of best.expenses) {
            console.log(`       ${e.date} ${e.vendor} ${YEN.format(e.amount)}円 [証憑: ${e.receipt}]`);
          }
        } else if (result.closest) {
          console.log(`  → まだ要件を満たす月がありません。一番近いのは ${result.closest.month.month}（${YEN.format(result.closest.month.total)}円）であと ${YEN.format(result.closest.shortfall)}円。`);
          console.log("  → 未登録の請求書がないか確認してください（燃料費・LPガスの計上漏れが多いです）。");
        }
      }

      console.log("\n■ 先に確かめること");
      for (const item of PRECHECK_ITEMS) console.log(`  □ ${item.label}\n      ${item.why}`);

      const pack = buildApplicationPack({
        program,
        expenses: all,
        applicant: flags.applicant,
        address: flags.address,
        today: jstToday(),
      });
      const file = await writeOutput(`${program.deadline}_エネルギー支援金_申請メモ.md`, pack);
      console.log(`\n申請メモの下書きを書き出しました。\n  ${file}`);
      console.log(`※ 要件・書類の最終確認は公式の「申請の手引き」で行ってください。\n  ${program.reference}`);
      return 0;
    }

    case "jizokuka": {
      const program = JIZOKUKA_R20;
      const options: CalcOptions = {
        deficit: "deficit" in flags,
        invoice: "invoice" in flags,
        wage: "wage" in flags,
      };
      const all = await store.getAll();
      const result = calcJizokuka(all, program, options);
      const rate = rateOf(program, options);
      const limit = limitOf(program, options);

      console.log(`\u25a0 ${program.name}（${program.round}）`);
      console.log(`  補助率  : ${rate[0]}/${rate[1]}${options.deficit ? "（赤字事業者）" : ""}`);
      console.log(`  補助上限: ${YEN.format(limit)}円`);
      console.log(`  申請受付: ${program.openFrom} 〜 ${program.deadline} 17:00`);
      console.log(`  様式4締切: ${program.supportPlanDeadline}（成田商工会議所が発行）`);
      console.log(`  上限を取るのに必要な対象経費: ${YEN.format(requiredCostFor(limit, rate))}円\n`);

      if (result.lines.length === 0) {
        console.log("  補助対象になりそうな支出がまだ登録されていません。");
        console.log('  例: npm run keihi -- add "11/10 ○○社 600000 トレーニング機器一式"');
      } else {
        console.log("\u25a0 区分別（経費帳からの推定）");
        for (const line of result.lines) {
          const capped = line.capped ? ` ← 区分上限${YEN.format(line.rule.subsidyLimit!)}円で頭打ち` : "";
          console.log(`  ${line.category.padEnd(9, "　")} 経費 ${YEN.format(line.cost).padStart(9)}円 → 補助 ${YEN.format(line.subsidy).padStart(8)}円${capped}`);
        }
        console.log(`  ${"合計".padEnd(9, "　")} 経費 ${YEN.format(result.totalCost).padStart(9)}円 → 補助 ${YEN.format(result.subsidy).padStart(8)}円`);
      }

      console.log("");
      if (result.soloViolation) {
        console.log("  \u{1f6ab} このままでは申請できません。広報費・ウェブサイト関連費だけの構成です。");
        console.log("     機械装置等費や展示会等出展費と組み合わせてください（第20回からの変更点）。");
      } else if (result.shortfallCost > 0) {
        console.log(`  上限まであと ${YEN.format(result.shortfallCost)}円 の対象経費が必要です。`);
      } else {
        console.log(`  \u2705 上限に到達しています。交付申請額は ${YEN.format(result.subsidy)}円。`);
      }

      const pack = buildJizokukaPack({
        program,
        expenses: all,
        options,
        applicant: flags.applicant,
        address: flags.address,
        today: jstToday(),
      });
      const file = await writeOutput(`${program.deadline}_持続化補助金_申請メモ.md`, pack);
      console.log(`\n申請メモの下書きを書き出しました。\n  ${file}`);
      console.log(`※ 金額・区分・上限は公表情報からの整理です。公募要領で検算してください。\n  ${program.reference}`);
      return 0;
    }

    case "jizokuka-plan": {
      const program = JIZOKUKA_R20;
      const today = jstToday();
      console.log(`\u25a0 ${program.name}（${program.round}）\n  申請締切: ${program.deadline}（今日: ${today}）\n`);
      for (const step of JIZOKUKA_PLAN_STEPS) {
        const date = shiftDate(program.deadline, step.offset);
        const mark = date < today ? "済/期限切れ" : "  ";
        console.log(`  ${date} ${mark} ${step.title}`);
        console.log(`             ${step.detail}`);
      }
      console.log(`\n\u25a0 提出書類（個人事業主）`);
      for (const doc of DOCUMENTS_SOLE_PROPRIETOR) console.log(`  \u25a1 ${doc.name} — ${doc.hint}`);
      return 0;
    }

    case "program": {
      const program = await loadProgram();
      console.log(`■ 今の支援金設定（${programFile} で上書きできます）`);
      console.log(`  名称      : ${program.name}`);
      console.log(`  給付額    : ${YEN.format(program.amount)}円（一律）`);
      console.log(`  申請受付  : ${program.openFrom} 〜 ${program.deadline}`);
      console.log(`  対象期間  : ${program.periodFrom} 〜 ${program.periodTo}`);
      console.log(`  要件A     : 任意の1か月で光熱費＋燃料費 ${YEN.format(program.monthlyEnergyThreshold)}円以上`);
      console.log(`  要件B     : 連続3か月で原材料費＋光熱費＋燃料費が月平均 ${YEN.format(program.threeMonthAverageThreshold)}円以上`);
      console.log(`  所在地要件: ${program.locationRequirement}`);
      console.log(`  参照      : ${program.reference}`);
      console.log(`  問い合わせ: ${program.contact}`);
      return 0;
    }

    case "accounts": {
      console.log("■ 使える勘定科目（決算書の並び）");
      for (const account of ACCOUNT_ORDER) console.log(`  ${account}`);
      return 0;
    }

    default:
      console.error(`知らないコマンドです: ${command}`);
      printHelp();
      return 1;
  }
}

// `| head` などで受け手が先に閉じたときに EPIPE で落ちないようにする
process.stdout.on("error", error => {
  if ((error as NodeJS.ErrnoException).code !== "EPIPE") throw error;
});

main(process.argv.slice(2))
  .then(code => {
    process.exitCode = code;
  })
  .catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
