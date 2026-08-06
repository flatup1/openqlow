import {
  AGE_BANDS,
  buildAgeBandQuestion,
  buildConsentRecordMessage,
  buildGuardianConsentCard,
  CONSENT_TERMS_VERSION,
  formatManagementNumber,
  GUARDIAN_CONSENT_AGE_THRESHOLD,
  GUARDIAN_CONSENT_ITEMS,
  GUARDIAN_CONSENT_REPLY,
  GUARDIAN_CONSENT_TRIGGER,
  isGuardianConsentReply,
  nextCardForAgeBand,
  requiresGuardianConsent,
  resolveAgeBand,
} from "./guardian_consent.js";
import { scoreResponseQuality } from "./response_quality.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

// --- 年代区分 -----------------------------------------------------------------
assert(GUARDIAN_CONSENT_AGE_THRESHOLD === 18, "境界は18歳");
assert(AGE_BANDS.length === 4, "年代は4区分");
assert(resolveAgeBand("小学生") === "elementary", "小学生");
assert(resolveAgeBand("中学生") === "junior_high", "中学生");
assert(resolveAgeBand("高校生") === "high_school", "高校生");
assert(resolveAgeBand("大人") === "adult", "大人 => adult");
assert(resolveAgeBand(" 成人 ") === "adult", "前後空白を許容");
assert(resolveAgeBand("ぴよぴよ") === undefined, "未知 => undefined");

// --- 要否判定（安全側に倒す） -------------------------------------------------
assert(requiresGuardianConsent("小学生") === true, "小学生は必要");
assert(requiresGuardianConsent("中学生") === true, "中学生は必要");
assert(requiresGuardianConsent("高校生") === true, "高校生は必要（18歳でも取りこぼさない）");
assert(requiresGuardianConsent("成人") === false, "成人は不要");
assert(requiresGuardianConsent("") === true, "未選択は安全側で必要");
assert(requiresGuardianConsent("ぴよぴよ") === true, "不正入力は安全側で必要");

// --- 重要事項は共通案内と重複させない ----------------------------------------
assert(GUARDIAN_CONSENT_ITEMS.length === 4, "未成年特有の4項目");
assert(GUARDIAN_CONSENT_ITEMS.some(t => t.includes("骨折")), "けがのリスクに触れる");
assert(GUARDIAN_CONSENT_ITEMS.some(t => t.includes("指示")), "指示に従うことに触れる");
// 退会・休会・違約金は【1/2】重要事項の確認の担当。ここに書くと二重管理になる。
for (const item of GUARDIAN_CONSENT_ITEMS) {
  assert(!item.includes("退会"), `退会は共通案内の担当: ${item}`);
  assert(!item.includes("違約金"), `違約金は共通案内の担当: ${item}`);
  assert(!/\d{1,3}[,，]\d{3}/.test(item), `金額を書かない: ${item}`);
}
assert(CONSENT_TERMS_VERSION.length > 0, "版が入っている");

// --- カード -------------------------------------------------------------------
assert(GUARDIAN_CONSENT_TRIGGER === "入会手続き", "トリガー語");

const ageCard = buildAgeBandQuestion();
assert(ageCard.options.length === 4, "年代カードは4択");
for (const o of ageCard.options) {
  assert(o.send.startsWith(GUARDIAN_CONSENT_TRIGGER), `送信テキストはトリガー始まり: ${o.send}`);
  const picked = o.send.replace(`${GUARDIAN_CONSENT_TRIGGER} `, "");
  assert(resolveAgeBand(picked) !== undefined, `送信テキストから年代を解決できる: ${o.send}`);
}

const consentCard = buildGuardianConsentCard();
assert(consentCard.options.length === 1, "同意ボタンは1つ（応答メッセージは状態を持てないため）");
assert(consentCard.options[0].send === GUARDIAN_CONSENT_REPLY, "押すと同意文が送られる");
for (const item of GUARDIAN_CONSENT_ITEMS) {
  assert(consentCard.text.includes(item), `カード本文に重要事項が載る: ${item.slice(0, 12)}`);
}

// --- 分岐 ---------------------------------------------------------------------
assert(nextCardForAgeBand("成人") === null, "成人は未成年フローに入らない");
assert(nextCardForAgeBand("中学生") !== null, "未成年は同意カードへ");
assert(nextCardForAgeBand("") !== null, "不明も安全側で同意カードへ");

assert(isGuardianConsentReply(GUARDIAN_CONSENT_REPLY) === true, "同意文を認識する");
assert(isGuardianConsentReply(` ${GUARDIAN_CONSENT_REPLY} `) === true, "前後空白を許容");
assert(isGuardianConsentReply("こんにちは") === false, "無関係な発言は認識しない");

// --- 記録 ---------------------------------------------------------------------
const at = new Date("2026-08-06T05:30:00Z"); // JST 14:30
assert(formatManagementNumber(1, at) === "FG-MC-2026.08.06.0001", "管理番号の形式");
// JST深夜0時はUTCでは前日15時。ローカル時刻のメソッドを使うと日付が1日ずれる。
assert(
  formatManagementNumber(1, new Date("2026-08-06T00:00:00+09:00")) === "FG-MC-2026.08.06.0001",
  "管理番号の日付はJSTで決まる（UTCサーバーでも 08.05 にならない）",
);
assert(formatManagementNumber(1234, at) === "FG-MC-2026.08.06.1234", "4桁でも壊れない");

const record = buildConsentRecordMessage("FG-MC-2026.08.06.0001", at);
assert(record.includes("保護者同意を受け付けました"), "受付メッセージ");
assert(record.includes("FG-MC-2026.08.06.0001"), "管理番号を含む");
assert(record.includes("2026-08-06 14:30"), "同意日時をJSTで含む");
assert(record.includes("紙の同意書"), "紙の署名を案内する");

// --- 文面の品質を固定する（将来の編集でトーンが落ちないように） ---------------
// 同ディレクトリの4観点スコアラーで満点であることを保証する。
for (const [name, card] of [
  ["年代カード", ageCard],
  ["未成年カード", consentCard],
] as const) {
  const q = scoreResponseQuality(card.text);
  assert(q.total === 100, `${name} は100点であること（実測 ${q.total}）`);
  assert(q.decision === "perfect", `${name} は perfect であること（実測 ${q.decision}）`);
}

// 管理番号がハイフン区切りだと電話番号と誤検出され、送信が止まる（2026-08-06 実測）。
// ドット区切りに変えた経緯を回帰テストとして固定する。
const recordQuality = scoreResponseQuality(buildConsentRecordMessage("FG-MC-2026.08.06.0001", at));
assert(
  recordQuality.total === 100,
  `同意受付メッセージは100点であること（実測 ${recordQuality.total} / ${recordQuality.kindness.issues.join(",")}）`,
);
const hyphenated = scoreResponseQuality(buildConsentRecordMessage("FG-MC-20260806-0001", at));
assert(
  hyphenated.decision === "reject",
  "ハイフン区切りの管理番号は電話番号と誤検出されるため使わない（この挙動を明示的に記録する）",
);

console.log("port/aika guardian_consent tests passed");
