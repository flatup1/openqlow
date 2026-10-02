export type EntryFighter = {
  id: string;
  gym: string;
  name: string;
  grade: string;
  age: string;
  height: string;
  weight: string;
  record: string;
  comment: string;
  musicChoice: '' | 'yes' | 'no';
  musicUrl: string;
};

export const ENTRY_HEADERS = [
  '管理番号', 'ジム名', '選手名', '学年', '年齢', '身長', '体重',
  '戦績・競技歴', '試合への意気込み', '入場曲URL（Apple Music推奨）',
] as const;

function safeCell(value: string): string {
  const text = value.replace(/\r\n?/g, '\n').trim();
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value: string): string {
  return `"${safeCell(value).replaceAll('"', '""')}"`;
}

export function entryCsv(fighters: EntryFighter[]): string {
  const rows = fighters.map((fighter) => [
    fighter.id, fighter.gym, fighter.name, fighter.grade, fighter.age,
    fighter.height, fighter.weight, fighter.record, fighter.comment, fighter.musicUrl,
  ]);
  return '\uFEFF' + [ENTRY_HEADERS, ...rows].map((row) => row.map((cell) => csvCell(String(cell))).join(',')).join('\r\n') + '\r\n';
}

export function entryErrors(fighter: EntryFighter, hasPhoto: boolean): string[] {
  const errors: string[] = [];
  if (!fighter.gym.trim()) errors.push('ジム名を入力してください。');
  if (!fighter.name.trim()) errors.push('選手名を入力してください。');
  const height = Number(fighter.height.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(height) || height < 50 || height > 250) errors.push('身長を50〜250cmで入力してください。');
  const weight = Number(fighter.weight.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(weight) || weight < 10 || weight > 250) errors.push('体重を10〜250kgで入力してください。');
  if (!fighter.record.trim()) errors.push('戦績・競技歴を入力してください。初試合なら「初試合」と入力してください。');
  if (!fighter.musicChoice) errors.push('入場曲の「あり」か「なし」を選んでください。');
  if (fighter.musicChoice === 'yes' && !fighter.musicUrl.trim()) errors.push('入場曲のURLを入力してください。');
  if (!hasPhoto) errors.push('選手の写真を選んでください。');
  return errors;
}
