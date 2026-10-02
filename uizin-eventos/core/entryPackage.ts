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
  musicUrl: string;
};

export type EntryFieldMode = 'off' | 'optional' | 'required';
export type EntryFormConfig = { music: boolean; grade: EntryFieldMode; age: EntryFieldMode; comment: EntryFieldMode };
export const DEFAULT_ENTRY_CONFIG: EntryFormConfig = { music: false, grade: 'optional', age: 'optional', comment: 'optional' };

export function entryConfigFromSearch(search: string): EntryFormConfig {
  const params = new URLSearchParams(search);
  const mode = (key: string, fallback: EntryFieldMode): EntryFieldMode => {
    const value = params.get(key);
    return value === 'off' || value === 'optional' || value === 'required' ? value : fallback;
  };
  return { music: params.get('music') === 'on', grade: mode('grade', 'optional'), age: mode('age', 'optional'), comment: mode('comment', 'optional') };
}

export function entryConfigSearch(config: EntryFormConfig): string {
  return new URLSearchParams({ music: config.music ? 'on' : 'off', grade: config.grade, age: config.age, comment: config.comment }).toString();
}

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

export function entryErrors(fighter: EntryFighter, hasPhoto: boolean, config: EntryFormConfig = DEFAULT_ENTRY_CONFIG): string[] {
  const errors: string[] = [];
  if (!fighter.gym.trim()) errors.push('ジム名を入力してください。');
  if (!fighter.name.trim()) errors.push('選手名を入力してください。');
  const height = Number(fighter.height.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(height) || height < 50 || height > 250) errors.push('身長を50〜250cmで入力してください。');
  const weight = Number(fighter.weight.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(weight) || weight < 10 || weight > 250) errors.push('体重を10〜250kgで入力してください。');
  if (!fighter.record.trim()) errors.push('戦績・競技歴を入力してください。初試合なら「初試合」と入力してください。');
  if (config.grade === 'required' && !fighter.grade.trim()) errors.push('学年を入力してください。');
  if (config.age === 'required' && !fighter.age.trim()) errors.push('年齢を入力してください。');
  if (config.comment === 'required' && !fighter.comment.trim()) errors.push('試合への意気込みを入力してください。');
  if (config.music && !fighter.musicUrl.trim()) errors.push('入場曲のURLを入力してください。');
  if (!hasPhoto) errors.push('選手の写真を選んでください。');
  return errors;
}
