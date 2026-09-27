import { isValidEventId, normalizeEventId } from './eventId.ts';

export function extractSheetId(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,100})/);
  const candidate = match?.[1] ?? trimmed;
  return /^[A-Za-z0-9_-]{20,100}$/.test(candidate) ? candidate : '';
}

export function eventLivePath(value: string): string {
  const eventId = normalizeEventId(value);
  return '../live/?event=' + encodeURIComponent(eventId);
}

export function validateNewEvent(eventId: string, sheetInput: string): string[] {
  const errors: string[] = [];
  if (!isValidEventId(eventId)) errors.push('大会IDは半角英数字とハイフン2〜48文字で入力してください。');
  if (!extractSheetId(sheetInput)) errors.push('進行表のGoogleスプレッドシートURLまたはIDを確認してください。');
  return errors;
}
