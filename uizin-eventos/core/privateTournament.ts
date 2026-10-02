import { fingerprint, pick, toRows } from './csv.ts';

export type LocalFighter = {
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
  photoDataUrl: string;
};

export type LocalBout = {
  id: string;
  redId: string;
  blueId: string;
  className: string;
  rule: string;
};

export type LocalTournament = {
  schema: 1;
  eventId: string;
  title: string;
  venue: string;
  date: string;
  updatedAt: number;
  currentBout: number;
  fighters: LocalFighter[];
  bouts: LocalBout[];
};

const PRIVATE_HEADERS = [
  '電話', '電話番号', 'メール', 'メールアドレス', '住所', '郵便番号', '保護者名',
  '連絡先', '生年月日', '同意者名', '申込日時', '受付番号',
];

export function emptyTournament(eventId = 'my-tournament'): LocalTournament {
  return { schema: 1, eventId, title: '大会名未設定', venue: '', date: '', updatedAt: Date.now(), currentBout: 0, fighters: [], bouts: [] };
}

export function privateHeaders(csv: string): string[] {
  const first = csv.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
  return PRIVATE_HEADERS.filter((word) => first.includes(word));
}

export function importFighters(csv: string): { fighters: LocalFighter[]; blockedHeaders: string[] } {
  const blockedHeaders = privateHeaders(csv);
  if (blockedHeaders.length) return { fighters: [], blockedHeaders };
  const fighters = toRows(csv).map((row, index): LocalFighter => {
    const name = pick(row, '選手名', '名前', '選手名（リングネーム）', 'fighter_name', 'name');
    const gym = pick(row, 'ジム名', '所属gym', '所属', 'gym', 'team');
    const stable = pick(row, '管理番号', 'id') || fingerprint(String(index), name, gym);
    return {
      id: stable,
      gym,
      name,
      grade: pick(row, '学年', 'grade'),
      age: pick(row, '年齢', 'age'),
      height: pick(row, '身長', '身長（cm）', 'height'),
      weight: pick(row, '体重', '試合時の希望体重（kg）', 'weight'),
      record: pick(row, '戦績', '戦績・競技歴', 'record'),
      comment: pick(row, '意気込み', '試合への意気込み', 'comment'),
      musicUrl: pick(row, '入場曲', '入場曲url', '入場曲URL（Apple Music推奨）', 'music_url'),
      photoDataUrl: '',
    };
  }).filter((fighter) => fighter.name.trim() !== '');
  return { fighters, blockedHeaders: [] };
}

export function contractWeight(red: LocalFighter | undefined, blue: LocalFighter | undefined): string {
  const parse = (value: string | undefined) => Number(String(value ?? '').replace(/[^0-9.]/g, ''));
  const weights = [parse(red?.weight), parse(blue?.weight)].filter((value) => Number.isFinite(value) && value >= 10 && value <= 200);
  if (!weights.length) return '';
  const value = Math.max(...weights);
  return (Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)) + 'kg契約';
}

export function safeMusicUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:') return '';
    const host = url.hostname.toLowerCase();
    if (host === 'music.apple.com' || host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') return url.toString();
  } catch { /* Invalid URL: do not make it clickable. */ }
  return '';
}

export function validateTournament(value: LocalTournament): string[] {
  const errors: string[] = [];
  if (!value.title.trim()) errors.push('大会名を入力してください。');
  value.bouts.forEach((bout, index) => {
    if (!bout.redId || !bout.blueId) errors.push('第' + (index + 1) + '試合の赤・青を選んでください。');
    if (bout.redId && bout.redId === bout.blueId) errors.push('第' + (index + 1) + '試合で同じ選手が選ばれています。');
  });
  return errors;
}
