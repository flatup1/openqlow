// CRM CLI — 見込み客の記録・追客の見える化・日報・自己修復ログ
//
//   npm run crm -- add --name 田中 --gender female --category female --status new_inquiry --inquiry "初心者でも大丈夫ですか"
//   npm run crm -- list
//   npm run crm -- status 1 replied
//   npm run crm -- followups
//   npm run crm -- daily-report
//   npm run crm -- log-error api_error "401 Unauthorized"
//
// 送信は行わない。日報・追客候補は人間が確認してから動く（営業参謀であって営業担当ではない）。

import path from "node:path";
import { parseFlags } from "../generators/shared.js";
import { openProspectStore } from "./store.js";
import { buildDailyReport, saveDailyReport } from "./daily_report.js";
import { getFollowupNeeded, getReviewRequestCandidates, getTrialFollowupNeeded } from "./queries.js";
import { logError, type ErrorType } from "./self_repair.js";
import { buildProspectFromInquiry } from "./intake.js";
import { resolveStatus, type Prospect, type ProspectInput, type ProspectStatus } from "./prospect.js";
import {
  buildImportantMattersMessage,
  CONSENT_TERMS_VERSION,
  openGuardianConsentStore,
} from "./guardian_consent.js";
import {
  buildFormalReceiptMessage,
  buildProcedureGuideMessage,
  buildWithdrawalClosedMessage,
  detectOwnerReviewSignals,
  detectWithdrawalIntent,
  formatJstStamp,
  getConfirmationNotSent,
  getOwnerReviewRequired,
  getPaymentStopPending,
  getReadyToClose,
  missingForClose,
  PAYMENT_STOP_LABELS,
  withdrawalStatusLabel,
  type WithdrawalCase,
} from "./withdrawal.js";
import {
  buildWithdrawalTimeline,
  CORRECTABLE_FIELDS,
  openWithdrawalService,
  type Actor,
  type CorrectableField,
  type WithdrawalOpResult,
} from "./withdrawal_store.js";
import { generateInquiryReply } from "../generators/inquiry_reply.js";
import { generateTrialFollowup } from "../generators/trial_followup.js";
import type { Gender } from "../generators/shared.js";

const baseDir = process.env.OPENQLOW_DATA_DIR || path.join(process.cwd(), "data");
const storeFile = path.join(baseDir, "prospects.json");
// 保護者同意も見込み客と同じ data/ 配下に置く。data/ は .gitignore 済みなので
// 個人情報がリポジトリに乗らない（OPENQLOW_DATA_DIR で外部へ退避も可能）。
const consentFile = path.join(baseDir, "guardian_consents.json");
const followupHours = Number(process.env.OPENQLOW_FOLLOWUP_HOURS) || 24;
// 退会操作の担当者名。誰が押したかを監査ログへ残すために使う。
const staffName = process.env.OPENQLOW_STAFF_NAME || "";

function coerceGender(value: string): Gender {
  if (value === "female" || /女/.test(value)) return "female";
  if (value === "male" || /男/.test(value)) return "male";
  return "unknown";
}

/** 見込み客1人に合った返信下書きを返す（status に応じて生成器を使い分け）。 */
function draftFor(p: Prospect): string {
  const gender = coerceGender(p.gender);
  if (p.status === "joined") {
    return generateTrialFollowup({ gender }).messages.reviewRequest;
  }
  if (p.status === "trial_done") {
    return generateTrialFollowup({
      gender,
      ageBand: p.ageGroup,
      concern: p.memo || p.lostReason,
      enrollmentStatus: p.trialStatus,
    }).messages.nextDayFollow;
  }
  return generateInquiryReply({
    message: p.inquiryText?.trim() || "体験について相談したい",
    gender,
  }).replies.followUp24h;
}

function flagsToProspectInput(flags: Record<string, string>): ProspectInput {
  const input: ProspectInput = {};
  if (flags.name) input.name = flags.name;
  if (flags.source) input.contactSource = flags.source;
  if (flags.gender) input.gender = flags.gender;
  if (flags.age) input.ageGroup = flags.age;
  if (flags.category) input.category = flags.category as ProspectInput["category"];
  if (flags.purpose) input.purpose = flags.purpose;
  if (flags.temperature) input.temperature = flags.temperature as ProspectInput["temperature"];
  if (flags.status) input.status = flags.status as ProspectStatus;
  if (flags.inquiry) input.inquiryText = flags.inquiry;
  if (flags.memo) input.memo = flags.memo;
  if (flags.trialDate) input.trialDate = flags.trialDate;
  if (flags.contact) input.lastContactAt = flags.contact;
  return input;
}

// --- 退会管理（スタッフ画面） --------------------------------------------------

/** 誰が操作したか。--owner が付いたときだけオーナー権限になる。 */
function resolveActor(flags: Record<string, string>): Actor {
  const name = flags.staff || staffName;
  if ("owner" in flags) return { type: "owner", id: flags.owner || name || "オーナー" };
  return { type: "staff", id: name };
}

/** 「未 / 済」表示。日時があれば日付も出す。 */
function doneMark(iso: string): string {
  return iso ? `済（${formatJstStamp(iso)}）` : "未";
}

function shortName(c: WithdrawalCase): string {
  return c.memberName || c.memberId || `#${c.id}`;
}

/** 会費ペイ未処理の件数を画面の一番上に出す（見落とすと事故になるため）。 */
function printWithdrawalBanner(all: WithdrawalCase[]): void {
  const pending = getPaymentStopPending(all);
  if (pending.length > 0) {
    console.log(`⚠ 会費ペイ未処理 ${pending.length}件`);
    console.log("");
  }
}

/** 操作結果の共通表示。何もしなかった場合もその理由を必ず出す。 */
function printOpResult(result: WithdrawalOpResult): number {
  console.log(result.message);
  if (result.case) {
    const c = result.case;
    console.log(`  状態: ${withdrawalStatusLabel(c.currentWithdrawalStatus)}`);
    if (c.scheduledWithdrawalDate) {
      console.log(`  退会予定日: ${c.scheduledWithdrawalDate}（最終在籍月 ${c.finalMembershipMonth}）`);
    }
    if (c.paymentStopStatus === "pending") {
      console.log(`  会費ペイ: 未処理 → 処理後に \`npm run crm -- withdrawal payment-done ${c.id}\``);
    }
  }
  return result.ok ? 0 : 1;
}

function printWithdrawalHelp(): void {
  console.log(`退会管理の使い方

  npm run crm -- withdrawal <コマンド>

■ 毎日見る
  alerts                          要処理の一覧（会費ペイ未処理・受付LINE未送信・オーナー確認）
  list [--all]                    対応中の一覧（--all で完了済みも表示）
  show <番号>                     【退会管理】1人分の画面
  timeline <番号>                 時系列（オーナー確認用・監査ログから生成）

■ 手続き（押した事実を記録します。送信そのものは人が行います）
  open --member <会員番号> [--name 氏名] [--line <userId>] [--channel LINE|電話|メール|来館]
                                  退会のご相談を受けた（正式受付にはなりません）
  guide <番号> [--sent]           手続き案内の文面を表示。--sent で送信済みとして記録
  form <番号>                     ［退会届受領］
  key <番号>                      ［カードキー返却］
  notice <番号> [--sent]          正式受付のご案内文面を表示。--sent で送信済みとして記録
  payment-done <番号>             ［会費ペイ処理済］（会費ペイ側の操作を終えてから押す）
  owner-review <番号> --reason "…"  ［オーナー確認へ］
  closing-notice <番号>           退会完了のご案内文面を表示
  close <番号>                    退会完了（退会予定日の到来後・4条件を満たす場合のみ）

■ 管理者のみ
  resolve <番号> --note "判断内容" --owner        オーナー確認を解除
  correct <番号> --field <項目> --value <値> --reason "理由" --owner   記録の修正

■ 共通オプション
  --staff <名前>                  担当者名（環境変数 OPENQLOW_STAFF_NAME でも指定可）

退会日・最終在籍月・状態はシステムが決めます。スタッフが計算・入力する必要はありません。
修正できる項目: ${CORRECTABLE_FIELDS.join(" / ")}`);
}

async function runWithdrawal(
  positional: string[],
  flags: Record<string, string>,
): Promise<number> {
  const service = openWithdrawalService({ dataDir: baseDir });
  const sub = (positional[0] ?? "list").trim();
  const actor = resolveActor(flags);

  /** 番号（id）または管理番号から1件取る。 */
  const pick = async (key: string) => {
    const t = (key ?? "").trim();
    if (!t) return undefined;
    return /^\d+$/.test(t) ? service.cases.get(Number(t)) : service.cases.findByCaseNumber(t);
  };

  const requireCase = async (key: string) => {
    const found = await pick(key);
    if (!found) console.error("対象が見つかりません。`npm run crm -- withdrawal list` で番号を確認してください。");
    return found;
  };

  switch (sub) {
    case "help":
      printWithdrawalHelp();
      return 0;

    case "alerts": {
      const all = await service.cases.getAll();
      const pending = getPaymentStopPending(all);
      const notSent = getConfirmationNotSent(all);
      const ownerReview = getOwnerReviewRequired(all);
      const ready = getReadyToClose(all, new Date());

      printWithdrawalBanner(all);
      console.log(`■ 会費ペイ未処理（${pending.length}件）`);
      if (!pending.length) console.log("  なし");
      for (const c of pending) {
        console.log(`  要処理  ${shortName(c)}`);
        console.log(`    正式受付  ${c.formalReceivedAt.slice(0, 10)}`);
        console.log(`    退会予定  ${c.scheduledWithdrawalDate}`);
        console.log(`    会費ペイ  ${PAYMENT_STOP_LABELS[c.paymentStopStatus]}`);
        console.log(`    処理したら: npm run crm -- withdrawal payment-done ${c.id}`);
      }

      const print = (title: string, list: WithdrawalCase[], hint: (c: WithdrawalCase) => string) => {
        console.log(`\n■ ${title}（${list.length}件）`);
        if (!list.length) console.log("  なし");
        for (const c of list) console.log(`  ${shortName(c)} → ${hint(c)}`);
      };
      print("正式受付LINE 未送信", notSent, c => `npm run crm -- withdrawal notice ${c.id}`);
      print("オーナー確認", ownerReview, c => c.ownerReviewReason || "理由未記録");
      print("退会完了にできる", ready, c => `npm run crm -- withdrawal close ${c.id}`);
      return 0;
    }

    case "list": {
      const all = await service.cases.getAll();
      const rows = "all" in flags ? all : all.filter(c => !c.closedAt && c.currentWithdrawalStatus !== "ACTIVE");
      printWithdrawalBanner(all);
      if (!rows.length) {
        console.log("対応中の退会手続きはありません。");
        return 0;
      }
      console.log(`■ 退会手続き（${rows.length}件）`);
      for (const c of rows) {
        const pay = c.formalReceivedAt ? ` | 会費ペイ:${PAYMENT_STOP_LABELS[c.paymentStopStatus]}` : "";
        const due = c.scheduledWithdrawalDate ? ` | 退会予定:${c.scheduledWithdrawalDate}` : "";
        console.log(`#${c.id} ${shortName(c)} | ${withdrawalStatusLabel(c.currentWithdrawalStatus)}${due}${pay}`);
      }
      console.log("\nヒント: 詳しく見るなら `npm run crm -- withdrawal show <番号>`");
      return 0;
    }

    case "show": {
      const c = await requireCase(positional[1] ?? "");
      if (!c) return 1;
      const row = (label: string, value: unknown) =>
        console.log(`  ${label}: ${value === "" || value === undefined || value === null ? "（未記録）" : value}`);
      console.log(`■ #${c.id} ${shortName(c)}　${c.caseNumber}`);
      console.log("【退会管理】");
      row("状態", withdrawalStatusLabel(c.currentWithdrawalStatus));
      row("最初の相談", `${formatJstStamp(c.firstWithdrawalInquiryAt) || "（未記録）"}（${c.withdrawalInquiryChannel || "経路未記録"}）`);
      row("手続き案内", doneMark(c.procedureGuidedAt));
      row("退会届", doneMark(c.withdrawalFormReceivedAt));
      row("カードキー", doneMark(c.cardKeyReturnedAt));
      row("正式受付", c.formalReceivedAt ? c.formalReceivedAt.slice(0, 10) : "（未成立：退会届とカードキーの両方が必要）");
      row("退会予定日", c.scheduledWithdrawalDate);
      row("最終在籍月", c.finalMembershipMonth);
      row("会費ペイ", c.formalReceivedAt ? PAYMENT_STOP_LABELS[c.paymentStopStatus] : "（正式受付後に判定）");
      row("LINE受付通知", doneMark(c.withdrawalConfirmationSentAt));
      row("オーナー確認", c.ownerReviewRequired === 1 ? `必要（${c.ownerReviewReason || "理由未記録"}）` : "不要");
      row("担当", c.handledBy);
      row("退会完了", doneMark(c.closedAt));
      row("メモ", c.memo);

      const missing = missingForClose(c);
      if (!c.closedAt && missing.length) console.log(`\n  残りの手続き: ${missing.join(" / ")}`);
      console.log(
        "\nボタン: " +
          [
            `［退会届受領］ withdrawal form ${c.id}`,
            `［カードキー返却］ withdrawal key ${c.id}`,
            `［会費ペイ処理済］ withdrawal payment-done ${c.id}`,
            `［オーナー確認へ］ withdrawal owner-review ${c.id} --reason "…"`,
          ].join("\n        "),
      );
      return 0;
    }

    case "timeline": {
      const c = await requireCase(positional[1] ?? "");
      if (!c) return 1;
      // 入会時の重要事項は既存の同意記録が正本。退会側では複製せず、ここで参照して並べる。
      const consentStore = openGuardianConsentStore(consentFile);
      const consent = c.lineUserId ? await consentStore.findByExternalId(c.lineUserId) : undefined;
      const entries = buildWithdrawalTimeline(await service.audit.getByCase(c.id), {
        termsVersion: consent?.termsVersion || c.onboardingTermsVersion,
        sentAt: consent?.createdAt || c.onboardingTermsSentAt,
        confirmedAt: consent?.consentedAt || c.onboardingTermsConfirmedAt,
      });
      console.log(`■ #${c.id} ${shortName(c)}　${c.caseNumber} の時系列`);
      console.log("（監査ログそのままの元データです。要約を付ける場合もこの表を必ず併記してください）\n");
      if (!entries.length) console.log("  記録はまだありません。");
      for (const e of entries) {
        console.log(`${e.at}  ${e.label}${e.detail ? `\n            ${e.detail}` : ""}`);
      }
      return 0;
    }

    case "open": {
      const memberId = (flags.member ?? "").trim();
      const lineUserId = (flags.line ?? "").trim();
      if (!memberId && !lineUserId) {
        console.error('Usage: crm withdrawal open --member <会員番号> [--name 氏名] [--line <userId>] [--channel LINE]');
        return 1;
      }
      const result = await service.recordInquiry({
        memberId,
        lineUserId,
        memberName: flags.name,
        channel: flags.channel || "来館",
        // --text にお客様の言葉を渡すと、拾った語と退会/休会の別を証跡に残せる
        ...(flags.text
          ? { keywords: detectWithdrawalIntent(flags.text).keywords, kind: detectWithdrawalIntent(flags.text).kind }
          : {}),
        actor,
        source: "CLI",
      });
      // 特殊ケースの可能性があれば、判断材料として出す（自動でオーナー確認にはしない）。
      if (flags.text) {
        const signals = detectOwnerReviewSignals(flags.text);
        if (signals.length) {
          console.log(`※ オーナー確認が必要かもしれません: ${signals.map(s => s.reason).join("、")}`);
          console.log(`   回すなら: npm run crm -- withdrawal owner-review ${result.case?.id} --reason "…"`);
        }
      }
      return printOpResult(result);
    }

    case "guide": {
      const c = await requireCase(positional[1] ?? "");
      if (!c) return 1;
      if (!("sent" in flags)) {
        if (c.procedureGuidedAt) {
          console.log(`※ 手続き案内は送信済みです（${formatJstStamp(c.procedureGuidedAt)}）。重複送信しないでください。`);
          return 0;
        }
        console.log("■ 手続き案内（確認して送信してください・自動送信はしません）\n");
        console.log(buildProcedureGuideMessage());
        console.log(`\n送信したら: npm run crm -- withdrawal guide ${c.id} --sent`);
        return 0;
      }
      return printOpResult(await service.markProcedureGuided({ caseId: c.id, actor, source: "CLI" }));
    }

    case "form": {
      const c = await requireCase(positional[1] ?? "");
      if (!c) return 1;
      return printOpResult(await service.receiveWithdrawalForm({ caseId: c.id, actor }));
    }

    case "key": {
      const c = await requireCase(positional[1] ?? "");
      if (!c) return 1;
      return printOpResult(await service.returnCardKey({ caseId: c.id, actor }));
    }

    case "notice": {
      const c = await requireCase(positional[1] ?? "");
      if (!c) return 1;
      if (!c.formalReceivedAt) {
        console.error("正式受付がまだ成立していません（退会届とカードキーの両方が必要です）。");
        return 1;
      }
      if (!("sent" in flags)) {
        if (c.withdrawalConfirmationSentAt) {
          console.log(`※ 正式受付のご案内は送信済みです（${formatJstStamp(c.withdrawalConfirmationSentAt)}）。`);
          return 0;
        }
        console.log("■ 正式受付のご案内（確認して送信してください・自動送信はしません）\n");
        // 日付はすべて台帳の確定値。ここで計算し直さない。
        console.log(buildFormalReceiptMessage(c));
        console.log(`\n送信したら: npm run crm -- withdrawal notice ${c.id} --sent`);
        return 0;
      }
      return printOpResult(await service.markConfirmationSent({ caseId: c.id, actor }));
    }

    case "closing-notice": {
      const c = await requireCase(positional[1] ?? "");
      if (!c) return 1;
      if (!c.scheduledWithdrawalDate) {
        console.error("退会予定日が未確定です（正式受付が必要です）。");
        return 1;
      }
      console.log("■ 退会完了のご案内（確認して送信してください・自動送信はしません）\n");
      console.log(buildWithdrawalClosedMessage(c));
      return 0;
    }

    case "payment-done": {
      const c = await requireCase(positional[1] ?? "");
      if (!c) return 1;
      return printOpResult(await service.completePaymentStop({ caseId: c.id, actor, note: flags.note }));
    }

    case "owner-review": {
      const c = await requireCase(positional[1] ?? "");
      if (!c) return 1;
      if (!flags.reason?.trim()) {
        console.error('Usage: crm withdrawal owner-review <番号> --reason "返金要求あり など"');
        return 1;
      }
      return printOpResult(await service.requestOwnerReview({ caseId: c.id, reason: flags.reason, actor }));
    }

    case "resolve": {
      const c = await requireCase(positional[1] ?? "");
      if (!c) return 1;
      if (!("owner" in flags)) {
        console.error("オーナー確認の解除はオーナーのみです。`--owner` を付けてください。");
        return 1;
      }
      if (!flags.note?.trim()) {
        console.error('Usage: crm withdrawal resolve <番号> --note "判断内容" --owner');
        return 1;
      }
      return printOpResult(await service.resolveOwnerReview({ caseId: c.id, note: flags.note, actor }));
    }

    case "close": {
      const c = await requireCase(positional[1] ?? "");
      if (!c) return 1;
      return printOpResult(await service.closeWithdrawal({ caseId: c.id, actor }));
    }

    case "correct": {
      const c = await requireCase(positional[1] ?? "");
      if (!c) return 1;
      const field = (flags.field ?? "") as CorrectableField;
      if (!("owner" in flags) || !flags.reason?.trim() || !CORRECTABLE_FIELDS.includes(field)) {
        console.error('Usage: crm withdrawal correct <番号> --field <項目> --value <値> --reason "理由" --owner');
        console.error(`  修正できる項目: ${CORRECTABLE_FIELDS.join(" / ")}`);
        console.error("  退会予定日・最終在籍月・正式受付日・状態は自動計算のため直接修正できません。");
        return 1;
      }
      return printOpResult(
        await service.adminCorrect({ caseId: c.id, field, value: flags.value ?? "", reason: flags.reason, actor }),
      );
    }

    default:
      console.error(`不明なサブコマンド: ${sub}`);
      printWithdrawalHelp();
      return 1;
  }
}

function printHelp(): void {
  console.log(`CRM（集客・追客アシスタント）の使い方

  npm run crm -- <コマンド>

■ よく使う
  intake --message "<問い合わせ文>"   問い合わせを取り込み、返信下書きまで一気に出す
  followups [--drafts]                 今フォローすべき人の一覧（--drafts で全員の返信下書きも一括表示）
  draft <番号>                         その人向けの返信下書きを出す（自動送信はしません）
  daily-report                         今日の集計レポートを作って保存

■ 名簿の操作
  list [--status 入会]                 一覧表示（--status で状態を絞り込み。日本語OK）
  find <名前の一部>                    名前で探す
  show <番号>                          その人の詳しい情報をすべて表示
  status <番号> <状態> [--memo "…"]   状態を更新（メモも残せる。メモは返信下書きに反映）
  add [--name 田中 --gender female ...] 手動で1件登録

■ 退会手続き（退会トラブルゼロ化OS）
  withdrawal alerts                    要処理の一覧（会費ペイ未処理など）
  withdrawal list                      対応中の退会手続き一覧
  withdrawal show <番号>               【退会管理】1人分の画面
  withdrawal timeline <番号>           時系列（オーナー確認用）
  withdrawal help                      退会管理の使い方をすべて表示

■ 未成年の保護者同意
  consent list                         同意の記録を一覧表示
  consent show <番号|管理番号>         その同意の詳しい内容を表示
  consent paper <番号|管理番号>        紙の同意書に署名をもらったことを記録
  consent terms                        保護者に見せる重要事項の文言を表示

■ その他
  log-error <種別> <メッセージ>        うまく動かない時の記録を残す
  help                                 この使い方を表示

ヒント: どのコマンドも勝手にメッセージを送りません。送るのは必ず人の最終確認のあとです。`);
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const { flags, positional } = parseFlags(rest);
  const store = openProspectStore(storeFile);
  const consentStore = openGuardianConsentStore(consentFile);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }

  switch (command) {
    case "add": {
      const input = flagsToProspectInput(flags);
      if (!input.lastContactAt) input.lastContactAt = new Date().toISOString();
      const created = await store.create(input);
      console.log(`登録しました: #${created.id} ${created.name || "(無名)"} [${created.status}]`);
      return 0;
    }
    case "intake": {
      const message = (flags.message ?? positional.join(" ")).trim();
      if (!message) {
        console.error('Usage: crm intake --message "<問い合わせ文>" [--name 田中] [--gender female|male] [--source LINE]');
        return 1;
      }
      const { prospect, replyDraft } = buildProspectFromInquiry(
        { message, gender: flags.gender as Gender | undefined },
        { name: flags.name, contactSource: flags.source },
      );
      const created = await store.create(prospect);
      console.log(`台帳に下書き登録しました: #${created.id} ${created.name || "(無名)"}`);
      console.log(`属性:${created.category} / 温度感:${created.temperature} / 目的:${created.purpose} / 次アクション:${created.nextAction}`);
      console.log("\n■ 返信下書き（確認して送信してください・自動送信はしません）\n" + replyDraft);
      return 0;
    }
    case "list": {
      const all = await store.getAll();
      let rows = all;
      let label = "全";
      if (flags.status) {
        const want = resolveStatus(flags.status);
        if (!want) {
          console.error(`不明な状態: ${flags.status}（例: 返信した / 体験予約 / 体験済み / 入会 / 見送り）`);
          return 1;
        }
        rows = all.filter(p => p.status === want);
        label = want;
      }
      if (!rows.length) {
        console.log(flags.status ? `状態「${label}」の見込み客はいません。` : "見込み客はまだ登録されていません。");
        return 0;
      }
      console.log(`■ 一覧（${label}：${rows.length}件）`);
      for (const p of rows) {
        console.log(`#${p.id} ${p.name || "(無名)"} | ${p.category} | ${p.status} | 温度:${p.temperature || "-"} | 最終連絡:${p.lastContactAt?.slice(0, 16) || "-"}`);
      }
      return 0;
    }
    case "status": {
      const id = Number(positional[0] ?? flags.id);
      const status = resolveStatus(positional[1] ?? flags.to ?? "");
      if (!id || !status) {
        console.error("Usage: crm status <番号> <状態> [--memo \"ひとことメモ\"]");
        console.error("  状態（日本語OK）: 返信した / 体験予約 / 体験済み / 入会 / 見送り など（英語コードも可）");
        return 1;
      }
      const updated = await store.update(id, {
        status,
        lastContactAt: new Date().toISOString(),
        ...(flags.memo ? { memo: flags.memo } : {}),
      });
      if (!updated) {
        console.error(`#${id} が見つかりません。`);
        return 1;
      }
      console.log(`#${id} を ${status} に更新しました。${flags.memo ? `（メモ: ${flags.memo}）` : ""}`);
      return 0;
    }
    case "find": {
      const query = (positional.join(" ") || flags.name || "").trim();
      if (!query) {
        console.error("Usage: crm find <名前の一部>");
        return 1;
      }
      const hits = (await store.getAll()).filter(p => (p.name || "").includes(query));
      if (!hits.length) {
        console.log(`「${query}」に一致する見込み客はいません。`);
        return 0;
      }
      for (const p of hits) {
        console.log(`#${p.id} ${p.name || "(無名)"} | ${p.category} | ${p.status} | 温度:${p.temperature || "-"}`);
      }
      return 0;
    }
    case "show": {
      const id = Number(positional[0] ?? flags.id);
      const p = id ? await store.get(id) : undefined;
      if (!p) {
        console.error("Usage: crm show <番号>（その人の詳しい情報をすべて表示します）");
        return 1;
      }
      const row = (label: string, value: unknown) =>
        console.log(`  ${label}: ${value === "" || value === undefined || value === null ? "（未記録）" : value}`);
      console.log(`■ #${p.id} ${p.name || "(無名)"}`);
      row("状態", p.status);
      row("属性", p.category);
      row("温度感", p.temperature);
      row("性別", p.gender);
      row("年代", p.ageGroup);
      row("目的", p.purpose);
      row("流入元", p.contactSource);
      row("問い合わせ", p.inquiryText);
      row("メモ", p.memo);
      row("体験日", p.trialDate);
      row("体験の状況", p.trialStatus);
      row("見送り理由", p.lostReason);
      row("次アクション", p.nextAction);
      row("最終連絡", p.lastContactAt?.slice(0, 16));
      row("登録日", p.createdAt?.slice(0, 16));
      row("更新日", p.updatedAt?.slice(0, 16));
      console.log("\nヒント: 返信下書きは `npm run crm -- draft " + p.id + "` で出せます。");
      return 0;
    }
    case "draft": {
      const id = Number(positional[0] ?? flags.id);
      const p = id ? await store.get(id) : undefined;
      if (!p) {
        console.error("Usage: crm draft <番号>（その人向けの返信下書きを出します）");
        return 1;
      }
      console.log(`■ #${p.id} ${p.name || "(無名)"} 向け 返信下書き（確認して送信・自動送信なし）\n`);
      console.log(draftFor(p));
      return 0;
    }
    case "followups": {
      const all = await store.getAll();
      const now = new Date();
      const withDrafts = "drafts" in flags;
      const print = (title: string, list: Prospect[]) => {
        console.log(`\n■ ${title}（${list.length}件）`);
        if (!list.length) {
          console.log("  なし");
          return;
        }
        for (const p of list) {
          console.log(`  #${p.id} ${p.name || "(無名)"}　→ 返信案: crm draft ${p.id}`);
          if (withDrafts) {
            const draft = draftFor(p).split("\n").map(line => `      ${line}`).join("\n");
            console.log(`    --- 返信下書き（確認して送信・自動送信なし） ---\n${draft}\n`);
          }
        }
      };
      print("追客漏れ候補", getFollowupNeeded(all, now, followupHours));
      print("体験後フォロー候補", getTrialFollowupNeeded(all));
      print("口コミ依頼候補", getReviewRequestCandidates(all));
      console.log(
        withDrafts
          ? "\nヒント: 上の下書きはそのまま確認して送れます（自動送信はしません）。"
          : "\nヒント: 各候補の下書きを一括で出すなら `npm run crm -- followups --drafts`（自動送信なし）。",
      );
      return 0;
    }
    case "withdrawal":
      return runWithdrawal(positional, flags);
    case "daily-report": {
      const all = await store.getAll();
      // 退会の要処理（会費ペイ未処理など）も日報に載せる。
      const withdrawals = await openWithdrawalService({ dataDir: baseDir }).cases.getAll();
      const { markdown, dateIso } = buildDailyReport(all, new Date(), { followupHours, withdrawals });
      const { filePath } = await saveDailyReport(markdown, dateIso, baseDir);
      console.log(markdown);
      console.log(`\n保存しました: ${filePath}`);
      return 0;
    }
    case "consent": {
      const sub = (positional[0] ?? "list").trim();

      // 紙の同意書を作る・見直すときに、電子側と同じ文言を確認するためのコマンド。
      if (sub === "terms") {
        console.log(`■ 未成年入会の重要事項（版: ${CONSENT_TERMS_VERSION}）\n`);
        console.log(buildImportantMattersMessage());
        console.log("\nヒント: 紙の同意書もこの文言に合わせてください。文言を変えたら CONSENT_TERMS_VERSION を上げます。");
        return 0;
      }

      if (sub === "list") {
        const all = await consentStore.getAll();
        if (!all.length) {
          console.log("保護者同意の記録はまだありません。");
          return 0;
        }
        console.log(`■ 保護者同意の記録（${all.length}件）`);
        for (const c of all) {
          const paper = c.paperSignedAt ? "紙署名済み" : "紙署名まち";
          console.log(
            `#${c.id} ${c.managementNumber} | ${c.minorName || "(氏名未記録)"} | ${c.status} | ${paper} | 同意:${c.consentedAt?.slice(0, 16) || "-"}`,
          );
        }
        console.log("\nヒント: 詳しく見るなら `npm run crm -- consent show <番号または管理番号>`");
        return 0;
      }

      if (sub === "show") {
        const key = (positional[1] ?? "").trim();
        const c = /^\d+$/.test(key)
          ? await consentStore.get(Number(key))
          : await consentStore.findByManagementNumber(key);
        if (!c) {
          console.error("Usage: crm consent show <番号または管理番号>");
          return 1;
        }
        const row = (label: string, value: unknown) =>
          console.log(`  ${label}: ${value === "" || value === undefined || value === null ? "（未記録）" : value}`);
        console.log(`■ #${c.id} ${c.managementNumber}`);
        row("ご本人氏名", c.minorName);
        row("保護者氏名", c.guardianName);
        row("状態", c.status);
        row("重要事項の確認", c.confirmedImportantMatters === 1 ? "済み" : "まだ");
        row("保護者としての同意", c.confirmedGuardianAgreement === 1 ? "済み" : "まだ");
        row("同意した文言の版", c.termsVersion);
        row("電子同意の日時", c.consentedAt?.slice(0, 16));
        row("紙の署名日", c.paperSignedAt?.slice(0, 16));
        row("メモ", c.memo);
        row("登録日", c.createdAt?.slice(0, 16));
        console.log("\n※ 紙の同意書が原本です。電子の記録は事前確認の履歴です。");
        return 0;
      }

      // 初回来館時に紙の同意書へ署名をもらったら、その事実をここで記録する。
      if (sub === "paper") {
        const key = (positional[1] ?? "").trim();
        const c = /^\d+$/.test(key)
          ? await consentStore.get(Number(key))
          : await consentStore.findByManagementNumber(key);
        if (!c) {
          console.error('Usage: crm consent paper <番号または管理番号> [--guardian "保護者氏名"]');
          return 1;
        }
        const updated = await consentStore.update(c.id, {
          paperSignedAt: new Date().toISOString(),
          ...(flags.guardian ? { guardianName: flags.guardian } : {}),
        });
        console.log(`${updated?.managementNumber} に紙の署名を記録しました（原本を保管してください）。`);
        return 0;
      }

      console.error(`不明なサブコマンド: ${sub}\n  使える: list / show <番号> / paper <番号> / terms`);
      return 1;
    }
    case "log-error": {
      const type = (positional[0] ?? flags.type ?? "unknown") as ErrorType;
      const message = positional.slice(1).join(" ") || flags.message || "";
      const { filePath } = await logError(type, message, flags.context, baseDir);
      console.log(`自己修復ログを記録しました: ${filePath}`);
      return 0;
    }
    default:
      console.error(`不明なコマンド: ${command}\n使い方は \`npm run crm -- help\` で確認できます。`);
      return 1;
  }
}

const invokedBasename = process.argv[1] ? path.basename(process.argv[1]) : "";
const invokedDirectly = invokedBasename === "crm_cli.ts" || invokedBasename === "crm_cli.js";
if (invokedDirectly) {
  const code = await main(process.argv.slice(2));
  process.exit(code);
}

export { main as runCrmCli };
