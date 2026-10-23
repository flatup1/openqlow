/**
 * 申し込みページの「誓約書」の部品（純粋・同期・DOMなし）。画面（app/apply/page.tsx）と試験（tests/pledgeLink.test.ts）が、同じ関数を使う。
 * 誓約・同意の「文」は、ここにも1字も無い。文はリンクの plt から来る（会長が Google の「誓約書」タブで原本と見比べて直す）。
 * ここにあるのは、操作の言葉（□に✔を入れてください、など）と、いま何が足りないかの数え方だけ。
 */
import { GYM_NAME_MAX, guardianNeeded, gymPhoneNormal, gymPhoneOk, isUnaffiliated, type GuardianMode, type PledgeConfig } from '../../core/pledge.ts';

/** ジム責任者の欄の「許可をとっている」念押しのチェックの文字（操作の言葉。会長が直す前提の案）。必ず✔してもらう */
export const GYM_PERMISSION_LABEL = 'ジム責任者の許可を得て、名前と電話番号を入れています';

/** 誓約書の項目の欄の鍵。pledge1 から pledgeN まで（欄の id は f- を付けて f-pledge1） */
export type PledgeItemKey = `pledge${number}`;
export type PledgeKey = PledgeItemKey | 'pledgeGuardian' | 'gymName' | 'gymPhone' | 'gymPermission' | 'pledgeGym';

const ITEM_KEY = /^pledge[1-9]\d*$/;
const OTHER_KEYS: readonly string[] = ['pledgeGuardian', 'gymName', 'gymPhone', 'gymPermission', 'pledgeGym'];
export const isPledgeItemKey = (key: string): key is PledgeItemKey => ITEM_KEY.test(key);
export const isPledgeKey = (key: string): key is PledgeKey => ITEM_KEY.test(key) || OTHER_KEYS.includes(key);

/** 今の入力で、何を出して何を求めるか */
export type PledgePlan = {
  /** リンクに誓約書がある */
  on: boolean;
  /** 項目の数 */
  n: number;
  /** 保護者の同意の欄を出す（年齢で決まる。年齢が空・読めないときは出す） */
  guardian: boolean;
  /** ジム名が「無所属」の言い方（このとき、ジム責任者の欄は出さない・求めない） */
  unaffiliated: boolean;
  /** ジム責任者の欄を出す */
  gym: boolean;
  /** 本番（live）なのに、会長がまだ文を確認していない：送れない */
  blocked: boolean;
  /** このリンクの「保護者の同意」「ジム責任者の同意」の設定（リンクの plg／plm）。そのまま POST に返す（サーバーが、リンクを作ったあとの設定の変更に気づくため）。誓約書が無いときは付けない */
  linkMode?: GuardianMode;
  linkGymMode?: boolean;
};

/** age・gym は、画面の「年齢」「ジム名」の入力（整えたもの）。mode はリンクの mode */
export function pledgePlan(pledge: PledgeConfig | undefined, age: string, gym: string, mode: 'test' | 'live' | undefined): PledgePlan {
  if (!pledge) return { on: false, n: 0, guardian: false, unaffiliated: false, gym: false, blocked: false };
  const unaffiliated = isUnaffiliated(gym);
  return {
    on: true, n: pledge.items.length, guardian: guardianNeeded(pledge.mode, age), unaffiliated,
    gym: pledge.gymMode && !unaffiliated, blocked: mode === 'live' && !pledge.confirmed, linkMode: pledge.mode, linkGymMode: pledge.gymMode,
  };
}

/** 入れた答え。gymName・gymPhone は、整えたあとの文字（前後の空白・ハイフンを取ったもの） */
export type PledgeAnswers = { ticks: boolean[]; guardian: boolean; gymName: string; gymPhone: string; gymPermission: boolean; gymConsent: boolean };

export const blankPledgeAnswers = (): PledgeAnswers => ({ ticks: [], guardian: false, gymName: '', gymPhone: '', gymPermission: false, gymConsent: false });

const tickAt = (a: PledgeAnswers, i: number): boolean => Boolean(a.ticks[i]);

/** 欄の順（画面の上から）。ok＝その欄が済んでいるか */
export function pledgeOrder(plan: PledgePlan, a: PledgeAnswers): Array<[PledgeKey, boolean]> {
  if (!plan.on) return [];
  const out: Array<[PledgeKey, boolean]> = [];
  for (let i = 0; i < plan.n; i++) out.push([`pledge${i + 1}`, tickAt(a, i)]);
  if (plan.guardian) out.push(['pledgeGuardian', a.guardian]);
  if (plan.gym) out.push(['gymName', Boolean(a.gymName)], ['gymPhone', gymPhoneOk(a.gymPhone)], ['gymPermission', a.gymPermission], ['pledgeGym', a.gymConsent]);
  return out;
}

/** いまの問題。empty＝まだ入っていない（送ろうとしたときに赤にする）／early＝長すぎなど、入力中にすぐ赤にしてよいもの */
export type PledgeIssue = { text: string; empty: boolean; early: boolean };
export type PledgeIssues = Partial<Record<PledgeKey, PledgeIssue>>;

export const PLEDGE_TICK_TEXT = 'この□に、✔を入れてください。';
export const PLEDGE_GUARDIAN_TEXT = '保護者の方の同意の□に、✔を入れてください。';
export const PLEDGE_GYM_TEXT = 'ジム責任者の同意の□に、✔を入れてください。';
/** サーバー（.gs）の「許可」の断り文と同じ言葉 */
export const PLEDGE_PERMISSION_TEXT = 'ジム責任者の許可をとっているか、確認のチェックが必要です。';
export const PLEDGE_BLOCKED_TEXT = '主催者が、誓約書の文をまだ確認していません。送れません。';

/** 携帯電話の形のまちがいを、やさしい文にする（ok かどうかは gymPhoneOk が決める。ここは文を選ぶだけ） */
function phoneText(phone: string): string {
  const d = phone.normalize('NFKC').replace(/[\s\-ー－―‐‑–—−]/g, '');
  const example = '例：09000000000';
  if (/\D/.test(d)) return `電話番号は、数字だけで、1つだけ入れてください。文字や、2つ目の番号は消してください。${example}`;
  if (d.length !== 11) return `携帯電話は11けたです。いま${d.length}けたです。${example}`;
  return `携帯電話（070・080・090で始まる番号）を入れてください。固定電話や050は使えません。${example}`;
}

export function pledgeIssues(plan: PledgePlan, a: PledgeAnswers): PledgeIssues {
  const out: PledgeIssues = {};
  if (!plan.on) return out;
  for (let i = 0; i < plan.n; i++) if (!tickAt(a, i)) out[`pledge${i + 1}`] = { text: PLEDGE_TICK_TEXT, empty: true, early: false };
  if (plan.guardian && !a.guardian) out.pledgeGuardian = { text: PLEDGE_GUARDIAN_TEXT, empty: true, early: false };
  if (plan.gym) {
    if (!a.gymName) out.gymName = { text: '責任者のお名前がまだです。入力してください。', empty: true, early: false };
    else if (a.gymName.length > GYM_NAME_MAX) out.gymName = { text: `長すぎます（いま${a.gymName.length}字／${GYM_NAME_MAX}字まで）`, empty: false, early: true };
    if (!a.gymPhone) out.gymPhone = { text: '責任者の携帯電話がまだです。数字だけ入力してください。例：09000000000', empty: true, early: false };
    else if (!gymPhoneOk(a.gymPhone)) out.gymPhone = { text: phoneText(a.gymPhone), empty: false, early: false };
    if (!a.gymPermission) out.gymPermission = { text: PLEDGE_PERMISSION_TEXT, empty: true, early: false };
    if (!a.gymConsent) out.pledgeGym = { text: PLEDGE_GYM_TEXT, empty: true, early: false };
  }
  return out;
}

/** □の✔があと何個か（項目・保護者・ジム責任者の2つ） */
export function pledgeTicksLeft(plan: PledgePlan, a: PledgeAnswers): number {
  if (!plan.on) return 0;
  let left = 0;
  for (let i = 0; i < plan.n; i++) if (!tickAt(a, i)) left++;
  if (plan.guardian && !a.guardian) left++;
  if (plan.gym) left += (a.gymPermission ? 0 : 1) + (a.gymConsent ? 0 : 1);
  return left;
}

/** 「入力内容を確認する →」を止める理由。ぜんぶ済んでいれば ''（止めない） */
export function pledgeLockReason(plan: PledgePlan, a: PledgeAnswers): string {
  if (!plan.on) return '';
  const parts: string[] = [];
  const left = pledgeTicksLeft(plan, a);
  if (left > 0) parts.push(`誓約書の□が、あと${left}つ残っています`);
  if (plan.gym) {
    // 電話が「入っていない」と「入れたが、携帯電話の形ではない」は、言い分ける（入れたものを「まだです」と言わない。ふつうの電話番号の欄と同じ考え方）
    const phoneWrong = Boolean(a.gymPhone) && !gymPhoneOk(a.gymPhone);
    if (phoneWrong) {
      if (!a.gymName) parts.push('ジム責任者の名前が、まだです');
      parts.push('ジム責任者の電話が、携帯電話の番号になっていません');
    } else if (!a.gymName || !a.gymPhone) parts.push('ジム責任者の名前と電話が、まだです');
  }
  return parts.join('。');
}

/**
 * 送る鍵（POST）。誓約書が無いときは {}（鍵は1つも足さない）。順番：pledge, pledgeItems, pledgeGuardian, gymName, gymPhone, gymPermission, pledgeGym, pledgeHash, pledgeGuardianMode, pledgeGymMode。
 * 最後の2つは、このリンクの設定（plg／plm）。いつも付ける。
 * pledgeItems は、✔した項目の番号（1,2,…）。保護者の欄・ジム責任者の欄が要らないときは、その鍵ごと無い。hash は、リンクの plf をそのまま返す。
 */
export function pledgePost(plan: PledgePlan, a: PledgeAnswers, hash: string): Record<string, string> {
  if (!plan.on) return {};
  const yes = (on: boolean) => (on ? 'yes' : 'no');
  const ticked: number[] = [];
  for (let i = 0; i < plan.n; i++) if (tickAt(a, i)) ticked.push(i + 1);
  return {
    pledge: 'yes',
    pledgeItems: ticked.join(','),
    ...(plan.guardian ? { pledgeGuardian: yes(a.guardian) } : {}),
    ...(plan.gym ? { gymName: a.gymName, gymPhone: gymPhoneNormal(a.gymPhone) || a.gymPhone, gymPermission: yes(a.gymPermission), pledgeGym: yes(a.gymConsent) } : {}),
    ...(hash ? { pledgeHash: hash } : {}),
    pledgeGuardianMode: plan.linkMode ?? 'none',
    pledgeGymMode: plan.linkGymMode ? 'on' : 'off',
  };
}
