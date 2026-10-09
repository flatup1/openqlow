import { safeGoogleRules, RULE_HEADERS, type SafeRule } from './safeGoogleRules.ts';
import { fingerprint, pick, toRows } from './csv.ts';
import type { EntryFormConfig } from './entryPackage.ts';
import { validRecruitment, type Recruitment } from './cloudEntry.ts';
import { validTimer, type PrivateTimer } from './privateTimer.ts';

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
  entryConfig?: EntryFormConfig;
  schedule?: SafeRule[];
  recruitment?: Recruitment;
  timer?: PrivateTimer;
  audience?: {open:boolean};
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
  if (new Set(fighters.map((fighter) => fighter.id)).size !== fighters.length) throw new Error('同じ管理番号が2つあります。原本で重複を確認してください。今ある名簿は変えていません。');
  return { fighters, blockedHeaders: [] };
}

/** Re-import by receipt, retaining cards and fighters absent from this file. Never guess by name. */
export function mergeFighters(current: LocalFighter[], incoming: LocalFighter[]): LocalFighter[] {
  if (new Set(incoming.map(fighter=>fighter.id)).size !== incoming.length) throw new Error('同じ管理番号が2つあります。元の名簿は変えていません。');
  const updates = new Map(incoming.map(fighter=>[fighter.id,fighter]));
  const existing = new Set(current.map(fighter=>fighter.id));
  const combined = current.map(fighter=>{
    const next=updates.get(fighter.id);
    return next ? {...next,photoDataUrl:next.photoDataUrl||fighter.photoDataUrl} : fighter;
  }).concat(incoming.filter(fighter=>!existing.has(fighter.id)));
  if(combined.length>3000)throw new Error('名簿が3000人を超えます。元の名簿は変えていません。');
  return combined;
}

export function contractWeight(red: LocalFighter | undefined, blue: LocalFighter | undefined): string {
  const parse = (value: string | undefined) => Number(String(value ?? '').trim().replace(/kg$/i, '').trim());
  const weights = [parse(red?.weight), parse(blue?.weight)];
  if (!weights.every((value) => Number.isFinite(value) && value >= 10 && value <= 250)) return '';
  const value = Math.max(...weights);
  return (Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)) + 'kg契約';
}

/** Soft warnings for one card. They never block saving; the organizer decides. */
export const WEIGHT_GAP_WARN_KG = 5;
export function boutWarnings(bout: LocalBout, fighters: LocalFighter[], bouts: LocalBout[]): string[] {
  const red = fighters.find((f) => f.id === bout.redId), blue = fighters.find((f) => f.id === bout.blueId);
  const warnings: string[] = [];
  const parse = (value: string | undefined) => Number(String(value ?? '').trim().replace(/kg$/i, '').trim());
  if (red && blue) {
    const a = parse(red.weight), b = parse(blue.weight);
    if (Number.isFinite(a) && Number.isFinite(b) && a >= 10 && b >= 10 && Math.abs(a - b) >= WEIGHT_GAP_WARN_KG) warnings.push('体重差が ' + (Math.round(Math.abs(a - b) * 10) / 10) + 'kg あります（' + red.name + ' ' + a + 'kg / ' + blue.name + ' ' + b + 'kg）。');
    if (red.gym.trim() && red.gym.trim() === blue.gym.trim()) warnings.push('同じジム（' + red.gym.trim() + '）の選手どうしです。');
  }
  [red, blue].forEach((f) => {
    if (!f) return;
    const count = bouts.filter((other) => other.redId === f.id || other.blueId === f.id).length;
    if (count > 1) warnings.push(f.name + ' が ' + count + ' 試合に入っています。');
  });
  return warnings;
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
    if ([bout.redId, bout.blueId].some((id) => id && !value.fighters.some((fighter) => fighter.id === id))) errors.push('第' + (index + 1) + '試合に名簿にいない選手がいます。選び直してください。');
  });
  if (new Set(value.fighters.map((fighter) => fighter.id)).size !== value.fighters.length) errors.push('選手の管理番号が重複しています。');
  if (new Set(value.bouts.map((bout) => bout.id)).size !== value.bouts.length) errors.push('試合の管理番号が重複しています。');
  return errors;
}

/** Validate stored/backup data before it can overwrite this event. Incomplete cards are allowed while preparing. */
export function isLocalTournament(value: unknown): value is LocalTournament {
  if (!value || typeof value !== 'object') return false;
  const data = value as LocalTournament;
  if(data.audience!==undefined&&(!data.audience||typeof data.audience.open!=='boolean'||Object.keys(data.audience).some(k=>k!=='open')))return false;
  if(data.recruitment!==undefined&&!validRecruitment(data.recruitment)||data.timer!==undefined&&!validTimer(data.timer))return false;
  if (data.schedule !== undefined) { try { safeGoogleRules([RULE_HEADERS,...data.schedule.map(row=>[row.no,row.rounds,row.roundSeconds,row.breakSeconds])]); } catch { return false; } }
  const text = (item: unknown) => typeof item === 'string' && item.length <= 5000;
  if (data.entryConfig !== undefined && (!data.entryConfig || typeof data.entryConfig.music !== 'boolean' || !['grade','age','comment'].every(key => ['off','optional','required'].includes(data.entryConfig![key as 'grade'|'age'|'comment'])))) return false;
  if (data.schema !== 1 || !text(data.eventId) || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(data.eventId) || ![data.title,data.venue,data.date].every(text) || !Number.isFinite(data.updatedAt) || !Number.isInteger(data.currentBout) || data.currentBout<0 || !Array.isArray(data.fighters) || !Array.isArray(data.bouts) || data.fighters.length>3000 || data.bouts.length>3000 || data.currentBout>=Math.max(1,data.bouts.length)) return false;
  if(data.timer){const t=data.timer,rule=data.schedule?.find(r=>r.no===data.currentBout+1);if(!rule||t.boutId!==data.bouts[data.currentBout]?.id||t.round>rule.rounds||t.remainingMs>(t.phase==='break'?rule.breakSeconds:rule.roundSeconds)*1000||t.phase==='complete'&&(t.status!=='paused'||t.remainingMs!==0))return false;}
  return data.fighters.every((fighter) => fighter && ['id','gym','name','grade','age','height','weight','record','comment','musicUrl'].every((key) => text(fighter[key as keyof LocalFighter])) && fighter.id.length>0 && typeof fighter.photoDataUrl==='string' && (!fighter.photoDataUrl || /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(fighter.photoDataUrl) && fighter.photoDataUrl.length<=1_800_100)) && data.bouts.every((bout) => bout && ['id','redId','blueId','className','rule'].every((key) => text(bout[key as keyof LocalBout])) && bout.id.length>0) && new Set(data.fighters.map(fighter=>fighter.id)).size===data.fighters.length && new Set(data.bouts.map(bout=>bout.id)).size===data.bouts.length;
}
