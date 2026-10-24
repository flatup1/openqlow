/**
 * 申し込みページの「入力の途中保存（下書き）」と「別の人を申し込む（ジム名と連絡先を残す）」の部品（純粋・同期・DOMなし）。
 * 画面（app/apply/page.tsx）と試験（tests/applyDraft.test.ts）が、同じ関数を使う。
 *
 * 事実：「この内容で送信する」を押すと、画面ごと Google のページに移る（form の target="_self"）。だから、送ったあとの「もう1人」の入力は、
 * 画面の中（メモリ）だけでは覚えられない。そこで、このスマホのこのタブの中（sessionStorage。タブを閉じると消える）に、短い時間だけ覚える。
 *
 * 2つの入れ物（どちらも sessionStorage だけ。localStorage・Cookie・ネットワークには出さない）：
 *   下書き  tos-apply-draft:v1:<eventId>:<mode> … 選手の欄12個だけ。12時間。送信の直前・「消す」で消える
 *   次の人  tos-apply-next:v1:<eventId>:<mode>  … ジム名・連絡先・個人情報の同意・ジム責任者の名前と電話。60分。送信の直前に書く
 * 絶対に入れない物は NEVER_STORED（下書き）と NEXT_NEVER_STORED（次の人）。入れ物は「入れてよい鍵」を選び出す書き方（pick）なので、
 * 一覧にない鍵は、ここを通ると必ず消える。さらに、電話・メール・写真らしい中身の欄は、入れてよい鍵でも入れない。
 */
import { findDivision, normalizeWeightClass, type WeightSettings } from './weightClass.ts';
import { HANAMICHI_KEYS, isHanamichiDivision } from './hanamichi.ts';
import { PLEDGE_LIMITS } from './pledge.ts';

export const DRAFT_KEY_PREFIX = 'tos-apply-draft:v1:';
export const NEXT_KEY_PREFIX = 'tos-apply-next:v1:';
/** 下書きが生きる時間（12時間）と、次の人の入れ物が生きる時間（60分） */
export const DRAFT_TTL_MS = 12 * 3600 * 1000;
export const NEXT_TTL_MS = 60 * 60 * 1000;
const VERSION = 1;

/** どの大会の・どのモード（本番かテストか）の入れ物か。別の大会・別のモードのものは、読まない */
export type DraftLink = { eventId: string; mode: 'test' | 'live' };

/** リンクの mode。'test' 以外（古いリンクで無いときも）は live */
export const linkMode = (mode: string | undefined): 'test' | 'live' => (mode === 'test' ? 'test' : 'live');

export const draftKey = (link: DraftLink): string => DRAFT_KEY_PREFIX + link.eventId + ':' + link.mode;
export const nextKey = (link: DraftLink): string => NEXT_KEY_PREFIX + link.eventId + ':' + link.mode;

/* ---------- 下書き（選手の欄12個） ---------- */

/** 下書きに入れてよい鍵（文字列だけ）。この12個のほかは、入れない */
export const DRAFT_FIELDS = ['gym', 'name', 'height', 'weight', 'division', 'weightClass', 'fighterClass', 'record', 'grade', 'age', 'comment', 'musicUrl'] as const;
export type DraftField = (typeof DRAFT_FIELDS)[number];
export type DraftFields = Record<DraftField, string>;

/**
 * 入れる文字の長さの上限（JavaScript の length）。欄の上限（ジム名120・選手名80・戦績300・意気込み500・学年30・曲のリンク500）の2倍まで。
 * 欄の上限を少し超えた入力は「長すぎます」の赤が戻るように、ぴったりでは切らない。それより長い分だけ切る
 */
export const DRAFT_MAX: Readonly<Record<DraftField, number>> = {
  gym: 240, name: 160, height: 20, weight: 20, division: 40, weightClass: 40, fighterClass: 5,
  record: 600, grade: 60, age: 10, comment: 1000, musicUrl: 1000,
};

const PLEDGE_TICK_KEYS = Array.from({ length: PLEDGE_LIMITS.items }, (_, i) => 'pledge' + (i + 1));

/** どちらの入れ物にも、絶対に入れない鍵：顔写真・生年月日・花道の追加の質問・誓約書の✔・保護者の✔・ジム責任者の「許可をとっている」念押しと同意の✔ */
const NEVER_ANYWHERE: readonly string[] = [
  'photo', 'photoDataUrl', 'birth', ...HANAMICHI_KEYS,
  'pledge', 'pledgeItems', ...PLEDGE_TICK_KEYS, 'pledgeGuardian', 'pledgeGym', 'pledgeHash', 'gymPermission', 'gymConsent',
];

/** 下書きに入れてはいけない鍵の一覧（上の「どちらにも入れない物」＋連絡先・個人情報の同意・ジム責任者の名前と電話） */
export const NEVER_STORED: readonly string[] = [...NEVER_ANYWHERE, 'contactName', 'contactPhone', 'contactEmail', 'consent', 'gymName', 'gymPhone'];

/** 見えない文字（向きの印・幅ゼロの空白など） */
const INVISIBLE = /[­؜᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

/**
 * 電話・メール・写真らしい中身か。下書きの欄には、書かない約束の物（住所や電話番号は書かないよう画面にも書いてある）。
 * 入れてよい鍵の欄でも、こういう中身なら、その欄だけ入れない。
 *  data:  … 写真（data URL）。どの欄でも
 *  メール … 「@」のある文字。どの欄でも
 *  電話   … 区切り（ハイフン・空白・かっこ・「+」）を取って、数字が10けた以上ならんでいる文字。曲のリンクは、長い数字が入るので、調べない
 * 先読み・後読み（lookbehind）は使わない（Safari 15 で動かないため）
 */
export function looksPrivate(value: string, field?: DraftField): boolean {
  const text = value.normalize('NFKC');
  if (/data:/i.test(text) || /@/.test(text)) return true;
  if (field === 'musicUrl') return false;
  return /\d{10,}/.test(text.replace(/[\s\-ー－―‐‑–—−().・+]/g, ''));
}

const cleanText = (value: unknown, max: number): string => (typeof value === 'string' ? value.replace(INVISIBLE, '').slice(0, max) : '');

/** 入れてよい12個だけを取り出す。文字以外・長すぎる分・電話やメールや写真らしい欄・クラスの 'upper'／'lower' 以外は、その欄だけ空にする */
export function pickDraft(fields: Readonly<Record<string, unknown>>): DraftFields {
  const out = {} as DraftFields;
  for (const key of DRAFT_FIELDS) {
    const raw = fields == null ? undefined : fields[key];
    // クラスは 'upper'／'lower' そのものだけ（切ってから調べると、'upperX' が 'upper' になってしまう）
    if (key === 'fighterClass') { out[key] = raw === 'upper' || raw === 'lower' ? raw : ''; continue; }
    const text = cleanText(raw, DRAFT_MAX[key]);
    out[key] = looksPrivate(text, key) ? '' : text;
  }
  return out;
}

/** 12個がぜんぶ空 */
export const draftIsEmpty = (fields: DraftFields): boolean => DRAFT_FIELDS.every((key) => !fields[key]);

/** 保存する文字（JSON）。入れるものが何もなければ null（保存しない・あれば消す） */
export function packDraft(fields: Readonly<Record<string, unknown>>, now: number, link: DraftLink): string | null {
  const f = pickDraft(fields);
  if (draftIsEmpty(f)) return null;
  return JSON.stringify({ v: VERSION, eventId: link.eventId, mode: link.mode, savedAt: now, f });
}

export type ParsedDraft = { fields: DraftFields; savedAt: number };

/** 入れ物の外側の検査：JSON の形・版・大会・モード・時刻（未来でない・期限内）。通れば中身（オブジェクト）と時刻を返す。通らなければ undefined（呼ぶ側は鍵ごと消す） */
function openEnvelope(json: string | null | undefined, now: number, link: DraftLink, ttl: number, inner: 'f' | 'k'): { body: Record<string, unknown>; savedAt: number } | undefined {
  if (typeof json !== 'string' || json.length === 0 || json.length > 20000) return undefined;
  let value: unknown;
  try { value = JSON.parse(json); } catch { return undefined; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  if (v.v !== VERSION || v.eventId !== link.eventId || v.mode !== link.mode) return undefined;
  const savedAt = v.savedAt;
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt) || savedAt <= 0 || savedAt > now || now - savedAt >= ttl) return undefined;
  const body = v[inner];
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  return { body: body as Record<string, unknown>, savedAt };
}

/**
 * 保存してあった下書きを読む。形・版・大会（eventId）・モード・時刻・期限（12時間）を調べる。
 * 入れてよい12個のほかの鍵・文字でない値は捨てる（捨てたあと何も残らなければ undefined）。通らなければ undefined＝呼ぶ側が消す
 */
export function parseDraft(json: string | null | undefined, now: number, link: DraftLink): ParsedDraft | undefined {
  const opened = openEnvelope(json, now, link, DRAFT_TTL_MS, 'f');
  if (!opened) return undefined;
  const fields = pickDraft(opened.body);
  return draftIsEmpty(fields) ? undefined : { fields, savedAt: opened.savedAt };
}

/* ---------- 戻すとき、いまのリンクで使える形にする ---------- */

/** いまのリンクの形（戻していいか決めるのに要るもの）。weights は階級分けがあるときだけ */
export type DraftLinkShape = { weights?: WeightSettings; classes: boolean; hanamichiRule: boolean; grade: boolean; age: boolean; comment: boolean; music: boolean };

/**
 * 戻すときの、選ぶ欄の検査。区分はいまのリンクの選択肢にあるときだけ（設定の名前にそろえる）、階級はその区分で有効なときだけ、
 * クラスは クラス分け＝あり で、花道のルールで外れていない（花道の区分でクラスを選ばせない）ときだけ。
 * リンクに出ない欄（学年・年齢・意気込み・入場曲）は戻さない。通らなかった欄は ''
 */
export function fitDraftToLink(fields: DraftFields, shape: DraftLinkShape): DraftFields {
  const out: DraftFields = { ...fields };
  const picked = shape.weights ? findDivision(fields.division, shape.weights) : undefined;
  out.division = picked ? picked.name : '';
  out.weightClass = picked ? normalizeWeightClass(picked.name, fields.weightClass, shape.weights) : '';
  const classFree = Boolean(shape.hanamichiRule) && Boolean(picked) && isHanamichiDivision(picked?.name);
  if (!shape.classes || classFree) out.fighterClass = '';
  if (!shape.grade) out.grade = '';
  if (!shape.age) out.age = '';
  if (!shape.comment) out.comment = '';
  if (!shape.music) out.musicUrl = '';
  return out;
}

/* ---------- 次の人（ジム名と連絡先） ---------- */

/** 次の人の入れ物に入れてよい中身。consent は個人情報の同意のチェック。gymName・gymPhone は、ジム責任者の名前と電話（無ければ空） */
export type NextKit = { gym: string; contactName: string; contactPhone: string; contactEmail: string; consent: boolean; gymName: string; gymPhone: string };
export const NEXT_TEXT_KEYS = ['gym', 'contactName', 'contactPhone', 'contactEmail', 'gymName', 'gymPhone'] as const;
export const NEXT_MAX: Readonly<Record<(typeof NEXT_TEXT_KEYS)[number], number>> = { gym: 240, contactName: 200, contactPhone: 30, contactEmail: 400, gymName: 80, gymPhone: 30 };

/** 次の人の入れ物に入れてはいけない鍵の一覧（どちらにも入れない物＋選手の欄12個） */
export const NEXT_NEVER_STORED: readonly string[] = [...NEVER_ANYWHERE, ...DRAFT_FIELDS.filter((key) => key !== 'gym')];

/** 入れてよい7個だけを取り出す（文字以外・長すぎる分・写真らしい欄は空に。consent は true のときだけ true） */
export function pickNext(input: Readonly<Record<string, unknown>>): NextKit {
  const out = { consent: input != null && input.consent === true } as NextKit;
  for (const key of NEXT_TEXT_KEYS) {
    const text = cleanText(input == null ? undefined : input[key], NEXT_MAX[key]);
    out[key] = /data:/i.test(text) ? '' : text;
  }
  return out;
}

/** ジム名も連絡先も空（戻すものが無い） */
export const nextIsEmpty = (kit: NextKit): boolean => !kit.gym && !kit.contactName && !kit.contactPhone && !kit.contactEmail;

/** 保存する文字（JSON）。戻すものが何もなければ null */
export function packNext(input: Readonly<Record<string, unknown>>, now: number, link: DraftLink): string | null {
  const k = pickNext(input);
  if (nextIsEmpty(k)) return null;
  return JSON.stringify({ v: VERSION, eventId: link.eventId, mode: link.mode, savedAt: now, k });
}

export type ParsedNext = { kit: NextKit; savedAt: number };

/** 保存してあった「次の人」の入れ物を読む。parseDraft と同じ検査（期限だけ60分）。通らなければ undefined＝呼ぶ側が消す */
export function parseNext(json: string | null | undefined, now: number, link: DraftLink): ParsedNext | undefined {
  const opened = openEnvelope(json, now, link, NEXT_TTL_MS, 'k');
  if (!opened) return undefined;
  const kit = pickNext(opened.body);
  return nextIsEmpty(kit) ? undefined : { kit, savedAt: opened.savedAt };
}

/* ---------- 画面に出す「◯分前」 ---------- */

/** 保存してから、どれくらいたったか。1分以内／◯分前／◯時間前 */
export function agoText(savedAt: number, now: number): string {
  const min = Math.max(0, Math.floor((now - savedAt) / 60000));
  if (min < 1) return '1分以内';
  return min < 60 ? min + '分前' : Math.floor(min / 60) + '時間前';
}

/* ---------- storage が使えないときも、黙って何もしない ---------- */

/** sessionStorage の形（getItem・setItem・removeItem だけ）。プライベートモード・容量いっぱい・使用禁止のときは、投げる／null になる */
export type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };

/** 読む。使えない・投げる・無いときは null */
export function safeGet(storage: StorageLike | null | undefined, key: string): string | null {
  try { return storage ? storage.getItem(key) : null; } catch { return null; }
}
/** 書く。使えない・投げる（容量いっぱいなど）ときは、黙って false */
export function safeSet(storage: StorageLike | null | undefined, key: string, value: string): boolean {
  try { if (!storage) return false; storage.setItem(key, value); return true; } catch { return false; }
}
/** 消す。使えない・投げるときは、黙って何もしない */
export function safeRemove(storage: StorageLike | null | undefined, key: string): void {
  try { storage?.removeItem(key); } catch { /* 使えない画面でも、申し込みはできる */ }
}
