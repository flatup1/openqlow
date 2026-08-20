// 保護者同意「紙とLINEで内容がズレていないか」の検知。
//
// なぜ必要か:
//   紙の同意書 docs/templates/未成年者入会_保護者同意書.html は、冒頭コメントで
//   「文言の正本は src/crm/guardian_consent.ts の GUARDIAN_CONSENT_ITEMS」
//   「文言を変えたら CONSENT_TERMS_VERSION も上げること」と宣言している。
//   ところが実際には、紙の7項目と正本の6項目は一致していない（下の KNOWN_GAPS 参照）。
//   それでいて CONSENT_TERMS_VERSION は据え置きなので、
//   **同じ版番号で、LINEの電子同意と紙の同意書が別々の内容を指している**。
//   後から「保護者は何に同意したのか」を確かめようとしたとき、記録が2つに割れる。
//
//   PR #106 のガード（port/aika/consent_wording_guard.test.ts）は
//   違約金の断定・金額の直書き・管理番号の形式を見るが、
//   「紙と正本で同意項目そのものが違う」は対象外。ここを埋める。
//
// このテストがやること:
//   1. 紙の確認事項と正本の同意項目を、それぞれ literal に固定する
//   2. どちらかが変わったら落ちる。落ちたら CONSENT_TERMS_VERSION を上げ、
//      紙とLINEを同時に直し、このファイルの固定値を更新する
//   3. 版番号も固定する。文言と版番号がセットで動くことを強制する
//
// このテストがやらないこと:
//   紙と正本のどちらが正しいかは決めない。免責条項の要否や競技名の範囲は
//   オーナーと法務の判断であって、テストが決めてよい話ではない。
//   現状の食い違いは KNOWN_GAPS に「未決」として記録してある。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONSENT_TERMS_VERSION, GUARDIAN_CONSENT_ITEMS } from "./guardian_consent.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const FORM_PATH = "docs/templates/未成年者入会_保護者同意書.html";

/** 紙の同意書から「確認事項」のチェック項目だけを取り出す。 */
function extractFormConsentItems(): string[] {
  const raw = readFileSync(path.join(repoRoot, FORM_PATH), "utf8");
  const body = raw.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const lines = body
    .split("\n")
    .map(line => line.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim())
    .filter(line => line.length > 0);

  const start = lines.findIndex(line => line === "確認事項");
  assert.notEqual(start, -1, `${FORM_PATH} に「確認事項」の見出しが見つかりません`);
  const end = lines.findIndex((line, i) => i > start && line.startsWith("緊急連絡先"));
  assert.notEqual(end, -1, `${FORM_PATH} に「緊急連絡先」の見出しが見つかりません`);

  // 見出しの次の1行は説明文（「以下の内容を確認し…」）なので落とす。
  return lines.slice(start + 2, end).filter(line => line.endsWith("。"));
}

// --- 1. 版番号の固定 ---------------------------------------------------------
// 文言を変えたらここも上げる。逆に、ここを上げずに文言だけ変えることはできない。
assert.equal(
  CONSENT_TERMS_VERSION,
  "2026-08-06",
  "CONSENT_TERMS_VERSION が変わりました。紙とLINEの文言を同時に更新し、このテストの固定値も更新してください。",
);

// --- 2. LINE側（正本）の同意項目の固定 -----------------------------------------
assert.deepEqual(
  [...GUARDIAN_CONSENT_ITEMS],
  [
    "キックボクシングは接触を伴う競技であり、打撲・捻挫・骨折などの怪我が発生する可能性があります。",
    "ジムは安全管理に努めますが、競技の特性上、怪我のリスクを完全に排除することはできません。",
    "会員および保護者は、インストラクターの指示およびジムのルールに従ってください。",
    "休会・退会などの手続きには期限があります。",
    "キャンペーン入会には適用条件があり、条件を満たさない場合は違約金が発生する場合があります。",
    "必要に応じて、保護者の方へご連絡・ご協力をお願いする場合があります。",
  ],
  "GUARDIAN_CONSENT_ITEMS が変わりました。紙の同意書も同時に直し、CONSENT_TERMS_VERSION を上げてください。",
);

// --- 3. 紙側の確認事項の固定 ---------------------------------------------------
assert.deepEqual(
  extractFormConsentItems(),
  [
    "会員規約・利用ルールを確認し、本人が遵守することに同意します。",
    "格闘技には打撲・捻挫・骨折等の怪我を伴う危険性があることを理解しています。",
    "健康状態に不安がある場合は事前に申告し、体調不良時は練習へ参加させません。",
    "インストラクターの指示および施設ルールに従い、安全に利用します。",
    "ジムの故意または過失による場合を除き、練習中に生じた怪我・事故について、通常起こりうる範囲のものは自己の責任となることを理解しています。",
    "退会・休会は会員規約に定める手続き（申請期限・届出）に従います。",
    "キャンペーンで入会した場合は、適用条件・在籍期間・違約金等を理解し同意します。",
  ],
  `${FORM_PATH} の確認事項が変わりました。LINE側の GUARDIAN_CONSENT_ITEMS も同時に直し、CONSENT_TERMS_VERSION を上げてください。`,
);

// --- 4. 現在わかっている食い違い（オーナー未決） ---------------------------------
//
// 紙と正本のどちらに寄せるかが決まったら、両方を直したうえで
// このリストを空にする。空にできた時点で、上の 2 と 3 は同じ内容を指す。
//
// 決め方は2つ:
//   (1) 紙の7項目を正本に合わせる（免責条項は落とす）
//   (2) 正本を7項目に更新し、LINEの文面も差し替える
// いずれも CONSENT_TERMS_VERSION を上げること。免責条項は法務の確認が要る。
const KNOWN_GAPS: readonly string[] = [
  "紙にだけある: 会員規約・利用ルールの遵守",
  "紙にだけある: 健康状態の申告と体調不良時の不参加",
  "紙にだけある: 怪我・事故の責任の所在（免責条項。正本に対応する項目が無い）",
  "正本にだけある: ジムは安全管理に努めるがリスクを完全には排除できない",
  "正本にだけある: 必要に応じて保護者へご連絡・ご協力をお願いする場合がある",
  "語の広がり: 正本『キックボクシング』に対し、紙は『格闘技』",
];

assert.equal(
  KNOWN_GAPS.length,
  6,
  [
    "紙と正本の食い違いの数が変わりました。",
    "解消したなら KNOWN_GAPS からその行を消し、この数も減らしてください。",
    "すべて解消できたら、このブロックごと消して構いません。",
  ].join(" "),
);

// 食い違いが残っている間は、紙が正本と同一だと言い切れない。
// 「一致しているはず」という思い込みでレビューを飛ばさないための明示。
assert.notDeepEqual(
  extractFormConsentItems(),
  [...GUARDIAN_CONSENT_ITEMS],
  "紙と正本が一致しました。KNOWN_GAPS を空にし、このアサーションを削除してください。",
);

console.log(`consent terms sync tests passed (未決の食い違い ${KNOWN_GAPS.length}件)`);
