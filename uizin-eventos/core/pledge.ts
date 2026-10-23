/**
 * 誓約書（申し込みの最後の□の✔）。申し込みページと、Googleの受付（Tournament_OS_Google受付_v3.gs）が、同じ決まりを使う。
 * .gs は import できないので、同じ内容を .gs の中にも持つ（tests/gasPledge.test.ts が、同じ答えになることを確かめる）。
 *
 * このファイルは、誓約・同意の「文」を1字も持たない。文は、Googleの「誓約書」タブ（会長が原本と見比べて直す）にだけある。
 * ここにあるのは、文の入れ物の形（項目の数・長さ）、リンクに入れる詰め方、保護者の同意が要るかの判定、携帯電話の形だけ。
 * 純粋・同期・DOMなし（btoa / atob も使わない）。
 */

/** 文の上限。長さは JavaScript の length（UTF-16 の単位。絵文字は2）で数える。.gs も同じ。total は、項目・保護者の文・ジム責任者の文の合計 */
export const PLEDGE_LIMITS = { items: 8, item: 120, total: 700 } as const;

/** 保護者の同意を、だれに求めるか：18歳未満のみ／全員／なし */
export type GuardianMode = 'under18' | 'all' | 'none';

export type PledgeConfig = {
  /** 誓約の項目（1項目ずつ✔する）。最大 PLEDGE_LIMITS.items 個 */
  items: string[];
  /** 保護者（連帯責任者）の同意の文 */
  guardian: string;
  /** 団体・ジム責任者の同意の文 */
  gym: string;
  mode: GuardianMode;
  /** ジム責任者の欄を出すか */
  gymMode: boolean;
  /** 会長が、文を原本と見比べて「済み」にしたか */
  confirmed: boolean;
};

/** 申込リンクの鍵（この順に並べる）。pl＝on／plg＝under18|all|none／plm＝on|off（ジム責任者の欄）／plc＝on|off（会長の確認）／plf＝文の指紋（16進の小文字64字）／plt＝文（packPledge） */
export const PLEDGE_LINK_KEYS = ['pl', 'plg', 'plm', 'plc', 'plf', 'plt'] as const;

/**
 * 申し込みページが POST に足す鍵（誓約書があるときだけ。なしのときは1つも足さない）。
 * pledgeGuardianMode・pledgeGymMode は、このリンクを作ったときの「保護者の同意」「ジム責任者の同意」の設定（リンクの plg／plm と同じ値：under18|all|none／on|off）。
 * 会長がリンクを作ったあとで、この2つを厳しくすると、古いページには求められる欄が無い。サーバーは、これで気づいて「新しいリンクをもらってください」と答える。
 */
export const PLEDGE_POST_KEYS = ['pledge', 'pledgeItems', 'pledgeGuardian', 'gymName', 'gymPhone', 'gymPermission', 'pledgeGym', 'pledgeHash', 'pledgeGuardianMode', 'pledgeGymMode'] as const;

/** サーバーが返すエラーの種類（コード）。文は .gs が持つ */
export const PLEDGE_ERROR_CODES = ['pledge', 'pledgeconfirm', 'pledgeold', 'gym', 'permission'] as const;

/** ジム責任者の名前の長さ（40字まで） */
export const GYM_NAME_MAX = 40;

const INVISIBLE = /[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

/* ---------- 詰め方：'u' + base64url(UTF-16BE(JSON)) ---------- */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** 文字列を UTF-16BE のバイト（1文字＝上位・下位の2バイト）にして、base64url（= なし）にする。サロゲートもそのまま入る */
function toBase64Url(text: string): string {
  let out = '';
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) { const unit = text.charCodeAt(i); bytes.push(unit >> 8, unit & 255); }
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    out += B64[a >> 2] + B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    if (b !== undefined) out += B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    if (c !== undefined) out += B64[c & 63];
  }
  return out;
}

/** base64url（= なし。英数字と - _ だけ）を UTF-16BE の文字列にもどす。きちんとした形でなければ undefined（バイトが奇数・長さが半端・余りのビットが0でない） */
function fromBase64Url(text: string): string | undefined {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return undefined;
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 4) {
    const v = [0, 1, 2, 3].map((k) => (i + k < text.length ? B64.indexOf(text[i + k]) : -1));
    bytes.push((v[0] << 2) | (v[1] >> 4));
    if (v[2] >= 0) bytes.push(((v[1] & 15) << 4) | (v[2] >> 2));
    if (v[3] >= 0) bytes.push(((v[2] & 3) << 6) | v[3]);
    // 余りのビットは0（この詰め方が作った形だけを読む）
    if (v[3] < 0 && v[2] >= 0 && (v[2] & 3) !== 0) return undefined;
    if (v[2] < 0 && (v[1] & 15) !== 0) return undefined;
  }
  if (bytes.length % 2 !== 0) return undefined;
  let out = '';
  for (let i = 0; i < bytes.length; i += 2) out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
  return out;
}

/** 対になっていないサロゲート（文字として読めない半端なもの）があるか */
export function hasLoneSurrogate(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) { const d = text.charCodeAt(i + 1); if (d >= 0xdc00 && d <= 0xdfff) { i++; continue; } return true; }
    if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
}

/**
 * 文の入れ物の形と長さを調べる：項目は1〜8個・1項目は1〜120字・合計700字まで・どれも対になっていないサロゲートなし。
 * 守れていなければ undefined。中身（文字）は変えない。
 */
export function checkPledgeTexts(items: unknown, guardian: unknown, gym: unknown): { items: string[]; guardian: string; gym: string } | undefined {
  if (!Array.isArray(items) || typeof guardian !== 'string' || typeof gym !== 'string') return undefined;
  if (items.length < 1 || items.length > PLEDGE_LIMITS.items) return undefined;
  let total = guardian.length + gym.length;
  for (const item of items) {
    if (typeof item !== 'string' || item.length < 1 || item.length > PLEDGE_LIMITS.item) return undefined;
    total += item.length;
  }
  if (total > PLEDGE_LIMITS.total) return undefined;
  if ([...items, guardian, gym].some((t) => hasLoneSurrogate(t))) return undefined;
  return { items: items.slice() as string[], guardian, gym };
}

/**
 * 文1つを、リンクに入れる形にする：'u' + base64url(UTF-16BE(text))。誓約書の plt（packPledge）も、花道のルールの1行 hr も、同じ詰め方を使う。
 * 長さの上限は、使う側が決める（ここでは見ない）。
 */
export function packText(text: string): string {
  return 'u' + toBase64Url(String(text));
}

/**
 * packText の逆。きちんとした形だけを読む：先頭が u でない・base64url でない・バイトが奇数・余りのビットが0でない・サロゲートが半端、は undefined。投げない。
 * 'u' だけ（空の文）は ''。長さの上限や、空を受け付けるかは、使う側が決める。
 */
export function unpackText(s: string): string | undefined {
  try {
    if (typeof s !== 'string' || s[0] !== 'u') return undefined;
    const text = fromBase64Url(s.slice(1));
    return text === undefined || hasLoneSurrogate(text) ? undefined : text;
  } catch {
    return undefined;
  }
}

/** リンクの plt に入れる形：packText(JSON.stringify({items, guardian, gym})) */
export function packPledge(items: string[], guardian: string, gym: string): string {
  return packText(JSON.stringify({ items, guardian, gym }));
}

/**
 * packPledge の逆。きちんとした形だけを読む：先頭が u でない・base64url でない・バイトが奇数・サロゲートが半端・
 * 上限をこえる・items が配列でない・余分な鍵・packPledge がそのまま作る形（鍵の順番・空白）でない、は undefined。投げない。
 */
export function unpackPledge(s: string): { items: string[]; guardian: string; gym: string } | undefined {
  try {
    const json = unpackText(s);
    if (json === undefined) return undefined;
    const value = JSON.parse(json) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const keys = Object.keys(value as object);
    if (keys.length !== 3 || !['items', 'guardian', 'gym'].every((k) => keys.includes(k))) return undefined;
    const v = value as Record<string, unknown>;
    const texts = checkPledgeTexts(v.items, v.guardian, v.gym);
    if (!texts) return undefined;
    // 作った形と1字も違わないものだけ（重複した鍵・空白・書き方のちがいは、別のリンクとして通さない）
    return packPledge(texts.items, texts.guardian, texts.gym) === s ? texts : undefined;
  } catch {
    return undefined;
  }
}

/**
 * ping の pledgeCanon（.gs が作る JSON 文字列 {items, guardian, gym}）を読む。形と長さが守れていなければ undefined。投げない。
 * 鍵の順番は問わない（.gs の JSON.stringify の順は items, guardian, gym）。
 */
export function parsePledgeCanon(text: unknown): { items: string[]; guardian: string; gym: string } | undefined {
  try {
    if (typeof text !== 'string' || text.length > 4000) return undefined;
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const keys = Object.keys(value as object);
    if (keys.length !== 3 || !['items', 'guardian', 'gym'].every((k) => keys.includes(k))) return undefined;
    const v = value as Record<string, unknown>;
    return checkPledgeTexts(v.items, v.guardian, v.gym);
  } catch {
    return undefined;
  }
}

/* ---------- 保護者の同意が要るか ---------- */

/** 年齢の文字を読む：見えない文字を取り、全角の数字は半角にして、前後の空白を取る（.gs の norm_ のあと normalize('NFKC') と同じ）。1〜120の整数なら数、それ以外は undefined */
function readAge(age: string): number | undefined {
  const text = String(age == null ? '' : age).replace(INVISIBLE, '').normalize('NFKC').trim();
  if (!/^\d{1,3}$/.test(text)) return undefined;
  const n = Number(text);
  return n >= 1 && n <= 120 ? n : undefined;
}

/** 年齢が、1〜120の整数として読めるか（読めない・空のとき、保護者の欄は「安全側」で出る。画面は、そのとき「年齢を入れると消える」と言う） */
export function ageKnown(age: string): boolean {
  return readAge(age) !== undefined;
}

/**
 * 保護者の同意が要るか。なし→要らない／全員→要る／18歳未満のみ→年齢が18未満のとき。
 * 年齢が空・読めない・121以上のときは「要る」（安全側。聞きそこなって、同意なしで通さない）。
 */
export function guardianNeeded(mode: GuardianMode, age: string): boolean {
  if (mode === 'none') return false;
  if (mode === 'all') return true;
  const n = readAge(age);
  return n === undefined || n < 18;
}

/* ---------- ジム責任者 ---------- */

/** ジム責任者の携帯電話か：全角・ハイフン・空白はOK。正規化して11けた、070／080／090で始まる。050（IP電話）や固定電話は不可 */
export function gymPhoneOk(s: string): boolean {
  const d = String(s == null ? '' : s).replace(INVISIBLE, '').normalize('NFKC').trim().replace(/[\s\-ー－―‐‑–—−]/g, '');
  return /^0[789]0\d{8}$/.test(d);
}

/** gymPhoneOk と同じ正規化（記録に残す形）。携帯でなければ '' */
export function gymPhoneNormal(s: string): string {
  const d = String(s == null ? '' : s).replace(INVISIBLE, '').normalize('NFKC').trim().replace(/[\s\-ー－―‐‑–—−]/g, '');
  return /^0[789]0\d{8}$/.test(d) ? d : '';
}

/** ジム名が「無所属」の言い方か：全角・半角をそろえ（NFKC）、空白を取ったあと、無所属／むしょぞく／ムショゾク／所属なし／なし／無し のどれか。.gs にも同じ表がある */
export const UNAFFILIATED_NAMES: readonly string[] = ['無所属', 'むしょぞく', 'ムショゾク', '所属なし', 'なし', '無し'];
export function isUnaffiliated(gym: string): boolean {
  const key = String(gym == null ? '' : gym).replace(INVISIBLE, '').normalize('NFKC').replace(/\s+/g, '');
  return UNAFFILIATED_NAMES.includes(key);
}
