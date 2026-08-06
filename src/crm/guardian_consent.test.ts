import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  AGE_BANDS,
  buildAgeBandQuestion,
  buildConsentRecordMessage,
  buildGuardianConsentCard,
  buildImportantMattersMessage,
  buildRemainingConfirmationMessage,
  calculateAge,
  CONSENT_ACTIONS,
  CONSENT_TERMS_VERSION,
  formatManagementNumber,
  GUARDIAN_CONSENT_AGE_THRESHOLD,
  GUARDIAN_CONSENT_ITEMS,
  GUARDIAN_CONSENT_TRIGGER,
  isConsentComplete,
  normalizeGuardianConsentInput,
  openGuardianConsentStore,
  parseBirthDate,
  requiresGuardianConsent,
  resolveAgeBand,
  resolveConsentStatus,
} from "./guardian_consent.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// --- 生年月日のゆるいパース ---------------------------------------------------
assert(parseBirthDate("2010-04-01") === "2010-04-01", "ハイフン区切り");
assert(parseBirthDate("2010/4/1") === "2010-04-01", "スラッシュ＋1桁をゼロ埋め");
assert(parseBirthDate("20100401") === "2010-04-01", "区切りなし8桁");
assert(parseBirthDate("2010年4月1日") === "2010-04-01", "日本語表記");
assert(parseBirthDate(" 2010-04-01 ") === "2010-04-01", "前後空白を許容");
assert(parseBirthDate("2010-02-30") === undefined, "実在しない日付は弾く");
assert(parseBirthDate("2010-13-01") === undefined, "13月は弾く");
assert(parseBirthDate("ぴよぴよ") === undefined, "文字列は弾く");
assert(parseBirthDate("") === undefined, "空は弾く");

// --- 満年齢の計算 -------------------------------------------------------------
const asOf = new Date("2026-08-06T00:00:00+09:00");
assert(calculateAge("2010-08-06", asOf) === 16, "誕生日当日は加齢済み");
assert(calculateAge("2010-08-07", asOf) === 15, "誕生日前日はまだ加齢しない");
assert(calculateAge("2010-08-05", asOf) === 16, "誕生日を過ぎている");
assert(calculateAge("2008-08-06", asOf) === 18, "ちょうど18歳");
assert(calculateAge("ぴよぴよ", asOf) === undefined, "不正な生年月日は undefined");

// --- 年代区分の解決 -----------------------------------------------------------
assert(GUARDIAN_CONSENT_AGE_THRESHOLD === 18, "境界は18歳");
assert(AGE_BANDS.length === 4, "年代は4区分");
assert(resolveAgeBand("小学生") === "elementary", "小学生 => elementary");
assert(resolveAgeBand("中学生") === "junior_high", "中学生 => junior_high");
assert(resolveAgeBand("高校生") === "high_school", "高校生 => high_school");
assert(resolveAgeBand("成人") === "adult", "成人 => adult");
assert(resolveAgeBand("大人") === "adult", "大人 => adult");
assert(resolveAgeBand(" 中学生 ") === "junior_high", "前後空白を許容");
for (const b of AGE_BANDS) {
  assert(resolveAgeBand(b) === b, `英語コード ${b} はそのまま通る`);
}
assert(resolveAgeBand("ぴよぴよ") === undefined, "未知 => undefined");

// --- 保護者同意の要否判定（生年月日は聞かない・安全側に倒す） ----------------
assert(requiresGuardianConsent("小学生") === true, "小学生は同意が必要");
assert(requiresGuardianConsent("中学生") === true, "中学生は同意が必要");
assert(requiresGuardianConsent("高校生") === true, "高校生は同意が必要（18歳でも取りこぼさない）");
assert(requiresGuardianConsent("成人") === false, "成人は不要");
assert(requiresGuardianConsent("adult") === false, "英語コードでも成人は不要");
// 判定できない場合に同意を飛ばすのが最も危険なため、true を返すこと。
assert(requiresGuardianConsent("") === true, "未選択は安全側で同意が必要");
assert(requiresGuardianConsent("ぴよぴよ") === true, "不正入力は安全側で同意が必要");

// --- 両方チェックしないと成立しない ------------------------------------------
assert(
  isConsentComplete({ confirmedImportantMatters: 1, confirmedGuardianAgreement: 1 }) === true,
  "両方チェックで成立",
);
assert(
  isConsentComplete({ confirmedImportantMatters: 1, confirmedGuardianAgreement: 0 }) === false,
  "重要事項のみでは成立しない",
);
assert(
  isConsentComplete({ confirmedImportantMatters: 0, confirmedGuardianAgreement: 1 }) === false,
  "同意のみでは成立しない",
);
assert(
  isConsentComplete({ confirmedImportantMatters: 0, confirmedGuardianAgreement: 0 }) === false,
  "未チェックでは成立しない",
);

// --- 重要事項の中身 -----------------------------------------------------------
assert(GUARDIAN_CONSENT_ITEMS.length === 6, "重要事項は6項目");
assert(
  GUARDIAN_CONSENT_ITEMS.some(t => t.includes("骨折")),
  "怪我のリスクに触れている",
);
assert(
  GUARDIAN_CONSENT_ITEMS.some(t => t.includes("違約金")),
  "キャンペーンの違約金に触れている",
);
// 正本（canon）の具体値を持ち込まないこと。金額や住所を書くと二重管理になる。
for (const item of GUARDIAN_CONSENT_ITEMS) {
  assert(!/\d{1,3}[,，]\d{3}/.test(item), `重要事項に金額を書かない: ${item}`);
}

// --- ステータスの日本語別名 ---------------------------------------------------
assert(resolveConsentStatus("同意済み") === "consented", "同意済み => consented");
assert(resolveConsentStatus("署名済み") === "paper_signed", "署名済み => paper_signed");
assert(resolveConsentStatus("pending") === "pending", "英語コードはそのまま");
assert(resolveConsentStatus("ぴよぴよ") === undefined, "未知 => undefined");

// --- 管理番号 -----------------------------------------------------------------
assert(
  formatManagementNumber(1, new Date("2026-08-06T10:00:00+09:00")) === "FG-MC-2026.08.06.0001",
  "管理番号の形式",
);
assert(
  formatManagementNumber(1234, new Date("2026-08-06T10:00:00+09:00")) === "FG-MC-2026.08.06.1234",
  "4桁を超えても壊れない",
);

// --- 入力の正規化 -------------------------------------------------------------
assert(
  normalizeGuardianConsentInput({ confirmedImportantMatters: true as unknown as 1 })
    .confirmedImportantMatters === 1,
  "true => 1",
);
assert(
  normalizeGuardianConsentInput({}).confirmedGuardianAgreement === 0,
  "既定は未チェック",
);
assert(
  normalizeGuardianConsentInput({}).termsVersion === CONSENT_TERMS_VERSION,
  "既定で現行の版が入る",
);
assert(
  (normalizeGuardianConsentInput({ prospectId: "7" as unknown as number }).prospectId as number) === 7,
  "prospectId は数値化",
);

// --- 文面 ---------------------------------------------------------------------
const notice = buildImportantMattersMessage();
assert(notice.includes("保護者の方へ"), "提示文に宛先がある");
assert(notice.includes("紙の同意書"), "紙の署名を案内している");
for (const item of GUARDIAN_CONSENT_ITEMS) {
  assert(notice.includes(item), `提示文に重要事項が含まれる: ${item.slice(0, 12)}`);
}

// --- カード式のフロー ---------------------------------------------------------
assert(GUARDIAN_CONSENT_TRIGGER === "入会手続き", "トリガー語");

const ageCard = buildAgeBandQuestion();
assert(ageCard.options.length === 4, "年代カードは4択");
assert(
  ageCard.options.every(o => resolveAgeBand(o.value) !== undefined),
  "年代カードの value はすべて正規コードとして解決できる",
);
assert(
  ageCard.options.some(o => o.label.includes("成人")),
  "成人の選択肢がある（これを選ぶと同意フローに入らない）",
);

const consentCard = buildGuardianConsentCard();
assert(consentCard.text.includes("保護者の方、入会に同意しますか"), "問いかけ文");
assert(consentCard.options.length === 2, "確認は2つ");
assert(
  consentCard.options.some(o => o.value === CONSENT_ACTIONS.confirmMatters),
  "重要事項の確認ボタン",
);
assert(
  consentCard.options.some(o => o.value === CONSENT_ACTIONS.confirmAgreement),
  "保護者同意ボタン",
);

// 押されていないほうだけを案内する
assert(
  buildRemainingConfirmationMessage({
    confirmedImportantMatters: 1,
    confirmedGuardianAgreement: 0,
  }).includes("保護者として入会に同意します"),
  "残りの確認だけを案内する",
);
assert(
  buildRemainingConfirmationMessage({
    confirmedImportantMatters: 1,
    confirmedGuardianAgreement: 1,
  }) === "",
  "両方揃っていれば案内は空",
);

// --- ストア -------------------------------------------------------------------
const dir = await mkdtemp(path.join(tmpdir(), "guardian-consent-"));
const file = path.join(dir, "guardian_consent.json");
const fixedNow = new Date("2026-08-06T05:30:00Z"); // JST 14:30
const store = openGuardianConsentStore(file, () => fixedNow);

try {
  assert((await store.getAll()).length === 0, "初期状態は空（ファイル未作成でも落ちない）");

  // 未チェックで作ると pending のまま、同意日時は入らない。
  const pending = await store.create({
    externalId: "U-line-001",
    minorName: "テスト太郎",
    ageBand: "中学生" as never, // LINEの日本語ラベルがそのまま来ても正規化される
    birthDate: "2012-05-05",
  });
  assert(pending.ageBand === "junior_high", "年代は正規コードで保存される");
  assert(pending.id === 1, "id は1から採番");
  assert(pending.managementNumber === "FG-MC-2026.08.06.0001", "管理番号が自動採番される");
  assert(pending.status === "pending", "未チェックは pending");
  assert(pending.consentedAt === "", "未成立なら同意日時は空");
  assert(pending.ageAtConsent === 14, "同意時点の年齢が確定して残る");
  assert(pending.termsVersion === CONSENT_TERMS_VERSION, "同意した文言の版が残る");

  // 片方だけチェックしても成立させない。
  const half = await store.update(pending.id, { confirmedImportantMatters: 1 });
  assert(half?.status === "pending", "片方だけでは pending のまま");
  assert(half?.consentedAt === "", "片方だけでは同意日時が入らない");

  // 両方揃った瞬間に成立する。
  const done = await store.update(pending.id, { confirmedGuardianAgreement: 1 });
  assert(done?.status === "consented", "両方揃うと consented");
  assert(done?.consentedAt === fixedNow.toISOString(), "同意日時が記録される");
  assert(done?.createdAt === pending.createdAt, "作成日時は書き換えない");

  // トークに残す記録文。
  const record = buildConsentRecordMessage(done!);
  assert(record.includes("保護者同意を受け付けました"), "受付メッセージ");
  assert(record.includes("FG-MC-2026.08.06.0001"), "管理番号を含む");
  assert(record.includes("2026-08-06 14:30"), "同意日時をJSTで含む");
  assert(record.includes("紙の同意書"), "紙の署名を案内する");

  // 紙に署名したら原本確保として状態が進む。
  const signed = await store.update(done!.id, { paperSignedAt: "2026-08-10T01:00:00Z" });
  assert(signed?.status === "paper_signed", "紙署名で paper_signed へ進む");

  // 同一ユーザーに2件目（きょうだいの入会など）。
  const second = await store.create({ externalId: "U-line-001", minorName: "テスト花子" });
  assert(second.id === 2, "id が進む");
  assert(second.managementNumber === "FG-MC-2026.08.06.0002", "管理番号も進む");
  const latest = await store.findByExternalId("U-line-001");
  assert(latest?.id === 2, "同一ユーザーは最新を返す");

  assert((await store.findByManagementNumber("FG-MC-2026.08.06.0001"))?.id === 1, "管理番号で引ける");
  assert((await store.findByExternalId("")) === undefined, "空IDでは引かない");
  assert((await store.get(999)) === undefined, "存在しないIDは undefined");
  assert((await store.update(999, { memo: "x" })) === undefined, "存在しないIDの更新は undefined");

  assert((await store.remove(2)) === true, "削除できる");
  assert((await store.remove(2)) === false, "二度目の削除は false");
  assert((await store.getAll()).length === 1, "残り1件");
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log("guardian_consent tests passed");
