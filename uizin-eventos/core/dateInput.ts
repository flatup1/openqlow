/**
 * Normalize pasted Japanese dates and eight-digit dates without guessing missing days.
 * 日づけに時刻がくっついた文字（「2027/10/3 10:00」）は、数字をつなげて別の日づけにしない。そのまま返す（日づけとしては読まない）。
 */
export function dateDigits(value: string): string {
  const text = value.normalize('NFKC').trim();
  // 「2027年10月3日」「2027/10/3」のあとに、曜日（日・(日)・日曜日）だけが付いていてもよい
  const parts = text.match(/^(\d{4})[年/.-](\d{1,2})[月/.-](\d{1,2})日?(?:\s*[(（]?[日月火水木金土](?:曜日?)?[)）]?)?$/);
  if (parts) return parts[1] + parts[2].padStart(2, '0') + parts[3].padStart(2, '0');
  // 数字がちょうど8けたのときだけ、数字以外を取り除く（「abc2027x1003」→ 20271003）。時刻などの数字が混ざって8けたを超えるときは、切り取らない
  const digits = text.replace(/[^0-9]/g, '');
  // 年・月・日・時・分・秒・「〜」・「:」が残っているのは、日づけと別の数（時刻・「3日〜4日」の4）が混ざっているとき。数字をつなげて別の日づけにしない
  return digits.length === 8 && !/[年月日時分秒〜~～:：]/.test(text.replace(/\d/g, '')) ? digits : text;
}

export function formatDateInput(value: string): string {
  const digits = dateDigits(value);
  if (!/^\d{8}$/.test(digits)) return digits;
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (year < 1000 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return digits;
  return `${year}年${month}月${day}日`;
}

export function isCompleteDate(value: string): boolean {
  return /^\d{4}年\d{1,2}月\d{1,2}日$/.test(formatDateInput(value));
}
