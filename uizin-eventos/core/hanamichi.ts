/**
 * 花道の追加情報（アナウンスに使う12項目）。申し込みページと、Googleの受付（Tournament_OS_Google受付_v3.gs）が、同じ決まりを使う。
 * .gs は import できないので、同じ内容を .gs の中にも持つ（tests/gasHanamichi.test.ts が、同じ答えになることを確かめる）。
 *
 * 会長が「必須／任意」を変えたいときは、下の表（HANAMICHI_ITEMS）の required を、1行ずつ直すだけ。
 * 本体の申し込みと重なる所属ジム・氏名・身長・体重・戦績は、二重に聞かない（本体の値を使う）ので、この表には無い。
 * ここの値は個人情報（生年月日・職業など）。Googleの「花道プロフィール」タブにだけ残し、画面・ログ・リンク・名簿には出さない。
 */

/** 区分の名前に、この文字が入っているときだけ、花道の追加の質問を出す */
export const HANAMICHI_WORD = '花道';

export type HanamichiKey = 'hnNameKana' | 'hnGymKana' | 'hnRing' | 'hnRingKana' | 'hnBirth' | 'hnKickYears' | 'hnPerWeek' | 'hnOther' | 'hnJob' | 'hnHobby' | 'hnReason' | 'hnMessage';
/** text＝1行／kana＝フリガナ（1行）／longtext＝何行でもよい長い文／number＝0〜99の整数／date＝yyyy-mm-dd */
export type HanamichiKind = 'text' | 'kana' | 'longtext' | 'number' | 'date';
export type HanamichiItem = {
  key: HanamichiKey;
  /** シートの見出しと同じ言葉 */
  label: string;
  required: boolean;
  /** 文字数の上限（number は けたの数、date は yyyy-mm-dd の10） */
  max: number;
  kind: HanamichiKind;
  /** ここに別の項目の鍵があるときは、その項目が空でないときだけ、この項目が要る（リングネームが空なら、フリガナは要らない） */
  needs?: HanamichiKey;
};

/** 数字の項目（キック歴・練習頻度）の上限 */
export const HANAMICHI_NUMBER_MAX = 99;
/** 生年月日の年の下限（これより前は、実在する日とは言わない） */
export const HANAMICHI_MIN_BIRTH_YEAR = 1900;

/**
 * 項目の表（POSTの鍵・シートの列は、この順）。原本の「必須選手情報」のとおり、職業と他格闘歴だけ任意、あとは必須。
 * 文字数の上限：リングネーム・フリガナ・職業・他格闘歴・趣味は60字、理由・メッセージは300字。
 */
export const HANAMICHI_ITEMS: readonly HanamichiItem[] = [
  { key: 'hnNameKana', label: '氏名のフリガナ', required: true, max: 60, kind: 'kana' },
  { key: 'hnGymKana', label: '所属ジムのフリガナ', required: true, max: 60, kind: 'kana' },
  { key: 'hnRing', label: 'リングネーム', required: true, max: 60, kind: 'text' },
  { key: 'hnRingKana', label: 'リングネームのフリガナ', required: true, max: 60, kind: 'kana', needs: 'hnRing' },
  { key: 'hnBirth', label: '生年月日', required: true, max: 10, kind: 'date' },
  { key: 'hnKickYears', label: 'キック歴（年）', required: true, max: 2, kind: 'number' },
  { key: 'hnPerWeek', label: '練習頻度（週に何回）', required: true, max: 2, kind: 'number' },
  { key: 'hnOther', label: '他格闘歴', required: false, max: 60, kind: 'text' },
  { key: 'hnJob', label: '職業', required: false, max: 60, kind: 'text' },
  { key: 'hnHobby', label: '趣味・特技', required: true, max: 60, kind: 'text' },
  { key: 'hnReason', label: '始めた理由・良かった所', required: true, max: 300, kind: 'longtext' },
  { key: 'hnMessage', label: 'メッセージ', required: true, max: 300, kind: 'longtext' },
];

/** POSTの鍵（この順）。申し込みページと試験が、同じ一覧を使う */
export const HANAMICHI_KEYS: readonly HanamichiKey[] = HANAMICHI_ITEMS.map((item) => item.key);

/** 「花道プロフィール」タブの見出し（この順）。最初の4つは本体の申し込みの値、あとは HANAMICHI_ITEMS の順 */
export const HANAMICHI_SHEET_HEADERS: readonly string[] = ['受付番号', '申込日時', '所属ジム', '選手名', ...HANAMICHI_ITEMS.map((item) => item.label)];

/** サーバーが返すエラーの種類（コード）と、赤い失敗の文 */
export const HANAMICHI_ERROR_CODE = 'hanamichi';
export const HANAMICHI_MISSING_MESSAGE = '花道の追加の質問に、答えていない所があります。申込ページにもどって、入れてから、もう一度送ってください。';
export const HANAMICHI_BAD_MESSAGE = '花道の追加の質問に、まちがいがある所があります。申込ページにもどって、直してから、もう一度送ってください。';

const INVISIBLE = /[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

/** 区分の名前に「花道」が入っているか（全角・半角・空白・見えない文字のちがいは見ない） */
export function isHanamichiDivision(name: unknown): boolean {
  if (typeof name !== 'string') return false;
  return name.replace(INVISIBLE, '').normalize('NFKC').replace(/\s+/g, '').includes(HANAMICHI_WORD);
}

/** 見えない文字を取り、改行を \n にそろえ、前後の空白を取る（.gs の norm_ と同じ）。数字と日付は、全角の数字も半角にする */
export function hanamichiText(value: unknown, kind: HanamichiKind = 'text'): string {
  const text = String(value == null ? '' : value).replace(/\r\n?/g, '\n').replace(INVISIBLE, '').trim();
  return kind === 'number' || kind === 'date' ? text.normalize('NFKC').trim() : text;
}

/** 実在する日で、今日（日本時間）より後ではない日か。2月30日・未来の日・1900年より前は false。年齢は見ない */
export function isRealPastDate(y: number, m: number, d: number, now: number = Date.now()): boolean {
  if (![y, m, d].every((n) => Number.isInteger(n))) return false;
  if (y < HANAMICHI_MIN_BIRTH_YEAR || m < 1 || m > 12 || d < 1) return false;
  const day = new Date(Date.UTC(y, m - 1, d));
  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== m - 1 || day.getUTCDate() !== d) return false;
  const jst = new Date(now + 9 * 3600 * 1000);
  return day.getTime() <= Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate());
}

/** 年・月・日の3つの選ぶ欄の値から、保存する形 yyyy-mm-dd を作る（どれかが空なら ''） */
export function hanamichiBirthText(y: string | number, m: string | number, d: string | number): string {
  const [yy, mm, dd] = [y, m, d].map((n) => String(n == null ? '' : n).trim());
  if (!yy || !mm || !dd) return '';
  return yy.padStart(4, '0') + '-' + mm.padStart(2, '0') + '-' + dd.padStart(2, '0');
}

/** 12項目の値をそろえる：見えない文字を取り、リングネームが空なら、そのフリガナも空にする。知らない鍵は捨てる */
export function hanamichiClean(values: Record<string, unknown>): Record<HanamichiKey, string> {
  const out = {} as Record<HanamichiKey, string>;
  for (const item of HANAMICHI_ITEMS) out[item.key] = hanamichiText(values[item.key], item.kind);
  for (const item of HANAMICHI_ITEMS) if (item.needs && !out[item.needs]) out[item.key] = '';
  return out;
}

/**
 * 12項目を調べる。errors には、まちがっている項目の鍵だけが入る（文は、その項目のそばに出す短い文）。
 * 調べるのは「空でないか・文字数・数字・実在する日」だけ。年齢は確かめない（40歳以上かの判定もしない）。
 */
export function validateHanamichi(values: Record<string, unknown>, now: number = Date.now()): { ok: boolean; errors: Record<string, string> } {
  const clean = hanamichiClean(values);
  const errors: Record<string, string> = {};
  for (const item of HANAMICHI_ITEMS) {
    const text = clean[item.key];
    if (!text) {
      const needed = item.required && (!item.needs || Boolean(clean[item.needs]));
      if (needed) errors[item.key] = item.kind === 'date' ? '年・月・日の3つを選んでください' : item.kind === 'number' ? '数字で入れてください' : '入れてください';
      continue;
    }
    if (item.kind === 'date') {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
      if (!m) errors[item.key] = '年・月・日の3つを選んでください';
      else if (!isRealPastDate(Number(m[1]), Number(m[2]), Number(m[3]), now)) errors[item.key] = '正しい日ではありません。年・月・日を選び直してください';
    } else if (item.kind === 'number') {
      if (!/^\d{1,2}$/.test(text) || Number(text) > HANAMICHI_NUMBER_MAX) errors[item.key] = '0から' + HANAMICHI_NUMBER_MAX + 'までの数字で入れてください';
    } else if (text.length > item.max) {
      errors[item.key] = item.max + '文字までにしてください';
    }
  }
  return { ok: Object.keys(errors).length === 0, errors };
}
