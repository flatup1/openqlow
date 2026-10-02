/** Normalize pasted Japanese dates and eight-digit dates without guessing missing days. */
export function dateDigits(value: string): string {
  const text = value.normalize('NFKC').trim();
  const parts = text.match(/^(\d{4})[年/.-](\d{1,2})[月/.-](\d{1,2})日?$/);
  return parts ? parts[1] + parts[2].padStart(2, '0') + parts[3].padStart(2, '0') : text.replace(/[^0-9]/g, '').slice(0, 8);
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
